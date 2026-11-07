"""Build xianmo_map.json: the 百家之道 仙命 id -> name registry (season 10's in-game picks).

Replays record the season's 仙命 picks in privateData.xianMoData.strategies: one entry per
pick ({id: round offered, pendings: [3 options + skip], selected}). Option ids are
pool*1000 + n from the game's XianMoStrategyConfig; ids < 1000 are the "skip" choice.
NAMES come from the game's own localization (the Localization MonoBehaviour in the asset bundles:
key XianMoStrategyName_<id> -> [zh-CN, en, zh-TW]); 736 of 754 options have one, the rest are
hidden / disabled options no replay offers. ICONS (and pool names) come from the wiki's
hundred-schools pages, matched per pool by
  1. wiki art named after the config id itself (Icon_XianMoStrategy_<id>)
  2. icon name (config field 15 == the wiki icon file)
  3. reward card (wiki data-card-instance is one of the packed card ids in config field 9)
  4. leftovers paired in the wiki's own sort order (sect = field 4 blank-first, then id),
     only when the leftover counts match.
Wiki-matched names agreed with the localization on all 707 options both cover (2026-10-25).

Needs the game installed locally (configs are read from its asset bundles) + UnityPy.
Run after a game patch changes the season's options; then copy xianmo_map.json next to
season_builds.py in the deploy repo's pipeline/ and bump SCHEMA there.
"""
import html, json, os, re, urllib.request

import struct

import UnityPy

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "xianmo_map.json")
GAME = r"C:\Program Files (x86)\Steam\steamapps\common\YiXianPai\YiXianPai_Data\StreamingAssets\aa\StandaloneWindows64"
WIKI = "https://sharpobject.github.io/yxp_wiki/{lang}/fates/hundred-schools.html"
UnityPy.config.FALLBACK_UNITY_VERSION = "2020.3.49f1"   # the version is stripped from the bundles

# wiki pool anchor -> config pool id, matched on round range, skip cost and option count
POOLMAP = {
    "sword-spirit-pool-1": 2, "sword-spirit-pool-2": 26, "sword-spirit-pool-3": 15,
    "long-ying-pool-1": 20, "long-ying-pool-2": 3, "dan-ge-pool-1": 4,
    "xuan-si-pool-1": 10, "xuan-si-pool-2": 22, "xuan-si-pool-3": 18,
    "the-old-man-in-white-pool-1": 19, "the-old-man-in-white-pool-2": 5,
    "mo-minggui-pool-1": 13, "mo-feiming-pool-1": 6, "mo-feiming-pool-2": 14,
    "gongshu-ju-pool-1": 23, "gongshu-yao-pool-1": 17, "gongshu-yao-pool-2": 7,
    "jiu-jie-pool-1": 8, "jiu-jie-pool-2": 28, "black-sphere-pool-1": 9,
    "getian-yin-pool-1": 29, "getian-yin-pool-2": 1,
    "danqingke-pool-1": 12, "danqingke-pool-2": 16, "danqingke-pool-3": 21,
    "chaos-devil-pool-1": 11, "chaos-devil-pool-2": 27,
    "suanni-pool-1": 24, "suanni-pool-2": 25,
}


# ---- minimal protobuf reading (Luban tables: top-level field 2 = one row) ----------
def varint(b, i):
    r = s = 0
    while True:
        x = b[i]; i += 1; r |= (x & 0x7F) << s; s += 7
        if x < 0x80:
            return r, i


def fields(b):
    i, out = 0, []
    while i < len(b):
        k, i = varint(b, i); f, wt = k >> 3, k & 7
        if wt == 0:
            v, i = varint(b, i)
        elif wt == 2:
            n, i = varint(b, i); v = b[i:i + n]; i += n
        elif wt == 5:
            v = int.from_bytes(b[i:i + 4], "little"); i += 4
        elif wt == 1:
            v = int.from_bytes(b[i:i + 8], "little"); i += 8
        else:
            raise ValueError(f"wire type {wt}")
        out.append((f, v))
    return out


def packed(v):
    """bytes -> list of varints (packed repeated int field); [] if it isn't one"""
    if isinstance(v, int):
        return [v]
    if not isinstance(v, bytes):
        return []
    out, i = [], 0
    try:
        while i < len(v):
            x, i = varint(v, i); out.append(x)
    except IndexError:
        return []
    return out


def config_rows(name):
    for f in os.listdir(GAME):
        if not f.endswith(".bundle"):
            continue
        try:
            env = UnityPy.load(os.path.join(GAME, f))
        except Exception:
            continue
        for o in env.objects:
            if o.type.name != "TextAsset":
                continue
            t = o.read()
            if t.m_Name != name:
                continue
            b = t.m_Script.encode("utf-8", "surrogateescape") if isinstance(t.m_Script, str) else bytes(t.m_Script)
            rows = []
            for fid, v in fields(b):
                if fid != 2:
                    continue
                r = {}
                for g, x in fields(v):
                    if isinstance(x, bytes) and g == 15:
                        x = x.decode("utf-8", "replace")
                    r.setdefault(g, x)
                rows.append(r)
            return rows
    raise SystemExit(f"{name} not found in the game bundles")


