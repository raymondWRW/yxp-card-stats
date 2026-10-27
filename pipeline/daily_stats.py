"""
Daily site statistics, stored per PERIOD in this repo (data/daily/s<season>/).

Replaces the single ever-growing extraction state (which outgrew the 16 GB CI runner):

  1. DAY periods: the replays of one UTC day (by the newest self-record in each source
     shard; both players' replays of a game share a shard, so no game spans two days) are
     folded by season_builds.process_record -- the same, validated per-record logic -- into
     a fresh state. Its recency weights are relative to that day's newest game (ref).
  2. WEEK periods: once an ISO week is over (+ WEEK_GRACE_DAYS for late shards), its days
     are combined and the board tables pruned to the top K per table; the day files go.
  3. COMBINE: every period is scaled by 0.5^((T_REF - ref) / half-life) -- exponential
     decay is multiplicative, so this equals per-game weighting against T_REF exactly --
     merged, and written as the site JSON by season_builds.write_output.

Board tables (the only part that grows with the season) are flat Parquet rows, combined
and pruned with DuckDB; the small accumulators (radar, matchups, fates, tiers, curves,
...) are a compressed pickle per period, merged in Python.

Only week files are committed; day files are rebuilt by every run (not committed), and a
day is also rebuilt whenever its set of source shards changes (late uploads). A finished
week is rebuilt from its days if one of them changes. The Parquet dataset stays the
single source of truth, so any period can always be recomputed.

Usage: python pipeline/daily_stats.py            (env as season_builds.py; YXP_DAILY = dir)
"""
import copy
import datetime
import glob
import io
import json
import os
import pickle
import sys
import time
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import duckdb                      # noqa: E402
import pyarrow as pa               # noqa: E402
import pyarrow.parquet as pq       # noqa: E402
import zstandard                   # noqa: E402

import season_builds as sb         # noqa: E402

DAILY_DIR = os.environ.get("YXP_DAILY") or os.path.join(os.path.dirname(HERE), "data", "daily", f"s{sb.SEASON}")
PERIODS = os.path.join(DAILY_DIR, "periods")
FAMILIES = os.path.join(DAILY_DIR, "families.json")
FORMAT = 4                          # bump to rebuild every period (layout / accumulator change); 2: strategy-variant split back on; 3: Power skill = Elo; 4: radar keeps the death round

# board tables kept per (character, side job, phase) when a week is compacted (and when
# combining for the site): more than the 20 / 8 the site shows, so the published top lists
# are effectively exact.
K_BOARDS_EARLY = 50                 # realm (phase) 1-4
K_BOARDS_LATE = 100                 # realm 5+
K_MBOARDS = 50                      # late-game boards per opponent character (site shows 8)
K_VARIANTS = 12                     # slot-order layouts per board (site shows 6)
WEEK_GRACE_DAYS = 2                 # a week is compacted this many days after it ends
# Day files are NOT committed (.gitignore): every run rebuilds the days not yet compacted
# into a week (at most ~9) from the Parquet dataset, so they stay exact (unpruned) and the
# repo only grows by one small week file per week. DAY_K_MULT > 0 would prune them too.
DAY_K_MULT = 0
# building days stops after this many minutes (the first run must build the whole season);
# what was built is kept, the site JSON is only written once every day exists.
BUDGET_MIN = float(os.environ.get("YXP_DAILY_BUDGET_MIN") or 0)

TEMPLATE = copy.deepcopy(sb.STATE)  # an empty state (before anything is folded)
WEIGHTED = sb.WEIGHTED
SMALL_KEYS = ("builds", "wc", "char", "tier", "fam_pop", "fates", "derivs", "daoyun", "xianmo", "botexp")
COUNTS = ("files", "self", "shards")
BAND_COLS = ["r0", "r1", "r2", "w0", "w1", "w2", "ww0", "ww1", "ww2"]


def log(msg):
    print(f"[daily] {msg}", flush=True)


# ---- family registry (append-only, so family indices mean the same in every period) ----
def load_families():
    reg = json.load(open(FAMILIES, encoding="utf-8")) if os.path.exists(FAMILIES) else []
    sb.STATE["fam_idx"], sb.STATE["fam_meta"] = {}, []
    for i, (key, img) in enumerate(reg):
        _, en, cn = sb.card_family(img)
        sb.STATE["fam_idx"][key] = i
        sb.STATE["fam_meta"].append({"i": i, "en": en, "cn": cn, "img": img})


