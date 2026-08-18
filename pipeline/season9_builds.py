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
import math
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
WC_ROUND = 12          # 轮椅指数 (wheelchair index) looks at boards from this round on
WC_MIN_RAW = 50        # min raw R12+ rounds for a build/tier to get a wheelchair entry
CURVE_ROUNDS = 30      # per-round curves (rerolls held / realm level) track rounds 1..30
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
        # per-round value HISTOGRAMS (for median curves): per band, per round 1..CURVE_ROUNDS,
        # recency-weighted counts per value — rerolls held clamped to 0..25, realm to 0..6.
        "rch": [[[0.0] * 26 for _ in range(CURVE_ROUNDS)] for _ in range(3)],
        "lvh": [[[0.0] * 7 for _ in range(CURVE_ROUNDS)] for _ in range(3)],
    }


# ---- strategy (archetype) splits --------------------------------------------
# Some combos blend distinct fixed archetypes; classify each GAME's strategy and key
# all build stats by (char, career, variant). Defining fates are read from the final
# talents (publicData.talents, which may carry +10000/20000/30000 upgrade offsets);
# defining board cards (e.g. 玄灵愈体 -> 玄奶) count if played in ANY round.
def _fate_tiers(base):
    return {base, base + 10000, base + 20000, base + 30000}
WC_MENGGONG = _fate_tiers(173)   # 屠馗 天命 猛攻之姿 -> 百杀 archetype
WC_BENGLIE = _fate_tiers(174)    # 屠馗 天命 崩裂之拳 -> 崩拳 archetype
WC_RONGHUI = _fate_tiers(192)    # 黎承云 天命 剑招融汇 -> 融剑 archetype
# 陆剑心 phase-4 upgrade of fate 95 灵气凝铸 — the chosen TIER is the discriminator:
LJX_FUFANG = {10095, 20095}      # 聚灵凝铸 (Spiritage) / 御灵凝铸 (Spiritstat) -> 符防
LJX_FUJIANYI = {30095}           # 灵威凝铸 (Spiritual Power Forging) -> 符剑意
NGS_SWIFT = _fate_tiers(140)     # 南宫生 疾燃咒印 (Swift Burning Seal), with 硬枝竹 -> 田土
DLY_NIKE = _fate_tiers(124)      # 杜伶鸳 双鸳逆克 (Overcome with each other) -> 逆克
JXM_DINGHUN = _fate_tiers(52)    # 姜袭明 七星定魂 (Heptastar Soulstat) -> 定魂
CHAR_TUKUI, CHAR_XIAOBU, CHAR_YEMM, CHAR_LICHY = 4000002, 4000001, 4000003, 1000006
CHAR_LJX, CHAR_NGS, CHAR_DLY, CHAR_JXM = 1000005, 3000005, 3000002, 2000004
CAREER_EL, CAREER_FU, CAREER_PM = 1, 2, 6      # 炼丹师, 符咒师, 灵植师

# combos whose classification also needs a board-card scan: (char, career) -> card name
WC_BOARD_MARK = {
    (CHAR_XIAOBU, CAREER_EL): "玄灵愈体",
    (CHAR_YEMM, CAREER_EL): "玄灵愈体",
    (CHAR_NGS, CAREER_PM): "硬枝竹",
}


def classify_variant(char, career, talents, has_mark):
    """Per-game strategy label ('' = this combo is not split)."""
    if char == CHAR_TUKUI and career in (CAREER_EL, CAREER_PM):
        ts = set(talents)
        if ts & WC_MENGGONG:
            return "百杀"
        if ts & WC_BENGLIE:
            return "崩拳"
        return "其他"
    if char == CHAR_XIAOBU and career == CAREER_EL:
        return "玄奶" if has_mark else "其他"
    if char == CHAR_YEMM and career == CAREER_EL:
        return "玄奶" if has_mark else "崩拳"       # 叶冥冥's non-玄奶 elixirist line is 崩拳
    if char == CHAR_LICHY:
        return "融剑" if set(talents) & WC_RONGHUI else "白板"   # 白板 = plain / no 融剑
    if char == CHAR_LJX and career == CAREER_FU:
        ts = set(talents)
        if ts & LJX_FUFANG:
            return "符防"
        if ts & LJX_FUJIANYI:
            return "符剑意"
        return "其他"
    if char == CHAR_NGS and career == CAREER_PM:
        return "田土" if (has_mark and set(talents) & NGS_SWIFT) else "混元"
    if char == CHAR_DLY and career == CAREER_EL:
        return "逆克" if set(talents) & DLY_NIKE else "其他"
    if char == CHAR_JXM:
        return "定魂" if set(talents) & JXM_DINGHUN else "其他"
    return ""


