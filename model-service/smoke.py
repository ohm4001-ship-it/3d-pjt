"""Actual CLI inference smoke, after dependencies and model downloads.

Audio source: official Whisper tests/jfk.flac (supply --audio path).
Image source: official TripoSR examples/chair.png by default.
Creates local ignored smoke-output/report.json and the real inference artifacts.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from common import ROOT, VENDOR, atomic_json, configure_cache, emit, fail


def worker(script: str, args: list[str]) -> dict:
    result = subprocess.run([sys.executable, str(ROOT / script), *args], check=True, capture_output=True, text=True, encoding="utf-8", timeout=600)
    if result.stderr.strip():
        print(result.stderr, file=sys.stderr)
    return json.loads(result.stdout)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", default=str(VENDOR / "examples" / "chair.png"))
    parser.add_argument("--audio", required=True)
    args = parser.parse_args()
    configure_cache()
    output = ROOT / "smoke-output"
    output.mkdir(parents=True, exist_ok=True)
    try:
        import imageio_ffmpeg
        import numpy as np
        import trimesh
        audio_input = Path(args.audio).resolve(strict=True)
        wav_path = output / "jfk.wav"
        subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-v", "error", "-y", "-i", str(audio_input), "-ar", "16000", "-ac", "1", str(wav_path)], check=True, capture_output=True, timeout=60)
        image = worker("generate.py", ["--input", str(Path(args.image).resolve(strict=True)), "--output", str(output / "chair.glb")])
        scene = trimesh.load(str(output / "chair.glb"), force="scene")
        if not scene.geometry or not np.isfinite(scene.bounds).all():
            raise AssertionError("Exported GLB is empty or has non-finite bounds")
        faces = sum(len(g.faces) for g in scene.geometry.values())
        if faces < 100:
            raise AssertionError("Expected substantial reconstructed mesh geometry")
        audio = worker("transcribe.py", ["--input", str(wav_path), "--output", str(output / "jfk-transcript.json"), "--language", "en"])
        if "country" not in audio["text"].lower() or len(audio["text"]) < 30:
            raise AssertionError("Whisper did not recover the speech fixture's expected content")
        report = {"passed": True, "image": image, "audio": audio, "checks": ["Actual CUDA TripoSR reconstruction", "Re-imported finite GLB with more than 100 faces", "FFmpeg FLAC to WAV decoding", "Actual Whisper transcription recovered expected speech"], "sources": {"image": "https://github.com/VAST-AI-Research/TripoSR/blob/main/examples/chair.png", "audio": "https://github.com/openai/whisper/blob/main/tests/jfk.flac"}}
        atomic_json(output / "report.json", report)
        emit(report)
        return 0
    except Exception as exc:
        if isinstance(exc, subprocess.CalledProcessError) and exc.stderr:
            print(exc.stderr if isinstance(exc.stderr, str) else exc.stderr.decode("utf-8", errors="replace"), file=sys.stderr)
        return fail(exc)


if __name__ == "__main__":
    raise SystemExit(main())