def save_families():
    reg = [[k, sb.STATE["fam_meta"][i]["img"]] for k, i in sorted(sb.STATE["fam_idx"].items(), key=lambda kv: kv[1])]
    os.makedirs(DAILY_DIR, exist_ok=True)
    with open(FAMILIES, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, separators=(",", ":"))


def reset_state():
    """Fresh accumulators; the family registry is kept."""
    fi, fm = sb.STATE["fam_idx"], sb.STATE["fam_meta"]
    sb.STATE.clear(); sb.STATE.update(copy.deepcopy(TEMPLATE))
    sb.STATE["fam_idx"], sb.STATE["fam_meta"] = fi, fm


# ---- which shards belong to which day ---------------------------------------------------
def day_of(ts_ms):
    return datetime.datetime.utcfromtimestamp(ts_ms / 1000).strftime("%Y-%m-%d")


def week_of(day):
    y, w, _ = datetime.date.fromisoformat(day).isocalendar()
    return f"{y}-W{w:02d}"


def week_last_day(week):
    y, w = week.split("-W")
    return datetime.date.fromisocalendar(int(y), int(w), 7)


def plan_days(src):
    """-> ({day: {"shards": [ids], "ref": ms}}, {shard: chunk}) for the season's shards.
    A shard's day = UTC date of its newest season self-record; shards without one follow
    the previous shard (they only add to the shard counter)."""
    baseline = {str(x) for x in json.load(open(os.path.join(HERE, "_shards.json")))}
    start = sb.SEASON_START.get(sb.SEASON, 0)
    shard_chunk, shard_ts = {}, {}
    for key, shards in sorted(src.manifests().items(), key=lambda kv: int(kv[0])):
        mine = [s for s in shards if int(s) >= start and s not in baseline]
        if not mine:
            continue
        games, players = src.games_players(key)
        newest = defaultdict(int)
        for (gid, _), p in players.items():
            g = games.get(gid)
            if g and p["has_self_record"] and g["season"] == sb.SEASON and g["game_mode"] == 3:
                newest[g["src_shard"]] = max(newest[g["src_shard"]], p["end_ts"] or 0)
        for s in mine:
            shard_chunk[s] = key
            shard_ts[s] = newest.get(s, 0)
        src.release(key)
    days, last = {}, None
    for s in sorted(shard_chunk, key=int):
        ts = shard_ts[s]
        d = day_of(ts) if ts else last
        if d is None:
            continue
        last = d
        e = days.setdefault(d, {"shards": [], "ref": 0})
        e["shards"].append(s); e["ref"] = max(e["ref"], ts)
    return days, shard_chunk


# ---- period files -----------------------------------------------------------------------
def _p(pid, ext):
    return os.path.join(PERIODS, f"{pid}.{ext}")


def read_meta(pid):
    try:
        return json.load(open(_p(pid, "json")))
    except Exception:
        return None


def list_periods():
    out = {}
    for f in glob.glob(os.path.join(PERIODS, "*.json")):
        m = json.load(open(f))
        if m.get("format") == FORMAT and m.get("season") == sb.SEASON:
            out[m["id"]] = m
    return out


def delete_period(pid):
    for ext in ("json", "small.pkl.zst", "groups.parquet", "variants.parquet"):
        try:
            os.remove(_p(pid, ext))
        except OSError:
            pass


def board_tables():
    """STATE board tables -> two Arrow tables: groups (one row per board family-multiset)
    and variants (one row per slot-order layout, with its per-slot level counts nested in
    `lv` so the long board key is not repeated per level)."""
    G, V = defaultdict(list), defaultdict(list)

    def put(d, kind, char, career, var, sub, cs, extra):
        d["kind"].append(kind); d["ch"].append(char); d["ca"].append(career); d["va"].append(var)
        d["sub"].append(int(sub)); d["cs"].append(list(cs))
        for k, v in extra:
            d[k].append(v)

    def bands(b3):
        return [("r0", b3[0][0]), ("r1", b3[1][0]), ("r2", b3[2][0]),
                ("w0", b3[0][1]), ("w1", b3[1][1]), ("w2", b3[2][1]),
                ("ww0", b3[0][2]), ("ww1", b3[1][2]), ("ww2", b3[2][2])]
    for (char, career, var), b in sb.STATE["builds"].items():
        for kind, tables in ((0, b["boards"]), (1, b["mboards"])):
            for sub, bd in tables.items():
                for cs, g in bd.items():
                    put(G, kind, char, career, var, sub, cs, bands(g[0]))
                    for lay, vv in g[1].items():
                        lv = [{"s": sl, "c": cid, "n": n} for (sl, cid), n in sorted(vv[1].items())]
                        put(V, kind, char, career, var, sub, cs, [("lay", list(lay)), ("lv", lv)] + bands(vv[0]))
    gs, vs = SCHEMAS
    mk = lambda d, sc: pa.Table.from_pydict({f.name: d.get(f.name, []) for f in sc}, schema=sc)
    return mk(G, gs), mk(V, vs)


