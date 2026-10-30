"""Generate the per-tool pages from app.html (the single-page app).

Every tool gets its own URL (hundred_school/, elo/, ...). Each page is app.html with
<base href> pointed back at the site root (so style.css, app.js and data/ resolve unchanged)
and body[data-start] set to the tab it opens on. index.html is the hand-written landing page.
Re-run after editing app.html:   python pipeline/make_pages.py <site dir>
"""
import os, sys

ROUTES = {                      # folder -> (start tab, <title>)
    "hundred_school": ("builds10", "百家之道 流派统计 · Hundred Schools builds"),
    "heavenly_derivation": ("builds9", "天衍万象 流派统计 · Heavenly Derivation builds"),
    "cards": ("cards", "卡牌统计 · Card stats"),
}

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    src = open(os.path.join(root, "app.html"), encoding="utf-8", newline="").read()
    for folder, (tab, title) in ROUTES.items():
        page = src.replace('<base href="./">', '<base href="../">', 1)
        page = page.replace('<body data-start="builds10">', f'<body data-start="{tab}">', 1)
        page = page.replace("<title>弈仙牌 数据</title>", f"<title>{title} · 弈仙牌 数据</title>", 1)
        assert page != src and f'data-start="{tab}"' in page
        os.makedirs(os.path.join(root, folder), exist_ok=True)
        open(os.path.join(root, folder, "index.html"), "w", encoding="utf-8", newline="").write(page)
        print("wrote", folder + "/index.html")

if __name__ == "__main__":
    main()
