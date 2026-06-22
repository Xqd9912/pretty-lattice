## 1. Backend Scene Contract

- [x] 1.1 Extend scene atom records with canonical site ID, fractional position, periodic image offset, and periodic-image marker.
- [x] 1.2 Implement fractional-coordinate canonicalization and boundary image generation for periodic 3D structures.
- [x] 1.3 Add backend tests for canonical atoms, face/edge/corner boundary images, near-boundary tolerance, non-periodic fallback, and unchanged summary atom counts.

## 2. Frontend Settings Panel

- [x] 2.1 Update frontend scene types and rendering logic so `Show boundary atom images` can hide or show periodic image instances locally.
- [x] 2.2 Add the compact right-side Settings trigger and full-height drawer using suitable shadcn components, including a switch for `Show boundary atom images`.
- [x] 2.3 Keep the left-side structure UI focused on file status, structure facts, and common actions while settings live in the right drawer.

## 3. Layout And Verification

- [x] 3.1 Extend preview safe-area handling so the stable right settings region participates in the framed preview workspace.
- [x] 3.2 Add or update frontend tests for boundary atom filtering, legend behavior, and settings-panel layout state.
- [x] 3.3 Run backend tests, frontend tests, and browser visual QA for panel open/closed states.
