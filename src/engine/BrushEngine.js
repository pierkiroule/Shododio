import { mixColor, paperRgb, rgba } from "../utils/color";
import { clamp } from "../utils/math";

/* ---------- RNG ---------- */
const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

/* ---------- Utils couleur ---------- */
const isRgb = (c) =>
  !!c &&
  Number.isFinite(c.r) &&
  Number.isFinite(c.g) &&
  Number.isFinite(c.b) &&
  c.r >= 0 &&
  c.r <= 255 &&
  c.g >= 0 &&
  c.g <= 255 &&
  c.b >= 0 &&
  c.b <= 255;

const normalizeInk = (ink) => {
  if (isRgb(ink)) return ink;
  if (Array.isArray(ink) && ink.length >= 3) {
    const r = Number(ink[0]);
    const g = Number(ink[1]);
    const b = Number(ink[2]);
    if (isRgb({ r, g, b })) return { r, g, b };
  }
  return { r: 0, g: 0, b: 0 };
};

/* ---------- Effets eau / matière ---------- */
const addWaterHalo = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const layers = Math.min(6, 3 + Math.round(intensity * 3));
  const haloRgb = mixColor(rgb, paperRgb, 0.55 + intensity * 0.2);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < layers; i += 1) {
    const radius = size * (0.9 + i * 0.35 + rand() * 0.25);
    const dx = (rand() - 0.5) * size * 0.2;
    const dy = (rand() - 0.5) * size * 0.2;
    const g = ctx.createRadialGradient(
      cx + dx,
      cy + dy,
      radius * 0.15,
      cx + dx,
      cy + dy,
      radius
    );
    g.addColorStop(0, rgba(haloRgb, 0));
    g.addColorStop(0.5, rgba(haloRgb, 0.03 * intensity));
    g.addColorStop(0.85, rgba(haloRgb, 0.06 * intensity));
    g.addColorStop(1, rgba(haloRgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(
      cx + dx,
      cy + dy,
      radius * 1.1,
      radius * 0.85,
      rand() * Math.PI,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }
  ctx.restore();
};

const addStain = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const radius = Math.max(6, size);
  const washRgb = mixColor(rgb, paperRgb, 0.35 + intensity * 0.2);
  const g = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  g.addColorStop(0, rgba(washRgb, 0.18 * intensity));
  g.addColorStop(0.6, rgba(washRgb, 0.05 * intensity));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 1.2, radius * 0.85, rand() * Math.PI, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const addDryEdge = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const g = ctx.createRadialGradient(cx, cy, size * 0.25, cx, cy, size);
  g.addColorStop(0, rgba(rgb, 0));
  g.addColorStop(0.55, rgba(rgb, 0.03 * intensity));
  g.addColorStop(0.9, rgba(rgb, 0.1 * intensity));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 1.05, size * 0.8, rand() * Math.PI, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const addGranulation = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const specks = Math.min(16, Math.round(4 + intensity * 10));
  const pale = mixColor(rgb, { r: 245, g: 240, b: 230 }, 0.5);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < specks; i += 1) {
    const dx = (rand() - 0.5) * size * 1.6;
    const dy = (rand() - 0.5) * size * 1.4;
    const r = 0.4 + rand() * 0.9 * intensity;
    ctx.fillStyle = rgba(pale, 0.08 * intensity);
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const addSplatter = (ctx, cx, cy, intensity, rgb, rand) => {
  const drops = Math.ceil(8 * intensity);
  const splashRgb = mixColor(rgb, paperRgb, 0.3 + intensity * 0.2);
  for (let i = 0; i < drops; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 10 + rand() * 30 * intensity;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    const s = 0.8 + rand() * 2.6 * intensity;
    ctx.fillStyle = rgba(splashRgb, 0.32 * intensity);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
};

const addWetTrace = (ctx, cx, cy, size, rgb, intensity, dirX, dirY, rand) => {
  const traceColor = mixColor(rgb, paperRgb, 0.4 + intensity * 0.2);
  const len = size * (0.8 + intensity * 0.6);
  const w = size * 0.5;
  const off = (rand() - 0.5) * size * 0.3;
  const tx = cx + dirX * off;
  const ty = cy + dirY * off;
  const g = ctx.createLinearGradient(tx, ty, tx + dirX * len, ty + dirY * len);
  g.addColorStop(0, rgba(traceColor, 0));
  g.addColorStop(0.35, rgba(traceColor, 0.05 * intensity));
  g.addColorStop(0.7, rgba(rgb, 0.12 * intensity));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(tx, ty, w, len * 0.6, Math.atan2(dirY, dirX), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/* ---------- Motifs de bout ---------- */
const addClawMarks = (ctx, cx, cy, size, rgb, alpha, dirX, dirY, nx, ny, rand, energy) => {
  const count = 3 + Math.round(rand() * 3);
  const length = size * (0.8 + energy * 1.4);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = rgba(rgb, alpha * 1.2);
  for (let i = 0; i < count; i += 1) {
    const spread = (rand() - 0.5) * size * 0.9;
    const angle = (rand() - 0.5) * 0.6;
    const dx = nx * spread;
    const dy = ny * spread;
    const rx = dirX * Math.cos(angle) - dirY * Math.sin(angle);
    const ry = dirX * Math.sin(angle) + dirY * Math.cos(angle);
    const clawLen = length * (0.6 + rand() * 0.6);
    ctx.lineWidth = 0.35 + rand() * 0.6;
    ctx.beginPath();
    ctx.moveTo(cx + dx, cy + dy);
    ctx.lineTo(cx + dx + rx * clawLen, cy + dy + ry * clawLen);
    ctx.stroke();
  }
  ctx.restore();
};

const addAuraRings = (ctx, cx, cy, size, rgb, intensity, rand, layers = 2) => {
  const tint = mixColor(rgb, paperRgb, 0.25);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < layers; i += 1) {
    const radius = size * (1.1 + i * 0.45 + rand() * 0.3);
    ctx.strokeStyle = rgba(tint, 0.08 * intensity);
    ctx.lineWidth = 0.4 + rand() * 0.7;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      radius * (0.9 + rand() * 0.2),
      radius * (0.7 + rand() * 0.2),
      rand() * Math.PI,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }
  ctx.restore();
};

/* ---------- Couleur encre ---------- */
const getInkDepth = (ink, flow) => {
  const depth = clamp(0.25 + flow * 0.35, 0.2, 0.7);
  return mixColor(paperRgb, ink, depth);
};

/* ---------- Brush ---------- */
export const drawBrush = (ctx, a, b, { ink, brush, drive, dt = 16, seed } = {}) => {
  if (!ctx || !a || !b) return;

  const safeInk = normalizeInk(ink);

  const safeBrush = brush ?? {};
  const safeDrive = drive ?? { energy: 0, low: 0, mid: 0, high: 0 };

  const rand = seed === undefined ? Math.random : mulberry32(seed);

  const ax = a.x ?? a[0];
  const ay = a.y ?? a[1];
  const bx = b.x ?? b[0];
  const by = b.y ?? b[1];

  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.min(90, Math.max(1, Math.floor(dist)));

  const dirX = dist ? (bx - ax) / dist : 0;
  const dirY = dist ? (by - ay) / dist : 0;
  const nx = -dirY;
  const ny = dirX;
  const speed = dist / Math.max(dt, 1);

  const wetness = Number.isFinite(safeBrush.wetness) ? safeBrush.wetness : 0.6;
  const baseSize = Number.isFinite(safeBrush.baseSize) ? safeBrush.baseSize : 12;
  const jitterBase = Number.isFinite(safeBrush.jitter) ? safeBrush.jitter : 0.25;
  const flow = clamp(Number.isFinite(safeBrush.flow) ? safeBrush.flow : 1, 0, 2);
  const bristles = Math.max(0, Number.isFinite(safeBrush.bristles) ? safeBrush.bristles : 0);
  const grain = clamp(Number.isFinite(safeBrush.grain) ? safeBrush.grain : 0.35, 0, 1);
  const spread = Number.isFinite(safeBrush.spread) ? safeBrush.spread : 0.9;
  const id = safeBrush.id ?? "default";
  const tipPattern = safeBrush.tipPattern ?? "classic";
  const haloOnly = id === "halo";

  const low = clamp(Number.isFinite(safeDrive.low) ? safeDrive.low : 0, 0, 1);
  const mid = clamp(Number.isFinite(safeDrive.mid) ? safeDrive.mid : 0, 0, 1);
  const high = clamp(Number.isFinite(safeDrive.high) ? safeDrive.high : 0, 0, 1);
  const energy = clamp(Number.isFinite(safeDrive.energy) ? safeDrive.energy : 0, 0, 1);

  const wateriness = clamp(wetness + low * 0.8 + energy * 0.6, 0, 2);
  const dryness = clamp(1.1 - wateriness + high * 0.5, 0.1, 1.3);
  const audioDamping = 1 - clamp(energy * 0.45 + high * 0.25 + mid * 0.15, 0, 0.6);
  const size = baseSize * (0.6 + energy * 1.2) * (0.6 + mid * 0.6) * audioDamping;
  const jitter = jitterBase * (1 + high * 4 + energy * 3) * size;

  const inkDeep = getInkDepth(safeInk, flow);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const cx = ax + (bx - ax) * t + (rand() - 0.5) * jitter;
    const cy = ay + (by - ay) * t + (rand() - 0.5) * jitter;

    const alpha = (0.05 + mid * 0.25 + energy * 0.2) * flow;
    const lw = size * (0.25 + energy * 0.9);
    const seg = Math.max(2, size * 0.6);

    if (!haloOnly) {
      ctx.strokeStyle = rgba(inkDeep, alpha);
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(cx - dirX * seg * 0.3, cy - dirY * seg * 0.3);
      ctx.lineTo(cx + dirX * seg, cy + dirY * seg);
      ctx.stroke();
    }

    if (!haloOnly && tipPattern === "claws") {
      addClawMarks(ctx, cx, cy, size, inkDeep, alpha, dirX, dirY, nx, ny, rand, energy);
    }

    if (!haloOnly && bristles > 0) {
      const count = Math.round(bristles * (0.7 + high * 0.6));
      for (let j = 0; j < count; j += 1) {
        if (rand() < grain * 0.25 * dryness) continue;
        const off = (rand() - 0.5) * spread * size;
        const mx = cx + nx * off;
        const my = cy + ny * off;
        const len = (2 + rand() * 6 + speed * 0.8) * (0.6 + energy * 0.8);
        const w = (0.2 + rand() * 0.6) * (0.6 + energy * 0.6);
        ctx.strokeStyle = rgba(inkDeep, alpha * (0.5 + rand() * 0.6));
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + dirX * len, my + dirY * len);
        ctx.stroke();
      }
    }

    if (haloOnly) {
      const haloSize = size * (1.4 + wateriness * 0.6);
      const haloIntensity = clamp(0.7 + wateriness * 0.4 + low * 0.2, 0, 1.6);
      addWaterHalo(ctx, cx, cy, haloSize, safeInk, haloIntensity, rand);
      addWaterHalo(ctx, cx, cy, haloSize * 0.7, safeInk, haloIntensity * 0.85, rand);
      addStain(ctx, cx, cy, haloSize * 0.9, safeInk, 0.5 + haloIntensity * 0.4, rand);
      addDryEdge(ctx, cx, cy, haloSize * 0.85, inkDeep, clamp(dryness + 0.35, 0.1, 1.4), rand);
      addGranulation(ctx, cx, cy, haloSize * 0.8, safeInk, clamp(grain * 1.2 + 0.2, 0, 1.6), rand);
    } else {
      if (rand() < 0.18 * (0.4 + wateriness)) {
        addWaterHalo(ctx, cx, cy, size * 1.3, safeInk, 0.4 + wateriness * 0.4, rand);
      }
      if (rand() < 0.14 * (0.3 + wateriness)) {
        addStain(ctx, cx, cy, size * 1.4, safeInk, 0.35 + wateriness * 0.35, rand);
      }
      if (rand() < 0.1 * dryness) {
        addDryEdge(ctx, cx, cy, size * 1.1, inkDeep, dryness, rand);
      }
      if (rand() < 0.18 * (0.3 + grain)) {
        addGranulation(ctx, cx, cy, size * 1.1, safeInk, (grain + high) * 0.9, rand);
      }
      if (tipPattern === "halo") {
        addAuraRings(ctx, cx, cy, size * (1 + wateriness * 0.2), safeInk, 0.9 + wateriness * 0.4, rand, 2);
        addWaterHalo(ctx, cx, cy, size * 1.5, safeInk, 0.55 + wateriness * 0.35, rand);
      }
      if (tipPattern === "halo-complex") {
        addAuraRings(ctx, cx, cy, size * (1.1 + wateriness * 0.3), safeInk, 1.1 + wateriness * 0.5, rand, 4);
        addWaterHalo(ctx, cx, cy, size * 1.7, safeInk, 0.6 + wateriness * 0.4, rand);
        addStain(ctx, cx, cy, size * 1.6, safeInk, 0.6 + wateriness * 0.4, rand);
        addGranulation(ctx, cx, cy, size * 1.2, safeInk, clamp(grain * 1.4 + 0.3, 0, 1.8), rand);
      }
    }

    if (!haloOnly) {
      const splash = Math.max(high, energy);
      if (splash > 0.25 && rand() < 0.06) {
        addSplatter(ctx, cx, cy, splash, safeInk, rand);
      }
      if (rand() < 0.12 * wateriness) {
        addWetTrace(ctx, cx, cy, size * 1.2, safeInk, wateriness, dirX, dirY, rand);
      }
    }
  }

  ctx.restore();
};