_i32, _f64 = pa.int32(), pa.float64()
_KEY = [("kind", pa.int8()), ("ch", _i32), ("ca", _i32), ("va", pa.string()), ("sub", _i32),
        ("cs", pa.list_(_i32))]
_STATS = [(c, _i32 if c.startswith("r") else _f64) for c in BAND_COLS]
_LV = pa.list_(pa.struct([("s", pa.int8()), ("c", _i32), ("n", _i32)]))
SCHEMAS = (pa.schema(_KEY + _STATS), pa.schema(_KEY + [("lay", pa.list_(_i32)), ("lv", _LV)] + _STATS))
TABLES = ("groups", "variants")


def small_accumulators():
    out = {}
    for k in SMALL_KEYS:
        v = sb.STATE[k]
        if k == "builds":            # boards live in the Parquet tables
            v = {bk: {kk: vv for kk, vv in b.items() if kk not in ("boards", "mboards")} for bk, b in v.items()}
        out[k] = v
    for k in COUNTS:
        out[k] = sb.STATE[k]
    mu = sb.STATE["mu"]
    out["mu"] = {"kept": mu["kept"], "dropped": mu["dropped"], "dist": dict(mu["dist"]),
                 "waiting_n": mu.get("waiting_n", sum(len(v) for v in mu["pending"].values()))}
    return out


def write_period(pid, meta, small, tables):
    os.makedirs(PERIODS, exist_ok=True)
    with open(_p(pid, "small.pkl.zst"), "wb") as f, zstandard.ZstdCompressor(level=10).stream_writer(f) as z:
        pickle.dump(small, z, protocol=pickle.HIGHEST_PROTOCOL)
    for name, t, sc in zip(TABLES, tables, SCHEMAS):
        pq.write_table(t.select(sc.names).cast(sc), _p(pid, f"{name}.parquet"),
                       compression="zstd", compression_level=9)
    meta = dict(meta, id=pid, format=FORMAT, season=sb.SEASON, schema=sb.SCHEMA)
    with open(_p(pid, "json"), "w") as f:        # written last: marks the period complete
        json.dump(meta, f, separators=(",", ":"))


def load_small(pid):
    with open(_p(pid, "small.pkl.zst"), "rb") as f, zstandard.ZstdDecompressor().stream_reader(f) as z:
        return sb._Unpickler(io.BufferedReader(z)).load()


# ---- combining periods ------------------------------------------------------------------
def merge_small(pids_refs, ref):
    """Merge the small accumulators of periods, each re-referenced to `ref`."""
    acc = {}
    for pid, pref in pids_refs:
        s = load_small(pid)
        f = 0.5 ** ((ref - pref) / sb.HALF_LIFE_MS)
        for k in WEIGHTED:
            if k in s:
                sb._rescale(s[k], f)
        mu = s.pop("mu")
        for k, v in s.items():
            acc[k] = sb._acc_add(acc.get(k), v)
        m = acc.setdefault("mu", {"kept": 0, "dropped": 0, "dist": Counter(), "waiting_n": 0})
        m["kept"] += mu["kept"]; m["dropped"] += mu["dropped"]; m["waiting_n"] += mu["waiting_n"]
        m["dist"].update({int(k): v for k, v in mu["dist"].items()})
    return acc


def _arrow(rel):
    """DuckDB result -> Arrow table (2.0 renamed fetch_arrow_table to to_arrow_table)."""
    return rel.to_arrow_table() if hasattr(rel, "to_arrow_table") else rel.fetch_arrow_table()


