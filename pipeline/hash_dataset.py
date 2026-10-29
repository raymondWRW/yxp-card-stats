"""One-off migration: pseudonymise the uids of the published Parquet dataset in place.

For every chunk whose manifest lacks "uid_hashed": download players/rounds/names, hash the uid
columns (pipeline/uidhash.py, needs the key), upload the rewritten files together with a manifest
carrying "uid_hashed": 1 in ONE commit (a chunk is never half-migrated). Re-runnable: migrated
chunks are skipped, and hashing is idempotent. Row groups are rewritten 1:1 (layout preserved).

  python pipeline/hash_dataset.py local  <dir>              # dir holds players/ rounds/ names/ -> rewrite in place (test)
  python pipeline/hash_dataset.py run --target USER/REPO [--limit N] [--batch 6] [--dry-run]

NOTE: this does NOT rewrite git history; old commits still hold the raw-uid files until the repo's
history is squashed (HF: HfApi.super_squash_history). Run convert-parquet.yml's concurrency group
idle while this runs.
"""
import argparse, json, os, shutil, sys, tempfile, time

import pyarrow.parquet as pq

import uidhash
from convert_to_parquet import UID_COLS

DEFAULT_TARGET = "www1234567890/Yi_Xian_Replay_Compressed"


def rewrite_file(src, dst, cols):
    """Copy parquet `src` -> `dst`, hashing `cols`, row group by row group. -> rows written."""
    pf = pq.ParquetFile(src)
    w = pq.ParquetWriter(dst, pf.schema_arrow, compression="zstd", compression_level=9, use_dictionary=True)
    n = 0
    try:
        for g in range(pf.num_row_groups):
            t = uidhash.hash_table(pf.read_row_group(g), cols)
            w.write_table(t, row_group_size=max(t.num_rows, 1))
            n += t.num_rows
    finally:
        w.close()
    assert n == pf.metadata.num_rows
    return n


def cmd_local(a):
    for t, cols in UID_COLS.items():
        for f in os.listdir(os.path.join(a.dir, t)):
            p = os.path.join(a.dir, t, f); tmp = p + ".tmp"
            print(t, f, rewrite_file(p, tmp, cols), "rows"); os.replace(tmp, p)


def migrated_chunks(api, target):
    from huggingface_hub import hf_hub_download
    out = {}
    for f in sorted(x for x in api.list_repo_files(target, repo_type="dataset") if x.startswith("manifest/")):
        m = json.load(open(hf_hub_download(target, f, repo_type="dataset", token=api.token, force_download=True)))
        out[os.path.basename(f)[:-5]] = bool(m.get("uid_hashed"))     # "c683" -> migrated?
    return out


def cmd_run(a):
    from huggingface_hub import HfApi, hf_hub_download, CommitOperationAdd
    api = HfApi(token=os.environ.get("HF_TOKEN"))
    state = migrated_chunks(api, a.target)
    todo = [k for k, ok in state.items() if not ok][: a.limit or None]
    print(f"{len(state)} chunks, {sum(state.values())} already hashed, {len(todo)} to do this run")
    if a.dry_run:
        return
    for i in range(0, len(todo), a.batch):
        group = todo[i:i + a.batch]
        with tempfile.TemporaryDirectory() as tmp:
            ops = []
            for k in group:
                for t, cols in UID_COLS.items():
                    src = hf_hub_download(a.target, f"{t}/{k}.parquet", repo_type="dataset", token=api.token, local_dir=os.path.join(tmp, "in"))
                    dst = os.path.join(tmp, "out", t, f"{k}.parquet"); os.makedirs(os.path.dirname(dst), exist_ok=True)
                    rewrite_file(src, dst, cols); os.remove(src)
                    ops.append(CommitOperationAdd(f"{t}/{k}.parquet", dst))
                mp = hf_hub_download(a.target, f"manifest/{k}.json", repo_type="dataset", token=api.token, local_dir=os.path.join(tmp, "in"))
                m = json.load(open(mp)); m["uid_hashed"] = 1
                mo = os.path.join(tmp, "out", f"{k}.manifest.json"); json.dump(m, open(mo, "w"))
                ops.append(CommitOperationAdd(f"manifest/{k}.json", mo))
                print("hashed", k, flush=True)
            for attempt in range(12):
                try:
                    api.create_commit(a.target, ops, repo_type="dataset", commit_message=f"Pseudonymise uids: {' '.join(group)}")
                    break
                except Exception as e:
                    print(f"commit retry {attempt}: {e}", file=sys.stderr); time.sleep(60 * min(attempt + 1, 5))
            else:
                raise RuntimeError(f"commit failed for {group}")


def main():
    ap = argparse.ArgumentParser(); sp = ap.add_subparsers(dest="cmd", required=True)
    l = sp.add_parser("local"); l.add_argument("dir"); l.set_defaults(f=cmd_local)
    r = sp.add_parser("run"); r.add_argument("--target", default=DEFAULT_TARGET); r.add_argument("--limit", type=int)
    r.add_argument("--batch", type=int, default=6); r.add_argument("--dry-run", action="store_true"); r.set_defaults(f=cmd_run)
    a = ap.parse_args(); a.f(a)


if __name__ == "__main__":
    main()
