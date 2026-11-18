"""Tools the energy coach may call. Writes wait for a host confirmation."""

from __future__ import annotations

import json
import uuid
from typing import Any

from nanomuse.schema import RiskLevel, ToolResult
from nanomuse.tools.base import BaseTool

from weiguang_muse.health import HealthBook


def _dump(payload: dict[str, Any]) -> str:
    text = json.dumps(payload, ensure_ascii=False)
    return text if len(text) <= 1500 else text[:1500]


class ReadHealth(BaseTool):
    name: str = "read_health"
    description: str = "读取这部手机已经同步的少量健康摘要。没有记录就说明没有，不要编造数值。"
    parameters: dict[str, Any] = {"type": "object", "properties": {}}
    risk: RiskLevel = RiskLevel.SAFE
    reads_private_data: bool = True
    book: Any = None

    async def execute(self, **_: Any) -> ToolResult:
        book: HealthBook = self.book
        return ToolResult(output=_dump(book.summary()))


class ListTasks(BaseTool):
    name: str = "list_tasks"
    description: str = "列出已经由用户确认、写在本地库里的任务和完成状态。"
    parameters: dict[str, Any] = {"type": "object", "properties": {}}
    risk: RiskLevel = RiskLevel.SAFE
    book: Any = None

    async def execute(self, **_: Any) -> ToolResult:
        book: HealthBook = self.book
        rows = book.tasks()
        active = sum(1 for row in rows if row["status"] == "active")
        done = sum(1 for row in rows if row["status"] == "done")
        return ToolResult(output=_dump({"active": active, "done": done, "tasks": rows[:12]}))


class ListGoals(BaseTool):
    name: str = "list_goals"
    description: str = "读取用户自己写下的目标。"
    parameters: dict[str, Any] = {"type": "object", "properties": {}}
    risk: RiskLevel = RiskLevel.SAFE
    book: Any = None

    async def execute(self, **_: Any) -> ToolResult:
        book: HealthBook = self.book
        return ToolResult(output=_dump({"goals": book.goals()[:8]}))


class ReviewTrend(BaseTool):
    name: str = "review_trend"
    description: str = "对照同一指标最近两条真实数值。不足两条就说明不足。不是医学判断。"
    parameters: dict[str, Any] = {
        "type": "object",
        "properties": {"metric": {"type": "string"}},
        "required": ["metric"],
    }
    risk: RiskLevel = RiskLevel.SAFE
    reads_private_data: bool = True
    book: Any = None

    async def execute(self, metric: str = "", **_: Any) -> ToolResult:
        book: HealthBook = self.book
        return ToolResult(output=_dump(book.trend(str(metric or ""))))


class ProposeTask(BaseTool):
    name: str = "propose_task"
    description: str = "提出一个待用户确认的任务。这个工具不写数据库，也不安排提醒或设备命令。"
    parameters: dict[str, Any] = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "detail": {"type": "string"},
            "metric": {"type": "string"},
        },
        "required": ["title"],
    }
    risk: RiskLevel = RiskLevel.SAFE
    book: Any = None
    pending: Any = None

    async def execute(self, title: str = "", detail: str = "", metric: str = "", **_: Any) -> ToolResult:
        book: HealthBook = self.book
        cleaned = str(title or "").strip()
        if not cleaned:
            return ToolResult.fail("任务标题是空的")
        chosen = str(metric or "").strip()
        if chosen and not book.has_metric(chosen):
            return ToolResult.fail("没有这项已同步数值，不能当作依据")
        if not chosen and not book.summary()["hasAnySample"]:
            return ToolResult.fail("没有已同步数值，不能生成带健康依据的任务")
        proposal = {
            "id": f"p_{uuid.uuid4().hex[:12]}",
            "title": cleaned[:80],
            "detail": str(detail or "")[:400],
            "metric": chosen,
            "source": "muse",
            "schedulesNotification": False,
            "deviceCommands": [],
        }
        self.pending.append(proposal)
        return ToolResult(output=_dump({"queued": True, "persisted": False, "proposal": proposal}))


class RememberNote(BaseTool):
    name: str = "remember_note"
    description: str = "记住一句用户已经同意的短约定。不要写入原始健康记录、设备地址或密钥。"
    parameters: dict[str, Any] = {
        "type": "object",
        "properties": {"text": {"type": "string"}},
        "required": ["text"],
    }
    risk: RiskLevel = RiskLevel.SAFE
    memory: Any = None

    async def execute(self, text: str = "", **_: Any) -> ToolResult:
        note = " ".join(str(text or "").split())
        if not note:
            return ToolResult.fail("没有可记的内容")
        if len(note) > 200 or any(token in note.lower() for token in ("value_json", "api_key", "bearer ")):
            return ToolResult.fail("这句太长，或像原始记录、密钥，没有写入记忆")
        if self.memory is None:
            return ToolResult.fail("本地记忆不可用")
        self.memory.add(note, category="agreement", source="coach")
        return ToolResult(output="已记在这部设备的教练记忆里")
