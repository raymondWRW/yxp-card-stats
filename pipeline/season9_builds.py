"""
Season-9 "build" analytics extraction (hsreplay-style) for sharpobject/yxp_replays.

Filter: seasonMec==9, gameMode==3, beginDaoXinRankScore>=3000, and the file is a
real-player SELF-RECORD (the entity present in the most rounds == data.uid). For
each self-record the subject's character/career/placement come from data.*, and we
walk roundStats (subject side) for board, realm, per-round result, opponent, net.

Outputs site/data/season9.json with character + (character,career) build stats:
  - top-4 win rate (battleRank<=3), placement distribution, average placement
  - side-job popularity per character
  - popularity (games)
  - power radar: 5 axes (early R1-7 / mid R8-13 / late R14+ / first / second),
    each = avg net destiny per round (net = +lifeDamage on a round win, - on a loss)
  - popular boards per realm phase (L1-L5): top board archetypes (distinct card
    families), with usage and round win rate
  - matchup vs each opponent character (REAL-snapshot opponents only): round win rate

Usage:
  python season9_builds.py local       # test on ./_new.tar.zst only
  python season9_builds.py full         # all new (season-9) shards via API diff
"""
import io
import json
import os
import re
import sys
import time
import tarfile
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor, wait, FIRST_COMPLETED

import requests
import zstandard

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://huggingface.co/datasets/sharpobject/yxp_replays/resolve/main"
API = "https://huggingface.co/api/datasets/sharpobject/yxp_replays/tree/main"
# PROXY holds the id->name maps; override with YXP_PROXY (CI bundles them next to the script).
PROXY = os.environ.get("YXP_PROXY") or r"C:\Users\raymo\OneDrive\Desktop\card counter with proxy\proxy"
MAP_PATH = os.path.join(PROXY, "card_id_map.json")
FATE_ID_MAP = os.path.join(PROXY, "fate_id_map.json")        # fate/talent id -> cn name
FATE_TALENT_MAP = os.path.join(PROXY, "fate_talent_map.json")  # id -> {name(en), nameCn}
# output dir: site/data locally, or the deploy repo's data/ in CI (YXP_OUTDIR).
OUTDIR = os.environ.get("YXP_OUTDIR") or os.path.join(HERE, "site", "data")
OUT = os.path.join(OUTDIR, "season9.json")            # light: meta, chars, tiers
OUT_BUILDS = os.path.join(OUTDIR, "season9_builds.json")  # heavy: builds, families
OUT_FATES = os.path.join(OUTDIR, "season9_fates.json")    # fate + 天衍 selections
OUT_DIAG = os.path.join(HERE, "season9_diag.json")                      # per-char bot-exposure diag
DAOXIN_MIN = 3000
DL_WORKERS = 10
TOP_BOARDS = 20
TOP_MBOARDS = 8        # top boards kept per (build, opponent character)
LATE_ROUND = 14        # "late game" = round >= 14 (matches radar 'late' axis)
HALF_LIFE_MS = 7 * 86400 * 1000   # recency half-life = 1 week
T_REF = None           # reference time (newest game endTs); set before processing

RX_DAOXIN = re.compile(rb'"beginDaoXinRankScore":(\d+)')

# card_id -> Chinese name (level-collapsed: all levels share the name)
with open(MAP_PATH, encoding="utf-8") as f:
    CN_NAME = json.load(f)

# fate / 天衍 id -> name (cn from fate_id_map, en from fate_talent_map; some 天衍 ids unmapped)
with open(FATE_ID_MAP, encoding="utf-8") as f:
    FATE_CN = json.load(f)
FATE_EN = {}
try:
    with open(FATE_TALENT_MAP, encoding="utf-8") as f:
        for k, v in json.load(f).items():
            if isinstance(v, dict) and v.get("name"):
                FATE_EN[k] = v["name"]
except Exception:
    pass

# wiki-mined fate effect category: cn name -> "cultivation" | "other" (innate added from data)
try:
    with open(os.path.join(HERE, "fate_categories.json"), encoding="utf-8") as f:
        FATE_CAT = json.load(f)
except Exception:
    FATE_CAT = {}