def new_wc():
    # 轮椅指数 raw material (rounds >= WC_ROUND), per band:
    # n = [w_rounds, raw_rounds, w_wins]; pool = famIdx -> w; slot -> famIdx -> w;
    # pl = [w_games, raw_games, w*placement] — per GAME, variant judged from the
    # game's final board/talents, so split variants get their own placement.
    return {"n": [[0.0, 0, 0.0] for _ in range(3)],
            "pool": [defaultdict(float) for _ in range(3)],
            "slot": [defaultdict(lambda: defaultdict(float)) for _ in range(3)],
            "pl": [[0.0, 0, 0.0] for _ in range(3)]}


STATE = {
    "builds": defaultdict(new_build),     # (char,career,strategyVariant) -> build
    "wc": defaultdict(new_wc),            # (char,career,strategyVariant) -> 轮椅指数 accumulators
    # char -> weighted/raw games + rank-score sufficient stats (for skill-adjusted Power)
    "char": defaultdict(lambda: {"gw": 0.0, "graw": 0, "swr": 0.0, "swr2": 0.0, "swrp": 0.0}),
    # (char,career,variant,daoxin-band) -> placement+rank stats for the tier filters
    "tier": defaultdict(lambda: {"gw": 0.0, "graw": 0, "place": [0.0] * 8,
                                 "swr": 0.0, "swr2": 0.0, "swrp": 0.0}),
    "fam_idx": {}, "fam_meta": [],        # family registry
    "fam_pop": defaultdict(float),        # famIdx -> weighted board appearances (for card ordering)
    # (char,career,variant,selectionId,optionId) -> per DaoXin band
    # [selected_w, offered_w, selected_place_w, selected_raw, offered_raw]
    "fates": defaultdict(lambda: [[0.0, 0.0, 0.0, 0, 0] for _ in range(3)]),   # fate picks (talentSelectionDatas)
    "derivs": defaultdict(lambda: [[0.0, 0.0, 0.0, 0, 0] for _ in range(3)]),  # 天衍 picks (fateStrategyData.strategies)
    "daoyun": defaultdict(lambda: [[0.0, 0.0, 0.0, 0, 0] for _ in range(3)]),  # 道韵 picks (daoYunSelectionDatas)
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

    # --- pre-pass: collect the player's side of every round, then classify the GAME's
    # strategy variant (final talents; defining board card counts from any round).
    sides = []
    for rs in d.get("roundStats", []):
        for sp in ("p1", "p2"):
            if rs[sp]["publicData"]["uid"] == uid:
                sides.append((rs, rs[sp], rs["p2" if sp == "p1" else "p1"], sp))
                break
    if not sides:
        return
    last_side = sides[-1][1]
    mark = WC_BOARD_MARK.get((char, career))
    has_mark = False
    if mark:
        for _, side, _, _ in sides:
            if any(x and CN_NAME.get(str(x)) == mark for x in side["privateData"].get("usedCards") or []):
                has_mark = True
                break
    var = classify_variant(char, career, last_side["publicData"].get("talents") or [], has_mark)

    b = STATE["builds"][(char, career, var)]
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
    tk = STATE["tier"][(char, career, var, band)]
    tk["gw"] += w; tk["graw"] += 1; tk["place"][rank] += w
    tk["swr"] += w * r; tk["swr2"] += w * r * r; tk["swrp"] += w * r * p

    gid = sys.intern(str(d.get("gameId", "")))
    STATE["self_ranks"][(gid, uid)] = rank
    # 轮椅指数 placement for this game's variant
    wk = STATE["wc"][(char, career, var)]
    wpl = wk["pl"][bi]
    wpl[0] += w; wpl[1] += 1; wpl[2] += w * (rank + 1)
    opp_chars = {}                        # real opponents this game: uid -> characterId
    bot_uids = set()                      # distinct bot opponents (for bot-exposure diag)
    for rs, side, opp, selfp in sides:
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

        # per-round curves: rerolls held (replaceCardChance snapshot) + realm level
        if rnd >= 1:
            ri = min(rnd, CURVE_ROUNDS) - 1
            rc = side["privateData"].get("replaceCardChance") or 0
            lv = side["publicData"].get("level") or 0
            b["rch"][bi][ri][min(max(int(rc), 0), 25)] += w
            b["lvh"][bi][ri][min(max(int(lv), 0), 6)] += w

        # board this round — keep the real board layout: slot order + duplicates + levels
        realm = side["publicData"].get("level") or 0
        cards = side["privateData"].get("usedCards") or []
        cids = tuple(x for x in cards if x)
        if cids:
            fams = [fam_index(x) for x in cids]
            for fi in fams:
                STATE["fam_pop"][fi] += w
            rec = b["boards"][realm][cids][bi]; rec[0] += 1; rec[1] += w; rec[2] += wwin
            # 轮椅指数 raw material: from round WC_ROUND on, what does this build keep playing?
            if rnd >= WC_ROUND:
                wcb = wk["n"][bi]; wcb[0] += w; wcb[1] += 1; wcb[2] += wwin
                pool = wk["pool"][bi]; slots = wk["slot"][bi]
                for i, fi in enumerate(fams):
                    pool[fi] += w; slots[i][fi] += w

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
        STATE["mu_pending"].append((char, career, var, och, sys.intern(ouid), gid, w, rank, bi))

    be = STATE["botexp"][char]; be[0] += 1; be[1] += len(bot_uids); be[2] += len(opp_chars)

    # fate & 天衍 & 道韵 selections — cumulative, read from the player's last present
    # round, keyed with the game's strategy variant.
    priv = last_side.get("privateData", {})
    placew = w * (rank + 1)
    for s in priv.get("talentSelectionDatas") or []:
        record_selection(STATE["fates"], char, career, var, s, w, placew, bi)
    for s in (priv.get("fateStrategyData") or {}).get("strategies") or []:
        record_selection(STATE["derivs"], char, career, var, s, w, placew, bi)
    # 道韵: two picks per game. The first is always selection id 4; the second's id
    # varies with game pace (10-21, usually 15) — bucket them into slots 1 and 2.
    for s in priv.get("daoYunSelectionDatas") or []:
        slot = 1 if (s.get("id") or 0) <= 9 else 2
        record_selection(STATE["daoyun"], char, career, var, s, w, placew, bi, sid=slot)


def record_selection(acc, char, career, var, s, w, placew, bi, sid=None):
    if sid is None:
        sid = s.get("id")
    sel = s.get("selected")
    if sid is None or not sel:
        return
    e = acc[(char, career, var, sid, sel)][bi]
    e[0] += w; e[2] += placew; e[3] += 1             # chosen weight + raw, placement-weight
    for o in s.get("pendings") or []:
        if o:
            oe = acc[(char, career, var, sid, o)][bi]
            oe[1] += w; oe[4] += 1                   # offered weight + raw


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
        # the HF API occasionally returns an error object instead of the file list;
        # retry a few times before giving up so transient hiccups don't kill the run
        for attempt in range(4):
            r = sess.get(url, timeout=60)
            body = r.json() if r.status_code == 200 else None
            if isinstance(body, list):
                break
            print(f"  !! shard listing attempt {attempt + 1}: status={r.status_code} body={str(body)[:200]}")
            if attempt == 3:
                raise RuntimeError("HuggingFace tree API kept failing")
            time.sleep(5 * (attempt + 1))
        names += [int(f["path"][:-8]) for f in body if f.get("path", "").endswith(".tar.zst")]
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
    for char, career, var, och, ouid, gid, w, myrank, bi in STATE["mu_pending"]:
        orank = ranks.get((gid, ouid))
        if orank is None:
            dropped += 1
            continue
        m = STATE["builds"][(char, career, var)]["matchup"][och][bi]
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
    for (char, career, var), b in STATE["builds"].items():
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
        # curves: WEIGHTED MEDIAN per round, precomputed per cumulative tier (medians
        # can't be merged client-side). Entry [ti][round] = [w, medRerolls, medRealm];
        # plain (lower) weighted median — the actual most-central integer value.
        def wmed(hist):
            tot = sum(hist)
            if tot <= 0:
                return 0
            half = tot / 2; cum = 0.0
            for v, n in enumerate(hist):
                cum += n
                if cum >= half:
                    return v
            return 0
        curve = []
        for idxs in ((0, 1, 2), (1, 2), (2,)):     # tiers 3000 / 4000 / 6000
            trows = []
            for ri in range(CURVE_ROUNDS):
                rch = [sum(b["rch"][i][ri][v] for i in idxs) for v in range(26)]
                lvh = [sum(b["lvh"][i][ri][v] for i in idxs) for v in range(7)]
                trows.append([r2(sum(rch)), wmed(rch), wmed(lvh)])
            curve.append(trows)
        # split combos live ONLY under their variant keys ("char_career|variant")
        builds_out[f"{char}_{career}" + (f"|{var}" if var else "")] = {
            "g": r2(b["gw"]), "graw": b["graw"], "place": [r2(p) for p in b["place"]],
            "radar": rad, "matchup": matchup, "boards": boards, "mboards": mboards,
            "curve": curve,
        }
    char_out = {str(char): {"g": r2(c["gw"]), "graw": c["graw"],
                            "swr": round(c["swr"]), "swr2": round(c["swr2"]), "swrp": round(c["swrp"])}
                for char, c in STATE["char"].items()}
    # tiers[key][band] = {graw, g, place[8], swr, swr2, swrp}; split combos get BOTH
    # per-variant keys ("char_career|variant") and an aggregate plain key summed across
    # variants, so character-level views keep working unchanged.
    tiers_out = {}
    agg = {}
    for (char, career, var, band), tk in STATE["tier"].items():
        key = f"{char}_{career}" + (f"|{var}" if var else "")
        tiers_out.setdefault(key, {})[band] = {
            "graw": tk["graw"], "g": r2(tk["gw"]), "place": [r2(p) for p in tk["place"]],
            "swr": round(tk["swr"]), "swr2": round(tk["swr2"]), "swrp": round(tk["swrp"])}
        if var:
            a = agg.setdefault(f"{char}_{career}", {}).setdefault(band, [0, 0.0, [0.0] * 8, 0.0, 0.0, 0.0])
            a[0] += tk["graw"]; a[1] += tk["gw"]
            for i in range(8):
                a[2][i] += tk["place"][i]
            a[3] += tk["swr"]; a[4] += tk["swr2"]; a[5] += tk["swrp"]
    for key, bands in agg.items():
        for band, a in bands.items():
            tiers_out.setdefault(key, {})[band] = {
                "graw": a[0], "g": r2(a[1]), "place": [r2(p) for p in a[2]],
                "swr": round(a[3]), "swr2": round(a[4]), "swrp": round(a[5])}
    # 轮椅指数 components per build per tier (cumulative bands, like the tier filter).
    # Diversity is the ENTROPY-based effective count, so frequency matters: a card played
    # once in 100 games barely moves it, while an always-played 8-card core reads as ~8.
    #   poolEff = exp(H) of the R12+ card-family distribution (effective card pool size)
    #   slotEff = usage-weighted mean of per-board-slot exp(H) (effective choices per slot)
    #   wr      = recency-weighted R12+ round win rate (the "strength in that range")
    # The frontend turns these into a 0-100 ranking via percentiles across builds.
    def eff(counter):
        tot = sum(counter.values())
        if tot <= 0:
            return 0.0
        h = 0.0
        for v in counter.values():
            p = v / tot
            if p > 0:
                h -= p * math.log(p)
        return math.exp(h)

    wc_out = {}
    for (char, career, var), wk in STATE["wc"].items():
        ent = {}
        for tier, idxs in (("3000", (0, 1, 2)), ("4000", (1, 2)), ("6000", (2,))):
            raw = sum(wk["n"][i][1] for i in idxs)
            if raw < WC_MIN_RAW:
                continue
            wr_w = sum(wk["n"][i][0] for i in idxs)
            wins = sum(wk["n"][i][2] for i in idxs)
            pool = defaultdict(float)
            for i in idxs:
                for f, v in wk["pool"][i].items():
                    pool[f] += v
            slots = defaultdict(lambda: defaultdict(float))
            for i in idxs:
                for si, c in wk["slot"][i].items():
                    for f, v in c.items():
                        slots[si][f] += v
            tot = sum(sum(c.values()) for c in slots.values())
            slot_eff = sum(eff(c) * (sum(c.values()) / tot) for c in slots.values()) if tot else 0.0
            pl_w = sum(wk["pl"][i][0] for i in idxs)
            pl_raw = sum(wk["pl"][i][1] for i in idxs)
            pl_sum = sum(wk["pl"][i][2] for i in idxs)
            ent[tier] = [r2(wr_w), raw, round(wins / wr_w, 4) if wr_w else 0,
                         round(eff(pool), 2), round(slot_eff, 2),
                         round(pl_sum / pl_w, 3) if pl_w else 0, pl_raw]
        if ent:
            # split combos carry their archetype label after "|" (e.g. "4000002_6|百杀")
            wc_out[f"{char}_{career}" + (f"|{var}" if var else "")] = ent

    # Split into a light file (drives the character leaderboard, loads instantly) and a
    # heavy file (build detail: boards/matchups/families, lazy-loaded on first build open).
    light = {
        "meta": {"season": 9, "mode": 3, "daoxinMin": DAOXIN_MIN, "halfLifeDays": 4,
                 "selfRecords": STATE["self"], "shards": STATE["shards"], "wcRound": WC_ROUND},
        "chars": char_out, "tiers": tiers_out, "wc": wc_out,
    }
    # v2: radar = destiny received (not round WR), matchup = placement head-to-head,
    # boards carry per-slot modal card levels. v3: all build stats split by DaoXin band
    # (A/B/C) for the build-page tier filter. v4: split combos keyed per strategy
    # variant + per-round curves. v5: curves are per-tier weighted MEDIANS.
    heavy = {
        "v": 5,
        "builds": builds_out,
        "families": [{**m, "pop": r2(STATE["fam_pop"].get(m["i"], 0))} for m in STATE["fam_meta"]],
    }
    # fate / 天衍 / 道韵 selections:
    # {char_career: {selectionId: [[optionId, per band [chosen_w, offered_w, place_w]], ...]}}
    def emit_sel(acc):
        grp = defaultdict(lambda: defaultdict(list))
        ids = set()
        for (char, career, var, sid, oid), v in acc.items():
            key = f"{char}_{career}" + (f"|{var}" if var else "")
            grp[key][sid].append([oid, [[r2(x) for x in bb] for bb in v]])
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
    for (char, career, var, sid, oid) in STATE["fates"]:
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
        "v": 5,   # v3: per-band rows; v4: strategy-variant keys; v5: raw counts appended
        "meta": {"season": 9, "daoxinMin": DAOXIN_MIN, "halfLifeDays": 4,
                 "selfRecords": STATE["self"], "iconBase": ICON_BASE},
        "fates": fates_out, "derivations": derivs_out, "daoyun": daoyun_out,
        "names": names, "dnames": dnames, "ynames": ynames,
    }

    # bot-exposure diagnostic: do some characters appear in bot-heavier lobbies (which
    # inflates placement, since bots fill the bottom seats)? Pair it with avg placement.
    place_sum, place_g = defaultdict(float), defaultdict(float)
    for (char, career, var), b in STATE["builds"].items():
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
