
> advanced-rc-column-designer-pro@1.0.0 validate
> node scripts/validate.js

PASS  ACI 318-25 axial cap (Table 22.4.2.1)
      φPn,max = 4189378.6 N; hand = 4189378.6 N
PASS  BS 8110-1:1997 axial caps (§3.8.4.3/4)
      Ncap = 3666385.4 N; hand = 3666385.4 N
PASS  ACI strain compatibility equilibrium
      Pure bending residual = -8.11e-8 N; φ = 0.9
PASS  ACI pure bending φ = 0.90
      φ = 0.9000
PASS  BS strain compatibility equilibrium
      Pure bending residual = -3.20e-5 N; M = 499.96 kN·m
PASS  Rectangular section properties
      Ag=240000, Ix=7.2000e+9
PASS  Circular section properties
      Ag=196349.5, Ix=3.0680e+9
PASS  Unit conversion kN→N
      1 kN = 1000 N
PASS  Unit conversion kN·m→N·mm
      1 kN·m = 1e6 N·mm
PASS  Brent root solver
      √2 ≈ 1.414213562373 in 20 iterations
PASS  Capacity utilization increases with moment
      u(100 kN·m)=0.239 < u(200 kN·m)=0.350
PASS  BS Table 3.19 braced β
      β11=0.75, β33=1
PASS  BS §3.8.4.5 biaxial β
      β=0.650 (Table 3.22 at N/(b·h·fcu)=0.3), M'=151.0 kN·m
PASS  DXF export integrity
      valid=true, circles=10, lines=11
PASS  ACI full design PASS
      status=PASS, u=0.597
PASS  Optimization feasible candidate
      evaluated=18, feasible=14, best As=2513

16/16 benchmarks passed