# 天衍 (Heavenly Derivation) registry: its option ids are a SEPARATE namespace from fates
# (FateStrategyConfig, wiki heavenly-derivation page). Built by build_tianyan_map.py into
# tianyan_map.json = {"byId": {id: {name(cn), sect, category, ...}}, "en": {id: enName}}.
DERIV_CN, DERIV_EN, DERIV_SECT, DERIV_ICON = {}, {}, {}, {}
try:
    with open(os.path.join(HERE, "tianyan_map.json"), encoding="utf-8") as f:
        _ty = json.load(f)
    for k, v in _ty.get("byId", {}).items():
        DERIV_CN[k] = v.get("name", ""); DERIV_SECT[k] = v.get("sect", "")
        DERIV_ICON[k] = v.get("icon", "")
    DERIV_EN = _ty.get("en", {})
except Exception:
    pass

# wiki icon CDN base; fate icons are Icon_Talent_<id>.png, derivation icons use their
# registry icon field (mix of Icon_FateStrategy_/Icon_Talent_/Card_).
ICON_BASE = "https://sharpobject.github.io/yxp_wiki/assets/fates/"

# Chinese -> English card names. Prefer the small distilled card_en_map.json (shipped to CI);
# fall back to the full analysis CSV when present (local dev).
CN2EN = {}
try:
    with open(os.path.join(HERE, "card_en_map.json"), encoding="utf-8") as f:
        CN2EN = json.load(f)
except Exception:
    try:
        import csv as _csv
        with open(os.path.join(HERE, "winrate_daoxin4000.csv"), encoding="utf-8") as f:
            for row in _csv.DictReader(f):
                cn = row.get("namecn"); en = row.get("card_name_en")
                if cn and en and cn not in CN2EN:
                    CN2EN[cn] = en
    except Exception:
        pass


def card_family(cid):
    """card_id -> (family_key, name_en, namecn). Levels share one family (by name)."""
    cn = CN_NAME.get(str(cid))
    if cn:
        return cn, CN2EN.get(cn, ""), cn
    return f"id_{cid}", "", ""


# ---- accumulators ----------------------------------------------------------
def new_build():
    # weighted = recency-weighted sum; raw = unweighted count (for sample thresholds)
    return {
        "gw": 0.0, "graw": 0, "place": [0.0] * 8,      # weighted games, raw games, weighted placement
        "radar": {k: [0.0, 0.0] for k in ("e", "m", "l", "f", "s")},  # [w_wins, w_rounds]
        "matchup": defaultdict(lambda: [0.0, 0.0, 0]),  # oppChar -> [w_rounds, w_wins, raw_rounds]
        "boards": defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0])),  # realm->bkey->[raw, w_count, w_wins]
        "mboards": defaultdict(lambda: defaultdict(lambda: [0, 0.0, 0.0])),  # oppChar->bkey->[raw, w_count, w_wins]
    }


STATE = {
    "builds": defaultdict(new_build),     # (char,career) -> build
    # char -> weighted/raw games + rank-score sufficient stats (for skill-adjusted Power)
    "char": defaultdict(lambda: {"gw": 0.0, "graw": 0, "swr": 0.0, "swr2": 0.0, "swrp": 0.0}),
    # (char,career,daoxin-band) -> placement+rank stats, for the tier filter on char/sidejob pages
    "tier": defaultdict(lambda: {"gw": 0.0, "graw": 0, "place": [0.0] * 8,
                                 "swr": 0.0, "swr2": 0.0, "swrp": 0.0}),
    "fam_idx": {}, "fam_meta": [],        # family registry
    "fam_pop": defaultdict(float),        # famIdx -> weighted board appearances (for card ordering)
    # (char,career,selectionId,optionId) -> [selected_w, offered_w, selected_place_w]
    "fates": defaultdict(lambda: [0.0, 0.0, 0.0]),   # fate picks (talentSelectionDatas)
    "derivs": defaultdict(lambda: [0.0, 0.0, 0.0]),  # 天衍 picks (fateStrategyData.strategies)
    # skill-matched matchups: every >=3000 player appears as a self-record, so we collect all
    # self uids, buffer matchup events, then keep only those vs a confirmed >=3000 opponent.
    "self_uids": set(),
    "mu_pending": [],                     # (char, career, oppChar, oppUid, w, wwin)
    "botexp": defaultdict(lambda: [0, 0.0, 0.0]),  # char -> [records, sum_bot_opps, sum_real_opps]
    "files": 0, "self": 0, "shards": 0,
}


