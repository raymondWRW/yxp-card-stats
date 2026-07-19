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
    each = avg destiny damage RECEIVED per round (damage dealt doesn't count, so
    mitigation effects like the musician's 慈念曲 are credited; lower = better)
  - popular boards per realm phase (L1-L5): top board archetypes (card families),
    with usage, round win rate, and each slot's most common card LEVEL
  - matchup vs each opponent character: head-to-head FINAL PLACEMENT, matched via
    gameId to the opponent's own >=3000 self-record (real players only, no bots)

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
HALF_LIFE_MS = 4 * 86400 * 1000   # recency half-life = 4 days
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
        # Everything below is split by the player's DaoXin band (index 0/1/2 =
        # A 3000-3999 / B 4000-5999 / C 6000+) so the build page can tier-filter.
        "radar": {k: [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0]] for k in ("e", "m", "l", "f", "s")},  # per band [w_destinyRecv, w_rounds]
        # oppChar -> per band [w_games, w_finishHigher, raw_games, w_selfPlaceSum, w_oppPlaceSum]
        "matchup": defaultdict(lambda: [[0.0, 0.0, 0, 0.0, 0.0] for _ in range(3)]),
        # board keys are the positional tuple of raw card IDS (level-specific) so the
        # display can show each slot's most common level; families are derived on output.
        "boards": defaultdict(lambda: defaultdict(lambda: [[0, 0.0, 0.0], [0, 0.0, 0.0], [0, 0.0, 0.0]])),  # realm->cids->per band [raw, w_count, w_wins]
        "mboards": defaultdict(lambda: defaultdict(lambda: [[0, 0.0, 0.0], [0, 0.0, 0.0], [0, 0.0, 0.0]])),  # oppChar->cids->per band [raw, w_count, w_wins]
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
    # (char,career,selectionId,optionId) -> per DaoXin band [selected_w, offered_w, selected_place_w]
    "fates": defaultdict(lambda: [[0.0, 0.0, 0.0] for _ in range(3)]),   # fate picks (talentSelectionDatas)
    "derivs": defaultdict(lambda: [[0.0, 0.0, 0.0] for _ in range(3)]),  # 天衍 picks (fateStrategyData.strategies)
    "daoyun": defaultdict(lambda: [[0.0, 0.0, 0.0] for _ in range(3)]),  # 道韵 picks (daoYunSelectionDatas)
    # skill-matched matchups: every >=3000 player appears as a self-record, so we map
    # (gameId, uid) -> final placement, buffer per-game matchup events, then keep only
    # those where the opponent's own record of the SAME game confirms them >=3000 —
    # which also hands us their final placement for the head-to-head comparison.
    "self_ranks": {},                     # (gameId, uid) -> battleRank (0-7)
    "mu_pending": [],                     # (char, career, oppChar, oppUid, gameId, w, myRank)
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
    bi = "ABC".index(band)                # band index for the band-split build stats
    tk = STATE["tier"][(char, career, band)]
    tk["gw"] += w; tk["graw"] += 1; tk["place"][rank] += w
    tk["swr"] += w * r; tk["swr2"] += w * r * r; tk["swrp"] += w * r * p

    gid = sys.intern(str(d.get("gameId", "")))
    STATE["self_ranks"][(gid, uid)] = rank
    opp_chars = {}                        # real opponents this game: uid -> characterId
    bot_uids = set()                      # distinct bot opponents (for bot-exposure diag)
    last_side = None
    for rs in d.get("roundStats", []):
        side = None; opp = None; selfp = None
        for sp in ("p1", "p2"):
            if rs[sp]["publicData"]["uid"] == uid:
                side = rs[sp]; opp = rs["p2" if sp == "p1" else "p1"]; selfp = sp
                break
        if side is None:
            continue
        last_side = side
        won = rs.get("winerId") == uid
        first = rs.get("firstPlayerId") == uid
        rnd = rs.get("round") or 0
        wwin = w if won else 0.0
        # destiny (命) damage: round lifeDamage is signed from p1's view; flip for p2 so
        # positive = self DEALT it (won the round), negative = self RECEIVED it (lost).
        # The radar tracks only the RECEIVED side, so mitigation (e.g. 慈念曲) is credited.
        ld = rs.get("lifeDamage") or 0
        sd = ld if selfp == "p1" else -ld
        recv = -sd if sd < 0 else 0
        # radar axes = recency-weighted destiny received per round, per phase / turn-order slot
        rad = b["radar"]
        phase = "e" if rnd <= 7 else ("m" if rnd <= 13 else "l")
        rad[phase][bi][1] += w; rad[phase][bi][0] += w * recv
        slot = "f" if first else "s"
        rad[slot][bi][1] += w; rad[slot][bi][0] += w * recv

        # board this round — keep the real board layout: slot order + duplicates + levels
        realm = side["publicData"].get("level") or 0
        cards = side["privateData"].get("usedCards") or []
        cids = tuple(x for x in cards if x)
        if cids:
            for x in cids:
                STATE["fam_pop"][fam_index(x)] += w
            rec = b["boards"][realm][cids][bi]; rec[0] += 1; rec[1] += w; rec[2] += wwin

        # opponents: bots excluded; real ones buffered per-game for the placement matchup
        oppub = opp["publicData"]
        ouid = str(oppub.get("uid", ""))
        if ouid.startswith("ai"):
            bot_uids.add(ouid)
        else:
            och = oppub.get("characterId")
            if och:
                opp_chars[ouid] = och
                # late-game board played vs this opponent character
                if rnd >= LATE_ROUND and cids:
                    mr = b["mboards"][och][cids][bi]; mr[0] += 1; mr[1] += w; mr[2] += wwin

    # one matchup event per distinct real opponent per game; resolved after all shards
    # (we need the opponent's own record to confirm >=3000 and get their placement).
    for ouid, och in opp_chars.items():
        STATE["mu_pending"].append((char, career, och, sys.intern(ouid), gid, w, rank, bi))

    be = STATE["botexp"][char]; be[0] += 1; be[1] += len(bot_uids); be[2] += len(opp_chars)

    # fate & 天衍 selections — cumulative, read from the player's last present round.
    # Each selection = {id: phase, pendings: options offered, selected: chosen}.
    # 4th stat = recency-weighted placement (rank+1) when chosen -> avg placement on display.
    if last_side is not None:
        priv = last_side.get("privateData", {})
        placew = w * (rank + 1)
        for s in priv.get("talentSelectionDatas") or []:
            record_selection(STATE["fates"], char, career, s, w, placew, bi)
        for s in (priv.get("fateStrategyData") or {}).get("strategies") or []:
            record_selection(STATE["derivs"], char, career, s, w, placew, bi)
        # 道韵: two picks per game. The first is always selection id 4; the second's id
        # varies with game pace (10-21, usually 15) — bucket them into slots 1 and 2.
        for s in priv.get("daoYunSelectionDatas") or []:
            slot = 1 if (s.get("id") or 0) <= 9 else 2
            record_selection(STATE["daoyun"], char, career, s, w, placew, bi, sid=slot)


