"""Vendor the yxp_wiki card renderer (used with permission) into this site.

The wiki composes card faces in the browser (a Web Worker draws each card on a canvas from
shared sprite sheets + a compact per-card recipe, cached in Cache Storage) instead of
serving one finished image per card. Workers must be same-origin, so the runtime and its
assets are copied here rather than loaded from the wiki:
    <dest>/vendor/card-components/{runtime,compact,s,...}
Our <img> tags keep pointing at the wiki's /assets/cards/<id>_<lang>.webp; the runtime
recognizes those URLs and swaps in the composed face. Its fallback for a card it can't
compose is patched to the wiki's preserved WebP (the relative ../../cards/ path doesn't exist
here). Writes <dest>/vendor/card-components/VERSION (the wiki commit) for cache busting.

Usage: python sync_card_renderer.py <dest>      (dest = site/ locally, the repo root in CI)
"""
import os, shutil, subprocess, sys, tempfile

REPO = "https://github.com/sharpobject/yxp_wiki.git"
SUB = "assets/card-components"
WIKI_CARDS = "https://sharpobject.github.io/yxp_wiki/assets/cards/"
FALLBACK_OLD = "return new URL(`../../cards/${key}.webp`,base).href;"
FALLBACK_NEW = f"return '{WIKI_CARDS}'+key+'.webp';"


def main():
    dest = os.path.join(sys.argv[1] if len(sys.argv) > 1 else ".", "vendor", "card-components")
    with tempfile.TemporaryDirectory() as tmp:
        run = lambda *a: subprocess.run(a, cwd=tmp, check=True, capture_output=True, text=True)
        run("git", "clone", "--depth", "1", "--filter=blob:none", "--sparse", REPO, "wiki")
        wiki = os.path.join(tmp, "wiki")
        subprocess.run(["git", "sparse-checkout", "set", SUB], cwd=wiki, check=True, capture_output=True)
        commit = subprocess.run(["git", "rev-parse", "--short=12", "HEAD"], cwd=wiki, check=True,
                                capture_output=True, text=True).stdout.strip()
        src = os.path.join(wiki, *SUB.split("/"))
        if os.path.isdir(dest):
            shutil.rmtree(dest)
        shutil.copytree(src, dest)
    cards = os.path.join(dest, "runtime", "cards.js")
    js = open(cards, encoding="utf-8").read()
    if FALLBACK_OLD in js:
        js = js.replace(FALLBACK_OLD, FALLBACK_NEW)
        open(cards, "w", encoding="utf-8").write(js)
    else:
        print("WARNING: cards.js fallback line changed upstream; fallback not patched", file=sys.stderr)
    with open(os.path.join(dest, "VERSION"), "w") as f:
        f.write(commit + "\n")
    size = sum(os.path.getsize(os.path.join(r, n)) for r, _, fs in os.walk(dest) for n in fs)
    print(f"synced yxp_wiki@{commit} card renderer -> {dest} ({size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
