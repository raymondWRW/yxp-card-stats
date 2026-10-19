"""
Convert sharpobject/yxp_replays tar.zst shards into season-independent Parquet tables.

Scope: ranked / DaoXin games only (gameMode == 3, seasonMec > 0).
Tables (one Parquet file per table per chunk of shards):
  games    one row per game
  players  one row per (game, uid)
  rounds   one row per (game, round, uid) -- the stable core + `extra` JSON

The core columns never change across seasons. Every other block of a round
(xianMoData, keYinData, mirageData, relicData, ...) lands unparsed in `extra`
(JSON string), so a new season's mechanics never needs a schema change.
Dropped on purpose: publicData.lastRoundData (duplicate of the previous round) and
cosmetics (skins, card backs, scene/scroller/defeat-effect ids, usernames).

Usage:
  python convert_to_parquet.py local --out DIR FILE.tar.zst ...          # no upload
  python convert_to_parquet.py plan --target USER/REPO                   # chunks still to do
  python convert_to_parquet.py run --target USER/REPO --chunks 495 496   # convert + upload
"""
import argparse
import io
import os
import sys
import tarfile
import time

import orjson
import pyarrow as pa
import pyarrow.parquet as pq
import zstandard

BASE = "https://huggingface.co/datasets/sharpobject/yxp_replays/resolve/main"
FORMAT_VERSION = 1

# fields lifted into typed round columns; everything else (minus DROP_*) goes to `extra`
CORE_PUBLIC = {"uid", "life", "level", "exp", "talents", "isAI", "rank", "winRoundCount",
               "loseRoundCount", "characterId", "career", "nextOpponent", "previousOpponent"}
CORE_PRIVATE = {"usedCards", "handCards", "unlockGrids", "replaceCardChance"}
DROP_PUBLIC = {"lastRoundData", "username", "cardBack", "skinNumber", "skinColor", "cardSkins",
               "battleScene", "battleSubScene", "battleScroller", "scrollerOrnament",
               "commonDefeatEffect", "characterDefeatEffect", "zunHao", "realtimeSpectators",
               "isPreReady", "isIllegalTeam"}
EMPTY = (None, 0, False, "", [], {})


def _extra(pub, priv):
    ex = {}
    for k, v in pub.items():
        if k not in CORE_PUBLIC and k not in DROP_PUBLIC and v not in EMPTY:
            ex["pub." + k] = v
    for k, v in priv.items():
        if k not in CORE_PRIVATE and v not in EMPTY:
            ex["priv." + k] = v
    return orjson.dumps(ex).decode() if ex else None


def _ints(xs):
    return [x for x in (xs or []) if x]