def record_selection(acc, char, career, s, w, placew, bi, sid=None):
    if sid is None:
        sid = s.get("id")
    sel = s.get("selected")
    if sid is None or not sel:
        return
    e = acc[(char, career, sid, sel)][bi]
    e[0] += w; e[2] += placew                        # chosen weight, placement-weight when chosen
    for o in s.get("pendings") or []:
        if o:
            acc[(char, career, sid, o)][bi][1] += w  # offered


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
    """Fold buffered per-game matchup events into builds. An event survives only if the
    opponent has their own >=DAOXIN_MIN self-record of the SAME game (skill-matched, no
    bots) — that record also gives their final placement for the head-to-head compare."""
    ranks = STATE["self_ranks"]; kept = dropped = 0
    for char, career, och, ouid, gid, w, myrank, bi in STATE["mu_pending"]:
        orank = ranks.get((gid, ouid))
        if orank is None:
            dropped += 1
            continue
        m = STATE["builds"][(char, career)]["matchup"][och][bi]
        m[0] += w; m[2] += 1; kept += 1
        if myrank < orank:
            m[1] += w                          # finished above this opponent
        m[3] += w * (myrank + 1); m[4] += w * (orank + 1)
    print(f"matchups: kept {kept} skill-matched, dropped {dropped} "
          f"({dropped / max(1, kept + dropped) * 100:.0f}% non->=3000 opponents)")
    STATE["mu_pending"] = []


