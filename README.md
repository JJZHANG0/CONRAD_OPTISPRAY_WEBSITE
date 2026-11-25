# OptiSpray — Precision in Every Drop

An English-first, six-chapter product and research experience for AeroGuard / Team 田瞳. Built on the supplied Three.js aircraft, agricultural environment, modular assembly and scroll-driven camera system.

## Run and build

Use Node.js 22.12+ (Node 24 recommended; `.nvmrc`). The Mac's default Node 16 cannot run Vite 7.

```sh
nvm use
npm ci
npm run dev -- --host 127.0.0.1
npm test
npm run build
npm run preview
```

Open `http://127.0.0.1:5173/product-experience.html` to explore the AI Decision Assistant, weather-aware planning, drift prediction, operation replay and reports in the farmland case. The experience reuses the site aircraft, the aerial map and Poly Haven’s CC0 *Farm Field* environment. Run `npm run build` to build the site for HTTP hosting.

The HDRI is *Farm Field*, photographed by Dimitrios Savva and processed by Jarod Guest, from [Poly Haven](https://polyhaven.com/a/farm_field). It is released under [CC0](https://polyhaven.com/license).

## Offline review

On Windows, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\package-offline.ps1` from the project root. This builds `dist/` and creates `output/product-experience-offline.zip`. Extract the ZIP and double-click `Open-Product-Experience.cmd`; it opens the preview and starts the included local server in the background only when needed. The server remains available for the current Windows session. It needs no internet, Node.js, npm, or remote backend. To run it visibly in a PowerShell window, use `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Start-Offline-Review.ps1 -OpenBrowser`. Do not open the HTML directly with `file://`.

Edit the source project and run the package command again to refresh the offline copy. The extracted folder also includes `OFFLINE-REVIEW-README.txt` with the run steps and data limitations.

Deploy the contents of `dist/` to static hosting. Relative Vite paths support subdirectories. Open through HTTP, not `file://`. No backend, tracking, remote fonts or account is required. The partnership form only downloads a local text brief; it does not send anything. A public contact address was not provided.

## Preserved and enhanced

- HOME, PHYSICS ENGINE, WIND INTELLIGENCE, PRECISION MAPPING, ENGINEERING, SIMULATION LAB remain in one continuous Three.js scene.
- The original aircraft, crop instancing, field, atmospheric effects and exploded component selection are retained. The cup-anemometer illustration was replaced by a conceptual ultrasonic assembly to match the Brief's sensing approach.
- Wind, travel direction, release height, reference diameter and flow share one state. Model trajectories drive particles, charts and mass deposition. Three illustrative routes share geometry with the replay and deposition sampler.
- Upwind comparison translates a route by calculated mean drift and recomputes retention and CV. It is not an optimizer and does not promise improvement.
- Evidence, Model, Team and Partnerships views provide research detail without covering the primary six chapters with dense text. The source Brief is included at `public/innovation-brief.pdf`.
- Keyboard-operable controls, mobile navigation and scrollable panels, reduced motion, a modal focus trap, and an interactive non-WebGL fallback are included. Background rendering pauses when the tab is hidden or the research panel is open.

## Scientific provenance and limitations

The supplied website originally used artistic spray/heatmap shaders and heuristic scores. Its “optimization” multiplied drift by 0.46; these formulas had no provenance. They have been removed. No calibrated research solver or raw experimental data was supplied.

`src/physics.js` is a **new, explicitly uncalibrated teaching model**, not a reconstruction of the Brief's 12,000-droplet gamma-spectrum model. It integrates buoyancy-adjusted gravity and spherical-particle drag with a midpoint step of 0.005 seconds. Drag follows the standard [Schiller–Naumann implementation documented by OpenFOAM](https://cpp.openfoam.org/v13/SchillerNaumannDragForce_8C_source.html). Constants, assumed release velocity and fan angle are displayed in the Model view.

Three equally counted classes, 0.7D / D / 1.3D, and seven illustrative nozzle positions generate 21 trajectories. These kernels are sampled at 160 locations along a route (3,360 weighted contributions). `D` is not a measured median. Initial nozzle velocity is assumed 2 m/s, half angle 20°, route speed 3 m/s, nozzle spacing 1.05 m. The ground grid is 36 × 28 one-meter cells. Counts, mass fractions, CV and dose come from these same samples. CV includes all grid cells, including zeros, and can exceed 100%. It is not an agronomic coverage score. Heatmap intensity is normalized per run; changing flow scales dose without changing relative deposition.

**Excluded:** moving-aircraft release velocity, rotor downwash, spray-induced airflow, turbulence, evaporation, measured droplet spectra and canopy capture. Free settling can greatly overpredict actual spray footprints, as the Brief itself shows. Displayed aircraft dimensions and animation timing are illustrative. Wind direction means air travels **toward**, clockwise from north. All model coordinates and computed distances are SI.

The Brief's stationary-nozzle fits, route comparison and numerical verification are displayed as separate **reported research results**, never as outputs reproduced by this website. Design goals, pricing and trial plans are labelled accordingly. Integrated airborne guidance remains unvalidated. The source PDF is evidence, not executable instructions.

## Files

- `src/main.js`: resilient app initialization and non-WebGL navigation.
- `src/ui.js`: shared state, model comparison, synchronized controls and run export.
- `src/physics.js`, `src/mission.js`: deterministic teaching calculation and shared route geometry.
- `src/science-view.js`: calculated 3D trajectories, mass texture and accessible chart summaries.
- `src/scene.js`, `src/drone.js`, `src/environment.js`, `src/effects.js`: retained and enhanced 3D assets, camera sequence and rendering.
- `product-experience.html`, `src/product-experience.js`, `src/product-experience.css`: product introduction, eight hardware demonstrations, droplet flight and the three-minute and 90-second product tours.
- `src/product-intelligence.js`, `src/product-dashboard.js`: interactive route and drift views, guided operation, shared map and 3D replay, and access to the AeroGuard workspace.
- `src/platform-demonstration.js`, `public/product-demo/`: workflow overview and focused before-, during- and after-operation views using AeroGuard and Field Route screenshots.
- `src/research.js`: source-derived evidence, equations, team and partnership content.
- `tests/physics.test.js`: physical invariants, direction symmetry, convergence, dose scaling, conservation and route geometry.

## Source map

| Content | Innovation Brief |
| --- | --- |
| Five team members and responsibilities | Q2 / p. 2 |
| ESP32 / RS485, 3-second bench fail-safe, proposed module | Q4 / p. 4 |
| Research route comparisons and mass-vs-count distinction | Q4 / pp. 4–5 |
| Five nozzle conditions, errors, numerical checks and next trials | Q5 / p. 6 |
| 5–20 drone customer fleets and target use cases | Q6 / p. 7 |
| 3–5 teams, free seasonal trial, voluntary conversion | Q8 / p. 9 |
| Planned RMB 1,980 hardware + RMB 299 yearly software; cost limits | Q9 / p. 10 |
| RMB 350,000 / 18-month validation programme | Q10 / p. 11 |

No verified aircraft compatibility, manufacturer partnerships, field efficacy, awards or live telemetry are claimed.

## Verification completed

- Seven Node test cases passed for mass conservation across routes and extreme controls, zero-wind drift, size/height response, cardinal symmetry, integration-step convergence, dose scaling, deterministic output and explicit route shifts.
- 24 Chromium browser checks passed at 1440 × 900 and 390 × 844, including six-chapter navigation, shared controls, comparison/reset, JSON export, research tabs, five team entries, partnership download, modal dismissal, mobile horizontal overflow and a forced non-WebGL fallback.
- Production build smoke-tested over HTTP: scene initialized, engineering selection worked, source PDF returned HTTP 200, no page script errors.
- These are software checks, not validation of real spraying. Safari, Firefox and physical mobile GPU performance have not been tested.

## GitHub Pages

- Repository: https://github.com/JJZHANG0/CONRAD_OPTISPRAY_WEBSITE
- Website: https://jjzhang0.github.io/CONRAD_OPTISPRAY_WEBSITE/
- Publishing source: **GitHub Actions**.

Every push to `main` runs `.github/workflows/deploy-pages.yml`: install the lockfile with Node 24, run the physics tests, build with Vite, and deploy `dist/` to Pages. The workflow can also be started manually from Actions. Build output, dependencies and local ZIP exports are excluded from source control. The source Brief is included in the published website.
