# Citizen dashboard UI critique and improvement plan

Reviewed on 20 November 2026 using the supplied dark-theme screenshot, the citizen dashboard source, and Modern Web Guidance. The screenshot captures one desktop viewport. Mobile behavior, interaction flows, contrast ratios, and assistive technology behavior still need live verification.

## What works

- The map and nearby center list share the screen, supporting comparison between locations and center details.
- Emergency and road-hazard reporting are prominent, distinct actions. The map key explains marker colors in text.
- Center cards include distance, address, and reported capacity. The implementation already includes loading, offline, empty, and unverified states.
- Layer buttons expose pressed or expanded state, and the stylesheet includes reduced-motion handling and a mobile bottom-sheet layout.

## P0 — Restore access to essential controls

### Prevent the header from covering the shelter panel

**Finding.** In the screenshot, the header overlaps the search field and the panel toggle. The location control is also partly covered. The header wraps its connection badge onto a second row, increasing the obstruction at the captured size. This makes the first steps in finding a center difficult to discover and operate.

**Implementation.** Reserve space for the actual header height in the shelter panel and map-control layout. Keep the primary actions and connection status compact as available space changes, and allow deliberate reflow or a secondary menu before controls overlap. Keep emergency reporting readily available. Account for text enlargement and translated labels.

**Acceptance.** At the captured viewport, 320 CSS pixels wide, and 200% zoom, search, panel toggle, primary actions, and location control remain visible, reachable, and unobscured. Keyboard focus is never hidden behind the header.

### Make evacuation center selection keyboard-operable

**Finding.** `CitizenDashboard.jsx` renders each center as a focusable `div` with `role="button"` and an `onClick` handler, but the card has no keyboard activation handler. Keyboard users can focus a center without opening it using Enter or Space.

**Implementation.** Render each selectable center with a native button inside a semantic list. Preserve the existing card appearance, expose a visible focus indicator, and ensure the selected center and its details are understandable when focus moves.

**Acceptance.** Tab reaches every center, Enter and Space open its details, and a screen reader announces its name and actionable role. Returning from details restores focus to the selected card.

## P1 — Improve decision-making and accessibility

### Clarify availability and data freshness

**Finding.** The list emphasizes green capacity figures and a progress bar, but the bar has no visible label explaining whether it represents occupancy or available space. The code uses `occPct` for the fill while the adjacent text reports available spaces. The screenshot also shows “Live Telemetry” without explaining which information is current. Cached-data messaging already exists in the list.

**Implementation.** Label the bar as occupancy and provide a textual occupied/total value when reliable data exists. Show availability and verification as explicit text, with a last-updated time and source when supplied by the data. Keep unknown, stale, full, and closed states distinct. Explain connection and freshness separately and retain the existing cached-data notice.

**Acceptance.** A citizen can distinguish occupied capacity from spaces reported available, identify stale or unknown information, and understand status without relying on color. Missing timestamps or capacity values have honest fallback text.

### Make search, sorting, and map controls understandable to everyone

**Finding.** The search input in `CitizenDashboard.jsx` relies on a placeholder for its label, and its icon-only clear button has no explicit accessible name. The nearest and most-space buttons change appearance but do not expose their selected state. The map canvas has the generic accessible name “Map.”

**Implementation.** Add a persistent label for center search and an accessible name for clearing it. Represent sorting as a named single-choice control, or expose the active state on the existing buttons. Give the map a descriptive name and concise instructions, and ensure center selection and key information remain available through the list. Audit all icon-only map controls for accessible names and visible focus.

**Acceptance.** Search and clear are announced by name, the active sort is announced, and a keyboard or screen-reader user can find and select a center without interpreting map colors. Verify actual map keyboard behavior in the browser.

### Improve readability and visual hierarchy

**Finding.** In the screenshot, addresses, distances, section headings, and some green capacity text appear muted against the dark surfaces. The interface uses several similar dark panels, borders, and colored pills that compete for attention. Actual contrast has not been measured.

**Implementation.** Measure text, icons, borders, and focus indicators in both themes. Adjust tokens to meet at least 4.5:1 for normal text and 3:1 for large text and relevant UI boundaries. Elevate center name, availability, and distance in the visual hierarchy. Keep secondary information readable and use text or shapes alongside status colors.

**Acceptance.** Contrast is measured on rendered backgrounds in both themes, including hover, focus, disabled, and selected states. Names, addresses, availability, and distance remain legible at 200% zoom.

### Reduce map obstruction and resolve visual conflicts

**Finding.** The right side stacks location, voice, hazard layers, and a large legend. The legend overlaps the map attribution area in the supplied screenshot. The selected dark map uses a CSS color-inversion filter, and the stylesheet contains competing filter declarations. Readability and hazard colors need verification against the actual map and overlays.

**Implementation.** Group secondary layer controls in a clearly named disclosure while keeping location and critical hazard visibility easy to find. Reserve a clear attribution area and position the legend so it does not cover controls or legal attribution. Evaluate a map style designed for dark mode and consolidate the effective filter rules if a filter remains. Preserve recognizable hazard and marker colors.

**Acceptance.** Attribution is fully visible and operable, controls and legend do not overlap at supported viewport sizes, and map labels, routes, and hazard overlays remain distinguishable in both themes. Test with real map data and color-vision simulation.

## P2 — Refine responsive and interaction details

### Validate the mobile bottom sheet

**Finding.** The code provides a draggable bottom sheet and uses dynamic viewport sizing in places. Its behavior cannot be assessed from the supplied desktop screenshot. A drag handle alone may be difficult for some users to operate.

**Implementation.** Provide clearly labeled expand and collapse controls alongside dragging. Respect safe-area insets, dynamic browser chrome, and the on-screen keyboard. Keep search, center results, map controls, and reporting actions accessible as the sheet changes height.

**Acceptance.** Test at 320px and common phone sizes in portrait and landscape. Touch targets should aim for at least 44 × 44 CSS pixels, with no overlapping hit areas. The sheet works with keyboard and touch, and focus stays visible when the keyboard opens.

### Make state changes and errors actionable

**Finding.** The source already renders loading, error, cached, and empty list states. Their behavior and presentation during live updates could not be verified from the screenshot.

**Implementation.** Review location permission denied, disconnected, loading, no search results, route failure, and reporting outcomes. Provide a clear next action where available, such as retrying or changing a search. Announce meaningful asynchronous changes politely, reserving urgent announcements for urgent failures.

**Acceptance.** Each state explains what happened and any available next step. Screen-reader announcements occur once without interrupting ongoing input unnecessarily.

## Verification checklist

- Reproduce the screenshot viewport, test light and dark themes, and capture before-and-after screenshots.
- Exercise center search, sorting, selection, directions, reporting, layers, and profile controls with pointer, touch, and keyboard.
- Test 320px through desktop widths, landscape, 200% zoom, text enlargement, reduced motion, and mobile safe areas.
- Run an automated accessibility audit and manually test keyboard focus, screen-reader announcements, and contrast over the rendered map.
- Confirm location denial, no data, offline cached data, and stale capacity using representative responses. Validate status and freshness wording with the data owners.

## Implementation references

- Dashboard layout, controls, and shelter results are in `dashboard-web/src/views/CitizenDashboard.jsx`.
- Responsive layout, map layers, legend, and theme rules are in `dashboard-web/src/styles/citizen-console.css`.
- Modern Web Guidance guides consulted are `accessibility`, `form-factor-adaptation`, and `content-first-noise-reduction`. The project-local skill is in `.agents/skills/modern-web-guidance/SKILL.md`.