def write_output():
    resolve_matchups()
    # Each board/matchup entry carries BOTH a raw occurrence count (for sample-size
    # thresholds) and recency-weighted sums (for current-meta rates & ordering).
    r2 = lambda x: round(x, 2)

    def merge_boards(bd, top_n, top_var=6):
        # bd keys are positional CARD-ID tuples (level-specific); values are per-DaoXin-band
        # [raw, w, ww] triplets. Group by card-family SET (sorted multiset) for the top
        # list; within a set, group by positional family layout for the variations; per
        # slot, keep the most common LEVEL (cid). Grouping/ordering use all-band totals;
        # stats stay band-split so the frontend can tier-filter.
        # entry -> [famlist, [[raw,w,ww] xA/B/C], [[famlist, bands, imgs], ...], imgs]
        zero3 = lambda: [[0, 0.0, 0.0], [0, 0.0, 0.0], [0, 0.0, 0.0]]
        wtot = lambda s3: s3[0][1] + s3[1][1] + s3[2][1]
        rb = lambda s3: [[s[0], r2(s[1]), r2(s[2])] for s in s3]
        groups = {}
        for ckey, v in bd.items():
            fams = tuple(fam_index(c) for c in ckey)
            cs = tuple(sorted(fams))
            g = groups.get(cs)
            if g is None:
                g = groups[cs] = [zero3(), {}]
            vv = g[1].get(fams)
            if vv is None:
                vv = g[1][fams] = [zero3(), [Counter() for _ in fams]]
            for b3 in range(3):
                for j in range(3):
                    g[0][b3][j] += v[b3][j]; vv[0][b3][j] += v[b3][j]
            raw_all = v[0][0] + v[1][0] + v[2][0]
            for i, c in enumerate(ckey):
                vv[1][i][c] += raw_all           # level popularity per slot (raw count)
        out = []
        for cs, g in sorted(groups.items(), key=lambda kv: -wtot(kv[1][0]))[:top_n]:
            vs = sorted(g[1].items(), key=lambda kv: -wtot(kv[1][0]))
            variations = [[list(fams), rb(vv[0]), [c.most_common(1)[0][0] for c in vv[1]]]
                          for fams, vv in vs[:top_var]]
            top = variations[0]
            out.append([top[0], rb(g[0]), variations, top[2]])
        return out

    builds_out = {}
    for (char, career), b in STATE["builds"].items():
        # radar: per band [w_destinyRecvSum, w_roundSum] — the frontend divides after
        # summing its selected bands.
        rad = {k: [[r2(bb[0]), r2(bb[1])] for bb in v] for k, v in b["radar"].items()}
        # matchup: [oppChar, per band [raw_games, w_games, w_finishHigher, w_selfPlaceSum, w_oppPlaceSum]]
        matchup = sorted(([oc, [[m[2], r2(m[0]), r2(m[1]), r2(m[3]), r2(m[4])] for m in bands]]
                          for oc, bands in b["matchup"].items()),
                         key=lambda x: -(x[1][0][0] + x[1][1][0] + x[1][2][0]))
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
        "meta": {"season": 9, "mode": 3, "daoxinMin": DAOXIN_MIN, "halfLifeDays": 4,
                 "selfRecords": STATE["self"], "shards": STATE["shards"]},
        "chars": char_out, "tiers": tiers_out,
    }
    # v2: radar = destiny received (not round WR), matchup = placement head-to-head,
    # boards carry per-slot modal card levels. v3: all build stats split by DaoXin band
    # (A/B/C) for the build-page tier filter. The frontend gates rendering on this.
    heavy = {
        "v": 3,
        "builds": builds_out,
        "families": [{**m, "pop": r2(STATE["fam_pop"].get(m["i"], 0))} for m in STATE["fam_meta"]],
    }
    # fate / 天衍 / 道韵 selections:
    # {char_career: {selectionId: [[optionId, per band [chosen_w, offered_w, place_w]], ...]}}
    def emit_sel(acc):
        grp = defaultdict(lambda: defaultdict(list))
        ids = set()
        for (char, career, sid, oid), v in acc.items():
            grp[f"{char}_{career}"][sid].append([oid, [[r2(x) for x in bb] for bb in v]])
            ids.add(oid)
        sel_tot = lambda row: row[1][0][0] + row[1][1][0] + row[1][2][0]
        out = {k: {str(sid): sorted(lst, key=lambda x: -sel_tot(x)) for sid, lst in sids.items()}
               for k, sids in grp.items()}
        return out, ids
    fates_out, ids1 = emit_sel(STATE["fates"])
    derivs_out, ids2 = emit_sel(STATE["derivs"])
    daoyun_out, ids3 = emit_sel(STATE["daoyun"])
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
    # 道韵 options are regular CARDS (plus the free pick 自在随心, id 27) — name them from
    # the card maps; the frontend uses the card art itself as the icon. "free": 1 marks
    # 自在随心 so the showcased top pick can skip it.
    ynames = {}
    for i in ids3:
        cn = CN_NAME.get(str(i), "")
        ynames[str(i)] = {"cn": cn, "en": CN2EN.get(cn, ""),
                          "free": 1 if (i == 27 or cn == "自在随心") else 0}
    fates_file = {
        "v": 3,                                       # rows are per-DaoXin-band since v3
        "meta": {"season": 9, "daoxinMin": DAOXIN_MIN, "halfLifeDays": 4,
                 "selfRecords": STATE["self"], "iconBase": ICON_BASE},
        "fates": fates_out, "derivations": derivs_out, "daoyun": daoyun_out,
        "names": names, "dnames": dnames, "ynames": ynames,
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
