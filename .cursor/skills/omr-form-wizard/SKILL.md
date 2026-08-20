---
name: omr-form-wizard
description: >-
  Implements the operator form-registration wizard (question regions, circle
  detection, TemplatePayload rules) without AI. Use only when the user asks to
  build or change the form wizard, detect_circles, TemplateEditor wizard steps,
  blank-form circle grouping, or files under components/form-wizard,
  lib/form-wizard, docs/form-wizard. Do not use for scan scoring, exception
  review, dashboard reset, default 신사2동 coordinates, or unrelated UI.
---

# Form registration wizard

Before any code: read `docs/form-wizard/architecture.md` and `docs/form-wizard/TASKS.md`.

## Contract

- Scoring stays `POST /api/omr` with stored circle ROIs. Never re-detect circles on filled scans.
- Wizard output must match existing `TemplatePayload`. Scoring reads circles + min/max, not the drawn region.
- Keep the 신사2동 default template as a seed.
- Do not `git push` or publish to GitHub unless the user explicitly asks.
- File owners: `docs/form-wizard/TASKS.md`. Do not edit another agent's files.

## Build

1. Same Python function as scoring. Add `action: "detect_circles"`. No second Vercel function.
2. Detect: blank-form image + relative region → relative circles `{x,y,w,h,score}`.
3. Four steps: blank form → four corners → one question box (title, min, max) → review + threshold + save.
4. Detect miss: keep the box; manual add/move/delete circles.
5. Scan path calls score only.

## UI split (later chrome)

- Konva = survey image, region boxes, circles (`WizardCanvas`).
- Shell = steps, panels, buttons (`FormWizard`). When the user pastes a 21st.dev (or similar) prompt and URL, restyle **only the shell**. Do not restyle by swapping Konva for tldraw/Fabric.

## Do not add

Document AI, LLM vision, Remark/SDAPS, opencv.js, tldraw, Fabric, title OCR, ArUco/QR (v1), extra mark types.
