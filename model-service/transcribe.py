"""Real local Whisper transcription: --input audio --output transcript.json."""
from __future__ import annotations

import argparse
import contextlib
import subprocess
import sys
import time
from pathlib import Path

from common import WHISPER, atomic_json, configure_cache, dependencies, emit, fail


def readiness(model_name: str = "base") -> dict:
    configure_cache()
    reasons = dependencies(["torch", "numpy", "whisper", "imageio_ffmpeg"])
    checkpoint = WHISPER / f"{model_name}.pt"
    if not checkpoint.is_file():
        reasons.append(f"Missing local Whisper checkpoint: {checkpoint}")
    if not reasons:
        try:
            import imageio_ffmpeg
            executable = imageio_ffmpeg.get_ffmpeg_exe()
            subprocess.run([executable, "-version"], check=True, capture_output=True, timeout=10)
        except Exception as exc:
            reasons.append(f"FFmpeg unavailable: {exc}")
    return {"ready": not reasons, "provider": "Whisper", "model": model_name, "reasons": reasons}


def transcribe(args) -> dict:
    input_path = Path(args.input).resolve(strict=True)
    output_path = Path(args.output).resolve()
    if output_path.suffix.lower() != ".json":
        raise ValueError("Transcript output must have a .json extension")
    if input_path == output_path:
        raise ValueError("Input and output paths must be different")
    status = readiness(args.model)
    if not status["ready"]:
        raise RuntimeError("Whisper is unavailable. " + " | ".join(status["reasons"]))
    import imageio_ffmpeg
    import numpy as np
    import torch
    import whisper

    started = time.monotonic()
    try:
        decoded = subprocess.run([
            imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-v", "error", "-i", str(input_path),
            "-t", "121", "-f", "s16le", "-ac", "1", "-ar", "16000", "-",
        ], check=True, capture_output=True, timeout=60)
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.decode("utf-8", errors="replace").strip()[:600]
        raise ValueError(f"Cannot decode audio: {detail}") from exc
    audio = np.frombuffer(decoded.stdout, dtype=np.int16).astype(np.float32) / 32768.0
    duration = len(audio) / 16000
    if duration == 0 or duration > 120:
        raise ValueError("Audio must contain between 0 and 120 seconds of decodable sound")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Transcribing with Whisper {args.model} on {device}", file=sys.stderr, flush=True)
    model = whisper.load_model(str(WHISPER / f"{args.model}.pt"), device=device)
    result = model.transcribe(audio, language=args.language, task="transcribe", fp16=device == "cuda", verbose=None, condition_on_previous_text=False)
    transcript = {"provider": "Whisper", "model": args.model, "language": result["language"], "text": result["text"].strip(), "durationSeconds": round(duration, 2), "segments": [{"start": s["start"], "end": s["end"], "text": s["text"].strip()} for s in result["segments"]]}
    atomic_json(output_path, transcript)
    return {"output": str(output_path), **transcript, "seconds": round(time.monotonic() - started, 2), "device": device}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--model", choices=["base", "small"], default="base")
    parser.add_argument("--language", default=None, help="Optional language code, e.g. ko; default detects language")
    args = parser.parse_args()
    if args.check:
        with contextlib.redirect_stdout(sys.stderr):
            status = readiness(args.model)
        emit(status)
        return 0
    if not args.input or not args.output:
        parser.error("--input and --output are required unless --check is used")
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = transcribe(args)
        emit(result)
        return 0
    except Exception as exc:
        return fail(exc)


if __name__ == "__main__":
    raise SystemExit(main())
