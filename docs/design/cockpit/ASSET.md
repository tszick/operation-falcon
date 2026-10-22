# Cockpit frame asset

`assets/cockpit/two-row-frame.png` is a generated, alpha-background, empty graphite cockpit shell based on `selected-two-row.png`. Generated with the built-in image generation tool on 2026-10-18; no external stock assets.

Generation prompt: Production game asset extraction/redesign from the approved cockpit concept. Keep only the shallow foreground graphite fighter-cockpit shell, full width, preserving physical depth, metallic materials, fasteners, thick recessed bezels, outward-angled side consoles and central face. Genuine alpha transparency outside the shell. No landscape, HUD, text, numbers, diagrams, needles, radar symbols, controls or lit indicators. All screen wells empty nearly black glass. Left cheek: weapons/airframe well. Central face: large radar well on the left; two stacked fuel and mission wells on the right. Right cheek: empty 2×3 switch-mounting plate above Mission Control well. No A-pillars. No baked-in UI. Maintain a full widescreen canvas. The game crops the alpha padding and scales the foreground to its viewport height budget.

All readouts, damage, goals, radar and switch states are rendered live by the simulation; the image supplies only the physical frame. Screen coordinates are registered in `src/cockpitGeometry.js`; `src/cockpit.js` projects the real DOM controls into these quadrilaterals. The radar keeps equal map scale on both axes and is resized to its live screen.

## Active strike cockpit — 2026-10-22

Active asset: `assets/cockpit/strike-frame.png` (1672 × 941 RGBA). The previous asset remains available as a design archive. The accepted reference is `selected-strike.png`. Generated with the built-in image_gen tool; screen data, symbols and controls remain live in the game.

Final generation prompt: Production game asset, precise cockpit frame extraction from approved reference. Preserve realistic graphite fighter-bomber cockpit geometry, layered coaming, machined metal, subtly worn edges, recessed bezels, bolts, rails and angled side consoles. Wide 1672×941 canvas; central silhouette begins at approximately y475. Retain left weapons well, central radar, stacked engine and mission wells to its right, upper right text-control panel and lower instruction well. Remove landscape, sky, HUD, text, digits, radar symbols and all lit UI. Uniform near-black empty screen interiors, one flat empty control panel. Alpha transparency above cockpit silhouette, opaque metal and screen wells inside it. No pilot, hands, switches or control stick.
