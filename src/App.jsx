import { useCallback, useEffect, useRef, useState } from "react";

const brushes = [
  { id: "senbon", name: "Senbon", style: "rake", baseSize: 7, bristles: 18, spread: 1.25, flow: 0.75, jitter: 0.55, grain: 0.5 },
  { id: "kumo", name: "Kumo", style: "mist", baseSize: 16, bristles: 8, spread: 1.8, flow: 0.28, jitter: 0.18, grain: 0.2 },
  { id: "uroko", name: "Uroko", style: "scales", baseSize: 9, bristles: 10, spread: 1.7, flow: 0.55, jitter: 0.3, grain: 0.75 },
  { id: "hana", name: "Hana", style: "petal", baseSize: 14, bristles: 6, spread: 2.1, flow: 0.65, jitter: 0.22, grain: 0.15 },
  { id: "hibana", name: "Hibana", style: "spark", baseSize: 5, bristles: 6, spread: 2.6, flow: 1.05, jitter: 0.8, grain: 0.1 },
  { id: "mizu", name: "Mizu", style: "water", baseSize: 20, bristles: 5, spread: 2.4, flow: 0.6, jitter: 0.25, grain: 0.05 },
  { id: "enso", name: "Enso", style: "halo", baseSize: 18, bristles: 8, spread: 2.2, flow: 0.4, jitter: 0.15, grain: 0.15 }
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

export default function App() {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const videoRefs = useRef({});
  const galleryActionsRef = useRef({});
  const toolbarRef = useRef(null);
  const toolbarHandleRef = useRef(null);
  const galleryModalRef = useRef(null);
  const galleryHandleRef = useRef(null);
  const [cycles, setCycles] = useState([]);
  const [playingId, setPlayingId] = useState(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryExportOpen, setGalleryExportOpen] = useState(false);
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(true);
  useEffect(() => {
    if (!galleryOpen) setGalleryExportOpen(false);
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
    let opacityScale = 0.85;
    let blurScale = 0;
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
    const tapState = {
      x: 0,
      y: 0,
      strength: 0
    };
    const cyclesRef = { current: [] };

    const setupDraggable = (target, handle) => {
      if (!target || !handle) return () => {};
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      let startWidth = 0;
      let startHeight = 0;

      const onPointerDown = (event) => {
        if (event.button !== 0) return;
        isDragging = true;
        const rect = target.getBoundingClientRect();
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        startWidth = rect.width;
        startHeight = rect.height;
        target.style.left = `${rect.left}px`;
        target.style.top = `${rect.top}px`;
        target.style.right = "auto";
        target.style.bottom = "auto";
        target.style.transform = "none";
        handle.setPointerCapture(event.pointerId);
      };

      const onPointerMove = (event) => {
        if (!isDragging) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const maxLeft = window.innerWidth - startWidth - 8;
        const maxTop = window.innerHeight - startHeight - 8;
        const nextLeft = clamp(startLeft + dx, 8, Math.max(8, maxLeft));
        const nextTop = clamp(startTop + dy, 8, Math.max(8, maxTop));
        target.style.left = `${nextLeft}px`;
        target.style.top = `${nextTop}px`;
      };

      const onPointerUp = (event) => {
        if (!isDragging) return;
        isDragging = false;
        handle.releasePointerCapture(event.pointerId);
      };

      handle.addEventListener("pointerdown", onPointerDown);
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);

      return () => {
        handle.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
      };
    };

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
        const alpha = 0.6 * intensity * opacityScale;
        ctx.fillStyle = rgba(mixColor(baseRgb, { r: 255, g: 255, b: 255 }, 0.15), alpha);
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const addStain = (ctx, cx, cy, size, baseRgb, intensity) => {
      const radius = Math.max(6, size);
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
      grad.addColorStop(0, rgba(baseRgb, 0.2 * intensity * opacityScale));
      grad.addColorStop(0.6, rgba(baseRgb, 0.08 * intensity * opacityScale));
      grad.addColorStop(1, rgba(baseRgb, 0));
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius * 1.2, radius * 0.85, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawPetalStamp = (ctx, cx, cy, size, angle, color, alpha) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = rgba(color, alpha);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.1, size * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
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
      const deepRgb = mixColor(baseRgb, { r: 0, g: 0, b: 0 }, 0.35);
      const mistRgb = mixColor(baseRgb, { r: 255, g: 255, b: 255 }, 0.5);

      ctx.save();
      ctx.filter = blurScale > 0 ? `blur(${blurScale}px)` : "none";
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

        if (brush.style === "mist") {
          const washSize = (brush.baseSize * brushSizeScale * 1.8 + localBands.low * 18) * pressure * sizeResponse;
          ctx.fillStyle = rgba(mistRgb, 0.08 * brush.flow * opacityScale);
          ctx.beginPath();
          ctx.ellipse(cx, cy, washSize, washSize * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();

          if (Math.random() < 0.15 + bandBoost * 0.4) {
            addStain(ctx, cx, cy, washSize * (0.8 + bandBoost), baseRgb, 0.4 + bandBoost * 0.5);
          }
        }

        if (brush.style === "water") {
          const washSize = (brush.baseSize * brushSizeScale * 1.6 + localBands.low * 22) * pressure * sizeResponse;
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillStyle = `rgba(0, 0, 0, ${clamp(0.04 + localEnergy.rms * 0.12, 0, 0.2)})`;
          ctx.beginPath();
          ctx.ellipse(cx, cy, washSize, washSize * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          if (Math.random() < 0.25 + bandBoost * 0.3) {
            ctx.save();
            ctx.globalCompositeOperation = "screen";
            ctx.fillStyle = rgba({ r: 255, g: 255, b: 255 }, 0.05 + localEnergy.rms * 0.15);
            ctx.beginPath();
            ctx.ellipse(cx, cy, washSize * 0.75, washSize * 0.4, Math.random() * Math.PI, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        }

        if (brush.style === "rake") {
          const rakeWidth = (brush.baseSize * brushSizeScale * 1.1 + localBands.mid * 8) * pressure * sizeResponse;
          const bristles = Math.max(8, Math.round(brush.bristles + localBands.high * 12));
          const alphaBase = (0.1 + localBands.mid * 0.6 + localEnergy.rms * 0.4) * brush.flow * opacityScale;

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
        }

        if (brush.style === "petal") {
          const petals = 2 + Math.floor(localBands.mid * 4);
          const baseSize = (brush.baseSize * brushSizeScale * 0.7 + localBands.mid * 6) * pressure * sizeResponse;
          for (let p = 0; p < petals; p += 1) {
            const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.2 + (p * Math.PI) / petals;
            const offset = (Math.random() - 0.5) * brush.spread * 6 * sizeResponse;
            drawPetalStamp(
              ctx,
              cx + nx * offset,
              cy + ny * offset,
              baseSize * (0.8 + Math.random() * 0.6),
              angle,
              baseRgb,
              (0.2 + localBands.mid * 0.6 + localEnergy.rms * 0.2) * brush.flow * opacityScale
            );
          }
          if (Math.random() < 0.2 + bandBoost * 0.3) {
            addStain(ctx, cx, cy, baseSize * 1.2, baseRgb, 0.4 + bandBoost * 0.4);
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
              (0.18 + localBands.low * 0.6 + localEnergy.rms * 0.2) * brush.flow * opacityScale
            );
          }
        }

        if (brush.style === "spark") {
          const burst = Math.max(localBands.high, localEnergy.peak);
          const sparkCount = 2 + Math.floor(burst * 6);
          for (let s = 0; s < sparkCount; s += 1) {
            const angle = Math.random() * Math.PI * 2;
            const length = (4 + Math.random() * 12) * (0.5 + burst) * sizeResponse;
            drawSpark(ctx, cx, cy, length, angle, mistRgb, 0.35 + burst * 0.5, 0.4 + Math.random() * 0.8);
          }
          if (Math.random() < 0.5 + burst * 0.4) {
            const scatter = (8 + burst * 22) * brush.spread;
            const hx = cx + (Math.random() - 0.5) * scatter;
            const hy = cy + (Math.random() - 0.5) * scatter;
            const size = (0.5 + Math.random() * (1 + burst * 1.2)) * sizeResponse;
            ctx.fillStyle = rgba(baseRgb, (0.25 + burst * 0.6) * opacityScale);
            ctx.beginPath();
            ctx.arc(hx, hy, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (brush.style === "halo") {
          const filamentCount = 24 + Math.floor(localBands.high * 48);
          const baseRadius = (brush.baseSize * brushSizeScale * 1.8 + localBands.low * 26) * (0.7 + bandBoost * 0.6);
          const radialJitter = 2 + localBands.high * 10 + localEnergy.rms * 8;
          const filamentLength = 4 + localBands.high * 16 + localEnergy.peak * 10;
          const angleSeed = Math.random() * Math.PI * 2;
          ctx.save();
          ctx.strokeStyle = rgba(deepRgb, (0.12 + localEnergy.rms * 0.35) * brush.flow * opacityScale);
          ctx.lineWidth = 0.35 * sizeResponse;
          ctx.beginPath();
          for (let f = 0; f < filamentCount; f += 1) {
            const angle = angleSeed + (f / filamentCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
            const radius = baseRadius + Math.sin(angle * 3) * radialJitter + (Math.random() - 0.5) * radialJitter;
            const ax = cx + Math.cos(angle) * radius;
            const ay = cy + Math.sin(angle) * radius;
            const bx = cx + Math.cos(angle) * (radius + filamentLength);
            const by = cy + Math.sin(angle) * (radius + filamentLength);
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
          }
          ctx.stroke();
          ctx.strokeStyle = rgba(mistRgb, 0.08 * opacityScale);
          ctx.lineWidth = 0.6 * sizeResponse;
          ctx.beginPath();
          ctx.arc(cx, cy, baseRadius * 0.7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (whisper && brush.style !== "mist") {
          const hazeSize = (brush.baseSize * brushSizeScale * 0.7 + localBands.low * 6) * pressure * sizeResponse;
          ctx.fillStyle = rgba(mistRgb, 0.05 * brush.flow * opacityScale);
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
            const alpha = 0.6 * splashIntensity * (whisper ? 0.5 : 1) * opacityScale;
            ctx.fillStyle = rgba(mixColor(baseRgb, { r: 255, g: 255, b: 255 }, 0.2), alpha);
            ctx.beginPath();
            ctx.arc(hx, hy, size, 0, Math.PI * 2);
            ctx.fill();
          }

          if (Math.random() < 0.12 * splashIntensity) {
            const len = 8 + 12 * splashIntensity;
            const ang = Math.random() * Math.PI * 2;
            drawSpark(ctx, cx, cy, len, ang, mistRgb, 0.35 * splashIntensity * opacityScale, 0.5);
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
    const setupOpacityControls = () => {
      const opacityRange = document.getElementById("opacity-range");
      const opacityValue = document.getElementById("opacity-value");
      const updateOpacity = (value) => {
        const numeric = parseFloat(value);
        opacityScale = clamp(numeric, 0.05, 1.4);
        opacityValue.textContent = `${Math.round(opacityScale * 100)}%`;
      };
      const onInput = (event) => updateOpacity(event.target.value);
      opacityRange.addEventListener("input", onInput);
      opacityRange.addEventListener("change", onInput);
      updateOpacity(opacityRange.value);
      return () => {
        opacityRange.removeEventListener("input", onInput);
        opacityRange.removeEventListener("change", onInput);
      };
    };

    const setupBlurControls = () => {
      const blurRange = document.getElementById("blur-range");
      const blurValue = document.getElementById("blur-value");
      const updateBlur = (value) => {
        const numeric = parseFloat(value);
        blurScale = clamp(numeric, 0, 12);
        blurValue.textContent = `${blurScale.toFixed(1)}px`;
      };
      const onInput = (event) => updateBlur(event.target.value);
      blurRange.addEventListener("input", onInput);
      blurRange.addEventListener("change", onInput);
      updateBlur(blurRange.value);
      return () => {
        blurRange.removeEventListener("input", onInput);
        blurRange.removeEventListener("change", onInput);
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
      tapState.strength = 0;
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
          guide: { x: tapState.x, y: tapState.y },
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

      if (tapState.strength > 0) {
        const dxTap = tapState.x - voiceState.x;
        const dyTap = tapState.y - voiceState.y;
        const tapAngle = Math.atan2(dyTap, dxTap);
        const angleDiff = Math.atan2(Math.sin(tapAngle - voiceState.angle), Math.cos(tapAngle - voiceState.angle));
        const distance = Math.hypot(dxTap, dyTap);
        const pull = clamp(tapState.strength * (1 - clamp(distance / (paper.width * 0.7), 0, 1)), 0, 1);
        voiceState.angle += angleDiff * (0.08 + pull * 0.18);
        tapState.strength = Math.max(0, tapState.strength - delta * 0.0015);
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

    const onCanvasTap = (event) => {
      if (!canvasWrap) return;
      if (event.target.closest(".action-area")) return;
      const rect = canvasWrap.getBoundingClientRect();
      const scaleX = rect.width > 0 ? paper.width / rect.width : 1;
      const scaleY = rect.height > 0 ? paper.height / rect.height : 1;
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);
      tapState.x = x * scaleX;
      tapState.y = y * scaleY;
      tapState.strength = 1;
    };

    initBtn.addEventListener("click", onInitClick);
    resetBtn.addEventListener("click", resetRitual);
    mainBtn.addEventListener("click", onMainClick);
    stopBtn.addEventListener("click", onStop);
    canvasWrap.addEventListener("pointerdown", onCanvasTap);
    const cleanupSize = setupBrushSizeControls();
    const cleanupOpacity = setupOpacityControls();
    const cleanupBlur = setupBlurControls();
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

    const cleanupToolbarDrag = setupDraggable(toolbarRef.current, toolbarHandleRef.current);
    const cleanupGalleryDrag = setupDraggable(galleryModalRef.current, galleryHandleRef.current);

    return () => {
      cleanupToolbarDrag();
      cleanupGalleryDrag();
      cleanupSize();
      cleanupOpacity();
      cleanupBlur();
      cleanupLayering();
      initBtn.removeEventListener("click", onInitClick);
      resetBtn.removeEventListener("click", resetRitual);
      mainBtn.removeEventListener("click", onMainClick);
      stopBtn.removeEventListener("click", onStop);
      canvasWrap.removeEventListener("pointerdown", onCanvasTap);
      window.removeEventListener("resize", resizeCanvas);
      if (resizeObserver) resizeObserver.disconnect();
      cyclesRef.current.forEach((cycle) => cleanupCycleAssets(cycle));
    };
  }, [updateCycles]);

  const selectedCycles = cycles.filter((cycle) => cycle.selected);
  const handlePlayPreview = (cycleId) => {
    setPlayingId((prev) => (prev === cycleId ? null : cycleId));
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

        <div
          ref={toolbarRef}
          className={`floating-toolbar ${toolsCollapsed ? "collapsed" : ""}`}
        >
          <div ref={toolbarHandleRef} className="floating-toolbar-header">
            <span>Outils</span>
            <button
              className="chip-btn ghost"
              type="button"
              onClick={() => setToolsCollapsed((prev) => !prev)}
            >
              {toolsCollapsed ? "Ouvrir" : "Réduire"}
            </button>
          </div>
          <div className="floating-toolbar-body">
            <div className="control-block">
              <div className="control-label">Pinceaux</div>
              <div id="brush-options" className="option-row compact"></div>
            </div>
            <div className="control-block">
              <div className="control-label">Encres</div>
              <div id="color-options" className="option-row compact"></div>
            </div>
            <div className="control-block slider-block">
              <div className="control-label">Taille</div>
              <div className="size-row">
                <input id="size-range" type="range" min="0" max="3" step="0.05" defaultValue="1" />
                <span id="size-value" className="size-value">100%</span>
              </div>
            </div>
            <div className="control-block slider-block">
              <div className="control-label">Opacité</div>
              <div className="size-row">
                <input id="opacity-range" type="range" min="0.05" max="1.4" step="0.05" defaultValue="0.85" />
                <span id="opacity-value" className="size-value">85%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tools-area">
        <div className="accordion">
          <section className={`accordion-item ${advancedOpen ? "open" : ""}`}>
            <button
              className="accordion-trigger"
              type="button"
              onClick={() => setAdvancedOpen((prev) => !prev)}
            >
              Réglages avancés
              <span className="accordion-indicator">{advancedOpen ? "−" : "+"}</span>
            </button>
            <div className="accordion-panel">
              <div className="minimal-controls">
                <div className="control-block slider-block">
                  <div className="control-label">Blur FX</div>
                  <div className="size-row">
                    <input id="blur-range" type="range" min="0" max="12" step="0.5" defaultValue="0" />
                    <span id="blur-value" className="size-value">0.0px</span>
                  </div>
                </div>
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
        </div>
        <button
          className="chip-btn gallery-launch"
          type="button"
          onClick={() => setGalleryOpen((prev) => !prev)}
        >
          Galerie éphémère
        </button>
      </div>

      <div
        ref={galleryModalRef}
        className={`gallery-modal ${galleryOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
      >
        <div ref={galleryHandleRef} className="gallery-modal-header">
          <div className="gallery-modal-title">Galerie éphémère</div>
          <div className="gallery-modal-actions">
            <button
              className="chip-btn ghost"
              type="button"
              onClick={() => setGalleryExportOpen((prev) => !prev)}
            >
              {galleryExportOpen ? "Masquer exports" : "Afficher exports"}
            </button>
            <button
              className="chip-btn ghost"
              type="button"
              onClick={() => {
                setGalleryOpen(false);
                setGalleryExportOpen(false);
              }}
            >
              Fermer
            </button>
          </div>
        </div>
        <div className="gallery-modal-body">
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
