export const IDENTITY = Object.freeze([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);

export function cf(x = 0, y = 0, z = 0, r = null) {
  return r ? [x, y, z, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]] : [x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function mul(a, b) {
  const [ax, ay, az, a0, a1, a2, a3, a4, a5, a6, a7, a8] = a;
  const [bx, by, bz, b0, b1, b2, b3, b4, b5, b6, b7, b8] = b;
  return [
    a0 * bx + a1 * by + a2 * bz + ax,
    a3 * bx + a4 * by + a5 * bz + ay,
    a6 * bx + a7 * by + a8 * bz + az,
    a0 * b0 + a1 * b3 + a2 * b6, a0 * b1 + a1 * b4 + a2 * b7, a0 * b2 + a1 * b5 + a2 * b8,
    a3 * b0 + a4 * b3 + a5 * b6, a3 * b1 + a4 * b4 + a5 * b7, a3 * b2 + a4 * b5 + a5 * b8,
    a6 * b0 + a7 * b3 + a8 * b6, a6 * b1 + a7 * b4 + a8 * b7, a6 * b2 + a7 * b5 + a8 * b8,
  ];
}

export function inv(a) {
  const [x, y, z, r0, r1, r2, r3, r4, r5, r6, r7, r8] = a;
  return [
    -(r0 * x + r3 * y + r6 * z), -(r1 * x + r4 * y + r7 * z), -(r2 * x + r5 * y + r8 * z),
    r0, r3, r6, r1, r4, r7, r2, r5, r8,
  ];
}

export function point(a, x, y, z) {
  return [a[3] * x + a[4] * y + a[5] * z + a[0], a[6] * x + a[7] * y + a[8] * z + a[1], a[9] * x + a[10] * y + a[11] * z + a[2]];
}

export function vector(a, x, y, z) {
  return [a[3] * x + a[4] * y + a[5] * z, a[6] * x + a[7] * y + a[8] * z, a[9] * x + a[10] * y + a[11] * z];
}

export function lookVector(a) {
  return [-a[5], -a[8], -a[11]];
}

export function withPos(a, x, y, z) {
  const r = a.slice();
  r[0] = x;
  r[1] = y;
  r[2] = z;
  return r;
}

export function rotOnly(a) {
  return withPos(a, 0, 0, 0);
}

export function orthonormalize(a) {
  let [, , , r0, r1, r2, r3, r4, r5, r6, r7, r8] = a;
  let xl = Math.hypot(r0, r3, r6) || 1;
  r0 /= xl; r3 /= xl; r6 /= xl;
  let d = r0 * r1 + r3 * r4 + r6 * r7;
  r1 -= d * r0; r4 -= d * r3; r7 -= d * r6;
  let yl = Math.hypot(r1, r4, r7) || 1;
  r1 /= yl; r4 /= yl; r7 /= yl;
  const zx = r3 * r7 - r6 * r4;
  const zy = r6 * r1 - r0 * r7;
  const zz = r0 * r4 - r3 * r1;
  return [a[0], a[1], a[2], r0, r1, zx, r3, r4, zy, r6, r7, zz];
}

export function fromQuat(x, y, z, qx, qy, qz, qw) {
  const xx = qx * qx, yy = qy * qy, zz = qz * qz;
  const xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  return [
    x, y, z,
    1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy),
    2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx),
    2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy),
  ];
}

export function toQuat(a) {
  const m00 = a[3], m01 = a[4], m02 = a[5], m10 = a[6], m11 = a[7], m12 = a[8], m20 = a[9], m21 = a[10], m22 = a[11];
  const tr = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    qw = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s;
  }
  const l = Math.hypot(qx, qy, qz, qw) || 1;
  return [qx / l, qy / l, qz / l, qw / l];
}

export function angles(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
  return [0, 0, 0,
    cy * cz, -cy * sz, sy,
    cz * sx * sy + cx * sz, cx * cz - sx * sy * sz, -cy * sx,
    sx * sz - cx * cz * sy, cz * sx + cx * sy * sz, cx * cy];
}

export function axisAngle(ax, ay, az, t) {
  const l = Math.hypot(ax, ay, az) || 1;
  const s = Math.sin(t / 2);
  return fromQuat(0, 0, 0, (ax / l) * s, (ay / l) * s, (az / l) * s, Math.cos(t / 2));
}

export function lookAt(px, py, pz, tx, ty, tz) {
  let fx = tx - px, fy = ty - py, fz = tz - pz;
  const fl = Math.hypot(fx, fy, fz);
  if (fl < 1e-9) return cf(px, py, pz);
  fx /= fl; fy /= fl; fz /= fl;
  let rx = -fz, ry = 0, rz = fx;
  let rl = Math.hypot(rx, rz);
  if (rl < 1e-6) {
    rx = 1; ry = 0; rz = 0;
  } else {
    rx /= rl; rz /= rl;
  }
  const bx = -fx, by = -fy, bz = -fz;
  const ux = by * rz - bz * ry, uy = bz * rx - bx * rz, uz = bx * ry - by * rx;
  return [px, py, pz, rx, ux, -fx, ry, uy, -fy, rz, uz, -fz];
}

export function lerp(a, b, t) {
  const qa = toQuat(a);
  let qb = toQuat(b);
  let d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  if (d < 0) {
    qb = qb.map((v) => -v);
    d = -d;
  }
  let q;
  if (d > 0.9995) {
    q = qa.map((v, i) => v + (qb[i] - v) * t);
  } else {
    const th = Math.acos(Math.min(1, d));
    const s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    q = qa.map((v, i) => v * wa + qb[i] * wb);
  }
  const l = Math.hypot(...q) || 1;
  return fromQuat(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, q[0] / l, q[1] / l, q[2] / l, q[3] / l);
}

export function isFiniteCF(a) {
  for (let i = 0; i < 12; i++) if (!Number.isFinite(a[i])) return false;
  return true;
}
