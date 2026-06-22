## Why

Boundary atoms currently render as a single canonical site, which can make a unit cell look visually open or incomplete when atoms sit on faces, edges, or corners. This change adds a restrained periodic-boundary display mode and uses it as the first real setting in a right-side Settings drawer.

## What Changes

- Generate visual periodic images for atoms that sit on unit-cell boundaries while keeping the underlying structure atom count unchanged.
- Extend scene atom records with lightweight metadata that links each visual atom back to its canonical site and periodic image offset.
- Add a low-frequency Settings drawer on the right side of the workspace with a `Show boundary atom images` switch after a structure is loaded.
- Keep the left structure card focused on read-only structure facts and common file actions.
- Update preview safe-area layout so the right settings region is treated as stable UI space rather than simply covering the crystal.

## Capabilities

### New Capabilities

### Modified Capabilities

- `structure-preview`: add periodic-boundary atom display metadata and a right-side Settings drawer for low-frequency preview settings.

## Impact

- Python scene-building logic and tests for canonical sites, boundary-image generation, and non-periodic fallback behavior.
- Structure preview API response shape for atom metadata.
- Frontend scene types, atom filtering, Three.js preview layout, and settings drawer state.
- shadcn/ui component usage may expand to include suitable source components such as `Sheet` and `Switch`, while preserving the existing Vercel-inspired light UI.
