"""Local, explicit model caches shared by the two CLI workers."""
from __future__ import annotations

import importlib
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor" / "TripoSR"
CACHE = ROOT / ".cache"
TRIPO = CACHE / "triposr"
WHISPER = CACHE / "whisper"

# Node receives UTF-8 JSON over pipes even on Korean Windows code pages.
for stream in [sys.stdout, sys.stderr]:
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")


def configure_cache(offline: bool = True) -> None:
    os.environ["HF_HOME"] = str(CACHE / "huggingface")
    os.environ["HF_HUB_CACHE"] = str(CACHE / "huggingface" / "hub")
    os.environ["U2NET_HOME"] = str(CACHE / "u2net")
    os.environ["NUMBA_CACHE_DIR"] = str(CACHE / "numba")
    os.environ.setdefault("TQDM_DISABLE", "1")
    if offline:
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TRANSFORMERS_OFFLINE"] = "1"


def dependencies(names: list[str]) -> list[str]:
    failures = []
    for name in names:
        try:
            importlib.import_module(name)
        except Exception as exc:
            failures.append(f"{name}: {type(exc).__name__}: {exc}")
    return failures


def emit(value: dict) -> None:
    print(json.dumps(value, ensure_ascii=False), flush=True)


def fail(exc: Exception) -> int:
    print(f"{type(exc).__name__}: {exc}", file=sys.stderr, flush=True)
    return 1


def atomic_json(output: Path, value: dict) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_name(output.name + ".partial")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(output)
