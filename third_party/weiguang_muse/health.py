"""Read and confirm rows in the existing weiguang.db shape.

Schema text matches android/band-core/.../WeiguangSql.java. Opening a database
applies a missing migration and does not delete rows.
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

VALUE_KEYS = ("step", "bpm", "percent", "hrv", "body", "totalMinutes", "pressure")

MIGRATION_1 = """
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
CREATE TABLE devices (address TEXT PRIMARY KEY, name TEXT, firmware TEXT, ui_version TEXT, sn TEXT, capabilities_json TEXT, last_connect_at INTEGER, updated_at INTEGER NOT NULL);
CREATE TABLE observations (id INTEGER PRIMARY KEY AUTOINCREMENT, idempotency_key TEXT NOT NULL UNIQUE, device_address TEXT NOT NULL, metric TEXT NOT NULL, device_sampled_at TEXT, phone_received_at INTEGER NOT NULL, sync_id TEXT, value_json TEXT NOT NULL, quality TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX idx_obs_device_metric ON observations(device_address, metric, phone_received_at);
CREATE TABLE sync_cursors (device_address TEXT NOT NULL, metric TEXT NOT NULL, cursor_value TEXT, last_success_at INTEGER, last_attempt_at INTEGER, last_status TEXT, last_error TEXT, PRIMARY KEY (device_address, metric));
CREATE TABLE goals (id TEXT PRIMARY KEY, text TEXT NOT NULL, created_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, detail TEXT, source TEXT NOT NULL, status TEXT NOT NULL, due_local TEXT, timezone TEXT, reminder_enabled INTEGER NOT NULL DEFAULT 0, reminder_local TEXT, repeat_daily INTEGER NOT NULL DEFAULT 0, rationale_json TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE task_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, kind TEXT NOT NULL, note TEXT, at_ms INTEGER NOT NULL);
CREATE TABLE reminder_fires (task_id TEXT NOT NULL, local_date TEXT NOT NULL, fired_at INTEGER NOT NULL, PRIMARY KEY (task_id, local_date));
CREATE TABLE graph_snapshots (thread_id TEXT PRIMARY KEY, values_json TEXT NOT NULL, checkpoint_json TEXT, updated_at INTEGER NOT NULL);
CREATE TABLE coach_results (id TEXT PRIMARY KEY, thread_id TEXT, status TEXT NOT NULL, summary_json TEXT NOT NULL, result_json TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
"""

MIGRATION_2 = "ALTER TABLE observations ADD COLUMN user_note TEXT;"


def connect(path: str | Path) -> sqlite3.Connection:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(target)
    conn.row_factory = sqlite3.Row
    _migrate(conn)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
    ).fetchone()
    now = int(time.time() * 1000)
    if exists is None:
        conn.executescript(MIGRATION_1)
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)", (now,)
        )
    version = conn.execute("SELECT COALESCE(MAX(version), 0) FROM schema_migrations").fetchone()[0]
    columns = {row[1] for row in conn.execute("PRAGMA table_info(observations)")}
    if version < 2 and "user_note" not in columns:
        conn.executescript(MIGRATION_2)
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at) VALUES(2, ?)", (now,)
        )
    conn.commit()


def numeric_value(value_json: str) -> float | None:
    try:
        parsed = json.loads(value_json)
    except json.JSONDecodeError:
        return None
    if isinstance(parsed, bool):
        return None
    if isinstance(parsed, (int, float)) and not isinstance(parsed, bool):
        return float(parsed) if _finite(parsed) else None
    if not isinstance(parsed, dict):
        return None
    for key in VALUE_KEYS:
        value = parsed.get(key)
        if isinstance(value, (int, float)) and not isinstance(value, bool) and _finite(value):
            return float(value)
    return None


def _finite(value: float) -> bool:
    return value == value and value not in (float("inf"), float("-inf"))


class HealthBook:
    """Bounded view. Device addresses and raw dumps stay in the database."""

    def __init__(self, conn: sqlite3.Connection | None = None, rows: list[dict[str, Any]] | None = None, goals: list[dict[str, Any]] | None = None):
        self.conn = conn
        self._rows = rows or []
        self._goals = goals or []

    def summary(self) -> dict[str, Any]:
        grouped: dict[str, list[dict[str, Any]]] = {}
        unreadable: dict[str, int] = {}
        for row in self._observation_rows():
            metric = str(row.get("metric") or "")
            if not metric:
                continue
            value = numeric_value(str(row.get("value_json") or ""))
            if value is None:
                unreadable[metric] = unreadable.get(metric, 0) + 1
                continue
            grouped.setdefault(metric, []).append(
                {
                    "value": value,
                    "deviceSampledAt": row.get("device_sampled_at") or None,
                    "phoneReceivedAt": int(row.get("phone_received_at") or 0),
                    "quality": row.get("quality") or "recorded",
                }
            )
        metrics = []
        for metric, points in grouped.items():
            ordered = sorted(points, key=lambda item: item["phoneReceivedAt"], reverse=True)[:3]
            metrics.append({"metric": metric, "points": ordered, "unreadable": unreadable.get(metric, 0)})
        for metric, count in unreadable.items():
            if metric not in grouped:
                metrics.append({"metric": metric, "points": [], "unreadable": count})
        return {
            "hasAnySample": any(item["points"] for item in metrics),
            "metrics": metrics,
            "note": "约 10 分钟是用户口述的采集预期，不是模型调用频率，也没有套用到每个指标。数值不是诊断。",
        }

    def has_metric(self, metric: str) -> bool:
        return any(item["metric"] == metric and item["points"] for item in self.summary()["metrics"])

    def goals(self) -> list[str]:
        if self.conn is not None:
            found = self.conn.execute(
                "SELECT text FROM goals WHERE archived = 0 ORDER BY created_at"
            ).fetchall()
            return [row["text"] for row in found]
        return [str(item.get("text") or item) for item in self._goals if str(item.get("text") or item)]

    def tasks(self) -> list[dict[str, Any]]:
        if self.conn is None:
            return []
        rows = self.conn.execute(
            "SELECT id, title, detail, source, status, reminder_enabled FROM tasks ORDER BY created_at"
        ).fetchall()
        return [dict(row) for row in rows]

    def trend(self, metric: str) -> dict[str, Any]:
        points = []
        for item in self.summary()["metrics"]:
            if item["metric"] == metric:
                points = list(reversed(item["points"]))
        if len(points) < 2:
            return {"status": "insufficient", "metric": metric, "medical": False}
        previous, latest = points[-2], points[-1]
        return {
            "status": "compared",
            "metric": metric,
            "previous": previous["value"],
            "latest": latest["value"],
            "delta": latest["value"] - previous["value"],
            "medical": False,
        }

    def confirm(self, proposal: dict[str, Any], user_confirmed: bool, timezone: str = "UTC") -> dict[str, Any]:
        if self.conn is None:
            return {"ok": False, "reason": "no_database"}
        if not user_confirmed:
            return {"ok": False, "reason": "unconfirmed"}
        title = str(proposal.get("title") or "").strip()
        if not title:
            return {"ok": False, "reason": "empty"}
        metric = str(proposal.get("metric") or "")
        if metric and not self.has_metric(metric):
            return {"ok": False, "reason": "no_sample"}
        proposal_id = str(proposal.get("id") or "")
        if proposal_id:
            existing = self.conn.execute("SELECT id FROM tasks WHERE id = ?", (proposal_id,)).fetchone()
            if existing:
                return {"ok": True, "reason": "duplicate", "id": existing["id"], "reminder": False}
        task_id = proposal_id or f"task_{uuid.uuid4().hex[:16]}"
        now = int(time.time() * 1000)
        self.conn.execute(
            "INSERT INTO tasks(id, title, detail, source, status, due_local, timezone, reminder_enabled, reminder_local, repeat_daily, rationale_json, created_at, updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                task_id,
                title,
                str(proposal.get("detail") or ""),
                "muse",
                "active",
                "",
                timezone or "UTC",
                0,
                "",
                0,
                json.dumps({"metric": metric, "basedOn": proposal.get("basedOn") or []}, ensure_ascii=False),
                now,
                now,
            ),
        )
        self.conn.execute(
            "INSERT INTO task_events(task_id, kind, note, at_ms) VALUES(?,?,?,?)",
            (task_id, "created", "user_confirmed", now),
        )
        self.conn.commit()
        return {"ok": True, "reason": "saved", "id": task_id, "reminder": False}

    def complete(self, task_id: str, user_confirmed: bool) -> dict[str, Any]:
        if self.conn is None:
            return {"ok": False, "reason": "no_database"}
        if not user_confirmed:
            return {"ok": False, "reason": "unconfirmed"}
        row = self.conn.execute("SELECT status FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            return {"ok": False, "reason": "missing"}
        if row["status"] == "done":
            return {"ok": True, "reason": "duplicate", "id": task_id}
        now = int(time.time() * 1000)
        self.conn.execute(
            "UPDATE tasks SET status = 'done', updated_at = ? WHERE id = ?", (now, task_id)
        )
        self.conn.execute(
            "INSERT INTO task_events(task_id, kind, note, at_ms) VALUES(?,?,?,?)",
            (task_id, "done", "user_confirmed", now),
        )
        self.conn.commit()
        return {"ok": True, "reason": "done", "id": task_id}

    def _observation_rows(self) -> list[dict[str, Any]]:
        if self.conn is not None:
            rows = self.conn.execute(
                "SELECT metric, device_sampled_at, phone_received_at, value_json, quality FROM observations ORDER BY phone_received_at DESC"
            ).fetchall()
            return [dict(row) for row in rows]
        return list(self._rows)