def combine_boards(pids_refs, ref, mult=1):
    """DuckDB: sum every period's board rows (weights scaled to `ref`), keep the top K per
    table (K x mult) and the top K_VARIANTS layouts per board, summing their level counts.
    Returns Arrow tables (groups, variants)."""
    con = duckdb.connect()
    con.execute("SET threads TO 4")
    pf = pa.table({"pid": [p for p, _ in pids_refs],
                   "f": [0.5 ** ((ref - r) / sb.HALF_LIFE_MS) for _, r in pids_refs]})
    con.register("pf", pf)
    files = lambda name: "[" + ",".join(f"'{_p(p, name + '.parquet')}'" for p, _ in pids_refs) + "]"
    key = "kind, ch, ca, va, sub, cs"
    sums = ", ".join([f"sum({c})::INTEGER AS {c}" if c.startswith("r") else f"sum({c} * f) AS {c}"
                      for c in BAND_COLS])
    src = lambda name: (f"(SELECT t.*, pf.f FROM read_parquet({files(name)}, filename=true) t "
                        f"JOIN pf ON pf.pid = regexp_extract(t.filename, '([^/]+)\\.{name}\\.parquet$', 1)) s")
    con.execute(f"""
        CREATE TEMP TABLE g AS
        SELECT * EXCLUDE rn FROM (
          SELECT *, row_number() OVER (PARTITION BY kind, ch, ca, va, sub
                                       ORDER BY w0 + w1 + w2 DESC, r0 + r1 + r2 DESC, cs) AS rn
          FROM (SELECT {key}, {sums} FROM {src('groups')} GROUP BY ALL))
        WHERE rn <= CASE WHEN kind = 1 THEN {K_MBOARDS * mult}
                         WHEN sub <= 4 THEN {K_BOARDS_EARLY * mult} ELSE {K_BOARDS_LATE * mult} END""")
    con.execute(f"""
        CREATE TEMP TABLE v AS
        SELECT * EXCLUDE rn FROM (
          SELECT *, row_number() OVER (PARTITION BY {key}
                                       ORDER BY w0 + w1 + w2 DESC, r0 + r1 + r2 DESC, lay) AS rn
          FROM (SELECT {key}, lay, {sums} FROM {src('variants')} SEMI JOIN g USING ({key}) GROUP BY ALL))
        WHERE rn <= {K_VARIANTS}""")
    con.execute(f"""
        CREATE TEMP TABLE l AS
        SELECT {key}, lay, list({{'s': slot, 'c': cid, 'n': n}} ORDER BY slot, cid) AS lv
        FROM (SELECT {key}, lay, u.s AS slot, u.c AS cid, sum(u.n)::INTEGER AS n
              FROM (SELECT {key}, lay, unnest(lv) AS u FROM {src('variants')} SEMI JOIN v USING ({key}, lay))
              GROUP BY ALL)
        GROUP BY ALL""")
    gt = _arrow(con.execute("SELECT * FROM g"))
    vt = _arrow(con.execute(f"SELECT v.*, l.lv FROM v LEFT JOIN l USING ({key}, lay)"))
    con.close()
    return gt, vt


def install_boards(gt, vt):
    """Arrow board rows -> STATE builds' nested board tables (the shape add_board builds)."""
    b3 = lambda r: [[r["r0"], r["w0"], r["ww0"]], [r["r1"], r["w1"], r["ww1"]], [r["r2"], r["w2"], r["ww2"]]]
    tbl = lambda r: sb.STATE["builds"][(r["ch"], r["ca"], r["va"])]["boards" if r["kind"] == 0 else "mboards"][r["sub"]]
    for r in gt.to_pylist():
        tbl(r)[tuple(r["cs"])] = [b3(r), {}]
    for r in vt.to_pylist():
        tbl(r)[tuple(r["cs"])][1][tuple(r["lay"])] = [b3(r), {(e["s"], e["c"]): e["n"] for e in r["lv"] or []}]


def install_small(acc):
    for k in SMALL_KEYS:
        if k in acc:
            if k == "builds":
                for bk, b in acc[k].items():
                    nb = sb.STATE["builds"][bk]          # defaultdict(new_build): boards stay empty
                    for kk, vv in b.items():
                        nb[kk] = vv
            else:
                dst = sb.STATE[k]
                for kk, vv in acc[k].items():
                    dst[kk] = vv
    for k in COUNTS:
        sb.STATE[k] = acc.get(k, 0)
    m = acc.get("mu", {})
    sb.STATE["mu"]["kept"] = m.get("kept", 0); sb.STATE["mu"]["dropped"] = m.get("dropped", 0)
    sb.STATE["mu"]["dist"] = Counter(m.get("dist", {})); sb.STATE["mu"]["waiting_n"] = m.get("waiting_n", 0)


