"""Explicit model download step. Never called by a web request."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import shutil
import sys
from pathlib import Path

from common import CACHE, TRIPO, WHISPER, atomic_json, configure_cache, emit, fail


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", action="store_true")
    parser.add_argument("--audio", action="store_true")
    parser.add_argument("--whisper-model", choices=["base", "small"], default="base")
    args = parser.parse_args()
    if not args.image and not args.audio:
        parser.error("Select --image and/or --audio")
    configure_cache(offline=False)
    try:
        with contextlib.redirect_stdout(sys.stderr):
            files = []
            if args.image:
                # Initialize Transformers' cache-version marker during setup,
                # before inference switches the Hugging Face cache offline.
                import transformers  # noqa: F401
                from huggingface_hub import hf_hub_download
                TRIPO.mkdir(parents=True, exist_ok=True)
                for filename in ["config.yaml", "model.ckpt"]:
                    print(f"Downloading official TripoSR {filename}", file=sys.stderr, flush=True)
                    cached = hf_hub_download("stabilityai/TripoSR", filename)
                    target = TRIPO / filename
                    temporary = target.with_name(target.name + ".partial")
                    try:
                        shutil.copyfile(cached, temporary)
                        temporary.replace(target)
                    finally:
                        temporary.unlink(missing_ok=True)
                    files.append(str(target))
                hf_hub_download("facebook/dino-vitb16", "config.json")
                import rembg
                print("Preparing local U2Net background-removal weights", file=sys.stderr, flush=True)
                rembg.new_session("u2net", providers=["CPUExecutionProvider"])
                files.append(str(CACHE / "u2net" / "u2net.onnx"))
            if args.audio:
                import whisper
                WHISPER.mkdir(parents=True, exist_ok=True)
                # load_model verifies the upstream checksum and downloads if absent.
                print(f"Preparing official Whisper {args.whisper_model} weights", file=sys.stderr, flush=True)
                model = whisper.load_model(args.whisper_model, device="cpu", download_root=str(WHISPER))
                del model
                files.append(str(WHISPER / f"{args.whisper_model}.pt"))
            manifest = []
            for filename in files:
                path = Path(filename)
                digest = hashlib.sha256()
                with path.open("rb") as stream:
                    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                        digest.update(chunk)
                manifest.append({"file": str(path.relative_to(CACHE)), "bytes": path.stat().st_size, "sha256": digest.hexdigest()})
            atomic_json(CACHE / "download-manifest.json", {"files": manifest})
        emit({"downloaded": files, "manifest": str(CACHE / "download-manifest.json")})
        return 0
    except Exception as exc:
        return fail(exc)


if __name__ == "__main__":
    raise SystemExit(main())
