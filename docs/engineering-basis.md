# Engineering Basis & Clause References

Internal units: **N, mm, MPa**. Compression positive. Moments about the section centroid:
`Mx = ΣF·y`, `My = ΣF·x`. The neutral-axis normal angle α is measured from +x; a load moment
direction maps to `α = atan2(Mx, My)`. Concrete displaced by compression reinforcement is
deducted in both engines.

## ACI 318-25

| Item | Provision | Implementation |
|---|---|---|
| Stress block | §22.2.2.4 | 0.85f'c over a = β1c; β1 = 0.85 − 0.05(fc−28)/7 ≥ 0.65 |
| φ factors | Table 21.2.2 | tied 0.65 / spiral 0.75 compression; 0.90 tension; transition εty…εty+0.003 |
| φ cap | §21.2.2.3 | interpolates between 0.90 at Pn = 0.1f'cAg and compression φ at balanced Pn |
| Axial cap | Table 22.4.2.1 | φ·0.80P0 (tied), φ·0.85P0 (spiral); P0 = 0.85fc(Ag−As)+fyAs |
| Min eccentricity | §6.6.4.5.4 | M2,min = Pu(15 + 0.03h) |
| Slenderness | §6.6.4 / §6.2.5 | short if klu/r ≤ 22 or braced ≤ min(40, 34−12M1/M2); >100 unsupported |
| EI | §6.6.4.4.4 | (0.2EcIg + EsIse)/(1+βdns), βdns default 0.6 |
| Magnification | §6.6.4 | δ = Cm/(1−Pu/0.75Pc) ≥ 1; Cm = max(0.4, 0.6+0.4M1/M2) |
| Sway | §6.6.4.3 | requires Q or ΣPu/ΣPc; δs > 1.5 unsupported; k default 1.2 with WARNING |
| ρ limits | §10.6.1.1 | 1%–8% |
| Ties | §25.7.2 | Ø ≥ 10 mm (≤32 mm bars) else 13 mm; s ≤ min(16db, 48dt, least dim); 150 mm support rule |
| Spirals | §25.7.3 | ρs ≥ 0.45(Ag/Ach−1)fc/fyt; clear pitch 25–75 mm |
| Shear | §22.5.5.1 / §10.6.2 | conservative Vc = (0.17√fc + Nu/6Ag)bw·d; φ = 0.75 |
| Ec | §19.2.2 | 4700√fc (normalweight) |

## BS 8110-1:1997 (incl. Amendment No. 6)

| Item | Provision | Implementation |
|---|---|---|
| Stress block | Fig. 3.3 / §3.8.4 | 0.45fcu over 0.9x, εcu = 0.0035 |
| Steel factor | Table 2.2 (Amd. 6) | γm = 1.05 → 0.95fy (NOT 0.87fy from Part 3:1985) |
| Concrete factor | Table 2.2 | γm = 1.50 |
| Steel grades | Table 3.1 | fy = 250 / 460 MPa only; others blocked |
| Axial caps | §3.8.4.3 / §3.8.4.4 | N = 0.4fcuAc+0.8fyAs and 0.35fcuAc+0.7fyAs; governing = min for braced |
| Pure axial | §3.8.4 | Nuz = 0.45fcuAc+0.95fyAs |
| Min eccentricity | §3.8.2.4 | emin = min(0.05h, 20 mm) |
| Classification | §3.8.1.3 | short if le/h < 15 braced, < 10 unbraced |
| Braced le | Table 3.19 | β matrix 0.75/0.80/0.90; 0.85/0.95; 1.00 for end conditions 1/2/3 |
| Unbraced le | Table 3.20 | not tabulated here; conservative k = 2.2 with WARNING unless lex/ley supplied |
| Additional moment | §3.8.3.1 | au = βa·K·h; βa = (le/h)²/2000; K = (Nuz−N)/(Nuz−Nbal) ≤ 1; Nbal = 0.25fcu·b·d |
| Braced design M | §3.8.3.2 / Fig. 3.20 | max(M2, Mi+Madd, M1+Madd/2, N·emin); Mi = 0.4M1+0.6M2 ≥ 0.4M2 |
| Unbraced design M | §3.8.3.7 | conservative full Madd at both ends |
| Biaxial | §3.8.4.5 / Table 3.22 | Mx' = Mx + β(h'/b')My (or My'); β interpolated; exact surface also checked |
| ρ limits | §3.12.5.3 | 0.4%–6% vertical (8% laps) |
| Links | §3.12.7.1 | Ø ≥ max(6, db/4); s ≤ min(12db,min, least dim) |
| Shear | Table 3.7/3.8 | vc = (0.79/1.25)(100As/bd)^⅓(400/d)^¼(fcu/25)^⅓; v ≤ min(0.8√fcu,5) |
| Ec | §2.5.3 (Part 2) | 20 + 0.2fcu kN/mm² |

## Scope gates (block PASS)

- Seismic design (ACI Ch.18 / BS seismic detailing).
- Nonzero torsion T.
- Prestress, anchorage and splice design.
- ACI klu/r > 100; sway without story data; δs > 1.5; Pu ≥ 0.75Pc.
- BS fy outside 250/460; slender clear height above §3.8.3 limit; slender tension.
- Any strain-compatibility root or biaxial-contour convergence failure.

## Verification

`src/validation/benchmarks.js` is the single source of truth for regression checks. It is run by
`npm test`, `npm run validate`, and the in-app **Validation** tab. Benchmarks include hand-calculated
axial caps, pure-bending equilibrium residuals < 1 N, section properties, unit conversions, solver
accuracy, slenderness tables, biaxial β, DXF integrity and optimization feasibility.

## Honest limitations

- BS unbraced Table 3.20 β values are not reproduced; a conservative upper bound is used and flagged.
- BS circular Nbal is undefined in the simplified method; K = 1 is used conservatively.
- Column shear uses conservative beam-type expressions; axial enhancement and seismic shear are not credited.
- Optimization is a verified discrete search over practical symmetric layouts, not a global continuous optimum.
- Results depend on input assumptions and must be checked against the licensed standards.
