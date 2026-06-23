## MODIFIED Requirements

### Requirement: Browser preview renders atoms and unit cell

The frontend SHALL render the returned scene as a full-workspace Three.js preview with atoms and the unit cell. The preview SHALL initialize loaded scenes with a reproducible Standard c-up three-quarter orthographic view, SHALL allow bounded interactive rotation and zoom, and SHALL allow the right-side Settings drawer to control whether periodic boundary image atom instances are visible and which rotation interaction mode is active.

#### Scenario: Render a successful scene

- **WHEN** the frontend receives a successful structure scene response
- **THEN** the full workspace canvas renders visible atom geometry
- **AND** it renders the unit-cell frame for the supplied cell
- **AND** it frames the scene with the Standard c-up three-quarter view

#### Scenario: Keep display controls in the right drawer

- **WHEN** the structure preview is displayed
- **THEN** settings are available from the right-side Settings drawer
- **AND** the left structure card remains focused on file status and compact structure facts

### Requirement: Preview provides a right-side settings drawer

The frontend SHALL provide a right-side Settings drawer for low-frequency preview settings after a structure scene is loaded. The drawer SHALL expand from and retract into a compact right-side settings trigger, SHALL attach to the right edge and span the full viewport height with an internally scrollable content area, SHALL remain visually consistent with the existing light UI, and SHALL expose a `Show boundary atom images` switch plus an advanced interaction-mode control for Trackball or Orbit rotation.

#### Scenario: Open settings drawer

- **GIVEN** a structure scene has loaded successfully
- **WHEN** the user opens the right-side settings trigger
- **THEN** the Settings drawer appears on the right side of the workspace
- **AND** the drawer includes an accessible title
- **AND** the drawer includes the `Show boundary atom images` switch
- **AND** the drawer includes an interaction-mode control with Trackball and Orbit options
- **AND** the drawer uses a simple restrained opening motion

#### Scenario: Retract settings drawer

- **WHEN** the user activates the drawer's retract control
- **THEN** the Settings drawer retracts toward the right-side trigger
- **AND** the retracting motion is visually consistent with the opening motion
- **AND** the retract control is aligned with the compact settings trigger

#### Scenario: Keep future settings absent until implemented

- **WHEN** the Settings drawer is shown for this change
- **THEN** it does not show disabled placeholder controls for bonded outside atoms, supercells, colors, lighting, crystallographic direction input, or export settings

## ADDED Requirements

### Requirement: Preview supports interactive rotation modes

The frontend SHALL allow the user to rotate a loaded structure preview with mouse drag gestures. Trackball rotation SHALL be the default interaction mode. Orbit rotation SHALL be available as a low-frequency setting in the right Settings drawer. Both interaction modes SHALL keep panning disabled.

#### Scenario: Trackball is the default rotation mode

- **WHEN** a structure scene loads successfully
- **THEN** the preview uses Trackball rotation as the active interaction mode

#### Scenario: Switch to Orbit rotation

- **WHEN** the user selects Orbit in the Settings drawer interaction-mode control
- **THEN** subsequent canvas drag gestures use Orbit rotation behavior
- **AND** the current zoom percentage remains unchanged

#### Scenario: Switch back to Trackball rotation

- **WHEN** the user selects Trackball in the Settings drawer interaction-mode control
- **THEN** subsequent canvas drag gestures use Trackball rotation behavior
- **AND** the current zoom percentage remains unchanged

#### Scenario: Pan remains disabled

- **WHEN** the user performs a pan-style mouse gesture in either interaction mode
- **THEN** the preview target remains centered for the loaded scene
- **AND** the structure is not translated through pan interaction

### Requirement: Preview zoom is bounded and synchronized

The frontend SHALL express preview zoom as a percentage of the fitted loaded-scene view. The zoom percentage SHALL be clamped from 20% to 500%. Wheel zoom, the vertical zoom slider, and the editable percentage input SHALL stay synchronized to the same zoom value. The zoom slider SHALL use logarithmic mapping so 100% lies at the midpoint between 20% and 500%.

#### Scenario: Show fitted zoom as 100 percent

- **WHEN** a structure scene loads successfully
- **THEN** the zoom control shows 100%
- **AND** the camera uses the fitted scene view

#### Scenario: Wheel zoom clamps to bounds

- **WHEN** the user zooms with the mouse wheel beyond the supported range
- **THEN** the zoom value remains no lower than 20%
- **AND** the zoom value remains no higher than 500%

#### Scenario: Slider and input stay synchronized

- **WHEN** the user changes the vertical zoom slider
- **THEN** the percentage input updates to the same zoom value
- **AND** the rendered preview uses that zoom value

#### Scenario: Input and slider stay synchronized

- **WHEN** the user enters a valid zoom percentage
- **THEN** the vertical zoom slider updates to the same zoom value
- **AND** the rendered preview uses that zoom value

#### Scenario: Percentage input clamps on commit

- **WHEN** the user commits a zoom percentage below 20% or above 500%
- **THEN** the zoom control clamps the value into the supported 20% to 500% range
- **AND** the rendered preview uses the clamped zoom value

### Requirement: Preview exposes a compact view-control rail

The frontend SHALL show a compact vertical view-control rail after a valid structure scene is loaded. The rail SHALL sit near the left structure card, SHALL provide reset, interaction lock, and zoom controls, and SHALL remain visually separate from the right Settings drawer. The rail SHALL NOT appear when no valid scene is loaded.

#### Scenario: Show rail after scene load

- **WHEN** a structure scene loads successfully
- **THEN** the preview shows a compact vertical rail near the left structure card
- **AND** the rail includes reset, lock, vertical zoom slider, and zoom percentage input controls

#### Scenario: Hide rail without a valid scene

- **WHEN** no structure is loaded or the current upload failed to parse
- **THEN** the preview does not show the view-control rail

#### Scenario: Rail participates in preview layout

- **WHEN** a loaded scene is framed for preview
- **THEN** the primary structure view avoids the left structure card and the view-control rail

### Requirement: Preview can lock and reset view interaction

The frontend SHALL provide a canvas interaction lock and a reset control for loaded structure previews. Locking SHALL disable mouse gesture changes to the canvas, including drag rotation and wheel zoom, while leaving explicit rail and settings controls available. Reset SHALL restore Standard orientation, 100% zoom, and centered framing.

#### Scenario: Lock disables canvas gestures

- **WHEN** the user enables the interaction lock
- **THEN** mouse drag gestures do not rotate the preview
- **AND** mouse wheel gestures do not change the zoom percentage

#### Scenario: Explicit controls remain available while locked

- **WHEN** the interaction lock is enabled
- **THEN** the user can still use the reset control
- **AND** the user can still change zoom through the rail controls
- **AND** the user can still change interaction mode in the Settings drawer

#### Scenario: Reset restores Standard view

- **WHEN** the user activates the reset control after rotating or zooming the preview
- **THEN** the preview returns to the Standard c-up three-quarter orientation
- **AND** the zoom value returns to 100%
- **AND** the preview target returns to centered framing
