// Lightweight 2D (XZ-plane) collision: circles against boxes and circles.

export function resolveCollisions(p, r, colliders, heightAbove = 0) {
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      if (c.enabled === false) continue;
      if (c.h !== undefined && heightAbove > c.h) continue; // jumped over it
      if (c.type === 'box') {
        const cx = Math.max(c.minX, Math.min(p.x, c.maxX));
        const cz = Math.max(c.minZ, Math.min(p.z, c.maxZ));
        const dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            p.x = cx + (dx / d) * r;
            p.z = cz + (dz / d) * r;
          } else {
            // centre inside the box: push out along the shallowest axis
            const l = p.x - c.minX, rr = c.maxX - p.x, t = p.z - c.minZ, b = c.maxZ - p.z;
            const m = Math.min(l, rr, t, b);
            if (m === l) p.x = c.minX - r;
            else if (m === rr) p.x = c.maxX + r;
            else if (m === t) p.z = c.minZ - r;
            else p.z = c.maxZ + r;
          }
        }
      } else if (c.type === 'circle') {
        const dx = p.x - c.x, dz = p.z - c.z;
        const d = Math.hypot(dx, dz), m = r + c.r;
        if (d < m && d > 1e-6) {
          p.x = c.x + (dx / d) * m;
          p.z = c.z + (dz / d) * m;
        }
      }
    }
  }
  return p;
}

export const boxCollider = (x, z, w, d, extra = {}) => ({ type: 'box', minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, ...extra });
