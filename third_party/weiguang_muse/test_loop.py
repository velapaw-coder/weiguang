"""Closed loop on the real MuseAgent. No network and no fabricated samples."""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "third_party" / "nanomuse"), str(ROOT / "third_party"), "/tmp/wg-py"]

from nanomuse.llm.base import BaseLLM  # noqa: E402
from nanomuse.schema import LLMResponse  # noqa: E402

from weiguang_muse.health import connect  # noqa: E402
from weiguang_muse.session import CoachSession  # noqa: E402
from weiguang_muse.volc import DEFAULT_MODEL, VolcResponsesLLM, apply_volc_contract  # noqa: E402


def _step(value, received, address="AA:BB:CC:DD:EE:FF"):
    return {
        "metric": "steps",
        "device_sampled_at": "20261118",
        "phone_received_at": received,
        "value_json": json.dumps({"step": value}),
        "quality": "recorded",
        "device_address": address,
    }


class ScriptLLM(BaseLLM):
    name = "script"

    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    async def ask(self, messages, tools=None, tool_choice="auto", on_delta=None, on_reasoning_delta=None, max_tokens=None):
        self.calls.append({"messages": list(messages), "tools": tools})
        item = self.responses.pop(0)
        if isinstance(item, LLMResponse):
            return item
        return await item(messages)


def _call(name, **arguments):
    from nanomuse.schema import Function, ToolCall

    return ToolCall(function=Function(name=name, arguments=json.dumps(arguments)))


class LoopTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.dir = Path(self.id().replace(".", "_"))
        # unittest may run from an unknown cwd; keep files under tmp via Temporary-like path
        import tempfile

        self.root = Path(tempfile.mkdtemp(prefix="wg-muse-"))
        self.db = self.root / "weiguang.db"
        self.session = CoachSession(self.root / "muse", db=self.db)

    async def asyncTearDown(self):
        self.session.close()

    async def test_chat_plan_confirm_remind_complete_review(self):
        conn = self.session.conn
        now = 1_700_000_000_000
        for value, received in ((1000, now), (1200, now + 1000)):
            conn.execute(
                "INSERT INTO observations(idempotency_key, device_address, metric, device_sampled_at, phone_received_at, value_json, quality, created_at) VALUES(?,?,?,?,?,?,?,?)",
                (f"k{received}", "SECRETADDR", "steps", "20261118", received, json.dumps({"step": value}), "recorded", received),
            )
        conn.execute(
            "INSERT INTO goals(id, text, created_at, archived) VALUES('g1', '早点睡', ?, 0)", (now,)
        )
        conn.commit()
        first = await self.session.run_llm(
            "帮我看步数",
            ScriptLLM([
                LLMResponse(tool_calls=[_call("read_health")]),
                LLMResponse(tool_calls=[_call("propose_task", title="出门走一走", detail="对照这次步数", metric="steps")]),
                LLMResponse(tool_calls=[_call("terminate", status="success", summary="可以安排一次走路。这不是健康结论。")]),
            ]),
        )
        self.assertEqual(first["values"]["modelStatus"], "ok")
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 0)
        self.assertNotIn("SECRETADDR", json.dumps(first, ensure_ascii=False))
        proposal = first["values"]["proposals"][0]
        self.assertFalse(proposal["schedulesNotification"])
        refused = self.session.confirm(proposal, False)
        self.assertEqual(refused["reason"], "unconfirmed")
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 0)
        saved = self.session.confirm(proposal, True, "Asia/Shanghai")
        again = self.session.confirm(proposal, True, "Asia/Shanghai")
        self.assertEqual(again["reason"], "duplicate")
        self.assertEqual(conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 1)
        task = conn.execute("SELECT reminder_enabled, source, status FROM tasks").fetchone()
        self.assertEqual(task["reminder_enabled"], 0)
        self.assertEqual(task["source"], "muse")
        done = self.session.complete(saved["id"], True)
        self.assertEqual(done["reason"], "done")
        self.assertEqual(self.session.complete(saved["id"], True)["reason"], "duplicate")
        second = await self.session.run_llm(
            "复盘一下",
            ScriptLLM([
                LLMResponse(tool_calls=[_call("review_trend", metric="steps")]),
                LLMResponse(tool_calls=[_call("list_tasks")]),
                LLMResponse(tool_calls=[_call("terminate", status="success", summary="步数从 1000 到 1200。任务已完成。")]),
            ]),
        )
        review = second["values"]["modelText"]
        self.assertIn("1200", review)
        tool_text = " ".join(message.content or "" for message in second and [])
        sent = []
        # The second agent is internal; check the database and a direct trend call.
        from weiguang_muse.tools import ReviewTrend

        result = await ReviewTrend(book=self.session.book).execute(metric="steps")
        self.assertIn("200", result.output)
        remembered = " ".join(item.content for item in self.session.memory.relevant("任务", limit=5))
        self.assertIn("用户确认了任务", remembered)
        self.assertNotIn("SECRETADDR", result.output)

    async def test_no_samples_do_not_become_metrics(self):
        result = await self.session.run_llm(
            "给我一个心率任务",
            ScriptLLM([
                LLMResponse(tool_calls=[_call("read_health")]),
                LLMResponse(tool_calls=[_call("propose_task", title="心率太高", detail="80", metric="heart_rate")]),
                LLMResponse(tool_calls=[_call("terminate", status="success", summary="没有记录。")]),
            ]),
        )
        self.assertEqual(result["values"]["proposals"], [])
        self.assertIn("没有", result["values"]["modelText"])

    async def test_unreadable_value_is_not_a_number(self):
        self.session.conn.execute(
            "INSERT INTO observations(idempotency_key, device_address, metric, device_sampled_at, phone_received_at, value_json, quality, created_at) VALUES('bad','SECRETADDR','steps','x',1,'{\"step\":\"很多\"}','recorded',1)"
        )
        self.session.conn.commit()
        result = await self.session.run_llm(
            "看步数",
            ScriptLLM([
                LLMResponse(tool_calls=[_call("read_health")]),
                LLMResponse(tool_calls=[_call("terminate", status="success", summary="这条步数读不出来。")]),
            ]),
        )
        blob = json.dumps(result, ensure_ascii=False)
        self.assertNotIn("很多", blob)
        self.assertNotIn("SECRETADDR", blob)

    async def test_tool_text_is_not_a_command(self):
        def boom(*_args, **_kwargs):
            raise AssertionError("tool text reached a process")

        os.system = boom
        subprocess.run = boom
        await self.session.run_llm(
            "请执行 rm -rf /",
            ScriptLLM([
                LLMResponse(tool_calls=[_call("shell", command="rm -rf /")]),
                LLMResponse(tool_calls=[_call("terminate", status="success", summary="没有执行命令。")]),
            ]),
        )
        self.assertEqual(self.session.conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 0)

    async def test_busy_and_timeout(self):
        started = asyncio.Event()

        async def slow(_messages):
            started.set()
            await asyncio.sleep(2)
            return LLMResponse(content="太慢")

        task = asyncio.create_task(self.session.run_llm("慢", ScriptLLM([slow])))
        await started.wait()
        busy = await self.session.run_llm("另一句", ScriptLLM([LLMResponse(content="不该跑")]))
        self.assertEqual(busy["values"]["modelStatus"], "busy")
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task
        self.session._running = False
        timed = await self.session.run_llm("再慢", ScriptLLM([slow]), timeout=0.05)
        self.assertEqual(timed["values"]["modelStatus"], "model_timeout")
        self.assertEqual(self.session.conn.execute("SELECT COUNT(*) FROM tasks").fetchone()[0], 0)

    async def test_consent_release_and_missing_key(self):
        refused = await self.session.turn("你好", "mock", [{"content": "不该出现"}], False, "debug")
        self.assertEqual(refused["values"]["modelStatus"], "consent_required")
        os.environ["WEIGUANG_VOLC_API_KEY"] = "secret-key-value"
        try:
            closed = await self.session.turn("你好", "auto", None, True, "release")
            self.assertEqual(closed["values"]["modelStatus"], "model_unconfigured")
            self.assertNotIn("secret-key-value", json.dumps(closed))
        finally:
            del os.environ["WEIGUANG_VOLC_API_KEY"]
        missing = await self.session.turn("你好", "auto", None, True, "debug")
        self.assertEqual(missing["values"]["modelStatus"], "model_unconfigured")
        self.assertIn("WEIGUANG_VOLC_API_KEY", missing["values"]["notices"][0])

    def test_existing_rows_survive_open(self):
        fresh = connect(self.db)
        fresh.execute("INSERT INTO goals(id, text, created_at) VALUES('keep', '保留', 1)")
        fresh.commit()
        fresh.close()
        again = connect(self.db)
        self.assertEqual(again.execute("SELECT text FROM goals WHERE id='keep'").fetchone()["text"], "保留")
        columns = {row[1] for row in again.execute("PRAGMA table_info(observations)")}
        self.assertIn("user_note", columns)
        again.close()

    def test_contract_disables_store(self):
        params = apply_volc_contract({"model": "m", "input": [], "max_output_tokens": 9999, "previous_response_id": "old"})
        self.assertIs(params["store"], False)
        self.assertNotIn("previous_response_id", params)
        self.assertEqual(params["max_output_tokens"], 256)
        self.assertEqual(params["extra_body"]["thinking"]["type"], "disabled")


