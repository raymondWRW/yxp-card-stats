"""Elo daily update from the compressed Parquet dataset (www1234567890/Yi_Xian_Replay_Compressed).

Loads the saved state (elo/rate.py builds the first one from the full raw-shard backfill), finds
source shards the state hasn't rated yet (chunk manifests minus state["done"]), and rates their
games oldest first: players table rows with has_self_record (real players' own results, bots
have none), placement = battle_rank + 1, one shared rating for ranked + DaoXin. Usernames come
from the names table. Then saves the state and re-exports the site files.

Both players' replays of a game land in the same source shard, so rating per new shard never
splits a lobby. A chunk's tail shards are re-converted as they fill; already-rated shard ids are
skipped, so nothing is rated twice.
Usage: python elo/update.py            (YXP_ELO_STATE / YXP_ELO_OUT override the paths)
"""
import json, os, sys, time

import pyarrow.parquet as pq
from huggingface_hub import HfApi, hf_hub_download

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import core
import uidhash          # pipeline/uidhash.py: ids are pseudonymised; hashing is idempotent so raw or hashed chunks both work

TARGET = "www1234567890/Yi_Xian_Replay_Compressed"
WORK = os.environ.get("YXP_ELO_WORK") or r"C:\Users\raymo\yxp-elo-work"
STATE = os.environ.get("YXP_ELO_STATE") or os.path.join(WORK, "elo_state.pkl.zst")
OUTDIR = os.environ.get("YXP_ELO_OUT") or os.path.join(WORK, "site_elo")


def fetch(path):
    return hf_hub_download(TARGET, path, repo_type="dataset", force_download=True)


def main():
    t0 = time.time()
    st = core.load_state(STATE)
    P, done = st["P"], st["done"]
    files = {getattr(f, "path", "") for f in HfApi().list_repo_tree(TARGET, repo_type="dataset", recursive=True)}
    chunks = sorted(int(p[len("manifest/c"):-5]) for p in files if p.startswith("manifest/c") and p.endswith(".json"))
    games = {}                                   # game_id -> [end_ts, [(uid, place, dx, season, name)]]
    new_shards, names = set(), {}
    for key in chunks:
        man = json.load(open(fetch(f"manifest/c{key}.json")))
        todo = set(man["shards"]) - done
        if not todo:
            continue
        new_shards |= todo
        g = pq.read_table(fetch(f"games/c{key}.parquet"),
                          columns=["game_id", "season", "is_daoxin", "end_ts", "src_shard"]).to_pylist()
        g = {r["game_id"]: r for r in g if r["src_shard"] in todo}
        p = pq.read_table(fetch(f"players/c{key}.parquet"),
                          columns=["game_id", "uid", "is_ai", "battle_rank", "end_ts", "has_self_record"]).to_pylist()
        if f"names/c{key}.parquet" in files:
            for r in pq.read_table(fetch(f"names/c{key}.parquet")).to_pylist():
                if r["src_shard"] in todo:
                    hu = uidhash.hash_uid(r["uid"])
                    cur = names.get(hu)
                    if cur is None or r["last_ts"] >= cur[1]:
                        names[hu] = (r["username"], r["last_ts"])
        for r in p:
            gm = g.get(r["game_id"])
            if gm is None or not r["has_self_record"] or r["is_ai"] or r["battle_rank"] is None:
                continue
            e = games.setdefault(r["game_id"], [gm["end_ts"] or 0, []])
            e[0] = max(e[0], r["end_ts"] or 0)
            e[1].append([uidhash.hash_uid(r["uid"]), r["battle_rank"] + 1, 1 if gm["is_daoxin"] else 0, gm["season"], ""])
    m, n = core.model(), 0
    for gid, (ts, ent) in sorted(games.items(), key=lambda kv: kv[1][0]):
        if len(ent) < 2:
            continue
        for e in ent:
            nm = names.get(e[0])
            e[4] = nm[0] if nm else ""
        core.rate_game(m, P, ts, [tuple(e) for e in ent])
        n += 1
    last = max([st["last"]] + [ts for ts, _ in games.values()])
    core.save_state(STATE, P, done | new_shards, last)
    info = core.export(P, OUTDIR, last)
    print(f"rated {n} new games from {len(new_shards)} new shards ({len(names)} names) in {time.time() - t0:.0f}s; "
          f"{len(P)} players; export {info}")


if __name__ == "__main__":
    main()
