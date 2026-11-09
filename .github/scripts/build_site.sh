#!/usr/bin/env bash
# Assemble the publishable static site into <outdir> (run from the repo root).
#   build_site.sh <outdir>
# Source = the checked-out tree (app, assets, vendor, frozen data) overlaid with the freshest
# generated data: ./_data/data/** (a checkout of the `data` branch) when present, else whatever
# the daily job just wrote into ./data. Pipeline code, CI files and the data/daily state are
# NOT part of the site. Refuses to produce a site missing the generated files, so a bad
# checkout can never blank the live site or (via rsync --delete) the server mirror.
set -euo pipefail
out=${1:?outdir}
rm -rf "$out"; mkdir -p "$out"
tar -cf -   --exclude=./.git --exclude=./.github --exclude=./pipeline --exclude=./README.md --exclude=./state   --exclude=./_data --exclude="./${out#./}" --exclude=./.gitattributes --exclude=./.gitignore --exclude=./data/daily   . | tar -xf - -C "$out"
# overlay the generated data (the `data` branch checkout) on top of the tree's data/
if [ -d _data/data ]; then tar -C _data/data -cf - . | tar -xf - -C "$out/data"; fi
for f in data/season10.json data/season10_builds.json data/season10_fates.json data/elo/top.json data/elo/names.json; do
  [ -s "$out/$f" ] || { echo "build_site: required file missing or empty: $f" >&2; exit 1; }
done
python3 -c "import json,sys;[json.load(open(sys.argv[1]+'/'+f,encoding='utf-8')) for f in ('data/season10.json','data/elo/top.json')]" "$out"
echo "site built in $out: $(find "$out" -type f | wc -l) files, $(du -sm "$out" | cut -f1) MB"
