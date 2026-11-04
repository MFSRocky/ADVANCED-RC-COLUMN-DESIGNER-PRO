# User Guide

## Workflow

1. **Projects** — create, open, duplicate, import/export JSON, or load the sample project.
2. **Column** — set shape, dimensions, cover, exposure, materials, bar layout and transverse reinforcement.
   The cross-section preview updates after you run Design.
3. **Loads** — enter factored loads directly (Pu kN, M kN·m, V kN) or fill service loads D/L/W/E and
   click *Generate from service loads*. Combination factors are code-specific and editable.
4. **Analysis** — click **Design**. Review the overall status, utilization, checks, slenderness steps,
   uniaxial interaction curve and biaxial contour. FAIL/WARNING items include clause references.
5. **Optimize** — choose an objective (steel area, cost, congestion, balanced), run the search, and apply
   a feasible alternative. Every candidate is verified by the full engine before ranking.
6. **Drawings** — export cross-section/elevation SVG, cross-section PNG, DXF and the reinforcement schedule CSV.
7. **Batch** — add or import columns via CSV, design all, and export the project summary CSV.
8. **Report** — generate the local PDF calculation report or a checks CSV.
9. **Validation** — run the engineering benchmark suite in the browser.
10. **Settings** — theme, default code, restore backup, clear local data.

## Units

Internal units are N, mm, MPa. The UI accepts kN and kN·m for loads and converts them internally.
Material strengths are entered in MPa. Dimensions and cover are in mm.

## Status meanings

- **PASS** — all implemented checks satisfy the selected code for the entered loads.
- **WARNING** — a conservative assumption or advisory condition (e.g. assumed unbraced effective height).
- **FAIL** — a capacity/detailing check is violated, or an unsupported provision blocks certification.

## Offline use

After the first load, the service worker caches the app shell, engines, drawings, reports and assets.
Projects are stored in IndexedDB; preferences and a recovery backup use LocalStorage. No calculation,
drawing or report feature calls the network.

## Mobile

The sidebar collapses to a menu button. Layouts use safe-area insets and avoid horizontal overflow.
Charts resize with the viewport.

## Troubleshooting presentation

- If the page looks unstyled or blank, hard-refresh (Ctrl/Cmd+Shift+R). The app ships critical inline
  CSS and a boot watchdog so the shell remains usable even if the external stylesheet or storage is delayed.
- If IndexedDB is blocked by the browser, the app boots in **Local backup mode** and shows a badge;
  projects are kept in LocalStorage/memory instead of failing silently.
- The service worker uses a versioned cache and network-first navigation so deployed fixes are not hidden
  by an old cached shell.
