import { mixColor, paperRgb, rgba } from "../utils/color";
import { clamp } from "../utils/math";

const mulberry32 = (seed) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

const addWaterHalo = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const layers = Math.min(6, 3 + Math.round(intensity * 3));
  const haloRgb = mixColor(rgb, paperRgb, 0.55 + intensity * 0.2);
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  for (let i = 0; i < layers; i += 1) {
    const radius = size * (0.9 + i * 0.35 + rand() * 0.25);
    const driftX = (rand() - 0.5) * size * 0.2;
    const driftY = (rand() - 0.5) * size * 0.2;
    const grad = ctx.createRadialGradient(cx + driftX, cy + driftY, radius * 0.15, cx + driftX, cy + driftY, radius);
    grad.addColorStop(0, rgba(haloRgb, 0));
    grad.addColorStop(0.5, rgba(haloRgb, 0.03 * intensity));
    grad.addColorStop(0.85, rgba(haloRgb, 0.06 * intensity));
    grad.addColorStop(1, rgba(haloRgb, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx + driftX, cy + driftY, radius * 1.1, radius * 0.85, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const addStain = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const radius = Math.max(6, size);
  const washRgb = mixColor(rgb, paperRgb, 0.35 + intensity * 0.2);
  const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
  grad.addColorStop(0, rgba(washRgb, 0.18 * intensity));
  grad.addColorStop(0.6, rgba(washRgb, 0.05 * intensity));
  grad.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 1.2, radius * 0.85, rand() * Math.PI, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const addDryEdge = (ctx, cx, cy, size, rgb, intensity, rand) => {
  const edge = ctx.createRadialGradient(cx, cy, size * 0.25, cx, cy, size);
  edge.addColorStop(0.0, rgba(rgb, 0));
  edge.addColorStop(0.55, rgba(rgb, 0.03 * intensity));
  edge.addColorStop(0.9, rgba(rgb, 0.1 * intensity));
  edge.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = edge;
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
    const radius = 0.4 + rand() * 0.9 * intensity;
    ctx.fillStyle = rgba(pale, 0.08 * intensity);
    ctx.beginPath();
    ctx.arc(cx + dx, cy + dy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

const addSplatter = (ctx, cx, cy, intensity, rgb, rand) => {
  const drops = Math.ceil(8 * intensity);
  const splashRgb = mixColor(rgb, paperRgb, 0.3 + intensity * 0.2);
  for (let i = 0; i < drops; i += 1) {
    const angle = rand() * Math.PI * 2;
    const radius = 10 + rand() * 30 * intensity;
    const sx = cx + Math.cos(angle) * radius;
    const sy = cy + Math.sin(angle) * radius;
    const size = 0.8 + rand() * 2.6 * intensity;
    const alpha = 0.32 * intensity;
    ctx.fillStyle = rgba(splashRgb, alpha);
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
};

const addWetTrace = (ctx, cx, cy, size, rgb, intensity, dirX, dirY, rand) => {
  const traceColor = mixColor(rgb, paperRgb, 0.4 + intensity * 0.2);
  const length = size * (0.8 + intensity * 0.6);
  const width = size * 0.5;
  const offset = (rand() - 0.5) * size * 0.3;
  const tx = cx + dirX * offset;
  const ty = cy + dirY * offset;
  const grad = ctx.createLinearGradient(tx, ty, tx + dirX * length, ty + dirY * length);
  grad.addColorStop(0, rgba(traceColor, 0));
  grad.addColorStop(0.35, rgba(traceColor, 0.05 * intensity));
  grad.addColorStop(0.7, rgba(rgb, 0.12 * intensity));
  grad.addColorStop(1, rgba(rgb, 0));
  ctx.save();
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(tx, ty, width, length * 0.6, Math.atan2(dirY, dirX), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const getInkDepth = (ink, flow) => {
  const luminance = (0.2126 * ink.r + 0.7152 * ink.g + 0.0722 * ink.b) / 255;
  const depth = clamp(0.08 + (1 - luminance) * 0.35 + flow * 0.08, 0.08, 0.5);
  return mixColor(ink, { r: 0, g: 0, b: 0 }, depth);
};

export const drawBrush = (ctx, a, b, { ink, brush, drive, dt = 16, seed } = {}) => {
  if (!ctx || !a || !b) return;
  const rand = seed === undefined ? Math.random : mulberry32(seed);
  const ax = a.x ?? a[0];
  const ay = a.y ?? a[1];
  const bx = b.x ?? b[0];
  const by = b.y ?? b[1];

  const dist = Math.hypot(bx - ax, by - ay);
  let steps = Math.max(1, Math.floor(dist));
  steps = Math.min(steps, 120);

  const dirX = dist > 0 ? (bx - ax) / dist : 0;
  const dirY = dist > 0 ? (by - ay) / dist : 0;
  const nx = -dirY;
  const ny = dirX;
  const speed = dist / Math.max(dt, 1);

  const wateriness = clamp(brush.wetness + drive.low * 0.8 + drive.energy * 0.6, 0, 2);
  const dryness = clamp(1.1 - wateriness + drive.high * 0.5, 0.1, 1.3);
  const size = brush.baseSize * (0.6 + drive.energy * 1.2) * (0.6 + drive.mid * 0.6);
  const jitterBase = brush.jitter * (1 + drive.high * 4 + drive.energy * 3) * size;
  const inkDeep = getInkDepth(ink, brush.flow);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";

  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    let cx = ax + (bx - ax) * t;
    let cy = ay + (by - ay) * t;

    cx += (rand() - 0.5) * jitterBase;
    cy += (rand() - 0.5) * jitterBase;

    const alpha = (0.05 + drive.mid * 0.25 + drive.energy * 0.2) * brush.flow;
    const lineWidth = size * (0.25 + drive.energy * 0.9);
    const segment = Math.max(2, size * 0.6);
    ctx.strokeStyle = rgba(inkDeep, alpha);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(cx - dirX * segment * 0.3, cy - dirY * segment * 0.3);
    ctx.lineTo(cx + dirX * segment, cy + dirY * segment);
    ctx.stroke();

    if (brush.id === "mist") {
      const mistSize = size * (1.6 + wateriness * 0.5 + drive.low * 0.8);
      const mistRgb = mixColor(ink, paperRgb, 0.65 + wateriness * 0.1);
      ctx.fillStyle = rgba(mistRgb, 0.04 * brush.flow);
      ctx.beginPath();
      ctx.ellipse(cx, cy, mistSize, mistSize * 0.7, rand() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    if (brush.bristles > 0) {
      const bristleCount = Math.round(brush.bristles * (0.7 + drive.high * 0.6));
      for (let bIndex = 0; bIndex < bristleCount; bIndex += 1) {
        if (rand() < brush.grain * 0.25 * dryness) continue;
        const offset = (rand() - 0.5) * brush.spread * size;
        const mx = cx + nx * offset;
        const my = cy + ny * offset;
        const length = (2 + rand() * 6 + speed * 0.8) * (0.6 + drive.energy * 0.8);
        const width = (0.2 + rand() * 0.6) * (0.6 + drive.energy * 0.6);
        ctx.strokeStyle = rgba(inkDeep, alpha * (0.5 + rand() * 0.6));
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(mx + dirX * length, my + dirY * length);
        ctx.stroke();
      }
    }

    const haloChance = brush.id === "dryRake" ? 0.08 : 0.18;
    const stainChance = brush.id === "dryRake" ? 0.05 : 0.14;
    const dryEdgeChance = brush.id === "dryRake" ? 0.16 : 0.1;
    const granulationChance = brush.id === "dryRake" ? 0.22 : 0.18;

    if (rand() < haloChance * (0.4 + wateriness)) {
      addWaterHalo(ctx, cx, cy, size * 1.3, ink, 0.4 + wateriness * 0.4, rand);
    }

    if (rand() < stainChance * (0.3 + wateriness)) {
      addStain(ctx, cx, cy, size * 1.4, ink, 0.35 + wateriness * 0.35, rand);
    }

    if (rand() < dryEdgeChance * dryness) {
      addDryEdge(ctx, cx, cy, size * 1.1, inkDeep, dryness, rand);
    }

    if (rand() < granulationChance * (0.3 + brush.grain)) {
      addGranulation(ctx, cx, cy, size * 1.1, ink, (brush.grain + drive.high) * 0.9, rand);
    }

    const splash = Math.max(drive.high, drive.energy);
    if (splash > 0.25 && rand() < 0.06) {
      addSplatter(ctx, cx, cy, splash, ink, rand);
    }

    if (rand() < 0.12 * wateriness) {
      addWetTrace(ctx, cx, cy, size * 1.2, ink, wateriness, dirX, dirY, rand);
    }
  }

  ctx.restore();
};