def fam_index(cid):
    key, en, cn = card_family(cid)
    idx = STATE["fam_idx"].get(key)
    if idx is None:
        idx = len(STATE["fam_meta"])
        STATE["fam_idx"][key] = idx
        # representative image id = this card_id (level art); good enough
        STATE["fam_meta"].append({"i": idx, "en": en, "cn": cn, "img": cid})
    return idx


def process_record(d):
    """d is a season-9 mode-3 daoxin>=3000 SELF-record's data dict."""
    uid = d["uid"]
    char = d["charId"]
    career = d["career"]
    rank = d.get("battleRank")
    if rank is None or not (0 <= rank <= 7):
        return
    endTs = d.get("endTs") or d.get("beginTs") or T_REF
    w = 0.5 ** (max(0, T_REF - endTs) / HALF_LIFE_MS)   # recency weight (newest ~1)
    b = STATE["builds"][(char, career)]
    c = STATE["char"][char]
    b["gw"] += w; b["graw"] += 1; c["gw"] += w; c["graw"] += 1
    b["place"][rank] += w
    # rank-score sufficient stats for the within-character skill slope
    p = rank + 1; r = d.get("beginRankScore", 0) or 0
    c["swr"] += w * r; c["swr2"] += w * r * r; c["swrp"] += w * r * p
    # DaoXin band (A=3000-3999, B=4000-5999, C=6000+) for the tier filter
    dx = d.get("beginDaoXinRankScore", 0)
    band = "A" if dx < 4000 else ("B" if dx < 6000 else "C")
    tk = STATE["tier"][(char, career, band)]
    tk["gw"] += w; tk["graw"] += 1; tk["place"][rank] += w
    tk["swr"] += w * r; tk["swr2"] += w * r * r; tk["swrp"] += w * r * p

    STATE["self_uids"].add(uid)
    opp_uids, bot_uids = set(), set()     # distinct opponents this game (for bot-exposure diag)
    last_side = None
    for rs in d.get("roundStats", []):
        side = None; opp = None
        for sp in ("p1", "p2"):
            if rs[sp]["publicData"]["uid"] == uid:
                side = rs[sp]; opp = rs["p2" if sp == "p1" else "p1"]
                break
        if side is None:
            continue
        last_side = side
        won = rs.get("winerId") == uid
        first = rs.get("firstPlayerId") == uid
        rnd = rs.get("round") or 0
        wwin = w if won else 0.0
        # radar axes = recency-weighted round win rate per phase and turn-order slot
        rad = b["radar"]
        phase = "e" if rnd <= 7 else ("m" if rnd <= 13 else "l")
        rad[phase][1] += w; rad[phase][0] += wwin
        slot = "f" if first else "s"
        rad[slot][1] += w; rad[slot][0] += wwin

        # board this round — keep the real board layout: slot order + duplicates
        realm = side["publicData"].get("level") or 0
        cards = side["privateData"].get("usedCards") or []
        fams = [fam_index(x) for x in cards if x]
        bkey = tuple(fams)
        if fams:
            for fi in fams:
                STATE["fam_pop"][fi] += w
            rec = b["boards"][realm][bkey]; rec[0] += 1; rec[1] += w; rec[2] += wwin

        # matchup vs REAL opponents only (bots excluded). Buffer the event; we keep it later
        # only if the opponent is a confirmed >=3000 player (skill-matched). mboards stay real-only.
        oppub = opp["publicData"]
        ouid = str(oppub.get("uid", ""))
        if ouid.startswith("ai"):
            bot_uids.add(ouid)
        else:
            opp_uids.add(ouid)
            och = oppub.get("characterId")
            if och:
                STATE["mu_pending"].append((char, career, och, sys.intern(ouid), w, wwin))
                # late-game board played vs this opponent character
                if rnd >= LATE_ROUND and fams:
                    mr = b["mboards"][och][bkey]; mr[0] += 1; mr[1] += w; mr[2] += wwin

    be = STATE["botexp"][char]; be[0] += 1; be[1] += len(bot_uids); be[2] += len(opp_uids)

    # fate & 天衍 selections — cumulative, read from the player's last present round.
    # Each selection = {id: phase, pendings: options offered, selected: chosen}.
    # 4th stat = recency-weighted placement (rank+1) when chosen -> avg placement on display.
    if last_side is not None:
        priv = last_side.get("privateData", {})
        placew = w * (rank + 1)
        for s in priv.get("talentSelectionDatas") or []:
            record_selection(STATE["fates"], char, career, s, w, placew)
        for s in (priv.get("fateStrategyData") or {}).get("strategies") or []:
            record_selection(STATE["derivs"], char, career, s, w, placew)