# ---- the three steps --------------------------------------------------------------------
def build_day(day, info, shard_chunk):
    t0 = time.time()
    reset_state()
    sb.T_REF = info["ref"]
    chunks = defaultdict(list)
    for s in info["shards"]:
        chunks[shard_chunk[s]].append(s)
    chunks = dict(sorted(chunks.items(), key=lambda kv: int(kv[0])))
    sb.scan_parquet(chunks, no_save=True, release=False)
    pid = f"d{day}"
    meta = {"kind": "day", "day": day, "week": week_of(day), "ref": info["ref"], "shards": info["shards"]}
    small = small_accumulators()
    write_period(pid, meta, small, board_tables())
    if DAY_K_MULT:
        write_period(pid, meta, small, combine_boards([(pid, info["ref"])], info["ref"], DAY_K_MULT))
    save_families()
    log(f"day {day}: {len(info['shards'])} shards, {sb.STATE['self']} records, {time.time() - t0:.0f}s | {sb._mem()}")


def compact_week(week, day_metas):
    t0 = time.time()
    ref = max(m["ref"] for m in day_metas)
    prs = [(m["id"], m["ref"]) for m in day_metas]
    small = merge_small(prs, ref)
    tables = combine_boards(prs, ref)
    write_period(f"w{week}", {"kind": "week", "week": week, "ref": ref,
                              "days": {m["day"]: m["shards"] for m in day_metas},
                              "shards": sorted((s for m in day_metas for s in m["shards"]), key=int)},
                 small, tables)
    for m in day_metas:
        delete_period(m["id"])
    log(f"week {week}: compacted {len(day_metas)} days, {tables[0].num_rows} boards kept, {time.time() - t0:.0f}s")


def run():
    sb.PRUNE = False                  # periods are exact; pruning happens at week compaction
    load_families()
    src = sb._pq_source()
    days, shard_chunk = plan_days(src)
    if not days:
        log("no season shards yet"); return False
    periods = list_periods()
    log(f"{len(days)} days ({min(days)} .. {max(days)}), {len(periods)} stored periods")

    # weeks whose days changed (late shards) are dropped and rebuilt from their days
    for pid, m in list(periods.items()):
        if m["kind"] == "week":
            current = {d: days.get(d, {}).get("shards") for d in m["days"]}
            extra = [d for d in days if week_of(d) == m["week"] and d not in m["days"]]
            if any(sorted(current[d] or [], key=int) != m["days"][d] for d in m["days"]) or extra:
                log(f"week {m['week']} changed -> rebuilding its days"); delete_period(pid); del periods[pid]
    covered = {d for m in periods.values() if m["kind"] == "week" for d in m["days"]}

    # (re)build changed / missing days; keep downloaded chunks until no later day needs them
    todo = [d for d in sorted(days) if d not in covered
            and (periods.get(f"d{d}") or {}).get("shards") != days[d]["shards"]]
    log(f"days to build: {todo or 'none'}")
    t_start = time.time()
    for i, d in enumerate(todo):
        if BUDGET_MIN and time.time() - t_start > BUDGET_MIN * 60:
            log(f"time budget ({BUDGET_MIN:.0f} min) used up: {len(todo) - i} days left for the next run;"
                " site JSON not updated")
            return False
        build_day(d, days[d], shard_chunk)
        periods[f"d{d}"] = read_meta(f"d{d}")
        need = {shard_chunk[s] for dd in todo[i + 1:] for s in days[dd]["shards"]}
        for k in {shard_chunk[s] for s in days[d]["shards"]} - need:
            src.release(k)

    # compact finished weeks
    newest = datetime.date.fromisoformat(max(days))
    by_week = defaultdict(list)
    for pid, m in periods.items():
        if m["kind"] == "day":
            by_week[m["week"]].append(m)
    for week, ms in sorted(by_week.items()):
        if week_last_day(week) + datetime.timedelta(days=WEEK_GRACE_DAYS) < newest:
            compact_week(week, sorted(ms, key=lambda m: m["day"]))
            for m in ms:
                periods.pop(m["id"], None)
            periods[f"w{week}"] = read_meta(f"w{week}")

    # combine everything for the site
    t0 = time.time()
    T_REF = max(m["ref"] for m in periods.values())
    prs = sorted(((pid, m["ref"]) for pid, m in periods.items()), key=lambda x: x[0])
    reset_state()
    sb.T_REF = T_REF
    install_small(merge_small(prs, T_REF))
    install_boards(*combine_boards(prs, T_REF))
    log(f"combined {len(prs)} periods (T_REF {T_REF}), {time.time() - t0:.0f}s | {sb._mem()}")
    sb.write_output()
    return True


if __name__ == "__main__":
    run()
