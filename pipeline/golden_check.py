"""Golden-output regression check for season_builds.py (run it before/after any refactor).

  python pipeline/golden_check.py            # compare against golden_hashes.json
  python pipeline/golden_check.py --update   # accept the current output as the new golden

What it does (≈1 min, no CI needed):
  1. Fixture: one Parquet chunk (c687, ~165 MB) from the HF dataset, cached OUTSIDE the repo
     (env YXP_GOLDEN_FIXTURE, default ~/yxp-golden-fixture); downloaded on first use.
  2. Run A: fresh fold of 10 shards -> season10*.json.      (output hashes vs golden)
  3. Run B: same fold, STATE saved to disk.                 (state serialisation)
  4. Run C: reload that state, nothing new to fold -> outputs must equal run A.
     => proves save_state/load_state round-trips every accumulator exactly.
Hashes ignore meta.generated. Skill = in-game rank (no Elo dependency), variants ON.

If the golden changes you MUST know why: legit causes are a deliberate SCHEMA bump (new filters,
accumulators, signatures, id maps); a refactor must leave it untouched.
"""
import hashlib, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
GOLDEN = os.path.join(HERE, "golden_hashes.json")
FIX = os.environ.get("YXP_GOLDEN_FIXTURE") or os.path.join(os.path.expanduser("~"), "yxp-golden-fixture")
HF = "www1234567890/Yi_Xian_Replay_Compressed"
CHUNK = "c687"
SHARDS = "34350000:34360000"
FILES = ("season10.json", "season10_builds.json", "season10_fates.json")


def ensure_fixture():
    need = [(s, e) for s, e in (("manifest", "json"), ("games", "parquet"), ("players", "parquet"),
                                ("names", "parquet"), ("rounds", "parquet"))
            if not os.path.exists(os.path.join(FIX, s, f"{CHUNK}.{e}"))]
    if not need:
        return
    from huggingface_hub import hf_hub_download
    for s, e in need:
        print(f"downloading {s}/{CHUNK}.{e} ...")
        hf_hub_download(HF, f"{s}/{CHUNK}.{e}", repo_type="dataset", local_dir=FIX)


def run(outdir, state=None):
    env = dict(os.environ, YXP_PARQUET=FIX, YXP_SKILL="rank", YXP_SPLIT_VARIANTS="1", YXP_OUTDIR=outdir,
               PYTHONDONTWRITEBYTECODE="1", YXP_SEASON="10")
    cmd = [sys.executable, os.path.join(HERE, "season_builds.py"), "full", "--shards", SHARDS]
    if state:
        env["YXP_STATE"] = state
        cmd.append("--fresh") if not os.path.exists(state) else None
    else:
        cmd += ["--fresh", "--no-save"]
    r = subprocess.run(cmd, env=env, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        sys.exit(f"season_builds failed:\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")
    return r.stdout


def canon(o):
    if isinstance(o, dict):
        return {k: canon(v) for k, v in o.items() if k != "generated"}
    return [canon(x) for x in o] if isinstance(o, list) else o


def digest(outdir):
    out = {}
    for f in FILES:
        o = canon(json.load(open(os.path.join(outdir, f), encoding="utf-8")))
        out[f] = hashlib.sha256(json.dumps(o, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
    return out


def main():
    ensure_fixture()
    with tempfile.TemporaryDirectory() as t:
        a, b, c = (os.path.join(t, x) for x in "abc")
        for d in (a, b, c):
            os.makedirs(d)
        st = os.path.join(t, "state.pkl.zst")
        print("run A: fresh fold"); run(a); ha = digest(a)
        print("run B: fold + save state"); run(b, st); hb = digest(b)
        print("run C: reload state, nothing new"); log = run(c, st); hc = digest(c)
        assert "state loaded" in log or "loaded," in log, "run C did not load the saved state"
    ok = True
    if not (ha == hb == hc):
        ok = False
        print("FAIL state round-trip / determinism:")
        for f in FILES:
            print(f"  {f}: A={ha[f]} B={hb[f]} C(reloaded)={hc[f]}")
    if "--update" in sys.argv:
        json.dump(ha, open(GOLDEN, "w"), indent=1); print("golden updated:", ha); sys.exit(0 if ok else 1)
    gold = json.load(open(GOLDEN)) if os.path.exists(GOLDEN) else None
    if gold is None:
        sys.exit("no golden_hashes.json yet: run with --update")
    for f in FILES:
        if gold.get(f) != ha[f]:
            ok = False; print(f"FAIL {f}: golden {gold.get(f)} != now {ha[f]}")
    print("OK: outputs match golden and the state round-trips exactly" if ok else "FAILED")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