def record_selection(acc, char, career, s, w, placew):
    sid = s.get("id"); sel = s.get("selected")
    if sid is None or not sel:
        return
    e = acc[(char, career, sid, sel)]
    e[0] += w; e[2] += placew                        # chosen weight, placement-weight when chosen
    for o in s.get("pendings") or []:
        if o:
            acc[(char, career, sid, o)][1] += w      # offered


# ---- shard streaming -------------------------------------------------------
def iter_records_from_raw(raw):
    data = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(raw)).read()
    tf = tarfile.open(fileobj=io.BytesIO(data))
    for mem in tf.getmembers():
        if not (mem.isfile() and mem.name.endswith(".json")):
            continue
        b = tf.extractfile(mem).read()
        STATE["files"] += 1
        m = RX_DAOXIN.search(b)
        if not m or int(m.group(1)) < DAOXIN_MIN:
            continue
        try:
            d = json.loads(b).get("data")
        except Exception:
            continue
        if not d or d.get("seasonMec") != 9 or d.get("gameMode") != 3:
            continue
        if d.get("beginDaoXinRankScore", 0) < DAOXIN_MIN:
            continue
        rss = d.get("roundStats") or []
        if not rss:
            continue
        cnt = Counter()
        for rs in rss:
            for sp in ("p1", "p2"):
                cnt[rs[sp]["publicData"]["uid"]] += 1
        if cnt.most_common(1)[0][0] != d["uid"]:
            continue  # opponent perspective, skip
        STATE["self"] += 1
        process_record(d)


def fetch_raw(shard):
    for a in range(3):
        try:
            return shard, requests.get(f"{BASE}/{shard}.tar.zst", timeout=300).content
        except Exception:
            if a == 2:
                return shard, None
            time.sleep(1.5 * (a + 1))


def new_shards():
    old = set(json.load(open(os.path.join(HERE, "_shards.json"))))
    sess = requests.Session(); names = []; cursor = None
    while True:
        url = API + "?recursive=true&limit=1000" + (f"&cursor={cursor}" if cursor else "")
        r = sess.get(url, timeout=60)
        names += [int(f["path"][:-8]) for f in r.json() if f.get("path", "").endswith(".tar.zst")]
        link = r.headers.get("Link", "")
        if 'rel="next"' in link:
            mm = re.search(r"cursor=([^&>]+)", link); cursor = mm.group(1) if mm else None
            if not cursor:
                break
        else:
            break
    return sorted(set(names) - old)


# ---- output ----------------------------------------------------------------
def resolve_matchups():
    """Fold buffered matchup events into builds, keeping only skill-matched opponents
    (opponent uid is itself a >=DAOXIN_MIN self-record). Bots were already excluded."""
    ok = STATE["self_uids"]; kept = dropped = 0
    for char, career, och, ouid, w, wwin in STATE["mu_pending"]:
        if ouid in ok:
            m = STATE["builds"][(char, career)]["matchup"][och]
            m[0] += w; m[1] += wwin; m[2] += 1; kept += 1
        else:
            dropped += 1
    print(f"matchups: kept {kept} skill-matched, dropped {dropped} "
          f"({dropped / max(1, kept + dropped) * 100:.0f}% non->=3000 opponents)")
    STATE["mu_pending"] = []