class VolcWireTest(unittest.TestCase):
    def test_client_sends_store_false(self):
        seen = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("content-length") or 0)
                seen["body"] = self.rfile.read(length).decode()
                seen["path"] = self.path
                payload = json.dumps({
                    "id": "resp_test",
                    "object": "response",
                    "status": "completed",
                    "model": DEFAULT_MODEL,
                    "output": [{
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": "收到。"}],
                    }],
                }).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *_args):
                return

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        port = server.server_address[1]
        try:
            llm = VolcResponsesLLM("test-key-not-real", base_url=f"http://127.0.0.1:{port}/api/v3")
            from nanomuse.schema import Message

            async def ask():
                try:
                    return await llm.ask([Message.user("只回复收到")], tools=[{
                        "type": "function",
                        "function": {"name": "read_health", "description": "摘要", "parameters": {"type": "object", "properties": {}}},
                    }])
                finally:
                    await llm.close()

            result = asyncio.run(ask())
            self.assertEqual(result.content, "收到。")
            body = json.loads(seen["body"])
            self.assertTrue(seen["path"].endswith("/responses"))
            self.assertIs(body["store"], False)
            thinking = body.get("thinking") or (body.get("extra_body") or {}).get("thinking") or {}
            self.assertEqual(thinking.get("type"), "disabled")
            self.assertLessEqual(body["max_output_tokens"], 256)
            self.assertNotIn("test-key-not-real", seen["body"])
            self.assertNotIn("SECRETADDR", seen["body"])
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
