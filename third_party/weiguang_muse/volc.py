"""Volcano Ark Responses calls. store is always false. The key is not logged."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from nanomuse.config import LLMSettings
from nanomuse.llm.openai_responses import OpenAIResponsesLLM

DEFAULT_BASE = "https://ark.cn-beijing.volces.com/api/v3"
DEFAULT_MODEL = "doubao-seed-2-1-lite-260915"
KEY_ENV = "WEIGUANG_VOLC_API_KEY"
KEY_FILE_ENV = "WEIGUANG_VOLC_KEY_FILE"


def load_api_key() -> str:
    direct = os.environ.get(KEY_ENV, "").strip()
    if direct:
        return direct
    location = os.environ.get(KEY_FILE_ENV, "").strip()
    if not location:
        return ""
    path = Path(location)
    if not path.is_file():
        return ""
    return path.read_text(encoding="utf-8").strip()


def apply_volc_contract(params: dict[str, Any]) -> dict[str, Any]:
    out = dict(params)
    out["store"] = False
    out.pop("previous_response_id", None)
    extra = dict(out.get("extra_body") or {})
    extra["thinking"] = {"type": "disabled"}
    out["extra_body"] = extra
    try:
        cap = int(out.get("max_output_tokens") or 256)
    except (TypeError, ValueError):
        cap = 256
    out["max_output_tokens"] = min(cap, 256)
    return out


class VolcResponsesLLM(OpenAIResponsesLLM):
    """Real Responses client with the coach contract applied to every request."""

    def __init__(self, api_key: str, base_url: str = DEFAULT_BASE, model: str = DEFAULT_MODEL):
        settings = LLMSettings(
            provider="openai_responses",
            model=model,
            base_url=base_url,
            api_key=api_key or "EMPTY",
            max_tokens=256,
            temperature=0.3,
            timeout=30,
            max_retries=0,
            stream=False,
            vision="off",
            tool_mode="native",
        )
        super().__init__(settings)

    async def _send(self, params, on_delta, on_reasoning_delta=None):
        self.settings.stream = False
        return await OpenAIResponsesLLM._send(
            self, apply_volc_contract(params), on_delta, on_reasoning_delta
        )
