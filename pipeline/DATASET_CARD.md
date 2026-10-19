---
license: other
pretty_name: Yi Xian Replay (compressed, columnar)
task_categories:
  - other
tags:
  - yi-xian-pai
  - game-replays
  - parquet
configs:
  - config_name: games
    data_files: "games/*.parquet"
  - config_name: players
    data_files: "players/*.parquet"
  - config_name: rounds
    data_files: "rounds/*.parquet"
---

# Yi Xian Replay (compressed, columnar)

A columnar (Parquet) re-encoding of the ranked / DaoXin replays in
[`sharpobject/yxp_replays`](https://huggingface.co/datasets/sharpobject/yxp_replays) (弈仙牌),
built to make analysis fast. All credit for collecting the replays goes to the source dataset.

The source stores ~5,000 JSON files per `tar.zst` shard, each repeating both players' full state every
round, so any analysis has to download, untar and JSON-parse everything. Here each game is stored once,
the stable fields are typed columns, and everything season-specific is kept in a JSON column.

> ## ⚠️ Verify against the source before you trust it
> This dataset was produced by a converter written from **assumptions about what the raw replay files
> look like** (which fields exist, what they mean, which are safe to drop). The raw data has changed
> between seasons and the assumptions may not hold for every shard or game version.
> One such assumption was already wrong once: `publicData.lastRoundData` looked like a copy of the previous
> round, but it is the state at the *start* of the round (its `life` differs from the previous round's final
> `life` in ~17% of rounds), so it is stored as `life_start` / `start_state`.
>
> **Before building on this data, test it on a shard of the original dataset**
> (<https://huggingface.co/datasets/sharpobject/yxp_replays/tree/main>):
> 1. Download one shard, e.g. `33922000.tar.zst`, and look at the raw JSON of a few games.
> 2. Convert it yourself with the converter (see *Reproducing*) and diff against the rows published here
>    (`game_id`, `board`, `life`, `won`, ... for the same game and round).
> 3. Check that whatever field your analysis needs is a column here, or lives in `extra` / `start_state`,
>    and means what you think it means.
>
> If something differs, the raw shard is the truth: please fix the converter and bump `FORMAT_VERSION`.

## Scope

- Only **ranked and DaoXin games**: `gameMode == 3` and `seasonMec > 0` in the raw file. Other modes are
  not included. `is_daoxin` marks DaoXin-ladder games.
- Seasons 7-10 as present in the source at the time of conversion (`season` = the raw `seasonMec`).
- Both players' replays of one game are merged into one game (the source has up to 8 perspectives per game).
- Dropped on purpose: cosmetics (skins, card backs, scene / scroller / defeat-effect ids, usernames).

## Layout

```
games/c<chunk>.parquet      one row per game
players/c<chunk>.parquet    one row per (game, player)
rounds/c<chunk>.parquet     one row per (game, round, player)   <- the big table
manifest/c<chunk>.json      which source shards the chunk holds + format_version
```

A chunk is 50 consecutive source shards: `chunk = shard_id // 50000`. A chunk is only usable if its
manifest exists (the manifest is committed together with the data). Within a chunk, each source shard is
its own set of row groups, and `games.src_shard` tells you which shard a game came from.

## Tables

All ids are the game's own integer ids (cards, characters, talents); names live in the analysis repo's id
maps (<https://github.com/raymondWRW/yxp-card-stats>, `pipeline/*_map.json`).

### `games`
`game_id`, `season`, `game_mode` (always 3), `is_daoxin`, `version` (game client version), `begin_ts`,
`end_ts` (ms since epoch), `n_rounds`, `src_shard`.

### `players`
`game_id`, `uid`, `is_ai`, `char_id`, `career`, `battle_rank` (final placement 0-7, only when
`has_self_record`), `rank_score_begin`, `rank_score_diff`, `daoxin_begin`, `daoxin_diff`,
`has_self_record` (true when this player's own replay exists; the rank / score columns are null otherwise).

### `rounds`
| column | meaning |
|---|---|
| `game_id`, `round`, `uid`, `opp_uid`, `side` | who, which round, against whom (`p1` / `p2`) |
| `first_player`, `won` | acted first this round / won it (`won` is null if the round has no winner) |
| `life`, `life_start` | destiny after the round / at the start of the round |
| `level`, `exp` | realm level and exp |
| `rank`, `win_count`, `lose_count` | in-game standing counters |
| `rerolls` | `replaceCardChance` (rerolls held), `unlock_grids` |
| `board` | `list<int>` card ids in slot order, **0 = empty slot** |
| `hand`, `talents` | `list<int>` |
| `hp_delta`, `life_damage`, `battle_time` | round-level battle values from the raw round record |
| `start_state` | JSON: the rest of the start-of-round state (`lastRoundData` minus `life`) |
| `extra` | JSON: every other `publicData` / `privateData` block that is non-empty |

`extra` keys are prefixed `pub.` / `priv.`. This is where each season's own mechanics live
(`priv.xianMoData` (百家之道 仙命), `priv.keYinData`, `priv.mirageData`, `priv.relicData`,
`priv.fateStrategyData`, `priv.cardSelectionData`, `priv.deckCardCount`, `priv.talentSelectionDatas`,
`priv.daoYunSelectionDatas`, `pub.daoYinDatas` / `pub.daoYinIds`, ...). They are **not** typed columns on
purpose, so a new season never changes the schema; some blocks (e.g. the selection blocks) are cumulative,
so read them from a player's last round. Parse `extra` only when you need it; it is most of the file size.

## Quick start

```python
import duckdb
con = duckdb.connect()
con.sql("""
  SELECT g.season, p.char_id, count(*) AS games, avg(p.battle_rank <= 3) AS top4
  FROM 'hf://datasets/www1234567890/Yi_Xian_Replay_Compressed/players/*.parquet' p
  JOIN 'hf://datasets/www1234567890/Yi_Xian_Replay_Compressed/games/*.parquet'   g USING (game_id)
  WHERE p.has_self_record AND g.season = 10
  GROUP BY ALL ORDER BY games DESC
""").show()
```

Select only the columns you need (skip `extra` / `start_state`) and Parquet will not read them.

## Reproducing / extending

The converter and the GitHub Actions workflow live in
<https://github.com/raymondWRW/yxp-card-stats> (`pipeline/convert_to_parquet.py`,
`.github/workflows/convert-parquet.yml`).

```bash
pip install pyarrow orjson zstandard requests huggingface_hub
python pipeline/convert_to_parquet.py local --out ./out 33922000.tar.zst   # one shard, no upload
```

`manifest/*.json` records `format_version`. Version 1 lacks `life_start` / `start_state`; version 2 has
them. If the schema changes the version is bumped and chunks are rebuilt.
