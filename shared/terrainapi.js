import { ENUMS } from './classes.js';
import { terrainOf, autowedge, VOXEL, SMOOTH_MATERIALS, SMOOTH_COLORS, CELL_WATER, cellCenter, worldToCell } from './terrain.js';

const MAT_NAME = Object.fromEntries(Object.entries(ENUMS.Material).map(([k, v]) => [v, k]));
const MAX_VOXELS = 4 * 1024 * 1024;

export function smoothMaterial(v) {
  const name = typeof v === 'string' ? v : MAT_NAME[v];
  if (name === 'Air') return 0;
  const i = SMOOTH_MATERIALS.indexOf(name);
  return i > 0 ? i : 2;
}

export function materialEnum(i) {
  return ENUMS.Material[SMOOTH_MATERIALS[i] || 'Air'];
}

function regionCells(r, res = VOXEL) {
  if (!Array.isArray(r) || r.length < 6) throw new Error('Region3 expected');
  if (Math.abs(res - VOXEL) > 1e-6) throw new Error('Resolution must be 4');
  const lo = [0, 1, 2].map((k) => Math.round(Math.min(r[k], r[k + 3]) / VOXEL));
  const hi = [0, 1, 2].map((k) => Math.round(Math.max(r[k], r[k + 3]) / VOXEL));
  const n = (hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]);
  if (n > MAX_VOXELS) throw new Error('Region is too large');
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] };
}

function int3(a) {
  return [Math.floor(+a[0] || 0), Math.floor(+a[1] || 0), Math.floor(+a[2] || 0)];
}