class Chunk:
    """Accumulates rows for a chunk of shards; dedupes games across player perspectives."""

    def __init__(self):
        self.games, self.players, self.rounds = {}, {}, {}

    def add_record(self, d, shard):
        gid = d["gameId"]
        if gid not in self.games:
            self.games[gid] = {
                "game_id": gid, "season": d["seasonMec"], "game_mode": d["gameMode"],
                "is_daoxin": bool(d.get("isDaoXinRank")), "version": d.get("version"),
                "begin_ts": d.get("beginTs"), "end_ts": d.get("endTs"),
                "n_rounds": d.get("round"), "src_shard": shard}
        subject = d["uid"]
        rss = d.get("roundStats") or []
        # a self-record's subject plays every round; the opponent perspective does not
        cnt = {}
        for rs in rss:
            for sp in ("p1", "p2"):
                u = rs[sp]["publicData"]["uid"]
                cnt[u] = cnt.get(u, 0) + 1
        is_self = bool(cnt) and max(cnt, key=cnt.get) == subject
        if is_self:
            self.players[(gid, subject)] = {
                "game_id": gid, "uid": subject, "is_ai": False, "char_id": d.get("charId"),
                "career": d.get("career"), "battle_rank": d.get("battleRank"),
                "rank_score_begin": d.get("beginRankScore"), "rank_score_diff": d.get("diffRankScore"),
                "daoxin_begin": d.get("beginDaoXinRankScore"), "daoxin_diff": d.get("diffDaoXinRankScore"),
                "has_self_record": True}
        for rs in rss:
            rnd = rs.get("round")
            for sp, op in (("p1", "p2"), ("p2", "p1")):
                pub, priv = rs[sp]["publicData"], rs[sp]["privateData"]
                uid = pub["uid"]
                key = (gid, rnd, uid)
                # the subject's own rows are authoritative; opponents' rows fill gaps
                if key in self.rounds and uid != subject:
                    continue
                if (gid, uid) not in self.players:
                    self.players[(gid, uid)] = {
                        "game_id": gid, "uid": uid, "is_ai": bool(pub.get("isAI")),
                        "char_id": pub.get("characterId"), "career": pub.get("career"),
                        "battle_rank": None, "rank_score_begin": None, "rank_score_diff": None,
                        "daoxin_begin": None, "daoxin_diff": None, "has_self_record": False}
                self.rounds[key] = {
                    "game_id": gid, "round": rnd, "uid": uid,
                    "opp_uid": rs[op]["publicData"]["uid"], "side": sp,
                    "first_player": rs.get("firstPlayerId") == uid,
                    "won": (rs.get("winerId") == uid) if rs.get("winerId") else None,
                    "life": pub.get("life"), "level": pub.get("level"), "exp": pub.get("exp"),
                    "rank": pub.get("rank"), "win_count": pub.get("winRoundCount"),
                    "lose_count": pub.get("loseRoundCount"),
                    "rerolls": priv.get("replaceCardChance"), "unlock_grids": priv.get("unlockGrids"),
                    "board": _ints_keep_slots(priv.get("usedCards")),
                    "hand": _ints(priv.get("handCards")),
                    "talents": _ints(pub.get("talents")),
                    "hp_delta": rs.get("hpDelta"), "life_damage": rs.get("lifeDamage"),
                    "battle_time": rs.get("battleTime"), "extra": _extra(pub, priv)}
                if uid != subject:
                    # opponent rows are only trustworthy for what the shared round shows; keep anyway
                    pass

    def tables(self):
        """-> {table_name: pa.Table}; rounds sorted by (game_id, round)."""
        out = {
            "games": pa.Table.from_pylist(list(self.games.values()), schema=GAMES_SCHEMA),
            "players": pa.Table.from_pylist(list(self.players.values()), schema=PLAYERS_SCHEMA),
            "rounds": pa.Table.from_pylist(list(self.rounds.values()), schema=ROUNDS_SCHEMA),
        }
        out["rounds"] = out["rounds"].sort_by([("game_id", "ascending"), ("round", "ascending")])
        return out


class ChunkWriter:
    """Appends per-shard tables to one Parquet file per table (a row group set per shard)."""

    def __init__(self, out_dir, name):
        self.paths, self.writers = {}, {}
        for t, schema in SCHEMAS.items():
            os.makedirs(os.path.join(out_dir, t), exist_ok=True)
            self.paths[t] = os.path.join(out_dir, t, name + ".parquet")
            self.writers[t] = pq.ParquetWriter(self.paths[t], schema, compression="zstd",
                                               compression_level=9, use_dictionary=True)

    def add(self, tables):
        for t, tbl in tables.items():
            self.writers[t].write_table(tbl, row_group_size=131072)

    def close(self):
        for w in self.writers.values():
            w.close()


def _ints_keep_slots(xs):
    """Board keeps slot order (0 = empty slot kept so positions survive)."""
    return [int(x) for x in (xs or [])]


I32, I64, STR, BOOL = pa.int32(), pa.int64(), pa.string(), pa.bool_()
GAMES_SCHEMA = pa.schema([("game_id", STR), ("season", I32), ("game_mode", I32), ("is_daoxin", BOOL),
                          ("version", STR), ("begin_ts", I64), ("end_ts", I64), ("n_rounds", I32),
                          ("src_shard", STR)])
