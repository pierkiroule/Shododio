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
  c.r >= 0 && c.r <= 255 &&
  c.g >= 0 && c.g <= 255 &&
  c.b >= 0 && c.b <= 255;

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

/* ---------- Effets aquarelle ---------- */
const addWaterHalo = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const layers = Math.min(4, 2 + Math.round(intensity * 2));
  const haloRgb = mixColor(rgb, paperRgb, 0.6);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < layers; i++) {
    const r = size * (0.9 + i * 0.3 + rand() * 0.2);
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, rgba(haloRgb, 0));
    g.addColorStop(0.6, rgba(haloRgb, 0.025 * intensity));
    g.addColorStop(1, rgba(haloRgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.8, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const addStain = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const wash = mixColor(rgb, paperRgb, 0.45);
  const g = ctx.createRadialGradient(cx, cy, size * 0.2, cx, cy, size);
  g.addColorStop(0, rgba(wash, 0.12 * intensity));
  g.addColorStop(1, rgba(wash, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 1.1, size * 0.85, rand() * Math.PI, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const addDryEdge = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const g = ctx.createRadialGradient(cx, cy, size * 0.4, cx, cy, size);
  g.addColorStop(0.6, rgba(rgb, 0));
  g.addColorStop(0.9, rgba(rgb, 0.06 * intensity));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size, size * 0.8, rand() * Math.PI, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const addGranulation = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const dots = Math.min(12, 3 + Math.round(intensity * 6));
  const pale = mixColor(rgb, paperRgb, 0.55);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < dots; i++) {
    const dx = (rand() - 0.5) * size;
    const dy = (rand() - 0.5) * size;
    ctx.fillStyle = rgba(pale, 0.04 * intensity);
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, 0.6 + rand(), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const addWetTrace = (ctx, cx, cy, size, rgb, intensity, dx, dy, rand) => {
  const wash = mixColor(rgb, paperRgb, 0.4);
  const len = size * 1.1;
  const g = ctx.createLinearGradient(cx, cy, cx + dx * len, cy + dy * len);
  g.addColorStop(0, rgba(wash, 0));
  g.addColorStop(0.6, rgba(wash, 0.06 * intensity));
  g.addColorStop(1, rgba(wash, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.4, len * 0.6, Math.atan2(dy, dx), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const addClawMarks = (ctx, cx, cy, size, rgb, alpha, dx, dy, nx, ny, rand, energy) => {
  const count = 2 + Math.round(rand() * 2);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.strokeStyle = rgba(rgb, alpha * 0.7);
  for (let i = 0; i < count; i++) {
    const off = (rand() - 0.5) * size * 0.6;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(cx + nx * off, cy + ny * off);
    ctx.lineTo(cx + dx * size * energy, cy + dy * size * energy);
    ctx.stroke();
  }
  ctx.restore();
};

const addAuraRings = (ctx, cx, cy, size, rgb, intensity, rand, layers = 2) => {
  const tint = mixColor(rgb, paperRgb, 0.3);
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < layers; i++) {
    ctx.strokeStyle = rgba(tint, 0.05 * intensity);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.ellipse(
      cx,
      cy,
      size * (1 + i * 0.35),
      size * (0.8 + i * 0.25),
      rand() * Math.PI,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }
  ctx.restore();
};

const stampInk = (ctx, cx, cy, size, rgb, alpha, angle, squash = 0.8) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(1, squash);
  const g = ctx.createRadialGradient(0, 0, size * 0.15, 0, 0, size);
  g.addColorStop(0, rgba(rgb, alpha));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

/* ---------- Couleur encre ---------- */
const getInkDepth = (ink, flow) =>
  mixColor(paperRgb, ink, clamp(0.25 + flow * 0.3, 0.25, 0.6));

/* ---------- Brush ---------- */
export const drawBrush = (ctx, a, b, { ink, brush, drive, seed, dt = 16 } = {}) => {
  if (!ctx || !a || !b) return;

  const rand = seed === undefined ? Math.random : mulberry32(seed);
  const safeInk = normalizeInk(ink);

  const { baseSize = 12, wetness = 0.6, flow = 1, grain = 0.35, jitter = 0.25, tipPattern } = brush || {};
  const { low = 0, mid = 0, high = 0, energy = 0 } = drive || {};

  const ax = a.x ?? a[0];
  const ay = a.y ?? a[1];
  const bx = b.x ?? b[0];
  const by = b.y ?? b[1];

  const dist = Math.hypot(bx - ax, by - ay);
  const speed = dist / Math.max(8, dt);
  const speedFactor = clamp(1.15 - speed * 0.15, 0.6, 1.35);
  const stepSize = clamp(baseSize * (0.2 + (1 - flow) * 0.18 + energy * 0.08), 0.6, 6);
  const steps = Math.min(160, Math.max(1, Math.floor(dist / stepSize)));

  const dx = dist ? (bx - ax) / dist : 0;
  const dy = dist ? (by - ay) / dist : 0;
  const nx = -dy;
  const ny = dx;

  const wateriness = clamp(wetness + low * 0.5 + energy * 0.3, 0, 1.2);
  const pressure = clamp(0.55 + energy * 0.85 + low * 0.5 + mid * 0.35, 0.4, 1.6);
  const size = baseSize * (0.55 + pressure * 0.45) * speedFactor;
  const inkDeep = getInkDepth(safeInk, flow);

  ctx.save();
  ctx.globalCompositeOperation = "multiply";

  const effectStride = Math.max(1, Math.floor(steps / 8));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const pulse = Math.sin(t * Math.PI) * 0.6 + 0.4;
    const wobble = (rand() - 0.5) * jitter * size;
    const swirl = Math.sin((t + rand()) * 6.2) * jitter * size * 0.35;
    const x = ax + (bx - ax) * t + nx * (wobble + swirl) + dx * swirl * 0.25;
    const y = ay + (by - ay) * t + ny * (wobble + swirl) + dy * swirl * 0.25;
    const stampSize = size * (0.7 + pulse * 0.6);
    const alpha = clamp((0.08 + flow * 0.18 + energy * 0.2) * pulse, 0.05, 0.5);
    const angle = Math.atan2(dy, dx) + (rand() - 0.5) * 0.35;

    stampInk(ctx, x, y, stampSize, inkDeep, alpha, angle, 0.65 + rand() * 0.3);

    if (i % effectStride === 0) {
      addWaterHalo(ctx, x, y, size * 1.1, safeInk, 0.35 + wateriness * 0.35, rand);
      if (rand() < 0.3) addStain(ctx, x, y, size * 1.25, safeInk, wateriness, rand);
      addDryEdge(ctx, x, y, size * 0.95, inkDeep, 1, rand);
      if (rand() < 0.45) addGranulation(ctx, x, y, size, safeInk, grain, rand);
      if (rand() < 0.2 * wateriness) addWetTrace(ctx, x, y, size, safeInk, wateriness, dx, dy, rand);

      if (tipPattern === "claws") {
        addClawMarks(ctx, x, y, size, inkDeep, 0.6, dx, dy, nx, ny, rand, energy);
      } else if (tipPattern === "halo") {
        addAuraRings(ctx, x, y, size * 1.15, safeInk, 0.85, rand);
      } else if (tipPattern === "halo-complex") {
        addAuraRings(ctx, x, y, size * 1.2, safeInk, 0.9, rand, 3);
        if (rand() < 0.5) addGranulation(ctx, x, y, size * 1.05, safeInk, grain * 1.2, rand);
      }
    }
  }

  ctx.restore();
};
