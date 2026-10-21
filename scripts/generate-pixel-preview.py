"""Local art preview: pixelmon + SDXL/Pixel Art XL, no API account or paid service.

Requires the separately cloned MIT pixelmon project and a running ComfyUI with
sd_xl_base_1.0.safetensors and pixel-art-xl.safetensors. Model weights stay outside
the game repository. Run --help for paths. All generated art and exact prompts
are saved under assets/pixel; intermediary renders stay in ignored .cache/.

The first preview's motion frames are procedural from a generated master sprite,
not independently AI-generated action poses. That distinction is recorded in the
manifest. Combat timing remains controlled by the game's existing engine.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/pixel"
RAW = ROOT / ".cache/pixel-raw"
NEGATIVE = "photograph, photorealistic, 3d render, blurry, text, watermark, signature, frame, border, grid, sprite sheet, multiple views, duplicate character, cropped, cut off feet, extra limbs, extra fingers"
JOBS = {
    "background": {
        "size": "384x128", "res": 1152, "seed": 2026102112,
        "prompt": "pixel, panoramic Chinese mountain landscape, blue green karst peaks fading into morning mist, tall distant waterfall, sunlight in pale golden sky, pine branches framing upper left corner, a continuous flat horizontal mossy stone ledge across the entire bottom foreground, side view grassy level ground, open air landscape scene background for a side scrolling game, empty arena, refined detailed 16 bit pixel art, muted jade and celadon palette, no people, no creatures, no bridge, no buildings in foreground, no stairs",
    },
    "hero": {
        "size": "96x128", "res": 1024, "seed": 2026102102,
        "prompt": "pixel, one male Chinese wuxia swordsman, young adult, black hair in a high topknot, celadon green long hanfu robe, ivory inner robe, dark boots, holding one long silver straight jian sword, full body, side view facing right, neutral ready stance, feet on the same ground line, both feet and entire sword visible, isolated on pure solid white background, single character, clean readable silhouette, crisp detailed 16 bit pixel art, jade green ivory charcoal and aged gold palette",
    },
    "wolf": {
        "size": "160x128", "res": 1024, "seed": 2026102103,
        "prompt": "pixel, one fierce dark charcoal gray forest wolf spirit, quadruped, full body side view facing left, mouth open with ivory fangs, pointed ears, a long bushy tail, small jade green accents in fur, all four paws visible, isolated on pure solid white background, single creature, game battle monster, sharp clean silhouette, crisp detailed 16 bit pixel art, dark slate jade and warm gray palette",
    },
    "fox": {
        "size": "128x96", "res": 768, "seed": 2026102104,
        "prompt": "pixel, one small magical fox companion, white fur with pale celadon jade green tips on pointed ears and fluffy tail, full body side view facing right, standing on all four paws, alert gentle expression, isolated on pure solid white background, single animal, crisp clean 16 bit pixel art, readable silhouette",
    },
}


def import_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def generate(name, job, tool_root, comfy_dir, steps):
    RAW.mkdir(parents=True, exist_ok=True)
    old = sorted(RAW.glob(name + f"_*_s{job['seed']}_raw*.png"))
    if old:
        print(f"Reuse {name}: {old[-1].name}", flush=True)
        return old[-1]
    pixelmon = import_file("gacha_pixelmon", tool_root / "pixelmon.py")
    pixelmon.COMFY = str(comfy_dir)
    pixelmon.OUTPUT = str(comfy_dir / "output")
    sys.argv = ["pixelmon", job["prompt"], "--raw", "--exact-prompt",
                "--negative", NEGATIVE, "--size", job["size"], "--res", str(job["res"]),
                "--seed", str(job["seed"]), "--steps", str(steps), "--cfg", "6.5",
                "--lora-strength", "1.0", "--name", name, "--no-open",
                "--output-to", str(RAW), "--create-dirs", "--server", "http://127.0.0.1:8188"]
    pixelmon.main()
    files = sorted(RAW.glob(name + f"_*_s{job['seed']}_raw*.png"))
    if not files:
        raise RuntimeError(f"pixelmon did not produce {name}")
    return files[-1]


def cutout(image, name):
    """Local U2Net foreground segmentation, then hard alpha for crisp pixels."""
    from rembg import remove
    segmented = remove(image.convert("RGB"), session=background_session()).convert("RGBA")
    rgb = np.asarray(image.convert("RGB"))
    alpha = np.where(np.asarray(segmented.getchannel("A")) > 100, 255, 0).astype(np.uint8)
    if name == "hero" and JOBS["hero"]["seed"] == 2026102102 and image.size == (768, 1024):
        # U2Net drops the reviewed master's very thin pale blade. Restore only
        # those source pixels, retaining the generated sword rather than drawing
        # a replacement. Coordinates are tied to the recorded deterministic seed.
        mask = Image.fromarray(alpha)
        ImageDraw.Draw(mask).polygon([(275, 517), (295, 530), (65, 773), (52, 766)], fill=255)
        alpha = np.asarray(mask)
    labels, count = ndimage.label(alpha > 0)
    if count:
        sizes = np.bincount(labels.ravel()); sizes[0] = 0
        # Keep the subject and meaningful detached weapon pieces, drop tiny noise.
        alpha = np.where(sizes[labels] >= max(10, sizes.max() * .003), alpha, 0).astype(np.uint8)
    result = Image.fromarray(np.dstack([rgb, alpha]))
    bounds = result.getbbox()
    if not bounds:
        raise RuntimeError("Cutout produced an empty sprite")
    return result.crop(bounds)


@lru_cache(maxsize=1)
def background_session():
    from rembg import new_session
    return new_session("u2net", providers=["CPUExecutionProvider"])


def palette_lock(image, count=40):
    alpha = image.getchannel("A") if image.mode == "RGBA" else None
    rgb = image.convert("RGB").quantize(colors=count, method=Image.Quantize.MEDIANCUT,
                                       dither=Image.Dither.NONE).convert("RGB")
    if alpha is not None:
        rgb.putalpha(alpha)
    return rgb


def export_actor(name, image, manifest):
    actor = cutout(image, name)
    if name == "hero":
        actor = ImageOps.mirror(actor)  # Reviewed master faces left; battle hero faces right.
    size = 192
    max_shape = (138, 163) if name == "hero" else (157, 135) if name == "wolf" else (141, 100)
    actor.thumbnail(max_shape, Image.Resampling.NEAREST)
    actor = palette_lock(actor, 40)
    master = Image.new("RGBA", (size, size))
    x, baseline = (size - actor.width) // 2, 179
    master.alpha_composite(actor, (x, baseline - actor.height))
    folder = OUT / name; folder.mkdir(parents=True, exist_ok=True)
    actor.save(folder / "portrait.png")

    # Preserve one colour palette and the same 192px canvas across all actions.
    # The feet remain fixed during idle. Only upper-body rows move by 0–2 pixels.
    idle = []
    for shift in (0, 1, 2, 1, 0, 0):
        arr = np.asarray(master)
        rows = np.arange(size)
        strength = np.maximum(0.0, (baseline - rows) / max(1, actor.height))
        source_rows = np.clip(rows + np.rint(shift * strength).astype(int), 0, size - 1)
        frame = arr[source_rows].copy()
        idle.append(Image.fromarray(frame))
    attack = []
    for dx, angle in ((0, 0), (-3, -3), (4, 2), (8, 3), (5, 2), (0, 0)):
        source = master.rotate(angle if name == "hero" else -angle,
                               resample=Image.Resampling.NEAREST, center=(96, baseline))
        frame = Image.new("RGBA", master.size)
        frame.alpha_composite(source, (dx if name == "hero" else -dx, 0))
        attack.append(frame)
    record = {"portrait": f"{name}/portrait.png", "motionMethod": "procedural-keyframes-from-generated-master"}
    for action, frames, fps in (("idle", idle, 6), ("attack", attack, 14)):
        paths = []
        sheet = Image.new("RGBA", (size * len(frames), size))
        for i, frame in enumerate(frames):
            filename = f"{action}-{i:02}.png"
            frame.save(folder / filename); paths.append(f"{name}/{filename}")
            sheet.alpha_composite(frame, (i * size, 0))
        sheet.save(folder / f"{action}-sheet.png")
        frames[0].save(folder / f"{action}.gif", save_all=True, append_images=frames[1:],
                       duration=round(1000 / fps), loop=0, disposal=2, transparency=0)
        record[action] = {"frames": paths, "fps": fps, "frameWidth": size,
                          "frameHeight": size, "anchor": [96, baseline]}
    if name == "hero": manifest["hero"] = record
    elif name == "fox":
        record["cardId"] = "P001"
        manifest["pet"] = record
    else: manifest["enemies"] = [record] * 4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tool-root", type=Path, default=ROOT / ".cache/tools/pixelmon")
    parser.add_argument("--comfy-dir", type=Path, required=True, help="ComfyUI shared input/output directory")
    parser.add_argument("--targets", nargs="+", choices=list(JOBS), default=list(JOBS))
    parser.add_argument("--steps", type=int, default=24)
    args = parser.parse_args()
    manifest_path = OUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf8"))
    manifest.update(provider="pixelmon-local-sdxl", status="generating",
                    provenance="主角、狼妖、灵狐及山林背景由 pixelmon + ComfyUI + SDXL / Pixel Art XL 在本地生成；首版动作是基于同一角色原画的程序关键帧。其余地图暂复用首图美术。")
    manifest["generation"] = {"tool": "https://github.com/grymmjack/pixelmon",
        "toolCommit": subprocess.check_output(["git", "-C", str(args.tool_root), "rev-parse", "HEAD"], text=True).strip(), "checkpoint": "stabilityai/stable-diffusion-xl-base-1.0",
        "lora": "nerijs/pixel-art-xl", "steps": args.steps,
        "jobs": JOBS, "negativePrompt": NEGATIVE}
    for name in args.targets:
        print(f"Generating {name} locally", flush=True)
        raw = generate(name, JOBS[name], args.tool_root, args.comfy_dir, args.steps)
        image = Image.open(raw).convert("RGB")
        if name == "background":
            image = palette_lock(image.resize((768, round(768 * image.height / image.width)), Image.Resampling.NEAREST), 64)
            image.save(OUT / "qingyun-background.png")
            manifest["backgrounds"] = ["qingyun-background.png"] * 4
        else: export_actor(name, image, manifest)
        manifest["status"] = "ready" if manifest.get("hero") and manifest.get("enemies") and manifest.get("backgrounds") else "generating"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
        print(f"Saved {name} to assets/pixel", flush=True)


if __name__ == "__main__":
    main()