PLAYERS_SCHEMA = pa.schema([("game_id", STR), ("uid", STR), ("is_ai", BOOL), ("char_id", I32),
                            ("career", I32), ("battle_rank", I32), ("rank_score_begin", I32),
                            ("rank_score_diff", I32), ("daoxin_begin", I32), ("daoxin_diff", I32),
                            ("has_self_record", BOOL)])
ROUNDS_SCHEMA = pa.schema([("game_id", STR), ("round", I32), ("uid", STR), ("opp_uid", STR),
                           ("side", STR), ("first_player", BOOL), ("won", BOOL), ("life", I32),
                           ("level", I32), ("exp", I32), ("rank", I32), ("win_count", I32),
                           ("lose_count", I32), ("rerolls", I32), ("unlock_grids", I32),
                           ("board", pa.list_(I32)), ("hand", pa.list_(I32)),
                           ("talents", pa.list_(I32)), ("hp_delta", I32), ("life_damage", I32),
                           ("battle_time", I32), ("extra", STR)])


SCHEMAS = {"games": GAMES_SCHEMA, "players": PLAYERS_SCHEMA, "rounds": ROUNDS_SCHEMA}


def iter_members(raw):
    data = zstandard.ZstdDecompressor().stream_reader(io.BytesIO(raw)).read()
    tf = tarfile.open(fileobj=io.BytesIO(data))
    for mem in tf:
        if mem.isfile() and mem.name.endswith(".json"):
            yield tf.extractfile(mem).read()


def convert_shard(chunk, shard, raw):
    seen = kept = 0
    for b in iter_members(raw):
        seen += 1
        try:
            d = orjson.loads(b).get("data")
        except Exception:
            continue
        if not d or d.get("gameMode") != 3 or not (d.get("seasonMec") or 0) > 0:
            continue
        if not d.get("roundStats"):
            continue
        chunk.add_record(d, shard)
        kept += 1
    return seen, kept


def fetch(shard):
    import requests
    for a in range(5):
        try:
            r = requests.get(f"{BASE}/{shard}.tar.zst", timeout=300)
            r.raise_for_status()
            return r.content
        except Exception:
            if a == 4:
                raise
            time.sleep(3 * (a + 1))


# ---- chunking / HF plumbing -----------------------------------------------------
# A chunk is CHUNK_SPAN consecutive shard ids (ids step by 1000). Chunk boundaries depend
# only on the shard id, so any machine can convert any chunk and reruns are idempotent.
# Both players' replays of a game land in the same shard, so dedupe is per shard.
SRC_REPO = "sharpobject/yxp_replays"
CHUNK_SPAN = 50000


def chunk_key(shard_id):
    return int(shard_id) // CHUNK_SPAN


def list_source_shards():
    from huggingface_hub import HfApi
    ids = []
    for f in HfApi().list_repo_tree(SRC_REPO, repo_type="dataset", recursive=True):
        n = getattr(f, "path", "")
        if n.endswith(".tar.zst"):
            ids.append(int(n.split(".")[0]))
    return sorted(ids)


def source_chunks():
    chunks = {}
    for sid in list_source_shards():
        chunks.setdefault(chunk_key(sid), []).append(str(sid))
    return chunks


def done_manifest(api, target, key):
    """Shard ids already converted into chunk `key` (empty if none)."""
    import json
    from huggingface_hub import hf_hub_download
    try:
        p = hf_hub_download(target, f"manifest/c{key}.json", repo_type="dataset", token=api.token,
                            force_download=True)
        m = json.load(open(p))
        return set(m["shards"]) if m.get("format_version") == FORMAT_VERSION else set()
    except Exception:
        return set()


