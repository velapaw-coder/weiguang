"""One JSON object on stdin, one JSON object on stdout. Keys are never printed."""

from __future__ import annotations

import asyncio
import json
import sys

from nanomuse.logger import logger

from weiguang_muse.session import CoachSession


def main() -> int:
    logger.remove()
    raw = sys.stdin.read()
    try:
        request = json.loads(raw or "{}")
    except json.JSONDecodeError:
        _emit({"values": {"modelStatus": "model_failed", "modelText": "", "proposals": [], "notices": ["请求不是 JSON。"], "followup": "", "stripped": []}})
        return 0
    if not isinstance(request, dict):
        _emit({"values": {"modelStatus": "model_failed", "modelText": "", "proposals": [], "notices": ["请求格式不对。"], "followup": "", "stripped": []}})
        return 0
    session = CoachSession(
        request.get("dataDir") or ".weiguang-muse",
        db=request.get("db") or None,
        rows=request.get("observations") or [],
        goals=request.get("goals") or [],
    )
    try:
        op = request.get("op") or "turn"
        if op == "confirm":
            _emit(session.confirm(request.get("proposal") or {}, bool(request.get("userConfirmed")), request.get("timezone") or "UTC"))
        elif op == "complete":
            _emit(session.complete(str(request.get("taskId") or ""), bool(request.get("userConfirmed"))))
        else:
            provider = "mock" if request.get("provider") == "mock" else "auto"
            script = request.get("script") if provider == "mock" else None
            result = asyncio.run(
                session.turn(
                    str(request.get("question") or ""),
                    provider,
                    script if isinstance(script, list) else None,
                    bool(request.get("consent")),
                    str(request.get("channel") or ""),
                )
            )
            _emit(result)
    finally:
        session.close()
    return 0


def _emit(payload: dict) -> None:
    sys.stdout.write(json.dumps(payload, ensure_ascii=False))
    sys.stdout.write("\n")


if __name__ == "__main__":
    raise SystemExit(main())
