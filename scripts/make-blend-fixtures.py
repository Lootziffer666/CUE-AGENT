#!/usr/bin/env python3
"""Erzeugt kleine Blender-Fixtures für WP-Q1/WP-C7.

Ausführung:
  blender --background --python scripts/make-blend-fixtures.py -- test/fixtures/blender/blends
"""
from __future__ import annotations

import sys
from pathlib import Path


def main() -> None:
    try:
        import bpy  # type: ignore
    except Exception as exc:  # pragma: no cover - nur innerhalb Blender sinnvoll
        raise SystemExit(f"Dieses Skript muss mit Blender laufen: {exc}")

    out_dir = Path(sys.argv[-1]) if len(sys.argv) > 1 else Path("test/fixtures/blender/blends")
    out_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    bpy.ops.mesh.primitive_cube_add(size=1.5, location=(0, 0, 0))
    cube = bpy.context.object
    cube.name = "CUE_Fixture_Cube"
    cube.keyframe_insert(data_path="rotation_euler", frame=1)
    cube.rotation_euler[2] = 1.5708
    cube.keyframe_insert(data_path="rotation_euler", frame=24)
    bpy.ops.wm.save_as_mainfile(filepath=str(out_dir / "healthy-cube.blend"))


if __name__ == "__main__":
    main()
