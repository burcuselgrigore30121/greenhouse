import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS telemetry (
  ts INTEGER NOT NULL,
  topic TEXT NOT NULL,
  payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry(ts);
"""

def connect(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.execute("PRAGMA journal_mode=WAL;")
    con.execute("PRAGMA synchronous=NORMAL;")
    con.executescript(SCHEMA)
    return con

def insert(con: sqlite3.Connection, ts: int, topic: str, payload: str) -> None:
    con.execute("INSERT INTO telemetry(ts, topic, payload) VALUES(?,?,?)", (ts, topic, payload))
    con.commit()

def min_max_ts(con: sqlite3.Connection):
    return con.execute("SELECT MIN(ts), MAX(ts) FROM telemetry").fetchone()

def days_covered(con: sqlite3.Connection) -> int:
    row = min_max_ts(con)
    if not row or row[0] is None or row[1] is None:
        return 0
    min_ts, max_ts = int(row[0]), int(row[1])
    return max(0, (max_ts - min_ts) // (24 * 3600))
