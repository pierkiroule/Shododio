import { useCallback, useEffect, useRef, useState } from "react";

const brushes = [
  { id: "senbon", name: "Senbon", style: "rake", baseSize: 7, bristles: 18, spread: 1.25, flow: 0.75, jitter: 0.55, grain: 0.5 },
  { id: "kumo", name: "Kumo", style: "mist", baseSize: 16, bristles: 8, spread: 1.8, flow: 0.28, jitter: 0.18, grain: 0.2 },
  { id: "uroko", name: "Uroko", style: "scales", baseSize: 9, bristles: 10, spread: 1.7, flow: 0.55, jitter: 0.3, grain: 0.75 },
  { id: "shuto", name: "Shuto", style: "alcohol", baseSize: 18, bristles: 6, spread: 2.4, flow: 0.5, jitter: 0.2, grain: 0.1 },
  { id: "keisen", name: "Keisen", style: "filament", baseSize: 8, bristles: 12, spread: 1.4, flow: 0.7, jitter: 0.2, grain: 0.15 }
];

const inkPalette = [
  { id: "sumi", name: "Sumi Noir", value: "#14110f" },
  { id: "ai", name: "Aï Indigo", value: "#2c3b52" },
  { id: "shu", name: "Shu Vermillon", value: "#b73a26" },
  { id: "yuzu", name: "Yuzu Jaune", value: "#f4c542" },
  { id: "midori", name: "Midori Vert", value: "#3c7a4d" },
  { id: "koke", name: "Koke Mousse", value: "#6a7d3c" },
  { id: "momo", name: "Momo Rose", value: "#d8a3b6" },
  { id: "kohaku", name: "Kohaku Ambre", value: "#c47d33" }
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const hexToRgb = (hex) => {
  const clean = hex.replace("#", "");
  const intVal = parseInt(clean, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255
  };
};

const mixColor = (rgb, target, amount) => ({
  r: Math.round(rgb.r + (target.r - rgb.r) * amount),
  g: Math.round(rgb.g + (target.g - rgb.g) * amount),
  b: Math.round(rgb.b + (target.b - rgb.b) * amount)
});

const rgba = (rgb, alpha) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
const paperRgb = { r: 244, g: 241, b: 234 };

export default function App() {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const videoRefs = useRef({});
  const galleryActionsRef = useRef({});
  const [cycles, setCycles] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryExportOpen, setGalleryExportOpen] = useState(false);
  const [menuSections, setMenuSections] = useState({
    brushes: true,
    inks: false,
    size: false,
    opacity: false,
    advanced: false,
    gallery: false
  });
  const [galleryExpanded, setGalleryExpanded] = useState(false);
  useEffect(() => {
    if (!galleryOpen) {
      setGalleryExportOpen(false);
      setGalleryExpanded(false);
    }
  }, [galleryOpen]);

  const updateCycles = useCallback((updater) => {
    setCycles((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

  useEffect(() => {
    const paper = canvasRef.current;
    const canvasWrap = canvasWrapRef.current;
    if (!paper || !canvasWrap) return undefined;

    const ctxP = paper.getContext("2d", { alpha: false });

    let audioCtx;
    let analyser;
    let data;
    let timeData;
    let mediaStream;
    let phase = "READY";
    let startTime = 0;
    let timeLimit = 10000;
    let remainingTime = 0;
    const CANVAS_SCALE = 3;
    const PREVIEW_LONG_EDGE = 360;
    const PREVIEW_FPS = 20;
    const MAX_CYCLES = 5;
    const MIN_BRUSH_SCALE = 0.05;
    let brushSizeScale = 1;
    let inkFlow = 0.72;
    let waterRatio = 0.28;
    const bands = { low: 0, mid: 0, high: 0 };
    const SILENCE_THRESHOLD = 0.01;
    const audioEnergy = { rms: 0, peak: 0 };
    let lastPeakTime = 0;
    let mediaRecorder;
    let recordedChunks = [];
    let activeBrush = brushes[0];
    let activeInk = inkPalette[0];
    let resizeObserver;
    let allowLayering = true;
    let lastFrameTime = performance.now();
    let previewBusy = false;
    const previewCanvas = document.createElement("canvas");
    const previewCtx = previewCanvas.getContext("2d", { alpha: false });
    const exportCanvas = document.createElement("canvas");
    const exportCtx = exportCanvas.getContext("2d", { alpha: false });
    let cycleIndex = 0;
    const voiceState = {
      x: 0,
      y: 0,
      angle: 0,
      velocity: 0
    };

    const mainBtn = document.getElementById("main-btn");
    const statusText = document.getElementById("status-text");
    const recDot = document.getElementById("rec-dot");
    const audioMeter = document.getElementById("audio-meter");
    const specViz = document.getElementById("spectrum-viz");
    const layeringToggle = document.getElementById("layering-toggle");
    const layeringValue = document.getElementById("layering-value");
    const touchState = {
      x: 0,
      y: 0,
      strength: 0,
      active: false,
      lastX: 0,
      lastY: 0,
      swipeAngle: 0,
      swipePower: 0
    };
    let activePointerId = null;
    const cyclesRef = { current: [] };

    const clearAll = () => {
      ctxP.fillStyle = "#f4f1ea";
      ctxP.fillRect(0, 0, paper.width, paper.height);

      for (let i = 0; i < 60000; i += 1) {
        const shade = Math.random();
        ctxP.fillStyle = `rgba(80,80,75,${shade * 0.08})`;
        ctxP.fillRect(Math.random() * paper.width, Math.random() * paper.height, 1, 1);
      }
    };

    const resizeCanvas = () => {
      const rect = canvasWrap.getBoundingClientRect();
      const width = Math.max(1, Math.floor(rect.width * CANVAS_SCALE));
      const height = Math.max(1, Math.floor(rect.height * CANVAS_SCALE));
      if (paper.width === width && paper.height === height) return;
      paper.width = width;
      paper.height = height;
      exportCanvas.width = width;
      exportCanvas.height = height;
      const ratio = width / height;
      const previewWidth = ratio >= 1 ? PREVIEW_LONG_EDGE : Math.round(PREVIEW_LONG_EDGE * ratio);
      const previewHeight = ratio >= 1 ? Math.round(PREVIEW_LONG_EDGE / ratio) : PREVIEW_LONG_EDGE;
      previewCanvas.width = Math.max(1, previewWidth);
      previewCanvas.height = Math.max(1, previewHeight);
      clearAll();
    };

    const addSplatter = (ctx, cx, cy, intensity, baseRgb) => {
      const drops = Math.ceil(8 * intensity);
      for (let i = 0; i < drops; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 10 + Math.random() * 30 * intensity;
        const sx = cx + Math.cos(angle) * radius;
        const sy = cy + Math.sin(angle) * radius;
        const size = (0.8 + Math.random() * 2.6 * intensity) * brushSizeScale;
        const alpha = 0.32 * intensity * inkFlow;
        const splatterRgb = mixColor(baseRgb, paperRgb, 0.3 + waterRatio * 0.35);
        ctx.fillStyle = rgba(splatterRgb, alpha);
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const addStain = (ctx, cx, cy, size, baseRgb, intensity) => {
      const radius = Math.max(6, size);
      const washRgb = mixColor(baseRgb, paperRgb, 0.35 + waterRatio * 0.45);
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
      grad.addColorStop(0, rgba(washRgb, 0.16 * intensity * inkFlow));
      grad.addColorStop(0.6, rgba(washRgb, 0.05 * intensity * inkFlow));
      grad.addColorStop(1, rgba(baseRgb, 0));
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 1.2, radius * 0.85, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const addDryEdge = (ctx, cx, cy, size, baseRgb, intensity) => {
      const radius = Math.max(8, size * 1.1);
      const edge = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
      edge.addColorStop(0.0, rgba(baseRgb, 0));
      edge.addColorStop(0.55, rgba(baseRgb, 0.02 * intensity * inkFlow));
      edge.addColorStop(0.9, rgba(baseRgb, 0.08 * intensity * inkFlow));
      edge.addColorStop(1, rgba(baseRgb, 0));
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = edge;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 1.05, radius * 0.8, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const addWetTrace = (ctx, cx, cy, size, baseRgb, intensity, dirX, dirY) => {
      const length = size * (1.2 + intensity * 1.6);
      const width = size * (0.4 + intensity * 0.6);
      const traceColor = mixColor(baseRgb, paperRgb, 0.4 + waterRatio * 0.35);
      const grad = ctx.createLinearGradient(
        cx - dirX * length * 0.5,
        cy - dirY * length * 0.5,
        cx + dirX * length * 0.6,
        cy + dirY * length * 0.6
      );
      grad.addColorStop(0, rgba(traceColor, 0));
      grad.addColorStop(0.35, rgba(traceColor, 0.05 * intensity * inkFlow));
      grad.addColorStop(0.7, rgba(baseRgb, 0.1 * intensity * inkFlow));
      grad.addColorStop(1, rgba(baseRgb, 0));
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, length, width, Math.atan2(dirY, dirX), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const addGranulation = (ctx, cx, cy, size, baseRgb, intensity) => {
      const specks = Math.round(6 + intensity * 12);
      const pale = mixColor(baseRgb, { r: 245, g: 240, b: 230 }, 0.5);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      for (let i = 0; i < specks; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * size * 0.9;
        const sx = cx + Math.cos(angle) * radius;
        const sy = cy + Math.sin(angle) * radius;
        const dot = (0.3 + Math.random() * 0.7) * (0.7 + intensity);
        ctx.fillStyle = rgba(pale, 0.06 * intensity * inkFlow);
        ctx.beginPath();
        ctx.arc(sx, sy, dot, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const addWaterHalo = (ctx, cx, cy, size, baseRgb, intensity) => {
      const layers = 3 + Math.round(intensity * 3);
      const haloRgb = mixColor(baseRgb, paperRgb, 0.55 + waterRatio * 0.35);
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      for (let i = 0; i < layers; i += 1) {
        const radius = size * (0.9 + i * 0.35 + Math.random() * 0.25);
        const driftX = (Math.random() - 0.5) * size * 0.2;
        const driftY = (Math.random() - 0.5) * size * 0.2;
        const grad = ctx.createRadialGradient(cx + driftX, cy + driftY, radius * 0.2, cx + driftX, cy + driftY, radius);
        grad.addColorStop(0, rgba(haloRgb, 0));
        grad.addColorStop(0.5, rgba(haloRgb, 0.025 * intensity * (0.6 + waterRatio)));
        grad.addColorStop(0.85, rgba(haloRgb, 0.05 * intensity * (0.6 + waterRatio)));
        grad.addColorStop(1, rgba(haloRgb, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(cx + driftX, cy + driftY, radius * 1.1, radius * 0.85, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawScaleStamp = (ctx, cx, cy, size, angle, color, alpha) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = rgba(color, alpha);
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.75);
      ctx.quadraticCurveTo(size * 0.9, -size * 0.1, 0, size * 0.9);
      ctx.quadraticCurveTo(-size * 0.9, -size * 0.1, 0, -size * 0.75);
      ctx.fill();
      ctx.restore();
    };

    const drawSpark = (ctx, cx, cy, length, angle, color, alpha, width = 0.7) => {
      ctx.save();
      ctx.strokeStyle = rgba(color, alpha);
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * length, cy + Math.sin(angle) * length);
      ctx.stroke();
      ctx.restore();
    };

    const drawSpectralBrush = (ctx, x1, y1, x2, y2, drive = { bands, energy: audioEnergy, force: false }) => {
      const localBands = drive.bands || bands;
      const localEnergy = drive.energy || audioEnergy;
      const totalVol = localBands.low + localBands.mid + localBands.high + localEnergy.rms;
      if (!drive.force && totalVol < SILENCE_THRESHOLD) return;

      const dist = Math.hypot(x2 - x1, y2 - y1);
      const steps = Math.max(1, Math.floor(dist));
      const speed = clamp(dist / 10, 0, 1);
      const pressure = 1.0 - speed * 0.6;
      const whisper = localEnergy.rms < 0.18;
      const brush = activeBrush;
      const baseRgb = hexToRgb(activeInk.value);
      const deepRgb = mixColor(baseRgb, { r: 0, g: 0, b: 0 }, 0.2 + inkFlow * 0.12);
      const mistRgb = mixColor(baseRgb, paperRgb, 0.65 + waterRatio * 0.2);
      const wateriness = clamp(0.25 + localBands.low * 0.9 + localEnergy.rms * 0.6 + waterRatio * 0.8, 0, 2);
      const dryness = clamp(0.95 - wateriness + localBands.high * 0.35 + inkFlow * 0.2, 0.1, 1.2);
      const fineDetail = clamp(localBands.high * 0.8 + localEnergy.peak * 0.6, 0, 1.2);

      ctx.save();
      ctx.globalCompositeOperation = "multiply";

      let dx = x2 - x1;
      let dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      let nx = 0;
      let ny = 0;
      let dirX = 0;
      let dirY = 0;
      if (len > 0) {
        nx = -dy / len;
        ny = dx / len;
        dirX = dx / len;
        dirY = dy / len;
      }

      const sizeResponse = clamp(0.25 + brushSizeScale * 0.85, 0.25, 1.15);
      const audioBoost = clamp(0.35 + localEnergy.rms * 0.9 + localEnergy.peak * 0.6, 0.35, 1.6);
      const bandBoost = clamp((localBands.low + localBands.mid + localBands.high) / 1.2, 0, 1);
      const jitterBase = (1.5 + localBands.high * 6 + localEnergy.rms * 5) * brush.jitter * audioBoost * (0.6 + sizeResponse * 0.4);

      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        let cx = x1 + (x2 - x1) * t;
        let cy = y1 + (y2 - y1) * t;

        cx += (Math.random() - 0.5) * jitterBase;
        cy += (Math.random() - 0.5) * jitterBase;

        if (Math.random() < 0.12 * wateriness && len > 0) {
          addWetTrace(ctx, cx, cy, 6 + brush.baseSize * 0.6, baseRgb, wateriness, dirX, dirY);
        }

        if (Math.random() < 0.2 * (0.4 + waterRatio)) {
          addWaterHalo(ctx, cx, cy, 10 + brush.baseSize * 1.2, baseRgb, 0.4 + wateriness * 0.4);
        }

        if (Math.random() < 0.1 * dryness) {
          addDryEdge(ctx, cx, cy, 6 + brush.baseSize * 0.8, deepRgb, dryness);
        }

        if (Math.random() < 0.18 * (0.4 + fineDetail)) {
          addGranulation(ctx, cx, cy, 6 + brush.baseSize, baseRgb, 0.4 + fineDetail);
        }

        if (brush.style === "mist") {
          const washSize = (brush.baseSize * brushSizeScale * 1.8 + localBands.low * 18) * pressure * sizeResponse;
          ctx.fillStyle = rgba(mistRgb, 0.05 * brush.flow * inkFlow);
          ctx.beginPath();
          ctx.ellipse(cx, cy, washSize, washSize * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();

          if (Math.random() < 0.15 + bandBoost * 0.4) {
            addStain(ctx, cx, cy, washSize * (0.8 + bandBoost), baseRgb, 0.4 + bandBoost * 0.5);
            if (Math.random() < 0.4) {
              addDryEdge(ctx, cx, cy, washSize * 0.9, deepRgb, 0.6 + bandBoost);
            }
          }
          if (Math.random() < 0.4) {
            addWaterHalo(ctx, cx, cy, washSize * 0.9, baseRgb, 0.5 + wateriness * 0.35);
          }
        }

        if (brush.style === "alcohol") {
          const washSize = (brush.baseSize * brushSizeScale * 1.7 + localBands.low * 20) * pressure * sizeResponse;
          const dilution = clamp(0.08 + localEnergy.rms * 0.18, 0.04, 0.22);
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = `rgba(0, 0, 0, ${dilution})`;
          ctx.beginPath();
          ctx.ellipse(cx, cy, washSize, washSize * 0.65, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          ctx.save();
          ctx.globalCompositeOperation = "screen";
          const haloGradient = ctx.createRadialGradient(cx, cy, washSize * 0.15, cx, cy, washSize * 0.95);
          const coolTone = mixColor(baseRgb, { r: 140, g: 200, b: 255 }, 0.35);
          haloGradient.addColorStop(0, rgba({ r: 255, g: 255, b: 255 }, 0.05));
          haloGradient.addColorStop(0.5, rgba(coolTone, 0.06 + localEnergy.rms * 0.12));
          haloGradient.addColorStop(1, rgba(baseRgb, 0));
          ctx.fillStyle = haloGradient;
          ctx.beginPath();
          ctx.ellipse(cx, cy, washSize * 1.1, washSize * 0.75, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (Math.random() < 0.25) {
            addWetTrace(ctx, cx, cy, washSize * 0.65, baseRgb, 0.45 + wateriness * 0.4, dirX, dirY);
          }
        }

        if (brush.style === "rake") {
          const rakeWidth = (brush.baseSize * brushSizeScale * 1.1 + localBands.mid * 8) * pressure * sizeResponse;
          const bristles = Math.max(8, Math.round(brush.bristles + localBands.high * 12));
          const alphaBase = (0.06 + localBands.mid * 0.6 + localEnergy.rms * 0.4) * brush.flow * inkFlow;

          for (let b = 0; b < bristles; b += 1) {
            if (Math.random() < brush.grain * 0.2) continue;
            const spread = (Math.random() - 0.5) * rakeWidth * brush.spread * 2;
            const mx = cx + nx * spread;
            const my = cy + ny * spread;
            const length = (3 + Math.random() * 8 + localBands.low * 12) * sizeResponse;
            const width = (0.4 + Math.random() * 0.6) * sizeResponse;
            ctx.strokeStyle = rgba(deepRgb, alphaBase * (0.6 + Math.random() * 0.5));
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(mx, my);
            ctx.lineTo(mx + dirX * length, my + dirY * length);
            ctx.stroke();
          }
          if (Math.random() < 0.2 + fineDetail * 0.2) {
            addGranulation(ctx, cx, cy, rakeWidth * 0.6, baseRgb, 0.35 + fineDetail);
          }
        }

        if (brush.style === "scales") {
          const layers = 1 + Math.floor(localBands.low * 3);
          const baseSize = (brush.baseSize * brushSizeScale * 0.55 + localBands.low * 8) * pressure * sizeResponse;
          for (let s = 0; s < layers; s += 1) {
            const offset = (Math.random() - 0.5) * brush.spread * 10 * sizeResponse;
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.4;
            drawScaleStamp(
              ctx,
              cx + nx * offset,
              cy + ny * offset,
              baseSize * (0.7 + Math.random() * 0.6),
              angle,
              deepRgb,
              (0.12 + localBands.low * 0.6 + localEnergy.rms * 0.2) * brush.flow * inkFlow
            );
          }
          if (Math.random() < 0.2 * dryness) {
            addDryEdge(ctx, cx, cy, baseSize * 1.2, deepRgb, 0.6 + dryness);
          }
        }

        if (brush.style === "filament") {
          const filamentCount = 18 + Math.floor(localBands.high * 16);
          const baseRadius = (brush.baseSize * brushSizeScale * 0.9 + localBands.low * 8) * (0.6 + bandBoost * 0.4);
          const radialJitter = 1.2 + localBands.high * 4 + localEnergy.rms * 2;
          const filamentLength = 2.5 + localBands.high * 6 + localEnergy.peak * 3;
          const angleSeed = Math.random() * Math.PI * 2;
          ctx.save();
          ctx.strokeStyle = rgba(deepRgb, (0.12 + localEnergy.rms * 0.25) * brush.flow * inkFlow);
          ctx.lineWidth = 0.25 * sizeResponse;
          ctx.beginPath();
          for (let f = 0; f < filamentCount; f += 1) {
            const angle = angleSeed + (f / filamentCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
            const radius = baseRadius + Math.sin(angle * 2) * radialJitter + (Math.random() - 0.5) * radialJitter;
            const ax = cx + Math.cos(angle) * radius;
            const ay = cy + Math.sin(angle) * radius;
            const bx = cx + Math.cos(angle) * (radius + filamentLength);
            const by = cy + Math.sin(angle) * (radius + filamentLength);
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
          }
          ctx.stroke();

          const splashes = Math.random() < 0.5 ? 2 : 5;
          for (let s = 0; s < splashes; s += 1) {
            const scatter = (3 + localEnergy.peak * 6) * brush.spread;
            const hx = cx + (Math.random() - 0.5) * scatter;
            const hy = cy + (Math.random() - 0.5) * scatter;
            const size = (0.35 + Math.random() * 0.5) * sizeResponse;
            ctx.fillStyle = rgba(baseRgb, (0.2 + localEnergy.peak * 0.32) * inkFlow);
            ctx.beginPath();
            ctx.arc(hx, hy, size, 0, Math.PI * 2);
            ctx.fill();
          }
          if (Math.random() < 0.25) {
            addWetTrace(ctx, cx, cy, baseRadius * 0.7, baseRgb, 0.35 + wateriness, dirX, dirY);
          }
          ctx.restore();
        }

        if (whisper && brush.style !== "mist") {
          const hazeSize = (brush.baseSize * brushSizeScale * 0.7 + localBands.low * 6) * pressure * sizeResponse;
          ctx.fillStyle = rgba(mistRgb, 0.03 * brush.flow * inkFlow);
          ctx.beginPath();
          ctx.ellipse(cx, cy, hazeSize, hazeSize * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }

        const splashIntensity = Math.max(localBands.high, localEnergy.peak);
        if (splashIntensity > 0.08) {
          if (Math.random() < 0.25 + splashIntensity * 0.6) {
            const scatter = (6 + splashIntensity * 24) * brush.spread;
            const hx = cx + (Math.random() - 0.5) * scatter;
            const hy = cy + (Math.random() - 0.5) * scatter;
            const size = (0.4 + Math.random() * (1 + splashIntensity)) * sizeResponse;
            const alpha = 0.32 * splashIntensity * (whisper ? 0.5 : 1) * inkFlow;
            const splashRgb = mixColor(baseRgb, paperRgb, 0.3 + waterRatio * 0.35);
            ctx.fillStyle = rgba(splashRgb, alpha);
            ctx.beginPath();
            ctx.arc(hx, hy, size, 0, Math.PI * 2);
            ctx.fill();
          }

          if (Math.random() < 0.12 * splashIntensity) {
            const len = 8 + 12 * splashIntensity;
            const ang = Math.random() * Math.PI * 2;
            drawSpark(ctx, cx, cy, len, ang, mistRgb, 0.18 * splashIntensity * inkFlow, 0.5);
          }

          if (localEnergy.peak > 0.18 && Math.random() < 0.5) {
            addSplatter(ctx, cx, cy, localEnergy.peak, baseRgb);
            addStain(ctx, cx, cy, 14 + localEnergy.peak * 26, baseRgb, localEnergy.peak);
          }
        }
      }

      ctx.restore();
    };

    const updateCycleStatus = () => {
      statusText.innerText = "Prêt à écouter";
    };

    const setupBrushSizeControls = () => {
      const sizeRange = document.getElementById("size-range");
      const sizeValue = document.getElementById("size-value");
      const updateSizing = (value) => {
        const numeric = parseFloat(value);
        const normalized = clamp(numeric, 0, 3);
        brushSizeScale = normalized === 0 ? MIN_BRUSH_SCALE : normalized;
        sizeValue.textContent = `${Math.round(normalized * 100)}%`;
      };
      const onInput = (event) => updateSizing(event.target.value);
      sizeRange.addEventListener("input", onInput);
      sizeRange.addEventListener("change", onInput);
      updateSizing(sizeRange.value);
      return () => {
        sizeRange.removeEventListener("input", onInput);
        sizeRange.removeEventListener("change", onInput);
      };
    };
    const setupDilutionControls = () => {
      const dilutionRange = document.getElementById("dilution-range");
      const dilutionValue = document.getElementById("dilution-value");
      const updateDilution = (value) => {
        const numeric = clamp(parseFloat(value), 0, 100);
        const inkRatio = numeric / 100;
        waterRatio = 1 - inkRatio;
        inkFlow = 0.2 + inkRatio * 0.75;
        dilutionValue.textContent = `Encre ${Math.round(inkRatio * 100)} / Eau ${Math.round(waterRatio * 100)}`;
      };
      const onInput = (event) => updateDilution(event.target.value);
      dilutionRange.addEventListener("input", onInput);
      dilutionRange.addEventListener("change", onInput);
      updateDilution(dilutionRange.value);
      return () => {
        dilutionRange.removeEventListener("input", onInput);
        dilutionRange.removeEventListener("change", onInput);
      };
    };

    const setupControls = () => {
      const brushContainer = document.getElementById("brush-options");
      const colorContainer = document.getElementById("color-options");
      brushContainer.innerHTML = "";
      colorContainer.innerHTML = "";

      brushes.forEach((brush, index) => {
        const btn = document.createElement("button");
        btn.className = "chip-btn";
        btn.textContent = brush.name;
        btn.dataset.brushId = brush.id;
        if (index === 0) btn.classList.add("active");
        btn.addEventListener("click", () => {
          activeBrush = brush;
          [...brushContainer.querySelectorAll(".chip-btn")].forEach((el) => el.classList.remove("active"));
          btn.classList.add("active");
        });
        brushContainer.appendChild(btn);
      });

      inkPalette.forEach((ink, index) => {
        const chip = document.createElement("button");
        chip.className = "color-chip";
        chip.style.background = ink.value;
        chip.title = ink.name;
        chip.dataset.inkId = ink.id;
        if (index === 0) chip.classList.add("active");
        chip.addEventListener("click", () => {
          activeInk = ink;
          [...colorContainer.querySelectorAll(".color-chip")].forEach((el) => el.classList.remove("active"));
          chip.classList.add("active");
        });
        colorContainer.appendChild(chip);
      });

    };

    const setupLayeringControl = () => {
      const updateLayering = (checked) => {
        allowLayering = checked;
        layeringValue.textContent = checked ? "Superposer" : "Nettoyer";
      };
      const onToggle = (event) => updateLayering(event.target.checked);
      layeringToggle.addEventListener("change", onToggle);
      updateLayering(layeringToggle.checked);
      return () => {
        layeringToggle.removeEventListener("change", onToggle);
      };
    };

    const setupRecorder = () => {
      try {
        const canvasStream = paper.captureStream(30);
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...mediaStream.getAudioTracks()
        ]);

        const options = { mimeType: "video/webm;codecs=vp9" };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = "video/webm";
          if (!MediaRecorder.isTypeSupported(options.mimeType)) options.mimeType = "";
        }

        mediaRecorder = new MediaRecorder(combinedStream, options);

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordedChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
          recordedChunks = [];
        };
      } catch (error) {
        console.error("Erreur recorder", error);
      }
    };

    const startAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStream = stream;
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.3;
        audioCtx.createMediaStreamSource(stream).connect(analyser);
        data = new Uint8Array(analyser.frequencyBinCount);
        timeData = new Uint8Array(analyser.fftSize);

        setupRecorder();

        document.getElementById("boot-screen").classList.add("hidden");
        loop();
        requestAnimationFrame(audioLoop);
      } catch (error) {
        console.error(error);
        alert("Micro requis.");
      }
    };

    const audioLoop = () => {
      if (!analyser) return requestAnimationFrame(audioLoop);
      analyser.getByteFrequencyData(data);
      analyser.getByteTimeDomainData(timeData);

      const binCount = data.length;
      const lowLimit = Math.floor(binCount * 0.08);
      const midLimit = Math.floor(binCount * 0.45);

      let l = 0;
      let m = 0;
      let h = 0;

      for (let i = 0; i < binCount; i += 1) {
        const v = data[i] / 255;
        if (i < lowLimit) l += v;
        else if (i < midLimit) m += v;
        else h += v;
      }

      const rawL = (l / lowLimit) * 2.8;
      const rawM = (m / (midLimit - lowLimit)) * 3.2;
      const rawH = (h / (binCount - midLimit)) * 6.2;

      bands.low += (clamp(rawL, 0, 1) - bands.low) * 0.25;
      bands.mid += (clamp(rawM, 0, 1) - bands.mid) * 0.25;
      bands.high += (clamp(rawH, 0, 1) - bands.high) * 0.2;

      let sum = 0;
      for (let i = 0; i < timeData.length; i += 1) {
        const v = (timeData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / timeData.length);
      const normalized = clamp((rms - 0.015) / 0.23, 0, 1);
      audioEnergy.rms += (normalized - audioEnergy.rms) * 0.3;

      const now = performance.now();
      if (normalized > 0.25 && now - lastPeakTime > 120) {
        audioEnergy.peak = 1;
        lastPeakTime = now;
      }
      audioEnergy.peak = Math.max(0, audioEnergy.peak - 0.12);

      if (phase === "DRAWING") {
        document.getElementById("spec-low").style.transform = `scaleY(${bands.low})`;
        document.getElementById("spec-mid").style.transform = `scaleY(${bands.mid})`;
        document.getElementById("spec-high").style.transform = `scaleY(${bands.high})`;
      }

      return requestAnimationFrame(audioLoop);
    };

    const resetVoiceState = () => {
      voiceState.x = paper.width * (0.35 + Math.random() * 0.3);
      voiceState.y = paper.height * (0.35 + Math.random() * 0.3);
      voiceState.angle = Math.random() * Math.PI * 2;
      voiceState.velocity = 0;
      lastFrameTime = performance.now();
      touchState.strength = 0;
      touchState.active = false;
      touchState.swipePower = 0;
      activePointerId = null;
    };

    const cleanupCycleAssets = (cycle) => {
      if (!cycle) return;
      if (cycle.preview.avURL) URL.revokeObjectURL(cycle.preview.avURL);
      if (cycle.preview.imageURL) URL.revokeObjectURL(cycle.preview.imageURL);
      if (cycle.snapshot?.close) cycle.snapshot.close();
    };

    const pushCycle = (cycle) => {
      updateCycles((prev) => {
        const next = [...prev, cycle];
        if (next.length > MAX_CYCLES) {
          const removed = next.shift();
          cleanupCycleAssets(removed);
        }
        cyclesRef.current = next;
        return next;
      });
    };

    const updateCycleSelection = (id, selected) => {
      updateCycles((prev) => {
        const next = prev.map((cycle) => (cycle.id === id ? { ...cycle, selected } : cycle));
        cyclesRef.current = next;
        return next;
      });
    };

    const deleteCycle = (id) => {
      updateCycles((prev) => {
        const next = prev.filter((cycle) => {
          if (cycle.id === id) cleanupCycleAssets(cycle);
          return cycle.id !== id;
        });
        cyclesRef.current = next;
        return next;
      });
    };

    const clearGallery = () => {
      updateCycles((prev) => {
        prev.forEach((cycle) => cleanupCycleAssets(cycle));
        cyclesRef.current = [];
        return [];
      });
    };

    const drawSnapshot = (ctx, canvas, snapshot, progress, seed = 0) => {
      ctx.fillStyle = "#f4f1ea";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!snapshot) return;
      const sway = Math.sin(progress * Math.PI * 2 + seed * 6) * 0.015;
      const driftX = Math.cos(progress * Math.PI * 2 + seed * 4) * canvas.width * 0.01;
      const driftY = Math.sin(progress * Math.PI * 2 + seed * 5) * canvas.height * 0.01;
      const scale = 1 + sway;
      const drawWidth = canvas.width * scale;
      const drawHeight = canvas.height * scale;
      const dx = (canvas.width - drawWidth) / 2 + driftX;
      const dy = (canvas.height - drawHeight) / 2 + driftY;
      ctx.drawImage(snapshot, dx, dy, drawWidth, drawHeight);
    };

    const replayCycle = (canvas, ctx, cycle, { durationMs = 2400, speed = 1.5 } = {}) => new Promise((resolve) => {
      const start = performance.now();
      const run = (now) => {
        const elapsed = (now - start) * speed;
        const progress = clamp(elapsed / durationMs, 0, 1);
        drawSnapshot(ctx, canvas, cycle.snapshot, progress, cycle.seed);
        if (progress < 1) {
          requestAnimationFrame(run);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(run);
    });

    const createPreviewImage = (cycle) => new Promise((resolve) => {
      drawSnapshot(previewCtx, previewCanvas, cycle.snapshot, 1, cycle.seed);
      previewCanvas.toBlob((blob) => {
        if (!blob) {
          resolve();
          return;
        }
        cycle.preview.imageURL = URL.createObjectURL(blob);
        resolve();
      }, "image/png", 0.6);
    });

    const connectAudioForPreview = (destination, durationMs, seed) => {
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const wobble = audioCtx.createOscillator();
      const wobbleGain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = 160 + seed * 220;
      wobble.type = "triangle";
      wobble.frequency.value = 0.6 + seed * 2;
      wobbleGain.gain.value = 12;
      wobble.connect(wobbleGain).connect(osc.frequency);
      gain.gain.value = 0;
      osc.connect(gain).connect(destination);
      const now = audioCtx.currentTime;
      const durationSec = durationMs / 1000;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
      osc.start(now);
      wobble.start(now);
      osc.stop(now + durationSec + 0.05);
      wobble.stop(now + durationSec + 0.05);
      return () => {
        osc.disconnect();
        wobble.disconnect();
        gain.disconnect();
      };
    };

    const recordPreviewAV = async (cycle) => {
      const durationMs = clamp(cycle.duration * 1000 * 0.25, 2000, 4000);
      const videoStream = previewCanvas.captureStream(PREVIEW_FPS);
      const audioDestination = audioCtx.createMediaStreamDestination();
      const stopAudio = connectAudioForPreview(audioDestination, durationMs, cycle.seed);
      const mergedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks()
      ]);
      const recorder = new MediaRecorder(mergedStream, { mimeType: "video/webm" });
      const chunks = [];
      return new Promise((resolve) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => {
          stopAudio();
          const blob = new Blob(chunks, { type: "video/webm" });
          cycle.preview.avURL = URL.createObjectURL(blob);
          resolve();
        };
        recorder.start();
        replayCycle(previewCanvas, previewCtx, cycle, { durationMs, speed: 1.5 }).then(() => recorder.stop());
      });
    };

    const registerCycle = async () => {
      if (previewBusy) return;
      previewBusy = true;
      try {
        cycleIndex += 1;
        const snapshot = await createImageBitmap(paper);
        const durationSeconds = Math.max(1, (timeLimit - remainingTime) / 1000);
        const cycle = {
          id: `${Date.now()}_${cycleIndex}`,
          duration: durationSeconds,
          seed: Math.random(),
          guide: { x: touchState.x, y: touchState.y },
          audioData: {
            bands: { ...bands },
            energy: { ...audioEnergy }
          },
          snapshot,
          preview: {
            avURL: "",
            imageURL: ""
          },
          selected: false
        };
        await createPreviewImage(cycle);
        await recordPreviewAV(cycle);
        pushCycle(cycle);
      } finally {
        previewBusy = false;
      }
    };

    const downloadBlob = (blob, filename) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    const exportImageHD = async (cycle) => {
      drawSnapshot(exportCtx, exportCanvas, cycle.snapshot, 1, cycle.seed);
      return new Promise((resolve) => {
        exportCanvas.toBlob((blob) => {
          if (!blob) return resolve();
          downloadBlob(blob, `cycle_${cycle.id}.png`);
          resolve();
        }, "image/png");
      });
    };

    const exportGlobalImage = async (selectedCycles) => {
      exportCtx.fillStyle = "#f4f1ea";
      exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      selectedCycles.forEach((cycle) => {
        exportCtx.drawImage(cycle.snapshot, 0, 0, exportCanvas.width, exportCanvas.height);
      });
      return new Promise((resolve) => {
        exportCanvas.toBlob((blob) => {
          if (!blob) return resolve();
          downloadBlob(blob, "global.png");
          resolve();
        }, "image/png");
      });
    };

    const recordAV = async (cycle, { filename, durationMs }) => {
      const videoStream = exportCanvas.captureStream(30);
      const audioDestination = audioCtx.createMediaStreamDestination();
      const stopAudio = connectAudioForPreview(audioDestination, durationMs, cycle.seed);
      const mergedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks()
      ]);
      const recorder = new MediaRecorder(mergedStream, { mimeType: "video/webm" });
      const chunks = [];
      return new Promise((resolve) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = () => {
          stopAudio();
          const blob = new Blob(chunks, { type: "video/webm" });
          downloadBlob(blob, filename);
          resolve();
        };
        recorder.start();
        replayCycle(exportCanvas, exportCtx, cycle, { durationMs, speed: 1 }).then(() => recorder.stop());
      });
    };

    const exportCycleAV = async (cycle) => {
      const durationMs = cycle.duration * 1000;
      await recordAV(cycle, { filename: `cycle_${cycle.id}.webm`, durationMs });
    };

    const exportGroupedAV = async (selectedCycles) => {
      if (!selectedCycles.length) return;
      const durationMs = selectedCycles.reduce((sum, cycle) => sum + cycle.duration * 1000, 0);
      const videoStream = exportCanvas.captureStream(30);
      const audioDestination = audioCtx.createMediaStreamDestination();
      const stopAudio = connectAudioForPreview(audioDestination, durationMs, selectedCycles[0].seed);
      const mergedStream = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...audioDestination.stream.getAudioTracks()
      ]);
      const recorder = new MediaRecorder(mergedStream, { mimeType: "video/webm" });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const run = async () => {
        for (const cycle of selectedCycles) {
          await replayCycle(exportCanvas, exportCtx, cycle, { durationMs: cycle.duration * 1000, speed: 1 });
        }
      };
      await new Promise((resolve) => {
        recorder.onstop = () => {
          stopAudio();
          const blob = new Blob(chunks, { type: "video/webm" });
          downloadBlob(blob, "cycles_groupes.webm");
          resolve();
        };
        recorder.start();
        run().then(() => recorder.stop());
      });
    };

    const createGifPalette = () => {
      const palette = [];
      for (let r = 0; r < 8; r += 1) {
        for (let g = 0; g < 8; g += 1) {
          for (let b = 0; b < 4; b += 1) {
            palette.push(
              Math.round((r / 7) * 255),
              Math.round((g / 7) * 255),
              Math.round((b / 3) * 255)
            );
          }
        }
      }
      return palette;
    };

    const quantizePixel = (r, g, b) => {
      const ri = Math.round((r / 255) * 7);
      const gi = Math.round((g / 255) * 7);
      const bi = Math.round((b / 255) * 3);
      return (ri << 5) | (gi << 2) | bi;
    };

    const lzwEncode = (indices, minCodeSize) => {
      const clearCode = 1 << minCodeSize;
      const endCode = clearCode + 1;
      let codeSize = minCodeSize + 1;
      let nextCode = endCode + 1;
      const dict = new Map();
      for (let i = 0; i < clearCode; i += 1) dict.set(`${i}`, i);
      const output = [];
      let cur = 0;
      let bits = 0;

      const emit = (code) => {
        cur |= code << bits;
        bits += codeSize;
        while (bits >= 8) {
          output.push(cur & 255);
          cur >>= 8;
          bits -= 8;
        }
      };

      emit(clearCode);
      let prefix = `${indices[0]}`;
      for (let i = 1; i < indices.length; i += 1) {
        const k = indices[i];
        const key = `${prefix},${k}`;
        if (dict.has(key)) {
          prefix = key;
        } else {
          emit(dict.get(prefix));
          dict.set(key, nextCode);
          nextCode += 1;
          prefix = `${k}`;
          if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
          if (nextCode >= 4096) {
            emit(clearCode);
            dict.clear();
            for (let c = 0; c < clearCode; c += 1) dict.set(`${c}`, c);
            codeSize = minCodeSize + 1;
            nextCode = endCode + 1;
          }
        }
      }
      emit(dict.get(prefix));
      emit(endCode);
      if (bits > 0) output.push(cur & 255);
      return output;
    };

    const buildGif = (frames, width, height, delay, reverse) => {
      const bytes = [];
      const push = (...vals) => bytes.push(...vals);
      const write16 = (value) => push(value & 255, (value >> 8) & 255);
      const palette = createGifPalette();

      push(...[71, 73, 70, 56, 57, 97]); // GIF89a
      write16(width);
      write16(height);
      push(0b11110111);
      push(0);
      push(0);
      push(...palette);
      push(0x21, 0xff, 0x0b);
      push(...[78, 69, 84, 83, 67, 65, 80, 69, 50, 46, 48]);
      push(0x03, 0x01, 0x00, 0x00, 0x00);

      const orderedFrames = reverse ? frames.slice().reverse() : frames;
      orderedFrames.forEach((frame) => {
        push(0x21, 0xf9, 0x04, 0x00);
        write16(Math.round(delay / 10));
        push(0x00, 0x00);
        push(0x2c);
        write16(0);
        write16(0);
        write16(width);
        write16(height);
        push(0x00);
        push(0x08);
        const lzwData = lzwEncode(frame, 8);
        for (let i = 0; i < lzwData.length; i += 255) {
          const block = lzwData.slice(i, i + 255);
          push(block.length, ...block);
        }
        push(0x00);
      });
      push(0x3b);
      return new Blob([new Uint8Array(bytes)], { type: "image/gif" });
    };

    const exportStopMotionGIF = async (selectedCycles, reverse = false) => {
      if (!selectedCycles.length) return;
      const first = selectedCycles[0];
      const img = await fetch(first.preview.imageURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
      const gifCanvas = document.createElement("canvas");
      gifCanvas.width = img.width;
      gifCanvas.height = img.height;
      const gifCtx = gifCanvas.getContext("2d");
      const frames = [];
      const ordered = reverse ? selectedCycles.slice().reverse() : selectedCycles;
      for (const cycle of ordered) {
        const frameBitmap = await fetch(cycle.preview.imageURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
        gifCtx.fillStyle = "#f4f1ea";
        gifCtx.fillRect(0, 0, gifCanvas.width, gifCanvas.height);
        gifCtx.drawImage(frameBitmap, 0, 0, gifCanvas.width, gifCanvas.height);
        const imageData = gifCtx.getImageData(0, 0, gifCanvas.width, gifCanvas.height);
        const indices = new Uint8Array(imageData.width * imageData.height);
        for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
          indices[p] = quantizePixel(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
        }
        frames.push([...indices]);
        frameBitmap.close();
      }
      img.close();
      const gifBlob = buildGif(frames, gifCanvas.width, gifCanvas.height, 120, false);
      downloadBlob(gifBlob, reverse ? "stopmotion_reverse.gif" : "stopmotion.gif");
    };

    const crc32Table = (() => {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i += 1) {
        let c = i;
        for (let k = 0; k < 8; k += 1) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c >>> 0;
      }
      return table;
    })();

    const crc32 = (data) => {
      let crc = 0xffffffff;
      for (let i = 0; i < data.length; i += 1) {
        crc = crc32Table[(crc ^ data[i]) & 255] ^ (crc >>> 8);
      }
      return (crc ^ 0xffffffff) >>> 0;
    };

    const buildZip = async (files) => {
      const encoder = new TextEncoder();
      let offset = 0;
      const fileRecords = [];
      const chunks = [];

      for (const file of files) {
        const data = new Uint8Array(await file.blob.arrayBuffer());
        const nameBytes = encoder.encode(file.name);
        const header = new Uint8Array(30 + nameBytes.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x04034b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 0, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, 0, true);
        const crc = crc32(data);
        view.setUint32(14, crc, true);
        view.setUint32(18, data.length, true);
        view.setUint32(22, data.length, true);
        view.setUint16(26, nameBytes.length, true);
        view.setUint16(28, 0, true);
        header.set(nameBytes, 30);
        chunks.push(header, data);
        fileRecords.push({
          nameBytes,
          crc,
          size: data.length,
          offset
        });
        offset += header.length + data.length;
      }

      const centralChunks = [];
      let centralSize = 0;
      fileRecords.forEach((record) => {
        const header = new Uint8Array(46 + record.nameBytes.length);
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x02014b50, true);
        view.setUint16(4, 20, true);
        view.setUint16(6, 20, true);
        view.setUint16(8, 0, true);
        view.setUint16(10, 0, true);
        view.setUint16(12, 0, true);
        view.setUint16(14, 0, true);
        view.setUint32(16, record.crc, true);
        view.setUint32(20, record.size, true);
        view.setUint32(24, record.size, true);
        view.setUint16(28, record.nameBytes.length, true);
        view.setUint16(30, 0, true);
        view.setUint16(32, 0, true);
        view.setUint16(34, 0, true);
        view.setUint16(36, 0, true);
        view.setUint32(38, 0, true);
        view.setUint32(42, record.offset, true);
        header.set(record.nameBytes, 46);
        centralChunks.push(header);
        centralSize += header.length;
      });

      const end = new Uint8Array(22);
      const endView = new DataView(end.buffer);
      endView.setUint32(0, 0x06054b50, true);
      endView.setUint16(4, 0, true);
      endView.setUint16(6, 0, true);
      endView.setUint16(8, fileRecords.length, true);
      endView.setUint16(10, fileRecords.length, true);
      endView.setUint32(12, centralSize, true);
      endView.setUint32(16, offset, true);
      endView.setUint16(20, 0, true);

      return new Blob([...chunks, ...centralChunks, end], { type: "application/zip" });
    };

    const exportZipBundle = async (selectedCycles) => {
      if (!selectedCycles.length) return;
      const files = [];
      for (const cycle of selectedCycles) {
        drawSnapshot(exportCtx, exportCanvas, cycle.snapshot, 1, cycle.seed);
        const imageBlob = await new Promise((resolve) => exportCanvas.toBlob(resolve, "image/png"));
        if (imageBlob) {
          files.push({ name: `cycle_${cycle.id}/image.png`, blob: imageBlob });
        }
        const durationMs = cycle.duration * 1000;
        const videoStream = exportCanvas.captureStream(30);
        const audioDestination = audioCtx.createMediaStreamDestination();
        const stopAudio = connectAudioForPreview(audioDestination, durationMs, cycle.seed);
        const mergedStream = new MediaStream([
          ...videoStream.getVideoTracks(),
          ...audioDestination.stream.getAudioTracks()
        ]);
        const recorder = new MediaRecorder(mergedStream, { mimeType: "video/webm" });
        const chunks = [];
        await new Promise((resolve) => {
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunks.push(event.data);
          };
          recorder.onstop = () => {
            stopAudio();
            resolve();
          };
          recorder.start();
          replayCycle(exportCanvas, exportCtx, cycle, { durationMs, speed: 1 }).then(() => recorder.stop());
        });
        const videoBlob = new Blob(chunks, { type: "video/webm" });
        files.push({ name: `cycle_${cycle.id}/av.webm`, blob: videoBlob });
      }
      const globalBlob = await new Promise((resolve) => {
        exportCtx.fillStyle = "#f4f1ea";
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        selectedCycles.forEach((cycle) => {
          exportCtx.drawImage(cycle.snapshot, 0, 0, exportCanvas.width, exportCanvas.height);
        });
        exportCanvas.toBlob(resolve, "image/png");
      });
      if (globalBlob) files.push({ name: "global.png", blob: globalBlob });
      const gifBlob = await (async () => {
        if (!selectedCycles.length) return null;
        const first = selectedCycles[0];
        const img = await fetch(first.preview.imageURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
        const gifCanvas = document.createElement("canvas");
        gifCanvas.width = img.width;
        gifCanvas.height = img.height;
        const gifCtx = gifCanvas.getContext("2d");
        const frames = [];
        for (const cycle of selectedCycles) {
          const frameBitmap = await fetch(cycle.preview.imageURL).then((res) => res.blob()).then((blob) => createImageBitmap(blob));
          gifCtx.fillStyle = "#f4f1ea";
          gifCtx.fillRect(0, 0, gifCanvas.width, gifCanvas.height);
          gifCtx.drawImage(frameBitmap, 0, 0, gifCanvas.width, gifCanvas.height);
          const imageData = gifCtx.getImageData(0, 0, gifCanvas.width, gifCanvas.height);
          const indices = new Uint8Array(imageData.width * imageData.height);
          for (let i = 0, p = 0; i < imageData.data.length; i += 4, p += 1) {
            indices[p] = quantizePixel(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
          }
          frames.push([...indices]);
          frameBitmap.close();
        }
        img.close();
        return buildGif(frames, gifCanvas.width, gifCanvas.height, 120, false);
      })();
      if (gifBlob) files.push({ name: "stopmotion.gif", blob: gifBlob });
      const zipBlob = await buildZip(files);
      downloadBlob(zipBlob, "export_cycles.zip");
    };

    const paintFromVoice = (timestamp) => {
      const delta = Math.min(48, timestamp - lastFrameTime);
      lastFrameTime = timestamp;
      const energy = audioEnergy.rms;
      const burst = audioEnergy.peak;
      const loudness = clamp(energy + burst * 0.6, 0, 1.2);
      const targetVelocity = clamp(1.2 + loudness * 18 + bands.mid * 6, 1.2, 24);
      voiceState.velocity += (targetVelocity - voiceState.velocity) * 0.15;

      const turnAmount = (Math.random() - 0.5) * (0.18 + bands.high * 1.1 + loudness * 0.8);
      voiceState.angle += turnAmount;

      if (touchState.strength > 0) {
        const dxTouch = touchState.x - voiceState.x;
        const dyTouch = touchState.y - voiceState.y;
        const touchAngle = Math.atan2(dyTouch, dxTouch);
        const angleDiff = Math.atan2(Math.sin(touchAngle - voiceState.angle), Math.cos(touchAngle - voiceState.angle));
        const distance = Math.hypot(dxTouch, dyTouch);
        const pull = clamp(touchState.strength * (1 - clamp(distance / (paper.width * 0.7), 0, 1)), 0, 1);
        voiceState.angle += angleDiff * (0.06 + pull * 0.2);

        if (touchState.swipePower > 0) {
          const swipeDiff = Math.atan2(
            Math.sin(touchState.swipeAngle - voiceState.angle),
            Math.cos(touchState.swipeAngle - voiceState.angle)
          );
          voiceState.angle += swipeDiff * (0.05 + touchState.swipePower * 0.18) * touchState.strength;
        }

        if (!touchState.active) {
          touchState.strength = Math.max(0, touchState.strength - delta * 0.0014);
        }
        touchState.swipePower = Math.max(0, touchState.swipePower - delta * 0.002);
      }

      const dx = Math.cos(voiceState.angle) * voiceState.velocity * (delta / 16);
      const dy = Math.sin(voiceState.angle) * voiceState.velocity * (delta / 16);
      const nx = voiceState.x + dx;
      const ny = voiceState.y + dy;

      drawSpectralBrush(ctxP, voiceState.x, voiceState.y, nx, ny);

      voiceState.x = nx;
      voiceState.y = ny;

      const margin = 40 * CANVAS_SCALE;
      if (voiceState.x < margin) {
        voiceState.x = margin;
        voiceState.angle = Math.PI - voiceState.angle;
      } else if (voiceState.x > paper.width - margin) {
        voiceState.x = paper.width - margin;
        voiceState.angle = Math.PI - voiceState.angle;
      }

      if (voiceState.y < margin) {
        voiceState.y = margin;
        voiceState.angle = -voiceState.angle;
      } else if (voiceState.y > paper.height - margin) {
        voiceState.y = paper.height - margin;
        voiceState.angle = -voiceState.angle;
      }
    };

    const startDrawingCycle = () => {
      phase = "DRAWING";
      timeLimit = 10000;
      startTime = Date.now();
      remainingTime = timeLimit;
      resetVoiceState();

      if (mediaRecorder && mediaRecorder.state === "inactive") {
        mediaRecorder.start();
      } else if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
      }

      recDot.classList.add("active");
      mainBtn.style.display = "none";
      stopBtn.style.display = "inline-flex";
      if (audioMeter) audioMeter.classList.add("active");
      if (specViz) specViz.style.opacity = 1;
      statusText.innerText = "Voix en peinture...";

      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    };

    const startCycle = () => {
      if (!allowLayering) clearAll();
      startDrawingCycle();
    };

    const finishRitual = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      if (audioMeter) audioMeter.classList.remove("active");
      mainBtn.innerText = "Nouveau cycle";
      mainBtn.style.display = "block";
      stopBtn.style.display = "none";
      statusText.innerText = "Rituel Terminé";
      recDot.classList.remove("active");
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      void registerCycle();
    };

    const resetRitual = () => {
      phase = "READY";
      clearAll();
      recordedChunks = [];
      resetVoiceState();

      mainBtn.innerText = "Peindre";
      mainBtn.style.display = "block";
      stopBtn.style.display = "none";

      if (audioMeter) audioMeter.classList.remove("active");
      updateCycleStatus();
      recDot.classList.remove("active");
    };

    const loop = () => {
      if (phase === "DRAWING") {
        const elapsed = Date.now() - startTime;
        remainingTime = Math.max(0, timeLimit - elapsed);

        paintFromVoice(performance.now());

        if (remainingTime <= 0) {
          phase = "FINISHED";
          finishRitual();
        }
      }
      requestAnimationFrame(loop);
    };

    const onInitClick = () => {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission().then(() => startAudio()).catch(() => startAudio());
      } else {
        startAudio();
      }
    };

    const initBtn = document.getElementById("init-btn");
    const resetBtn = document.getElementById("reset-btn");
    const stopBtn = document.getElementById("stop-btn");
    const onMainClick = () => {
      if (phase === "READY" || phase === "FINISHED") startCycle();
    };

    const onStop = () => {
      if (phase === "DRAWING") {
        phase = "FINISHED";
        finishRitual();
      }
    };

    const updateTouchPoint = (event) => {
      if (!canvasWrap) return;
      if (event.target.closest(".action-area")) return;
      const rect = canvasWrap.getBoundingClientRect();
      const scaleX = rect.width > 0 ? paper.width / rect.width : 1;
      const scaleY = rect.height > 0 ? paper.height / rect.height : 1;
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);
      touchState.x = x * scaleX;
      touchState.y = y * scaleY;
    };

    const onCanvasTap = (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      updateTouchPoint(event);
      touchState.lastX = touchState.x;
      touchState.lastY = touchState.y;
      touchState.strength = 1;
      touchState.active = true;
      touchState.swipePower = 0;
      activePointerId = event.pointerId;
      canvasWrap.setPointerCapture?.(event.pointerId);
    };

    const onCanvasMove = (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId) return;
      updateTouchPoint(event);
      const dx = touchState.x - touchState.lastX;
      const dy = touchState.y - touchState.lastY;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        touchState.swipeAngle = Math.atan2(dy, dx);
        touchState.swipePower = clamp(touchState.swipePower + dist * 0.02, 0, 1);
        touchState.lastX = touchState.x;
        touchState.lastY = touchState.y;
      }
      touchState.strength = 1;
    };

    const onCanvasRelease = (event) => {
      if (activePointerId === null || event.pointerId !== activePointerId) return;
      touchState.active = false;
      activePointerId = null;
      canvasWrap.releasePointerCapture?.(event.pointerId);
    };

    initBtn.addEventListener("click", onInitClick);
    resetBtn.addEventListener("click", resetRitual);
    mainBtn.addEventListener("click", onMainClick);
    stopBtn.addEventListener("click", onStop);
    canvasWrap.addEventListener("pointerdown", onCanvasTap);
    canvasWrap.addEventListener("pointermove", onCanvasMove);
    canvasWrap.addEventListener("pointerup", onCanvasRelease);
    canvasWrap.addEventListener("pointercancel", onCanvasRelease);
    const cleanupSize = setupBrushSizeControls();
    const cleanupOpacity = setupDilutionControls();
    const cleanupLayering = setupLayeringControl();
    setupControls();
    resizeCanvas();
    updateCycleStatus();
    resetVoiceState();

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);
    window.addEventListener("resize", resizeCanvas);

    galleryActionsRef.current = {
      updateCycleSelection,
      deleteCycle,
      clearGallery,
      exportImageHD,
      exportCycleAV,
      exportGlobalImage,
      exportGroupedAV,
      exportStopMotionGIF,
      exportZipBundle
    };

    return () => {
      cleanupSize();
      cleanupOpacity();
      cleanupLayering();
      initBtn.removeEventListener("click", onInitClick);
      resetBtn.removeEventListener("click", resetRitual);
      mainBtn.removeEventListener("click", onMainClick);
      stopBtn.removeEventListener("click", onStop);
      canvasWrap.removeEventListener("pointerdown", onCanvasTap);
      canvasWrap.removeEventListener("pointermove", onCanvasMove);
      canvasWrap.removeEventListener("pointerup", onCanvasRelease);
      canvasWrap.removeEventListener("pointercancel", onCanvasRelease);
      window.removeEventListener("resize", resizeCanvas);
      if (resizeObserver) resizeObserver.disconnect();
      cyclesRef.current.forEach((cycle) => cleanupCycleAssets(cycle));
    };
  }, [updateCycles]);

  const selectedCycles = cycles.filter((cycle) => cycle.selected);
  const handlePlayPreview = (cycleId) => {
    setPlayingId((prev) => (prev === cycleId ? null : cycleId));
  };

  const toggleMenuSection = (section) => {
    setMenuSections((prev) => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  useEffect(() => {
    if (!playingId) return;
    const video = videoRefs.current[playingId];
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  }, [playingId]);

  return (
    <div className="app">
      <svg className="filter-defs" aria-hidden="true">
        <filter id="ink-sharpen">
          <feConvolveMatrix order="3" kernelMatrix="0 -1 0 -1 5 -1 0 -1 0" />
        </filter>
      </svg>
      <div id="boot-screen" className="overlay">
        <h1>LA VOIX DU SHODO</h1>
        <p className="boot-subtitle">RITUEL VOCAL</p>
        <button id="init-btn">Activer le Micro</button>
      </div>

      <div className="canvas-area" ref={canvasWrapRef}>
        <canvas id="paper-layer" ref={canvasRef}></canvas>
        <div className="paper-texture"></div>
        <div id="ui-layer" className="ui-layer">
          <div className="shodo-indicator" aria-hidden="true"></div>
          <div className="top-ui">
            <div id="status-msg">
              <div id="rec-dot"></div>
              <span id="status-text">Prêt à écouter</span>
            </div>
            <div id="audio-meter" className="audio-meter">
              <div id="spectrum-viz">
                <div id="spec-low" className="spec-bar"></div>
                <div id="spec-mid" className="spec-bar"></div>
                <div id="spec-high" className="spec-bar"></div>
              </div>
            </div>
          </div>

          <div className="action-area">
            <button id="main-btn" className="main-btn">Peindre</button>
            <button id="stop-btn" className="main-btn secondary">Stop</button>
            <div className="action-controls">
              <button id="reset-btn" className="chip-btn" type="button">Reset</button>
            </div>
          </div>
        </div>

      </div>

      <div className="tools-area">
        <div className="accordion">
          <section className={`accordion-item ${menuSections.brushes ? "open" : ""}`}>
            <button
              className="accordion-trigger"
              type="button"
              onClick={() => toggleMenuSection("brushes")}
            >
              Pinceaux
              <span className="accordion-indicator">{menuSections.brushes ? "−" : "+"}</span>
            </button>
            <div className="accordion-panel">
              <div id="brush-options" className="option-row compact"></div>
            </div>
          </section>

          <section className={`accordion-item ${menuSections.inks ? "open" : ""}`}>
            <button
              className="accordion-trigger"
              type="button"
              onClick={() => toggleMenuSection("inks")}
            >
              Encres
              <span className="accordion-indicator">{menuSections.inks ? "−" : "+"}</span>
            </button>
            <div className="accordion-panel">
              <div id="color-options" className="option-row compact"></div>
            </div>
          </section>

          <section className={`accordion-item ${menuSections.size ? "open" : ""}`}>
            <button
              className="accordion-trigger"
              type="button"
              onClick={() => toggleMenuSection("size")}
            >
              Taille
              <span className="accordion-indicator">{menuSections.size ? "−" : "+"}</span>
            </button>
            <div className="accordion-panel">
              <div className="size-row">
                <input id="size-range" type="range" min="0" max="3" step="0.05" defaultValue="1" />
                <span id="size-value" className="size-value">100%</span>
              </div>
            </div>
          </section>

          <section className={`accordion-item ${menuSections.opacity ? "open" : ""}`}>
            <button
              className="accordion-trigger"
              type="button"
              onClick={() => toggleMenuSection("opacity")}
            >
              Dilution
              <span className="accordion-indicator">{menuSections.opacity ? "−" : "+"}</span>
            </button>
            <div className="accordion-panel">
              <div className="size-row">
                <input id="dilution-range" type="range" min="0" max="100" step="1" defaultValue="72" />
                <span id="dilution-value" className="size-value">Encre 72 / Eau 28</span>
              </div>
            </div>
          </section>

          <section className={`accordion-item ${menuSections.advanced ? "open" : ""}`}>
            <button
              className="accordion-trigger"
              type="button"
              onClick={() => toggleMenuSection("advanced")}
            >
              Réglages avancés
              <span className="accordion-indicator">{menuSections.advanced ? "−" : "+"}</span>
            </button>
            <div className="accordion-panel">
              <div className="minimal-controls">
                <div className="control-block slider-block">
                  <div className="control-label">Cycles</div>
                  <label className="size-row toggle-row">
                    <input id="layering-toggle" type="checkbox" defaultChecked />
                    <span id="layering-value" className="size-value">Superposer</span>
                  </label>
                </div>
              </div>
            </div>
          </section>

          <section className={`accordion-item ${menuSections.gallery ? "open" : ""}`}>
            <button
              className="accordion-trigger"
              type="button"
              onClick={() => toggleMenuSection("gallery")}
            >
              Galerie
              <span className="accordion-indicator">{menuSections.gallery ? "−" : "+"}</span>
            </button>
            <div className="accordion-panel">
              <button
                className="chip-btn gallery-launch"
                type="button"
                onClick={() => {
                  setGalleryOpen((prev) => {
                    const next = !prev;
                    if (next) setGalleryExpanded(false);
                    return next;
                  });
                }}
              >
                Galerie éphémère
              </button>
            </div>
          </section>
        </div>
      </div>

      {galleryOpen ? (
        <button
          className="gallery-backdrop"
          type="button"
          aria-label="Fermer la galerie"
          onClick={() => setGalleryOpen(false)}
        />
      ) : null}
      <div
        className={`gallery-drawer ${galleryOpen ? "open" : ""} ${galleryExpanded ? "expanded" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div className="gallery-drawer-header">
          <button
            className="gallery-drawer-handle"
            type="button"
            onClick={() => setGalleryExpanded((prev) => !prev)}
            aria-label={galleryExpanded ? "Réduire la galerie" : "Agrandir la galerie"}
          >
            <span className="handle-pill"></span>
          </button>
          <div className="gallery-drawer-title">Galerie éphémère</div>
          <div className="gallery-drawer-actions">
            <button
              className="chip-btn ghost"
              type="button"
              onClick={() => setGalleryExportOpen((prev) => !prev)}
            >
              {galleryExportOpen ? "Masquer exports" : "Afficher exports"}
            </button>
            <button className="chip-btn ghost" type="button" onClick={() => setGalleryOpen(false)}>
              Fermer
            </button>
          </div>
        </div>
        <div className="gallery-drawer-body">
          <p className="gallery-hint">
            Préviews AV générées après chaque cycle. Sélectionnez pour exporter (max 5 cycles).
          </p>
          <div className="gallery-grid">
            {cycles.length === 0 ? (
              <div className="gallery-empty">Aucun cycle enregistré pour l’instant.</div>
            ) : (
              cycles.map((cycle) => (
                <div key={cycle.id} className="gallery-card">
                  {playingId === cycle.id ? (
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current[cycle.id] = el;
                      }}
                      src={cycle.preview.avURL}
                      className="gallery-media"
                      controls
                      playsInline
                    />
                  ) : (
                    <img className="gallery-media" src={cycle.preview.imageURL} alt={`Cycle ${cycle.id}`} />
                  )}
                  <div className="gallery-actions-row">
                    <button className="chip-btn" type="button" onClick={() => handlePlayPreview(cycle.id)}>
                      ▶︎ Lire cycle AV
                    </button>
                    <label className="gallery-select">
                      <input
                        type="checkbox"
                        checked={cycle.selected}
                        onChange={(event) => galleryActionsRef.current.updateCycleSelection?.(cycle.id, event.target.checked)}
                      />
                      Sélectionner
                    </label>
                  </div>
                  <div className="gallery-actions-row">
                    <button className="chip-btn" type="button" onClick={() => galleryActionsRef.current.exportImageHD?.(cycle)}>
                      Image HD
                    </button>
                    <button className="chip-btn" type="button" onClick={() => galleryActionsRef.current.exportCycleAV?.(cycle)}>
                      AV HD
                    </button>
                    <button className="chip-btn" type="button" onClick={() => galleryActionsRef.current.deleteCycle?.(cycle.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="gallery-actions">
            <button
              className="chip-btn"
              type="button"
              onClick={() => galleryActionsRef.current.clearGallery?.()}
            >
              Vider galerie
            </button>
          </div>
          {galleryExportOpen ? (
            <div className="gallery-export">
              <div className="gallery-export-row">
                <button
                  className="chip-btn"
                  type="button"
                  disabled={!selectedCycles.length}
                  onClick={() => selectedCycles.forEach((cycle) => galleryActionsRef.current.exportImageHD?.(cycle))}
                >
                  Images HD sélectionnées
                </button>
                <button
                  className="chip-btn"
                  type="button"
                  disabled={!selectedCycles.length}
                  onClick={() => galleryActionsRef.current.exportGlobalImage?.(selectedCycles)}
                >
                  Image globale
                </button>
              </div>
              <div className="gallery-export-row">
                <button
                  className="chip-btn"
                  type="button"
                  disabled={!selectedCycles.length}
                  onClick={() => selectedCycles.forEach((cycle) => galleryActionsRef.current.exportCycleAV?.(cycle))}
                >
                  AV cycles
                </button>
                <button
                  className="chip-btn"
                  type="button"
                  disabled={!selectedCycles.length}
                  onClick={() => galleryActionsRef.current.exportGroupedAV?.(selectedCycles)}
                >
                  AV groupé
                </button>
              </div>
              <div className="gallery-export-row">
                <button
                  className="chip-btn"
                  type="button"
                  disabled={!selectedCycles.length}
                  onClick={() => galleryActionsRef.current.exportStopMotionGIF?.(selectedCycles, false)}
                >
                  GIF stop-motion
                </button>
                <button
                  className="chip-btn"
                  type="button"
                  disabled={!selectedCycles.length}
                  onClick={() => galleryActionsRef.current.exportStopMotionGIF?.(selectedCycles, true)}
                >
                  GIF reverse
                </button>
              </div>
              <div className="gallery-export-row">
                <button
                  className="chip-btn"
                  type="button"
                  disabled={!selectedCycles.length}
                  onClick={() => galleryActionsRef.current.exportZipBundle?.(selectedCycles)}
                >
                  Export ZIP groupé
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
