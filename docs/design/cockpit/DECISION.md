# Cockpit design decision — 2026-10-18

Selected: **selected-two-row.png**, the deeply recessed graphite cockpit with a 2×3 toggle bank. The user explicitly corrected an initial assumption: the single-row bank is NOT the selected design.

Reserve: **reserve-single-row.png**. Keep this second concept for a later iteration; do not replace the selected design with it without a new request.

Required arrangement from the user's sketch: outward-angled left weapons/airframe console; central radar, with fuel/throttle/G above mission objectives to its right; outward-angled right 2×3 switch bank above Mission Control.

The cockpit must occupy no more than one third of the viewport; aim for the lower quarter. Keep at least two thirds of the world visible. Preserve the existing central HUD, targeting behavior, radar logic, aircraft-specific weapon lists, damage, landing information and controls. No canopy A-pillars initially.

The concept images are design references, not live readouts. Render all instrument data and interactive controls from simulation state.

On compact cockpit displays Mission Control shows the current instruction and the next action; on the narrowest displays only the current instruction. The H guide retains full instructions. This avoids clipping or scrolling in flight.

Latest user refinement: raise the deck modestly (up to 30% of the viewport) and replace the 2×3 metal toggles with red cylindrical pushbuttons. Key characters sit on the caps, function labels beside them. Actual active state depresses the cap, including keyboard-driven changes. Keep danger warnings independent of pressed state. The four lower HUD readouts move upward only as needed to stay above the raised frame.

Superseding refinement: remove the red cylindrical button visuals entirely. Keep text controls such as “G – FUTÓ” with green for normal/off, yellow for active, red for an unsafe configuration. Retain the raised deck height.

Approved refinement — 2026-10-22: selected-strike.png supersedes the earlier shell. The new layered graphite fighter/strike cockpit uses strike-frame.png with separately registered live screen wells and text controls. Preserve the central HUD and its original altitude readout; keep cockpit height at most 30% of the viewport.
