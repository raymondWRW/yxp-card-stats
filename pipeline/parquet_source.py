"""
Reads the season-independent Parquet dataset (see convert_to_parquet.py) and rebuilds, per
shard, the record dicts that season_builds.process_record() consumes -- so the analytics
code is unchanged and only the I/O layer differs.

Source = a local directory (tests) or a HF dataset repo id ("user/name").
Only what process_record reads is reconstructed: the self-record header, and per round
the subject's side (uid/life/life_start/level/talents/board/rerolls) plus the opponent's
uid + character. `extra` (JSON) is parsed ONLY for each record's last round, which is
where the cumulative selection blocks (fate / 天衍 / 道韵 / 仙命) are read from.
"""
import json
import os
from collections import defaultdict

import orjson
import pyarrow.parquet as pq

SELECTION_BLOCKS = ("talentSelectionDatas", "fateStrategyData", "daoYunSelectionDatas", "xianMoData")


class Source:
    def __init__(self, src):
        self.src = src
        self.local = os.path.isdir(src)
        if not self.local:
            from huggingface_hub import HfApi, HfFileSystem
            self.api, self.fs = HfApi(), HfFileSystem()

    def manifests(self):
        """{chunk_key: [shard ids]} for every chunk that is fully uploaded."""
        out = {}
        if self.local:
            d = os.path.join(self.src, "manifest")
            for f in sorted(os.listdir(d)):
                m = json.load(open(os.path.join(d, f)))
                out[m["chunk"]] = [str(s) for s in m["shards"]]
            return out
        from huggingface_hub import hf_hub_download
        for f in self.api.list_repo_tree(self.src, path_in_repo="manifest", repo_type="dataset"):
            if f.path.endswith(".json"):
                m = json.load(open(hf_hub_download(self.src, f.path, repo_type="dataset")))
                out[m["chunk"]] = [str(s) for s in m["shards"]]
        return out

    def _open(self, table, key):
        if self.local:
            return pq.ParquetFile(os.path.join(self.src, table, f"c{key}.parquet"))
        return pq.ParquetFile(f"datasets/{self.src}/{table}/c{key}.parquet", filesystem=self.fs)

    def games_players(self, key):
        g = self._open("games", key).read().to_pydict()
        p = self._open("players", key).read().to_pydict()
        games = {g["game_id"][i]: {k: g[k][i] for k in g} for i in range(len(g["game_id"]))}
        players = {}
        for i in range(len(p["game_id"])):
            players[(p["game_id"][i], p["uid"][i])] = {k: p[k][i] for k in p}
        return games, players

    def shard_records(self, key, want_shards, season, tier_field, tier_min):
        """Yield (shard_id, [record dicts]) in shard order for the wanted shards of chunk `key`.
        Each shard was appended as its own row group set; rows of a game are contiguous."""
        games, players = self.games_players(key)
        rf = self._open("rounds", key)
        by_shard = defaultdict(list)
        for rg in range(rf.num_row_groups):
            t = rf.read_row_group(rg)
            if t.num_rows == 0:
                continue
            gids = t.column("game_id")
            first = games.get(gids[0].as_py())
            if first is None or first["src_shard"] not in want_shards:
                continue
            by_shard[first["src_shard"]].append(t)
        for sid in sorted(want_shards, key=int):      # shards with no ranked rows still tick the window
            recs = []
            for t in by_shard.get(sid, []):
                recs += _records(t, games, players, season, tier_field, tier_min)
            yield sid, recs


def _records(t, games, players, season, tier_field, tier_min):
    c = t.to_pydict()
    n = t.num_rows
    rows = defaultdict(list)                       # (game, uid) -> row indexes (round order)
    for i in range(n):
        rows[(c["game_id"][i], c["uid"][i])].append(i)
    out = []
    for (gid, uid), idx in rows.items():
        g = games.get(gid)
        pl = players.get((gid, uid))
        if g is None or pl is None or not pl["has_self_record"]:
            continue
        if g["season"] != season or g["game_mode"] != 3:
            continue
        tier = pl["daoxin_begin"] if tier_field == "beginDaoXinRankScore" else pl["rank_score_begin"]
        if (tier or 0) < tier_min:
            continue
        rss = []
        for i in idx:
            ouid = c["opp_uid"][i]
            op = players.get((gid, ouid))
            mine = {"publicData": {"uid": uid, "life": c["life"][i], "level": c["level"][i],
                                   "talents": c["talents"][i], "characterId": pl["char_id"],
                                   "lastRoundData": {"life": c["life_start"][i]}},
                    "privateData": {"usedCards": c["board"][i], "replaceCardChance": c["rerolls"][i]}}
            theirs = {"publicData": {"uid": ouid, "characterId": op["char_id"] if op else None,
                                     "isAI": bool(op["is_ai"]) if op else str(ouid).startswith("ai")},
                      "privateData": {}}
            won = c["won"][i]
            rs = {"round": c["round"][i], "hpDelta": c["hp_delta"][i], "lifeDamage": c["life_damage"][i],
                  "firstPlayerId": uid if c["first_player"][i] else ouid,
                  "winerId": None if won is None else (uid if won else ouid)}
            rs["p1" if c["side"][i] == "p1" else "p2"] = mine
            rs["p2" if c["side"][i] == "p1" else "p1"] = theirs
            rss.append(rs)
        ex = c["extra"][idx[-1]]                   # cumulative selections live on the last round
        if ex:
            ex = orjson.loads(ex)
            priv = rss[-1]["p1" if c["side"][idx[-1]] == "p1" else "p2"]["privateData"]
            for k in SELECTION_BLOCKS:
                if ex.get("priv." + k) is not None:
                    priv[k] = ex["priv." + k]
        out.append({"gameId": gid, "uid": uid, "charId": pl["char_id"], "career": pl["career"],
                    "battleRank": pl["battle_rank"], "beginRankScore": pl["rank_score_begin"],
                    "beginDaoXinRankScore": pl["daoxin_begin"], "beginTs": pl["begin_ts"],
                    "endTs": pl["end_ts"],      # per player: an eliminated player's replay ends earlier "seasonMec": g["season"], "gameMode": g["game_mode"],
                    "roundStats": rss})
    return out


def max_end_ts(source, key, season):
    games, players = source.games_players(key)
    return max((p["end_ts"] or 0 for (gid, _), p in players.items()
                if p["has_self_record"] and games[gid]["season"] == season), default=0)
