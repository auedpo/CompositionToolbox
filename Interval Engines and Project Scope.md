# Project Instructions

## Overview
Interval Placement Lab is a browser-based applet for exploring vertical interval placement, quantization, and tension scoring across permutations of interval sets. The user supplies interval sizes (in steps), an EDO context, and placement parameters. The applet computes permutations, places interval anchors/centers, quantizes endpoints, derives pitches, and scores tension. Results are ranked and visualized.

## Scope and Goals
- Explore how interval orderings affect placement and tension across window sizes.
- Provide multiple placement engines (prefix and repulsion families).
- Keep placement math transparent via debug panels and anchor tables.
- Support real-time parameter tweaking, visualization, and MIDI preview.

## Coding Stack
- Frontend: Vanilla HTML/CSS/JS.
- Build: Vite (ES modules) in `interval-applet/src`.
- Bundled output: `interval-applet/app.js` (used when serving static `index.html`).
- Tests: Node-based test script for prefix dominance engine.

## Key Concepts
- Permutation: Ordered interval list (order matters for placement).
- L: Window height in steps (O * EDO steps).
- Rho: Orientation parameter used in endpoint placement and feasibility bounds.
- Anchors/Centers: Continuous positions used to place interval endpoints before quantization.
- Quantization: Rounds anchors and splits intervals to integer lattice endpoints.
- Tension: Scoring based on pitch-set relationships in EDO and register.

## Placement Engines
Engines are labeled by family-type in the UI.

1) prefix-slack (id: v2)
- Uses slack weights based on (L - d)^beta.
- Blends index spacing with prefix-weighted spacing using alpha.
- Bounds are derived from quantized split policy.
- Implemented in `src/placementEngines/prefixSlackEngine.js` and `anchorsForPerm` in `src/main.js`.

2) prefix-dominance (id: prefixDominance)
- Uses dominance weights based on d^beta.
- Uses global feasible band: Amin = max(rho * d_i), Amax = min(L - (1 - rho) * d_i).
- Anchors: a_i = Amin + u_i * (Amax - Amin), u_i = sum_{k<i} w_k / sum w_k.
- Implemented in `src/placementEngines/prefixDominanceEngine.js`.

3) repulsion-centers (id: repulse)
- Center-repulsion solver with projected bounds.
- Uses gamma/kappa/lambda/eta/iterations for repulsion dynamics.
- Implemented in `src/placementEngines/repulsionCentersEngine.js`.

## Placement Parameters (UI)
- anchorAlpha: prefix-slack blend (0..1). Prefix-dominance uses this as reserved.
- anchorBeta: exponent for slack/dominance weights (>=0).
- anchorRho: orientation parameter (0..1).
- repulseGamma, repulseKappa, repulseLambda, repulseEta, repulseIterations, repulseAlpha.

## UI Notes
- Placement mode selector shows: uniform-centers (legacy), prefix-slack, prefix-dominance, repulsion-centers.
- Selected permutation panel shows engine and metrics.
- "Intervals" line groups induced intervals by d mod 6 (then by value).
- Anchor debug table shows center bounds, endpoints, and prefix weights when applicable.
- Odd interval bias controls quantized split behavior (per column).

## Project Structure (Applet)
- `interval-applet/index.html`: main UI.
- `interval-applet/styles.css`: layout and styling.
- `interval-applet/src/main.js`: core logic, UI, rendering, scoring.
- `interval-applet/src/state.js`: defaults and state.
- `interval-applet/src/placementEngines/`: engine modules.
- `interval-applet/app.js`: bundled script for static usage.
- `interval-applet/tests/`: Node tests.

## Build and Run
- Dev: `npm --prefix interval-applet run dev`
- Build: `npm --prefix interval-applet run build`
- Preview: `npm --prefix interval-applet run preview`
- Tests: `node interval-applet/tests/prefixDominanceEngine.test.js`

## Design Standards
- Clear engine naming: family-type (e.g., prefix-slack).
- Keep placement engines modular and swappable.
- Maintain debug visibility for placement math.
- Avoid adding new semantic parameters unless needed.
- Preserve determinism for placement and scoring.

## Notes on Determinism
- Prefix engines are order-sensitive by design.
- Repulsion engine depends on solver parameters but is deterministic for given inputs.
- Feasibility check: if Amin > Amax, prefix-dominance returns null.

## TODO / Future Extensions
- Additional engine families or variants (if desired).
- Expanded tests for UI and scoring.
- Optional export or share of placement snapshots.