def write_output():
    resolve_matchups()
    # Each board/matchup entry carries BOTH a raw occurrence count (for sample-size
    # thresholds) and recency-weighted sums (for current-meta rates & ordering).
    r2 = lambda x: round(x, 2)

    def merge_boards(bd, top_n, top_var=6):
        # group positional boards by card-SET (sorted multiset); merge stats; keep top
        # card-sets, each with its top positional variations.
        # entry -> [repr_famlist, raw, w_count, w_wins, [[famlist, raw, w_count, w_wins], ...]]
        groups = {}
        for bkey, v in bd.items():
            cs = tuple(sorted(bkey))
            g = groups.get(cs)
            if g is None:
                g = groups[cs] = [0, 0.0, 0.0, []]
            g[0] += v[0]; g[1] += v[1]; g[2] += v[2]; g[3].append((bkey, v))
        out = []
        for cs, g in sorted(groups.items(), key=lambda kv: -kv[1][1])[:top_n]:
            vs = sorted(g[3], key=lambda x: -x[1][1])
            variations = [[list(bk), vv[0], r2(vv[1]), r2(vv[2])] for bk, vv in vs[:top_var]]
            out.append([list(vs[0][0]), g[0], r2(g[1]), r2(g[2]), variations])
        return out

    builds_out = {}
    for (char, career), b in STATE["builds"].items():
        rad = {k: (round(v[0] / v[1], 3) if v[1] else 0.0) for k, v in b["radar"].items()}
        # matchup: [oppChar, raw_rounds, w_rounds, w_wins], ordered by raw sample
        matchup = sorted(([oc, m[2], r2(m[0]), r2(m[1])] for oc, m in b["matchup"].items()),
                         key=lambda x: -x[1])
        boards = {realm: merge_boards(bd, TOP_BOARDS) for realm, bd in b["boards"].items()}
        mboards = {}
        for oc, bd in b["mboards"].items():
            mb = merge_boards(bd, TOP_MBOARDS)
            if mb:
                mboards[str(oc)] = mb
        builds_out[f"{char}_{career}"] = {
            "g": r2(b["gw"]), "graw": b["graw"], "place": [r2(p) for p in b["place"]],
            "radar": rad, "matchup": matchup, "boards": boards, "mboards": mboards,
        }
    char_out = {str(char): {"g": r2(c["gw"]), "graw": c["graw"],
                            "swr": round(c["swr"]), "swr2": round(c["swr2"]), "swrp": round(c["swrp"])}
                for char, c in STATE["char"].items()}
    # tiers[char_career][band] = {graw, g, place[8], swr, swr2, swrp}
    tiers_out = {}
    for (char, career, band), tk in STATE["tier"].items():
        tiers_out.setdefault(f"{char}_{career}", {})[band] = {
            "graw": tk["graw"], "g": r2(tk["gw"]), "place": [r2(p) for p in tk["place"]],
            "swr": round(tk["swr"]), "swr2": round(tk["swr2"]), "swrp": round(tk["swrp"])}
    # Split into a light file (drives the character leaderboard, loads instantly) and a
    # heavy file (build detail: boards/matchups/families, lazy-loaded on first build open).
    light = {
        "meta": {"season": 9, "mode": 3, "daoxinMin": DAOXIN_MIN, "halfLifeDays": 7,
                 "selfRecords": STATE["self"], "shards": STATE["shards"]},
        "chars": char_out, "tiers": tiers_out,
    }
    heavy = {
        "builds": builds_out,
        "families": [{**m, "pop": r2(STATE["fam_pop"].get(m["i"], 0))} for m in STATE["fam_meta"]],
    }
    # fate / 天衍 selections: {char_career: {selectionId: [[optionId, chosen_w, offered_w, place_w], ...]}}
    def emit_sel(acc):
        grp = defaultdict(lambda: defaultdict(list))
        ids = set()
        for (char, career, sid, oid), v in acc.items():
            grp[f"{char}_{career}"][sid].append([oid, r2(v[0]), r2(v[1]), r2(v[2])])
            ids.add(oid)
        out = {k: {str(sid): sorted(lst, key=lambda x: -x[1]) for sid, lst in sids.items()}
               for k, sids in grp.items()}
        return out, ids
    fates_out, ids1 = emit_sel(STATE["fates"])
    derivs_out, ids2 = emit_sel(STATE["derivs"])
    # fate bucket: innate if the fate is offered to only one character, else its wiki category
    char_of = defaultdict(set)
    for (char, career, sid, oid) in STATE["fates"]:
        char_of[oid].add(char)
    def fate_bucket(oid):
        if len(char_of.get(oid, ())) <= 1:
            return "innate"
        return FATE_CAT.get(FATE_CN.get(str(oid), ""), "other")
    # fate names come from the fate map; 天衍 derivation options are CARDS (separate id
    # namespace that overlaps fate ids), so they must be named from the card map instead.
    names = {}
    for i in ids1:
        names[str(i)] = {"cn": FATE_CN.get(str(i), ""), "en": FATE_EN.get(str(i), ""),
                         "bucket": fate_bucket(i), "icon": f"Icon_Talent_{i}.png"}
    dnames = {}
    for i in ids2:
        k = str(i)
        dnames[k] = {"cn": DERIV_CN.get(k, ""), "en": DERIV_EN.get(k, ""),
                     "sect": DERIV_SECT.get(k, ""), "icon": DERIV_ICON.get(k, "")}
    fates_file = {
        "meta": {"season": 9, "daoxinMin": DAOXIN_MIN, "halfLifeDays": 7,
                 "selfRecords": STATE["self"], "iconBase": ICON_BASE},
        "fates": fates_out, "derivations": derivs_out, "names": names, "dnames": dnames,
    }

    # bot-exposure diagnostic: do some characters appear in bot-heavier lobbies (which
    # inflates placement, since bots fill the bottom seats)? Pair it with avg placement.
    place_sum, place_g = defaultdict(float), defaultdict(float)
    for (char, career), b in STATE["builds"].items():
        for i, p in enumerate(b["place"]):
            place_sum[char] += (i + 1) * p; place_g[char] += p
    diag = {}
    for char, (n, bots, real) in STATE["botexp"].items():
        diag[str(char)] = {
            "records": n, "avgBots": round(bots / n, 3) if n else 0,
            "avgReal": round(real / n, 3) if n else 0,
            "avgPlace": round(place_sum[char] / place_g[char], 3) if place_g[char] else 0}
    with open(OUT_DIAG, "w", encoding="utf-8") as f:
        json.dump(diag, f, ensure_ascii=False, indent=1)
    gb = sum(v["avgBots"] * v["records"] for v in diag.values()) / max(1, sum(v["records"] for v in diag.values()))
    worst = sorted(diag.items(), key=lambda kv: -kv[1]["avgBots"])[:5]
    print(f"bot-exposure: global avgBots={gb:.2f}; most bot-heavy chars: "
          + ", ".join(f"{c}={v['avgBots']:.2f}(pl {v['avgPlace']:.2f})" for c, v in worst))

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    for path, obj in ((OUT, light), (OUT_BUILDS, heavy), (OUT_FATES, fates_file)):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {os.path.basename(OUT)} ({os.path.getsize(OUT)/1e3:.0f} KB) + "
          f"{os.path.basename(OUT_BUILDS)} ({os.path.getsize(OUT_BUILDS)/1e6:.1f} MB) + "
          f"{os.path.basename(OUT_FATES)} ({os.path.getsize(OUT_FATES)/1e3:.0f} KB) | "
          f"self-records={STATE['self']} builds={len(builds_out)}")