export function installTerrain(def, host, { T, multi }) {
  const dm = host.dm;
  const data = (t) => terrainOf(t, dm.era === 2018 ? 2018 : 2012);
  const cellMat = (v) => {
    const n = typeof v === 'string' ? ENUMS.CellMaterial[v] : +v;
    return Number.isFinite(n) ? Math.max(0, Math.min(17, n | 0)) : 0;
  };
  def('SetCell', 'Terrain', (t, [x, y, z, mat, block, orient]) => {
    data(t).set(Math.floor(x), Math.floor(y), Math.floor(z), cellMat(mat), 255, (+block || 0) | 0, (+orient || 0) | 0);
    return null;
  });
  def('GetCell', 'Terrain', (t, [x, y, z]) => {
    const [m, , b, o] = data(t).cell(Math.floor(x), Math.floor(y), Math.floor(z));
    return multi(T.e('CellMaterial', dm.era === 2018 ? (m ? 1 : 0) : m), T.e('CellBlock', b), T.e('CellOrientation', o));
  });
  def('SetCells', 'Terrain', (t, [r, mat, block, orient]) => {
    const d = data(t);
    const lo = int3(r.slice(0, 3)), hi = int3(r.slice(3, 6));
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > MAX_VOXELS) throw new Error('Region is too large');
    const m = cellMat(mat);
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) d.set(x, y, z, m, 255, (+block || 0) | 0, (+orient || 0) | 0);
    return null;
  });
  def('GetWaterCell', 'Terrain', (t, [x, y, z]) => {
    const [m, , b, o] = data(t).cell(Math.floor(x), Math.floor(y), Math.floor(z));
    return multi(m === CELL_WATER, T.e('WaterForce', m === CELL_WATER ? b : 0), T.e('WaterDirection', m === CELL_WATER ? o : 0));
  });
  def('SetWaterCell', 'Terrain', (t, [x, y, z, force, dir]) => {
    data(t).set(Math.floor(x), Math.floor(y), Math.floor(z), CELL_WATER, 255, (+force || 0) & 7, (+dir || 0) & 3);
    return null;
  });
  def('AutowedgeCell', 'Terrain', (t, [x, y, z]) => autowedge(data(t), Math.floor(x), Math.floor(y), Math.floor(z)));
  def('AutowedgeCells', 'Terrain', (t, [r]) => {
    const d = data(t);
    const lo = int3(r.slice(0, 3)), hi = int3(r.slice(3, 6));
    if ((hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1) > MAX_VOXELS) throw new Error('Region is too large');
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) autowedge(d, x, y, z);
    return null;
  });
  def('CellCenterToWorld', 'Terrain', (t, [x, y, z]) => T.v3(cellCenter(Math.floor(x), Math.floor(y), Math.floor(z))));
  def('CellCornerToWorld', 'Terrain', (t, [x, y, z]) => T.v3([Math.floor(x) * VOXEL, Math.floor(y) * VOXEL, Math.floor(z) * VOXEL]));
  def('WorldToCell', 'Terrain', (t, [p]) => T.v3(worldToCell(p || [0, 0, 0])));
  def('WorldToCellPreferSolid', 'Terrain', (t, [p]) => {
    const c = worldToCell(p || [0, 0, 0]);
    const d = data(t);
    if (!d.get(...c)) for (const [a, b, e] of [[0, -1, 0], [0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) if (d.get(c[0] + a, c[1] + b, c[2] + e)) return T.v3([c[0] + a, c[1] + b, c[2] + e]);
    return T.v3(c);
  });
  def('WorldToCellPreferEmpty', 'Terrain', (t, [p]) => {
    const c = worldToCell(p || [0, 0, 0]);
    const d = data(t);
    if (d.get(...c)) for (const [a, b, e] of [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) if (!d.get(c[0] + a, c[1] + b, c[2] + e)) return T.v3([c[0] + a, c[1] + b, c[2] + e]);
    return T.v3(c);
  });
  def('CountCells', 'Terrain', (t) => data(t).count());
  def('Clear', 'Terrain', (t) => {
    data(t).clear();
    return null;
  });
  def('ConvertToSmooth', 'Terrain', () => null);
  def('FillBlock', 'Terrain', (t, [cf, size, mat]) => {
    if (!Array.isArray(cf) || !Array.isArray(size)) throw new Error('FillBlock expects a CFrame and a Vector3');
    const m = smoothMaterial(mat);
    data(t).fillBox(cf, size, m, m ? {} : { subtract: true });
    return null;
  });
  def('FillBall', 'Terrain', (t, [center, radius, mat]) => {
    if (!Array.isArray(center)) throw new Error('FillBall expects a Vector3');
    const m = smoothMaterial(mat);
    data(t).fillBall(center, +radius || 0, m, m ? {} : { subtract: true });
    return null;
  });
  def('FillCylinder', 'Terrain', (t, [cf, height, radius, mat]) => {
    const d = data(t);
    const m = smoothMaterial(mat);
    const r = +radius || 0, h = (+height || 0) / 2;
    const ext = r + h;
    const lo = [0, 1, 2].map((k) => Math.floor((cf[k] - ext) / VOXEL) - 1), hi = [0, 1, 2].map((k) => Math.floor((cf[k] + ext) / VOXEL) + 1);
    if ((hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]) > MAX_VOXELS) throw new Error('Region is too large');
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      const dx = (x + 0.5) * VOXEL - cf[0], dy = (y + 0.5) * VOXEL - cf[1], dz = (z + 0.5) * VOXEL - cf[2];
      const lx = cf[3] * dx + cf[6] * dy + cf[9] * dz, ly = cf[4] * dx + cf[7] * dy + cf[10] * dz, lz = cf[5] * dx + cf[8] * dy + cf[11] * dz;
      const occ = Math.min(Math.max(0, Math.min(1, (r - Math.hypot(lx, lz)) / VOXEL + 0.5)), Math.max(0, Math.min(1, (h - Math.abs(ly)) / VOXEL + 0.5)));
      if (occ > 0) d.writeVoxel(x, y, z, m, occ, m ? {} : { subtract: true });
    }
    return null;
  });
  def('FillWedge', 'Terrain', (t, [cf, size, mat]) => {
    const d = data(t);
    const m = smoothMaterial(mat);
    const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
    const ext = Math.hypot(hx, hy, hz);
    const lo = [0, 1, 2].map((k) => Math.floor((cf[k] - ext) / VOXEL) - 1), hi = [0, 1, 2].map((k) => Math.floor((cf[k] + ext) / VOXEL) + 1);
    if ((hi[0] - lo[0]) * (hi[1] - lo[1]) * (hi[2] - lo[2]) > MAX_VOXELS) throw new Error('Region is too large');
    for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) for (let x = lo[0]; x <= hi[0]; x++) {
      let inside = 0;
      for (let s = 0; s < 8; s++) {
        const px = (x + 0.25 + 0.5 * (s & 1)) * VOXEL - cf[0], py = (y + 0.25 + 0.5 * ((s >> 1) & 1)) * VOXEL - cf[1], pz = (z + 0.25 + 0.5 * ((s >> 2) & 1)) * VOXEL - cf[2];
        const lx = cf[3] * px + cf[6] * py + cf[9] * pz, ly = cf[4] * px + cf[7] * py + cf[10] * pz, lz = cf[5] * px + cf[8] * py + cf[11] * pz;
        if (Math.abs(lx) <= hx && Math.abs(ly) <= hy && Math.abs(lz) <= hz && (ly + hy) / (2 * hy || 1) <= (lz + hz) / (2 * hz || 1)) inside++;
      }
      if (inside) d.writeVoxel(x, y, z, m, inside / 8, m ? {} : { subtract: true });
    }
    return null;
  });
  def('FillRegion', 'Terrain', (t, [r, res, mat]) => {
    const { lo, hi } = regionCells(r, +res || VOXEL);
    const d = data(t);
    const m = smoothMaterial(mat);
    for (let y = lo[1]; y < hi[1]; y++) for (let z = lo[2]; z < hi[2]; z++) for (let x = lo[0]; x < hi[0]; x++) d.set(x, y, z, m, 255);
    return null;
  });
  def('ReplaceMaterial', 'Terrain', (t, [r, res, from, to]) => {
    const { lo, hi } = regionCells(r, +res || VOXEL);
    const d = data(t);
    const a = smoothMaterial(from), b = smoothMaterial(to);
    for (let y = lo[1]; y < hi[1]; y++) for (let z = lo[2]; z < hi[2]; z++) for (let x = lo[0]; x < hi[0]; x++) {
      const [m, o] = d.cell(x, y, z);
      if (m === a) d.set(x, y, z, b, b ? o : 0);
    }
    return null;
  });
  def('__ReadVoxels', 'Terrain', (t, [r, res]) => {
    const { lo, hi, size } = regionCells(r, +res || VOXEL);
    const d = data(t);
    const mats = [], occs = [];
    for (let x = lo[0]; x < hi[0]; x++) for (let y = lo[1]; y < hi[1]; y++) for (let z = lo[2]; z < hi[2]; z++) {
      const [m, o] = d.cell(x, y, z);
      mats.push(m);
      occs.push(m ? Math.round((o / 255) * 1000) / 1000 : 0);
    }
    return multi(T.list(mats), T.list(occs), T.v3(size));
  });
  def('__WriteVoxels', 'Terrain', (t, [r, res, mats, occs]) => {
    const { lo, hi } = regionCells(r, +res || VOXEL);
    const d = data(t);
    let i = 0;
    for (let x = lo[0]; x < hi[0]; x++) for (let y = lo[1]; y < hi[1]; y++) for (let z = lo[2]; z < hi[2]; z++, i++) {
      const m = (mats && mats[i]) | 0;
      const o = Math.max(0, Math.min(1, +(occs && occs[i]) || 0));
      d.set(x, y, z, m > 0 && m < SMOOTH_MATERIALS.length && o > 0 ? m : 0, Math.round(o * 255));
    }
    return null;
  });
  def('__MaterialIndex', 'Terrain', (t, [mat]) => smoothMaterial(mat));
  def('__MaterialEnum', 'Terrain', (t, [i]) => T.e('Material', materialEnum(i | 0)));
  def('GetMaterialColor', 'Terrain', (t, [mat]) => {
    const name = MAT_NAME[mat] || String(mat);
    const own = t.materialColors && t.materialColors.get(name);
    return T.c3(own || (SMOOTH_COLORS[name] || [127, 127, 127]).map((v) => v / 255));
  });
  def('SetMaterialColor', 'Terrain', (t, [mat, color]) => {
    const name = MAT_NAME[mat] || String(mat);
    if (!t.materialColors) t.materialColors = new Map();
    if (Array.isArray(color)) t.materialColors.set(name, color.slice(0, 3));
    if (data(t)) for (const k of data(t).chunks.keys()) data(t).dirty.add(k);
    return null;
  });
  def('CopyRegion', 'Terrain', () => null);
  def('PasteRegion', 'Terrain', () => null);
}
