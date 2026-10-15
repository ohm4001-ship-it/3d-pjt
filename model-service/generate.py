"""A real single-image TripoSR worker: --input image --output mesh.glb.

No placeholder mesh is emitted. Missing models/dependencies fail explicitly.
Run download_models.py once before inference; jobs do not download weights.
"""
from __future__ import annotations

import argparse
import contextlib
import sys
import time
from pathlib import Path

from common import CACHE, TRIPO, VENDOR, configure_cache, dependencies, emit, fail


def readiness() -> dict:
    configure_cache()
    reasons = dependencies([
        "torch", "numpy", "PIL", "omegaconf", "einops", "transformers",
        "huggingface_hub", "trimesh", "rembg", "onnxruntime", "imageio", "skimage",
    ])
    for path in [VENDOR / "tsr" / "system.py", TRIPO / "config.yaml", TRIPO / "model.ckpt", CACHE / "u2net" / "u2net.onnx"]:
        if not path.is_file():
            reasons.append(f"Missing local file: {path}")
    if not reasons:
        try:
            from huggingface_hub import hf_hub_download
            hf_hub_download("facebook/dino-vitb16", "config.json", local_files_only=True)
            import torch
            if not torch.cuda.is_available():
                reasons.append("CUDA is unavailable. This image worker requires an NVIDIA CUDA GPU.")
        except Exception as exc:
            reasons.append(f"Model prerequisite: {exc}")
    return {"ready": not reasons, "provider": "TripoSR", "device": "cuda:0", "reasons": reasons}


def generate(args) -> dict:
    input_path = Path(args.input).resolve(strict=True)
    output_path = Path(args.output).resolve()
    if output_path.suffix.lower() != ".glb":
        raise ValueError("Output must have a .glb extension")
    if input_path == output_path:
        raise ValueError("Input and output paths must be different")
    status = readiness()
    if not status["ready"]:
        raise RuntimeError("TripoSR is unavailable. " + " | ".join(status["reasons"]))

    import numpy as np
    import rembg
    import torch
    from PIL import Image, ImageOps
    import isosurface_adapter

    # A deliberate, documented adapter replaces the CUDA C++ meshing extension.
    sys.path.insert(0, str(VENDOR))
    sys.modules["tsr.models.isosurface"] = isosurface_adapter
    from tsr.system import TSR
    from tsr.utils import remove_background, resize_foreground

    started = time.monotonic()
    print("Loading official TripoSR weights on cuda:0", file=sys.stderr, flush=True)
    model = TSR.from_pretrained(str(TRIPO), config_name="config.yaml", weight_name="model.ckpt")
    model.renderer.set_chunk_size(args.chunk_size)
    model.to("cuda:0").eval()

    # Avoid Pillow decompression bombs and preserve transparency/orientation.
    Image.MAX_IMAGE_PIXELS = 16_000_000
    with Image.open(input_path) as opened:
        if opened.width * opened.height > Image.MAX_IMAGE_PIXELS:
            raise ValueError("Image is larger than the 16 megapixel limit")
        image = ImageOps.exif_transpose(opened).convert("RGBA")
    image.thumbnail((2048, 2048))
    if image.getextrema()[3][0] == 255:
        print("Removing image background using local U2Net weights", file=sys.stderr, flush=True)
        image = remove_background(image, rembg.new_session("u2net", providers=["CPUExecutionProvider"]))
    alpha = np.asarray(image)[..., 3]
    if not np.any(alpha > 0):
        raise ValueError("Background removal left no foreground. Supply an isolated object image.")
    image = resize_foreground(image, 0.85)
    rgba = np.asarray(image, dtype=np.float32) / 255.0
    rgb = rgba[..., :3] * rgba[..., 3:] + 0.5 * (1 - rgba[..., 3:])
    image = Image.fromarray((rgb * 255).astype(np.uint8))

    print("Reconstructing image and extracting vertex-colored mesh", file=sys.stderr, flush=True)
    with torch.inference_mode():
        scene = model([image], device="cuda:0")
        mesh = model.extract_mesh(scene, has_vertex_color=True, resolution=args.resolution)[0]
    if len(mesh.vertices) < 3 or len(mesh.faces) < 1:
        raise RuntimeError("TripoSR produced an empty mesh")
    if not np.isfinite(mesh.vertices).all():
        raise RuntimeError("TripoSR produced invalid vertices")
    # TripoSR uses Z-up. GLTF/Three.js viewers expect Y-up.
    import trimesh
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-np.pi / 2, [1, 0, 0]))
    mesh.metadata.update({"generator": "TripoSR", "purpose": "visual reference; not a dimensioned manufacturing model"})
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(output_path.name + ".partial")
    try:
        mesh.export(str(temporary), file_type="glb")
        with temporary.open("rb") as stream:
            if stream.read(4) != b"glTF":
                raise RuntimeError("Mesh exporter did not create a GLB file")
        temporary.replace(output_path)
    finally:
        temporary.unlink(missing_ok=True)
    return {"output": str(output_path), "provider": "TripoSR", "vertices": len(mesh.vertices), "faces": len(mesh.faces), "bytes": output_path.stat().st_size, "seconds": round(time.monotonic() - started, 2), "device": torch.cuda.get_device_name(0), "gpuPeakMemoryBytes": torch.cuda.max_memory_allocated(), "resolution": args.resolution}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input")
    parser.add_argument("--output")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--resolution", type=int, default=128, choices=[64, 128, 192, 256])
    parser.add_argument("--chunk-size", type=int, default=4096)
    args = parser.parse_args()
    if args.check:
        # Imported packages sometimes log to stdout; reserve stdout for JSON.
        with contextlib.redirect_stdout(sys.stderr):
            status = readiness()
        emit(status)
        return 0
    if not args.input or not args.output:
        parser.error("--input and --output are required unless --check is used")
    if not 256 <= args.chunk_size <= 8192:
        parser.error("--chunk-size must be between 256 and 8192")
    try:
        with contextlib.redirect_stdout(sys.stderr):
            result = generate(args)
        emit(result)
        return 0
    except Exception as exc:
        return fail(exc)


if __name__ == "__main__":
    raise SystemExit(main())