def cmd_plan(a):
    import json
    from huggingface_hub import HfApi
    api = HfApi(token=os.environ.get("HF_TOKEN"))
    todo = []
    for key, shards in sorted(source_chunks().items()):
        if done_manifest(api, a.target, key) >= set(shards):
            continue
        todo.append(key)
    if a.max_chunks:
        todo = todo[:a.max_chunks]
    jobs = [todo[i:i + a.per_job] for i in range(0, len(todo), a.per_job)]
    print(json.dumps(jobs))


def upload_chunk(api, target, key, workdir, shards):
    import json, random
    from huggingface_hub import CommitOperationAdd
    mpath = os.path.join(workdir, f"c{key}.manifest.json")
    json.dump({"format_version": FORMAT_VERSION, "chunk": key, "shards": sorted(shards)}, open(mpath, "w"))
    ops = [CommitOperationAdd(f"{t}/c{key}.parquet", os.path.join(workdir, t, f"c{key}.parquet"))
           for t in SCHEMAS]
    ops.append(CommitOperationAdd(f"manifest/c{key}.json", mpath))   # last: marks the chunk done
    for attempt in range(10):
        try:
            api.create_commit(target, ops, repo_type="dataset", commit_message=f"chunk {key}")
            return
        except Exception as e:     # concurrent-commit conflicts / rate limits: back off and retry
            print(f"upload retry {attempt}: {e}", file=sys.stderr)
            time.sleep(random.uniform(5, 30) * (attempt + 1))
    raise RuntimeError(f"upload of chunk {key} failed")


def convert_chunk(key, shards, workdir):
    w = ChunkWriter(workdir, f"c{key}")
    t0, seen, kept = time.time(), 0, 0
    for sid in shards:
        chunk = Chunk()
        s, k = convert_shard(chunk, sid, fetch(sid))
        seen, kept = seen + s, kept + k
        w.add(chunk.tables())
    w.close()
    print(f"chunk {key}: {len(shards)} shards, {seen} files, {kept} ranked records, "
          f"{time.time() - t0:.0f}s", file=sys.stderr)


def cmd_run(a):
    import shutil, tempfile
    from huggingface_hub import HfApi
    api = HfApi(token=os.environ["HF_TOKEN"])
    src = source_chunks()
    for key in a.chunks:
        shards = src[key]
        if done_manifest(api, a.target, key) >= set(shards):
            print(f"chunk {key} already done", file=sys.stderr)
            continue
        wd = tempfile.mkdtemp(prefix=f"yxp{key}_")
        try:
            convert_chunk(key, shards, wd)
            upload_chunk(api, a.target, key, wd, shards)
        finally:
            shutil.rmtree(wd, ignore_errors=True)


def cmd_local(a):
    chunk, t0, ids = Chunk(), time.time(), []
    for f in a.files:
        sid = os.path.basename(f).split(".")[0]
        seen, kept = convert_shard(chunk, sid, open(f, "rb").read())
        ids.append(sid)
        print(f"{sid}: {seen} files, {kept} ranked records, {time.time() - t0:.1f}s", file=sys.stderr)
    w = ChunkWriter(a.out, a.name or f"{ids[0]}-{ids[-1]}")
    w.add(chunk.tables())
    w.close()


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan", help="print JSON list of chunk-key lists still to convert")
    p.add_argument("--target", required=True)
    p.add_argument("--per-job", type=int, default=2)
    p.add_argument("--max-chunks", type=int, default=0)
    p.set_defaults(fn=cmd_plan)
    p = sub.add_parser("run", help="convert chunks and upload them (needs HF_TOKEN)")
    p.add_argument("--target", required=True)
    p.add_argument("--chunks", type=int, nargs="+", required=True)
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("local", help="convert local tar.zst files into --out (no upload)")
    p.add_argument("--out", required=True)
    p.add_argument("--name")
    p.add_argument("files", nargs="+")
    p.set_defaults(fn=cmd_local)
    a = ap.parse_args()
    a.fn(a)


if __name__ == "__main__":
    main()