def max_endts_from_raw(raw):
    data = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(raw)).read()
    tf = tarfile.open(fileobj=io.BytesIO(data))
    mx = 0
    for mem in tf.getmembers():
        if not mem.name.endswith(".json"):
            continue
        try:
            d = json.loads(tf.extractfile(mem).read()).get("data")
        except Exception:
            continue
        if d and d.get("seasonMec") == 9:
            ts = d.get("endTs") or d.get("beginTs") or 0
            if ts > mx:
                mx = ts
    return mx


def main(mode):
    global T_REF
    if mode == "local":
        raw = open(os.path.join(HERE, "_new.tar.zst"), "rb").read()
        T_REF = max_endts_from_raw(raw)
        print(f"T_REF (newest game) = {T_REF}")
        iter_records_from_raw(raw)
        STATE["shards"] = 1
    else:
        shards = new_shards()
        print(f"new (season-9) shards to scan: {len(shards)}")
        _, lastraw = fetch_raw(shards[-1])    # newest shard sets the recency reference
        T_REF = max_endts_from_raw(lastraw) if lastraw else 0
        print(f"T_REF (newest game) = {T_REF}")
        t0 = time.time(); done = 0
        it = iter(shards); inflight = set()
        with ThreadPoolExecutor(max_workers=DL_WORKERS) as ex:
            def sub():
                s = next(it, None)
                if s is None:
                    return False
                inflight.add(ex.submit(fetch_raw, s)); return True
            for _ in range(DL_WORKERS * 2):
                if not sub():
                    break
            while inflight:
                ds, _ = wait(inflight, return_when=FIRST_COMPLETED)
                for fut in ds:
                    inflight.discard(fut)
                    sh, raw = fut.result()
                    if raw is not None:
                        try:
                            iter_records_from_raw(raw); STATE["shards"] += 1
                        except Exception as e:
                            print(f"  !! shard {sh}: {e}")
                    done += 1; sub()
                    if done % 25 == 0:
                        el = time.time() - t0
                        print(f"[{done}/{len(shards)}] self={STATE['self']} "
                              f"builds={len(STATE['builds'])} | {done/el*60:.0f} shards/min")
    write_output()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "local")
