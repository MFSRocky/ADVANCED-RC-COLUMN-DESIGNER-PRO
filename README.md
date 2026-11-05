# RC Column Designer Pro

Offline-first reinforced-concrete column design to **ACI 318-25** and **BS 8110-1:1997**.
The two code engines are implemented independently — stress blocks, material factors,
slenderness methods and detailing rules are never mixed.

> **Engineering notice.** This software is a design aid, not a code-compliance certificate.
> Unsupported provisions (seismic, torsion, prestress, anchorage/splice, certain sway cases)
> **block a PASS result** rather than being approximated. Every result must be checked by a
> competent engineer against the licensed code text.

## Features

- Rectangular, square and circular sections with arbitrary bar coordinates.
- Full strain-compatibility P–M and P–Mx–My analysis (displaced concrete deducted).
- ACI 318-25: φ factors + §21.2.2.3 cap, axial caps, nonsway/sway slenderness, ties/spirals.
- BS 8110-1:1997: 0.45fcu / 0.9x block, γm = 1.05 steel (Amendment No. 6), §3.8.4 axial caps,
  Table 3.19 braced effective heights, additional moments, §3.8.4.5 biaxial equivalent moment.
- Load-combination manager (ASCE 7 / ACI §5.3 and BS Table 2.1) plus direct factored loads.
- Genuine reinforcement optimization: enumerates practical layouts, verifies every candidate.
- SVG / PNG / DXF drawings, reinforcement schedules, batch CSV, IndexedDB projects, autosave.
- Local jsPDF calculation reports. Responsive light/dark UI, PWA offline support.
- Engineering regression suite shared by Node tests and the in-app Validation tab.

## Quick start

```bash
npm install          # installs jsPDF, Lucide icons, fonts, Playwright (dev)
npm run serve        # static server on http://0.0.0.0:8080
npm run build        # build static deployment artifact into dist/
npm run serve:dist   # serve the built dist/ artifact locally
npm test             # engineering regression tests
npm run validate     # benchmark report
npm run test:ui      # headless browser presentation/boot smoke test (server must be running)
```

Open `http://localhost:8080` (or the Arena live preview). All calculation, drawing, storage and
report features work offline after the first load; no internet-dependent APIs are used.

## Architecture

```
src/
  core/        units, validation, numerical solvers, section geometry
  codes/
    aci318-25/ materials, section-analysis, slenderness, detailing, design wrappers, optimization
    bs8110-1997/ materials, section-analysis, slenderness, detailing, design wrappers, optimization
  analysis/    capacity-check, design-column, interaction-diagrams, batch, optimization engine
  drawings/    cross-section, elevation, schedule, DXF
  reports/     PDF + CSV
  storage/     IndexedDB projects, JSON/CSV import-export, defaults/samples
  ui/          app shell, components, canvas charts, styles
  validation/  shared engineering benchmarks
tests/         node:test regression suite
docs/          engineering basis, user guide, installation
samples/       sample project + CSV
```

Internal units are **N, mm, MPa** throughout. Display conversions are validated.

## Documentation

- [Engineering basis & clause references](docs/engineering-basis.md)
- [User guide](docs/user-guide.md)
- [Installation & offline use](docs/installation.md)
- [Vercel deployment](docs/vercel.md)

## License

Application code: MIT (see `LICENSE`). Vendored libraries retain their own licenses
(jsPDF MIT, Lucide ISC, Inter OFL, IBM Plex OFL).
