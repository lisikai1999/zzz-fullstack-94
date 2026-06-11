import sqlite3
import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "sorting_center.db")


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS layouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            config TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS simulation_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            layout_id INTEGER,
            params TEXT NOT NULL,
            status TEXT DEFAULT 'completed',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS simulation_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER REFERENCES simulation_runs(id),
            gate_stats TEXT NOT NULL,
            system_stats TEXT NOT NULL,
            bottlenecks TEXT NOT NULL,
            event_log TEXT NOT NULL
        );
    """)
    conn.commit()
    conn.close()
