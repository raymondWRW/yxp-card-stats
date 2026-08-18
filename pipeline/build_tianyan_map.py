"""Build tianyan_map.json: the 天衍 (Heavenly Derivation) id -> name registry.

天衍 option ids (fateStrategyData.strategies selected/pendings) are a SEPARATE id
namespace from regular fates and from cards -- they index into the game's
FateStrategyConfig ("天衍万象"). Names/icons are parsed straight from the wiki's
heavenly-derivation pages (zh + en), which track new patches; a previously built
map is merged in so extra fields (sect/category from the old 0w0k mirror) survive.
Output: {"byId": {id: {name, icon, sect?, category?, ...}}, "en": {id: en}}.

Run this whenever the site shows un-named 天衍 ids (a game patch added options).
"""
import json, re, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "tianyan_map.json")
ZH_URL = "https://sharpobject.github.io/yxp_wiki/zh/fates/heavenly-derivation.html"
EN_URL = "https://sharpobject.github.io/yxp_wiki/en/fates/heavenly-derivation.html"
# fallback CN source (older mirror; carries sect/category)
CN_MIRROR = "https://raw.githubusercontent.com/0w0k/yxp_replays_analyze/main/data/fates_wiki.json"

ENTRY = re.compile(
    r'<article class="fate-card" id="fate-strategy-(\d+)">\s*<img\s+src="([^"]*)"[^>]*>\s*<div>\s*<h3>(.*?)</h3>',
    re.S)


def fetch(url):
    return urllib.request.urlopen(url, timeout=60).read().decode("utf-8", "replace")


def parse(html):
    """id -> {name, icon(file name)}"""
    out = {}
    for m in ENTRY.finditer(html):
        oid, src, name = m.group(1), m.group(2), re.sub(r"<[^>]+>", "", m.group(3)).strip()
        out[oid] = {"name": name, "icon": os.path.basename(src)}
    return out


def main():
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except Exception:
        old = {"byId": {}, "en": {}}
    byId = dict(old.get("byId", {}))
    try:  # refresh sect/category from the mirror when it has entries we lack
        for k, v in json.loads(fetch(CN_MIRROR))["byId"].items():
            byId.setdefault(k, {}).update({kk: vv for kk, vv in v.items() if kk not in ("name", "icon") or not byId[k].get(kk)})
    except Exception as e:
        print("mirror unavailable:", e)
    zh = parse(fetch(ZH_URL))
    en = parse(fetch(EN_URL))
    for k, v in zh.items():   # wiki is authoritative for name + icon
        e = byId.setdefault(k, {})
        e["name"] = v["name"]; e["icon"] = v["icon"]
    en_names = dict(old.get("en", {}))
    en_names.update({k: v["name"] for k, v in en.items()})
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"byId": byId, "en": en_names}, f, ensure_ascii=False)
    missing_en = [k for k in byId if k not in en_names]
    print(f"byId={len(byId)} (wiki zh={len(zh)}) en={len(en_names)} missing_en={len(missing_en)} {missing_en[:10]}")


if __name__ == "__main__":
    main()
