"""Shared Elo core: rating model, per-game update, state save/load, site export.

Model: Weng-Lin Plackett-Luce (openskill) over each lobby's real players, ranked by their final
placement (players without a self-record in that game -- bots, non-uploaders -- are simply absent).
Ranked and DaoXin games feed ONE shared rating; no character adjustment. Sigma widens when a player
starts a new season and with inactivity (never above the starting sigma), so returning players
re-converge quickly. Display: everyone starts at 3000; rating = 3000 + SCALE * (mu - MU0), SCALE so
that the starting sigma spans 400 points. Leaderboards sort by the conservative rating (mu - 2 sigma).
"""
import json, math, os, pickle

import zstandard
from openskill.models import PlackettLuce

MU0, SIGMA0 = 25.0, 25.0 / 3
BETA = float(os.environ.get("ELO_BETA") or 25.0 / 6)
TAU = float(os.environ.get("ELO_TAU") or 25.0 / 300)            # per-game drift
SEASON_SIGMA = float(os.environ.get("ELO_SEASON_SIGMA") or 3.0)  # added (in quadrature) at a player's first game of a new season
DAY_SIGMA = float(os.environ.get("ELO_DAY_SIGMA") or 0.15)       # added per day of inactivity (in quadrature)
SCALE = 400.0 / SIGMA0
START = 3000
MIN_GAMES = 30          # leaderboard eligibility (overall / per season)
ACTIVE_DAYS = 30        # current leaderboard: played within this many days
SEARCH_MIN_GAMES = 10   # players findable by search
TOP_N = 100
DAY_MS = 86400 * 1000


def disp(mu):
    return START + SCALE * (mu - MU0)


def model():
    return PlackettLuce(mu=MU0, sigma=SIGMA0, beta=BETA, tau=TAU)


def params():
    return {"beta": BETA, "tau": TAU, "seasonSigma": SEASON_SIGMA, "daySigma": DAY_SIGMA}


def new_player(name, ts, season):
    return {"mu": MU0, "sigma": SIGMA0, "games": 0, "dx": 0, "last": ts, "name": name or "",
            "nameTs": ts if name else 0, "season": season, "seasons": {}}


def pre_game(p, ts, season):
    """uncertainty growth before a game: inactivity, then a new season"""
    days = max(0.0, (ts - p["last"]) / DAY_MS)
    s2 = p["sigma"] ** 2 + (DAY_SIGMA ** 2) * days
    if season != p["season"]:
        s2 += SEASON_SIGMA ** 2
    p["sigma"] = min(SIGMA0, math.sqrt(s2))


def rate_game(m, P, ts, ent):
    """ent = [(uid, place 1-8, daoxin 0/1, season, name)] for one game's real players (>= 2).
    Returns the pre-game player dicts (in `ent` order) so callers can validate before rating."""
    ent = sorted(ent, key=lambda e: e[1])
    ps = []
    for uid, place, dx, season, name in ent:
        p = P.get(uid)
        if p is None:
            p = P[uid] = new_player(name, ts, season)
        pre_game(p, ts, season)
        ps.append(p)
    new = m.rate([[m.rating(mu=p["mu"], sigma=p["sigma"])] for p in ps], ranks=[e[1] for e in ent])
    for p, (r,), (uid, place, dx, season, name) in zip(ps, new, ent):
        p["mu"], p["sigma"] = r.mu, r.sigma
        p["games"] += 1; p["dx"] += dx; p["last"] = ts; p["season"] = season
        if name and ts >= p["nameTs"]:
            p["name"], p["nameTs"] = name, ts
        d = round(disp(r.mu))
        se = p["seasons"].get(season)
        if se is None:
            se = p["seasons"][season] = {"start": d, "peak": d, "games": 0}
        se["end"] = d; se["endC"] = round(disp(r.mu - 2 * r.sigma))
        se["peak"] = max(se["peak"], d); se["games"] += 1
    return ent, ps


# ---- state ------------------------------------------------------------------------
def save_state(path, P, done_shards, last_ts):
    tmp = path + ".tmp"
    with open(tmp, "wb") as f, zstandard.ZstdCompressor(level=6).stream_writer(f) as z:
        pickle.dump({"params": params(), "P": P, "done": set(done_shards), "last": last_ts}, z, protocol=5)
    os.replace(tmp, path)


def load_state(path):
    with open(path, "rb") as f:
        st = pickle.load(zstandard.ZstdDecompressor().stream_reader(f))
    if st["params"] != params():
        raise SystemExit(f"state was built with {st['params']}, current settings {params()}: rebuild it")
    return st


# ---- site export ------------------------------------------------------------------
def _row(rank, uid, p, rating, cons, games, extra=None):
    r = {"r": rank, "uid": uid, "name": p["name"], "rating": rating, "cons": cons, "games": games}
    if extra:
        r.update(extra)
    return r


def export(P, outdir, now):
    """data/elo/top.json (current top 100 + each season's top 100 at season end),
    data/elo/names.json (search index), data/elo/p/<xx>.json (player histories, by uid suffix)."""
    os.makedirs(os.path.join(outdir, "p"), exist_ok=True)
    cons = lambda p: disp(p["mu"] - 2 * p["sigma"])
    cur = sorted(((u, p) for u, p in P.items()
                  if p["games"] >= MIN_GAMES and now - p["last"] <= ACTIVE_DAYS * DAY_MS),
                 key=lambda up: cons(up[1]), reverse=True)[:TOP_N]
    top = {"generated": now, "params": params(), "minGames": MIN_GAMES, "activeDays": ACTIVE_DAYS,
           "current": [_row(i, u, p, round(disp(p["mu"])), round(cons(p)), p["games"],
                            {"dx": p["dx"], "sigma": round(SCALE * p["sigma"]), "last": p["last"]})
                       for i, (u, p) in enumerate(cur, 1)],
           "seasons": {}}
    for s in sorted({s for p in P.values() for s in p["seasons"]}):
        best = sorted(((u, p) for u, p in P.items() if p["seasons"].get(s, {}).get("games", 0) >= MIN_GAMES),
                      key=lambda up: up[1]["seasons"][s]["endC"], reverse=True)[:TOP_N]
        top["seasons"][str(s)] = [_row(i, u, p, p["seasons"][s]["end"], p["seasons"][s]["endC"],
                                       p["seasons"][s]["games"], {"peak": p["seasons"][s]["peak"]})
                                  for i, (u, p) in enumerate(best, 1)]
    json.dump(top, open(os.path.join(outdir, "top.json"), "w", encoding="utf-8"), ensure_ascii=False,
              separators=(",", ":"))
    findable = {u: p for u, p in P.items() if p["games"] >= SEARCH_MIN_GAMES and p["name"]}
    json.dump(sorted([p["name"], u] for u, p in findable.items()),
              open(os.path.join(outdir, "names.json"), "w", encoding="utf-8"), ensure_ascii=False,
              separators=(",", ":"))
    shards = {}
    for u, p in findable.items():
        shards.setdefault(u[-2:], {})[u] = {
            "name": p["name"], "rating": round(disp(p["mu"])), "cons": round(cons(p)),
            "sigma": round(SCALE * p["sigma"]), "games": p["games"], "dx": p["dx"], "last": p["last"],
            "seasons": {str(s): {k: v for k, v in se.items() if k != "endC"} for s, se in p["seasons"].items()}}
    for k, v in shards.items():
        json.dump(v, open(os.path.join(outdir, "p", f"{k}.json"), "w", encoding="utf-8"), ensure_ascii=False,
                  separators=(",", ":"))
    return {"current": len(top["current"]), "findable": len(findable), "shards": len(shards)}
