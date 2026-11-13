const CSG_KEY = [86, 46, 110, 88, 49, 32, 48, 4, 52, 105, 12, 119, 12, 1, 94, 0, 26, 96, 55, 105, 29, 82, 43, 7, 79, 36, 89, 101, 83, 4, 122];

export function parseCSG(raw) {
  const d = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) d[i] = raw[i] ^ CSG_KEY[i % CSG_KEY.length];
  if (String.fromCharCode(...d.subarray(0, 6)) !== 'CSGMDL') return null;
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const version = dv.getInt32(6, true);
  if (version !== 2) return null;
  let o = 42;
  const nv = dv.getInt32(o, true), stride = dv.getInt32(o + 4, true);
  o += 8;
  if (nv <= 0 || nv > 1e6 || stride < 24 || o + nv * stride + 4 > d.length) return null;
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const b = o + i * stride;
    for (let k = 0; k < 3; k++) {
      pos[i * 3 + k] = dv.getFloat32(b + k * 4, true);
      nrm[i * 3 + k] = dv.getFloat32(b + 12 + k * 4, true);
    }
  }
  o += nv * stride;
  const ni = dv.getInt32(o, true);
  o += 4;
  if (ni <= 0 || o + ni * 4 > d.length) return null;
  const idx = new Uint32Array(ni);
  for (let i = 0; i < ni; i++) {
    const v = dv.getInt32(o + i * 4, true);
    idx[i] = v >= 0 && v < nv ? v : 0;
  }
  return { pos, nrm, idx };
}

export function base64Bytes(s) {
  const bin = atob(String(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function meshDataFromAsset(bytes) {
  const text = new TextDecoder().decode(bytes);
  const m = /<BinaryString name="MeshData">([^<]*)<\/BinaryString>/.exec(text);
  return m && m[1].trim() ? parseCSG(base64Bytes(m[1])) : null;
}

export function unionValue(part, name) {
  if (part.info && part.info.all.has(name)) {
    const v = part.props.get(name);
    if (v != null && v !== '') return v;
  }
  return part.extra && part.extra.get(name) ? part.extra.get(name).v : null;
}

export function unionBounds(m) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.pos.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = m.pos[i + k];
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
  }
  return [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
}