# ---- game localization ------------------------------------------------------------
def localization_names(prefix=b"XianMoStrategyName_"):
    """{id: [zh-CN, en, zh-TW]} from the game's Localization MonoBehaviour. Each entry is the key
    string, padding, a 0 field, count=3, then three (length, utf-8, pad-to-4) strings."""
    for f in os.listdir(GAME):
        if not f.endswith(".bundle") or os.path.getsize(os.path.join(GAME, f)) > 40_000_000:
            continue
        try:
            env = UnityPy.load(os.path.join(GAME, f))
        except Exception:
            continue
        for o in env.objects:
            if o.type.name != "MonoBehaviour":
                continue
            b = o.get_raw_data()
            if prefix not in b:
                continue
            out = {}
            for m in re.finditer(re.escape(prefix) + rb"(\d+)\x00", b):
                end = m.end() - 1
                for i in range(end - end % 4, end + 16, 4):
                    if i >= end and b[i:i + 4] == b"\x03\x00\x00\x00":
                        j, vals = i + 4, []
                        for _ in range(3):
                            n = struct.unpack_from("<i", b, j)[0]
                            if not 0 <= n < 2000:
                                break
                            vals.append(b[j + 4:j + 4 + n].decode("utf-8", "replace")); j += 4 + n + (-n) % 4
                        if len(vals) == 3:
                            out[int(m.group(1))] = vals
                        break
            if out:
                return out
    return {}


# ---- wiki ---------------------------------------------------------------------------
def wiki_pools(lang):
    t = urllib.request.urlopen(WIKI.format(lang=lang), timeout=60).read().decode("utf-8", "replace")
    starts = [(m.start(), m.group(1)) for m in re.finditer(r'<details class="pool"[^>]*id="([^"]+)"', t)] + [(len(t), None)]
    out = {}
    for (s, pid), (e, _) in zip(starts, starts[1:]):
        body, rows = t[s:e], []
        for a in re.findall(r'<article class="fate-card seasonal-fate".*?</article>', body, re.S):
            img = re.search(r'src="[^"]*/([^/"]+)\.webp"', a)
            card = re.search(r'data-card-instance="(\d+)"', a)
            name = html.unescape(re.sub(r"<[^>]+>", "", re.search(r"<h3>(.*?)</h3>", a, re.S).group(1))).strip()
            rows.append({"icon": img.group(1) if img else None, "card": int(card.group(1)) if card else None, "name": name})
        summ = html.unescape(re.sub(r"<[^>]+>", "", re.search(r"<summary>(.*?)</summary>", body, re.S).group(1))).strip()
        out[pid] = (summ.split("(")[0].strip(), rows)
    return out


def match(c, w):
    if w["icon"] and w["icon"].startswith("Icon_XianMoStrategy_"):   # art named by the config id
        return w["icon"] == f"Icon_XianMoStrategy_{c[1]}"
    ic = c.get(15) if isinstance(c.get(15), str) else None
    if ic and w["icon"] == ic:
        return True
    return bool(w["card"]) and w["card"] in packed(c.get(9))


def main():
    rows = config_rows("XianMoStrategyConfig")
    loc = localization_names()
    zh, en = wiki_pools("zh"), wiki_pools("en")
    wiki_icons = {w["icon"] for _, ws in zh.values() for w in ws if w["icon"]}
    by_id = {}
    for pid, cp in POOLMAP.items():
        cr = sorted((r for r in rows if r[1] // 1000 == cp), key=lambda r: r[1])
        (zs, zw), (es, ew) = zh[pid], en[pid]
        assign, used = {}, set()
        for _ in range(3):                                   # unordered unique-key matching
            for ci, c in enumerate(cr):
                if ci in assign:
                    continue
                cand = [k for k, w in enumerate(zw) if k not in used and match(c, w)]
                if len(cand) == 1 or (cand and len({zw[k]["name"] for k in cand}) == 1):
                    assign[ci] = cand[0]; used.add(cand[0])
        left_c = sorted((i for i in range(len(cr)) if i not in assign), key=lambda i: (cr[i].get(4) or 0, cr[i][1]))
        left_w = [k for k in range(len(zw)) if k not in used]
        if left_c and len(left_c) == len(left_w):
            for i, k in zip(left_c, left_w):
                assign[i] = k
        norm = lambda t: (t or "").replace("·", "•").strip()
        icon_by_name = {}                                  # this pool's wiki entries: name -> art
        for w in zw:
            icon_by_name.setdefault(norm(w["name"]), w["icon"])
        for ci, c in enumerate(cr):
            k = assign.get(ci)
            ln = loc.get(c[1])
            if ln is None and k is None:
                continue                                   # hidden option: no name anywhere
            # art: the wiki entry with the same official name, else the key-matched entry, else the
            # config's own icon, else wiki art named after the option id
            icon = (icon_by_name.get(norm(ln[0])) if ln else None) or (zw[k]["icon"] if k is not None else None) \
                or (c.get(15) if isinstance(c.get(15), str) else "") or ""
            if not icon and f"Icon_XianMoStrategy_{c[1]}" in wiki_icons:
                icon = f"Icon_XianMoStrategy_{c[1]}"
            by_id[str(c[1])] = {"cn": ln[0] if ln else zw[k]["name"], "en": ln[1] if ln else ew[k]["name"],
                                "icon": icon, "pool": cp, "poolCn": zs, "poolEn": es}
        print(f"  {pid:<28} config pool {cp:<3} rows {len(cr):<4} wiki {len(zw):<4} icon-matched {len(assign)}")
    print(f"named {len(by_id)} of {len(rows)} options ({len(loc)} localization names) -> {OUT}")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"byId": by_id}, f, ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main()
