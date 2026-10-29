# WORKLOG — 3D upgrade (branch `3d-upgrade`)

On restart: read this file and TODO.md, `git switch 3d-upgrade`, continue from "In progress".
Rules: the live channel posts from `main` untouched; merge only after a full GitHub end-to-end test
passes and the 3D version is clearly better. Free tools only; ≤100 Higgsfield credits on experiments.

## Status
- Live channel: OK. Launch Oct 26 (009, 019, 002 scheduled via Buffer at 7/8/9 PM), nightly ran
  Oct 27 and Oct 28 ("Delivered Shorts" commits on main).

## Done
- 2026-10-29: branch `3d-upgrade` created from main 0154f54.

## In progress
- Phase 1: choosing a CPU 3D renderer.

## Decisions
- Candidate renderers: (1) moderngl + Mesa llvmpipe via EGL — renders straight into numpy, so it
  composites with the existing Pillow pipeline (captions, images, CTA) without a second tool;
  (2) Blender headless Cycles CPU; (3) three.js in headless Chromium (SwiftShader). Benchmarked on
  GitHub's 2-core runner via `.github/workflows/bench3d.yml`.

## Needs Sam
- (none yet)
