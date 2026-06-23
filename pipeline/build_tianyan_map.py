"""Build tianyan_map.json: the 天衍 (Heavenly Derivation) id -> name registry.

天衍 option ids (fateStrategyData.strategies selected/pendings) are a SEPARATE id
namespace from regular fates and from cards -- they index into the wiki's
FateStrategyConfig ("天衍万象"). CN names + sect come from the parsed config
(0w0k/yxp_replays_analyze mirrors it as data/fates_wiki.json, itself scraped from
sharpobject.github.io/yxp_wiki/.../heavenly-derivation.html); EN names come from the
English wiki page. Output: {"byId": {id: {name, sect, category, ...}}, "en": {id: en}}.
"""
import json, re, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CN_URL = "https://raw.githubusercontent.com/0w0k/yxp_replays_analyze/main/data/fates_wiki.json"
EN_URL = "https://sharpobject.github.io/yxp_wiki/en/fates/heavenly-derivation.html"


def fetch(url):
    return urllib.request.urlopen(url, timeout=60).read().decode("utf-8", "replace")


def main():
    byId = json.loads(fetch(CN_URL))["byId"]
    html = fetch(EN_URL)
    en = {m.group(1): m.group(2).strip()
          for m in re.finditer(r'id="fate-strategy-(\d+)"[\s\S]*?<h3>(.*?)</h3>', html)}
    out = {"byId": byId, "en": en}
    with open(os.path.join(HERE, "tianyan_map.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    missing_en = sum(1 for k in byId if k not in en)
    print(f"byId={len(byId)} en={len(en)} missing_en={missing_en}")


if __name__ == "__main__":
    main()
