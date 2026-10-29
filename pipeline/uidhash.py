"""Pseudonymise player uids (privacy).

hash_uid(uid) = first 16 hex chars of HMAC-SHA256(secret key, uid). Keyed on purpose: the source
dataset (sharpobject/yxp_replays) is public with raw uids, so an unkeyed hash could be recomputed
by anyone. Without the key the mapping can't be rebuilt, WITH the key it is deterministic, so
every table / the Elo state / the site JSON hash to the same id.

Bots ("ai4-lv2", ...) are not players and code relies on the "ai" prefix: they pass through
unchanged. A hashed id is exactly 16 hex chars; a raw uid is 24 (is_hashed() tells them apart,
which makes migrations idempotent).

The key is NEVER committed. It comes from $YXP_UID_KEY, or the file in $YXP_UID_KEY_FILE
(default ~/yxp-uid-key.txt). CI: the UID_HASH_KEY repo secret is exported as YXP_UID_KEY.
Losing the key means the ids can no longer be derived from raw uids (existing hashed data stays valid).
"""
import hashlib, hmac, os, re

HASH_LEN = 16
_HASHED = re.compile(r"^[0-9a-f]{%d}$" % HASH_LEN)
_key = None


def _load_key():
    global _key
    if _key is None:
        k = os.environ.get("YXP_UID_KEY", "").strip()
        if not k:
            path = os.environ.get("YXP_UID_KEY_FILE") or os.path.join(os.path.expanduser("~"), "yxp-uid-key.txt")
            if os.path.isfile(path):
                k = open(path, encoding="utf-8").read().strip()
        if len(k) < 32:
            raise RuntimeError("uid hash key missing/too short: set YXP_UID_KEY (>= 32 chars) or YXP_UID_KEY_FILE")
        _key = k.encode("utf-8")
    return _key


def is_bot(uid):
    return not uid or str(uid).startswith("ai")


def is_hashed(uid):
    return bool(_HASHED.match(str(uid)))


def hash_uid(uid):
    """raw uid -> pseudonym; bots and already-hashed ids are returned unchanged."""
    if uid is None:
        return None
    uid = str(uid)
    if is_bot(uid) or is_hashed(uid):
        return uid
    return hmac.new(_load_key(), uid.encode("utf-8"), hashlib.sha256).hexdigest()[:HASH_LEN]


def hash_table(tbl, cols):
    """pyarrow Table -> same table with the given string columns hashed (hash computed once per distinct value)."""
    import pyarrow as pa, pyarrow.compute as pc
    for c in cols:
        i = tbl.schema.get_field_index(c)
        if i < 0:
            continue
        col = tbl.column(i).combine_chunks()
        uniq = pc.unique(col)
        mapped = pa.array([hash_uid(u) for u in uniq.to_pylist()], type=col.type)
        idx = pc.index_in(col, value_set=uniq)
        tbl = tbl.set_column(i, tbl.schema.field(i), pc.take(mapped, idx))
    return tbl
