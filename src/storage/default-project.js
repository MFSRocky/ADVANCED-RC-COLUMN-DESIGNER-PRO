export function createDefaultProject() {
  return {
    id: crypto.randomUUID(),
    schemaVersion: 1,
    name: 'New Project',
    client: '', projectNumber: '', engineer: '',
    code: 'ACI318-25',
    units: { length: 'mm', force: 'kN', moment: 'kN·m', stress: 'MPa', area: 'mm²' },
    settings: { exposure: 'interior', aggregateSize: 20, theme: 'system' },
    columns: [createColumn('C1', 'ACI318-25')],
    combinations: defaultCombinations('ACI318-25'),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function createColumn(mark = 'C1', code = 'ACI318-25', overrides = {}) {
  const isBS = code.startsWith('BS');
  return {
    id: crypto.randomUUID(), mark, floor: 'Ground', grid: 'A/1', zone: '',
    input: {
      code,
      geometry: { shape: 'rect', b: 400, h: 600 },
      cover: isBS ? 30 : 40,
      concrete: isBS ? { fcu: 30 } : { fc: 30 },
      steel: { fy: isBS ? 460 : 420 },
      tieSteel: { fy: isBS ? 460 : 420 },
      arrangement: { barDb: 25, nx: 3, ny: 4 },
      transverse: { type: 'ties', db: isBS ? 8 : 10, spacing: 150 },
      height: { clear: 3500, braced: true, kx: 1, ky: 1, endTopX: '1', endBottomX: '1', endTopY: '1', endBottomY: '1' },
      loads: [{ id: 'ULS1', name: '1.2D + 1.6L', Pu: 2500e3, Mx: 150e6, My: 80e6, M1x: 75e6, M2x: 150e6, M1y: 40e6, M2y: 80e6, Vx: 40e3, Vy: 25e3, betaDns: 0.5 }],
      exposure: isBS ? 'moderate' : 'interior',
      aggregateSize: 20,
      ...overrides,
    },
  };
}

export function defaultCombinations(code) {
  if (code.startsWith('BS')) {
    return [
      { id: 'BS1', name: '1.4D + 1.6L', factors: { D: 1.4, L: 1.6, W: 0, E: 0 }, clause: 'Table 2.1' },
      { id: 'BS2', name: '1.4D + 1.4W', factors: { D: 1.4, L: 0, W: 1.4, E: 0 }, clause: 'Table 2.1' },
      { id: 'BS3', name: '1.2D + 1.2L + 1.2W', factors: { D: 1.2, L: 1.2, W: 1.2, E: 0 }, clause: 'Table 2.1' },
      { id: 'BS4', name: '1.0D + 1.4W (uplift)', factors: { D: 1.0, L: 0, W: 1.4, E: 0 }, clause: 'Table 2.1' },
    ];
  }
  return [
    { id: 'ACI1', name: '1.4D', factors: { D: 1.4, L: 0, W: 0, E: 0 }, clause: 'ASCE 7 §2.3.1 (ACI §5.3)' },
    { id: 'ACI2', name: '1.2D + 1.6L', factors: { D: 1.2, L: 1.6, W: 0, E: 0 }, clause: 'ASCE 7 §2.3.1 (ACI §5.3)' },
    { id: 'ACI3', name: '1.2D + 1.0W + 1.0L', factors: { D: 1.2, L: 1.0, W: 1.0, E: 0 }, clause: 'ASCE 7 §2.3.1 (ACI §5.3)' },
    { id: 'ACI4', name: '0.9D + 1.0W', factors: { D: 0.9, L: 0, W: 1.0, E: 0 }, clause: 'ASCE 7 §2.3.1 (ACI §5.3)' },
    { id: 'ACI5', name: '1.2D + 1.0E + 1.0L', factors: { D: 1.2, L: 1.0, W: 0, E: 1.0 }, clause: 'ASCE 7 §2.3.1 (ACI §5.3)' },
  ];
}

export function sampleProject() {
  const p = createDefaultProject();
  p.name = 'Sample Office Building — RC Columns';
  p.client = 'Sample Client'; p.projectNumber = 'RC-2026-001'; p.engineer = 'Design Engineer';
  p.columns = [
    createColumn('C1', 'ACI318-25'),
    createColumn('C2', 'ACI318-25', { geometry: { shape: 'rect', b: 350, h: 350 }, arrangement: { barDb: 20, nx: 3, ny: 3 }, loads: [{ name: 'ULS', Pu: 1400e3, Mx: 60e6, My: 60e6, M1x: 30e6, M2x: 60e6, M1y: 30e6, M2y: 60e6, Vx: 20e3, Vy: 20e3 }] }),
    createColumn('C3', 'BS8110-1997', { concrete: { fcu: 35 }, steel: { fy: 460 }, tieSteel: { fy: 460 }, cover: 30, geometry: { shape: 'rect', b: 400, h: 500 }, arrangement: { barDb: 25, nx: 3, ny: 3 }, exposure: 'moderate', loads: [{ name: '1.4D+1.6L', Pu: 2200e3, Mx: 120e6, My: 70e6, M1x: 60e6, M2x: 120e6, M1y: 35e6, M2y: 70e6, Vx: 35e3, Vy: 25e3 }] }),
    createColumn('C4', 'ACI318-25', { geometry: { shape: 'circle', D: 500 }, arrangement: { barDb: 20, n: 8 }, transverse: { type: 'spiral', db: 10, spacing: 50 }, loads: [{ name: 'ULS', Pu: 1800e3, Mx: 90e6, My: 40e6, M1x: 45e6, M2x: 90e6, M1y: 20e6, M2y: 40e6 }] }),
  ];
  return p;
}
