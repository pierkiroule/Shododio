import { useEffect, useRef } from "react";

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
    let timeLimit = 7000;
    let remainingTime = 0;
    const CANVAS_SCALE = 3;
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
    let lastVideoUrl;
    let activeBrush = brushes[0];
    let activeInk = inkPalette[0];
    let resizeObserver;
    let allowLayering = true;
    let lastFrameTime = performance.now();
    let guidePath = [];
    let guideActive = false;
    const ink = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0
    };

    const mainBtn = document.getElementById("main-btn");
    const statusText = document.getElementById("status-text");
    const recDot = document.getElementById("rec-dot");
    const timerContainer = document.getElementById("timer-container");
    const specViz = document.getElementById("spectrum-viz");
    const exportToggle = document.getElementById("export-toggle");
    const exportMenu = document.getElementById("export-menu");
    const layeringToggle = document.getElementById("layering-toggle");
    const layeringValue = document.getElementById("layering-value");

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
      const prevWidth = paper.width;
      const prevHeight = paper.height;
      const width = Math.max(1, Math.floor(rect.width * CANVAS_SCALE));
      const height = Math.max(1, Math.floor(rect.height * CANVAS_SCALE));
      if (paper.width === width && paper.height === height) return;
      paper.width = width;
      paper.height = height;
      clearAll();
      if (prevWidth > 0 && prevHeight > 0) {
        const scaleX = width / prevWidth;
        const scaleY = height / prevHeight;
        guidePath = guidePath.map((point) => ({
          x: point.x * scaleX,
          y: point.y * scaleY
        }));
        ink.x *= scaleX;
        ink.y *= scaleY;
      }
    };

    const getPointerPos = (event) => {
      const rect = canvasWrap.getBoundingClientRect();
      const scaleX = rect.width > 0 ? paper.width / rect.width : 1;
      const scaleY = rect.height > 0 ? paper.height / rect.height : 1;
      const x = clamp((event.clientX - rect.left) * scaleX, 0, paper.width);
      const y = clamp((event.clientY - rect.top) * scaleY, 0, paper.height);
      return { x, y };
    };

    const onPointerDown = (event) => {
      if (!canvasWrap) return;
      guidePath = [];
      guideActive = true;
      const point = getPointerPos(event);
      guidePath.push(point);
      canvasWrap.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const onPointerMove = (event) => {
      if (!guideActive) return;
      const point = getPointerPos(event);
      const last = guidePath[guidePath.length - 1];
      if (!last) {
        guidePath.push(point);
        return;
      }
      const distance = Math.hypot(point.x - last.x, point.y - last.y);
      if (distance > 4 * CANVAS_SCALE) {
        guidePath.push(point);
      }
    };

    const onPointerUp = (event) => {
      if (!guideActive) return;
      guideActive = false;
      canvasWrap.releasePointerCapture(event.pointerId);
    };

    const attractToGuide = (x, y, strength) => {
      if (guidePath.length < 2) return { x, y };
      let closest = null;
      let minDist = Infinity;
      for (const point of guidePath) {
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance < minDist) {
          minDist = distance;
          closest = point;
        }
      }
      if (!closest) return { x, y };
      return {
        x: x + (closest.x - x) * strength,
        y: y + (closest.y - y) * strength
      };
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
          const blob = new Blob(recordedChunks, {
            type: recordedChunks[0] ? recordedChunks[0].type : "video/webm"
          });
          if (lastVideoUrl) {
            window.URL.revokeObjectURL(lastVideoUrl);
          }
          lastVideoUrl = URL.createObjectURL(blob);
          saveVideoBtn.disabled = false;
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
      ink.x = paper.width * 0.5;
      ink.y = paper.height * 0.5;
      ink.vx = 0;
      ink.vy = 0;
      lastFrameTime = performance.now();
    };

    const paintFromVoice = (timestamp) => {
      const delta = Math.min(48, timestamp - lastFrameTime);
      lastFrameTime = timestamp;
      const energy = bands.low * 0.6 + bands.mid * 0.4 + audioEnergy.rms * 0.4;
      ink.vx += (Math.random() - 0.5) * energy * 2;
      ink.vy += (Math.random() - 0.5) * energy * 2;

      ink.vx *= 0.92;
      ink.vy *= 0.92;

      const guided = attractToGuide(ink.x, ink.y, 0.04 + bands.low * 0.12);
      ink.vx += guided.x - ink.x;
      ink.vy += guided.y - ink.y;

      const prevX = ink.x;
      const prevY = ink.y;
      ink.x += ink.vx * (delta / 16);
      ink.y += ink.vy * (delta / 16);

      const margin = 40 * CANVAS_SCALE;
      if (ink.x < margin) {
        ink.x = margin;
        ink.vx = Math.abs(ink.vx) * 0.6;
      } else if (ink.x > paper.width - margin) {
        ink.x = paper.width - margin;
        ink.vx = -Math.abs(ink.vx) * 0.6;
      }

      if (ink.y < margin) {
        ink.y = margin;
        ink.vy = Math.abs(ink.vy) * 0.6;
      } else if (ink.y > paper.height - margin) {
        ink.y = paper.height - margin;
        ink.vy = -Math.abs(ink.vy) * 0.6;
      }

      drawSpectralBrush(ctxP, prevX, prevY, ink.x, ink.y);
    };

    const startDrawingCycle = () => {
      phase = "DRAWING";
      timeLimit = 7000;
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
      timerContainer.style.opacity = 1;
      specViz.style.opacity = 1;
      statusText.innerText = "Voix en peinture...";

      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    };

    const startCycle = () => {
      if (!allowLayering) clearAll();
      exportMenu.classList.remove("active");
      startDrawingCycle();
    };

    const finishRitual = () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      timerContainer.style.opacity = 0;
      mainBtn.innerText = "Nouveau cycle";
      mainBtn.style.display = "block";
      stopBtn.style.display = "none";
      statusText.innerText = "Rituel Terminé";
      recDot.classList.remove("active");
    };

    const resetRitual = () => {
      phase = "READY";
      clearAll();
      recordedChunks = [];
      lastVideoUrl = undefined;
      saveVideoBtn.disabled = true;
      resetVoiceState();

      mainBtn.innerText = "Peindre";
      mainBtn.style.display = "block";
      stopBtn.style.display = "none";

      timerContainer.style.opacity = 0;
      updateCycleStatus();
      recDot.classList.remove("active");
      exportMenu.classList.remove("active");
    };

    const loop = () => {
      if (phase === "DRAWING") {
        const elapsed = Date.now() - startTime;
        remainingTime = Math.max(0, timeLimit - elapsed);
        const ratio = remainingTime / timeLimit;

        document.getElementById("timer-display").innerText = (remainingTime / 1000).toFixed(1);
        document.getElementById("timer-bar").style.transform = `scaleX(${ratio})`;

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
    const saveBtn = document.getElementById("save-btn");
    const saveVideoBtn = document.getElementById("save-video-btn");
    const stopBtn = document.getElementById("stop-btn");

    const onSave = () => {
      const a = document.createElement("a");
      a.download = `lavoixdushodo_${Date.now()}.png`;
      a.href = paper.toDataURL();
      a.click();
    };

    const onSaveVideo = () => {
      if (!lastVideoUrl) return;
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = lastVideoUrl;
      a.download = `lavoixdushodo_${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    const onExportToggle = () => {
      exportMenu.classList.toggle("active");
    };
    const onMainClick = () => {
      if (phase === "READY" || phase === "FINISHED") startCycle();
    };

    const onStop = () => {
      if (phase === "DRAWING") {
        phase = "FINISHED";
        finishRitual();
      }
    };

    initBtn.addEventListener("click", onInitClick);
    resetBtn.addEventListener("click", resetRitual);
    saveBtn.addEventListener("click", onSave);
    saveVideoBtn.addEventListener("click", onSaveVideo);
    exportToggle.addEventListener("click", onExportToggle);
    mainBtn.addEventListener("click", onMainClick);
    stopBtn.addEventListener("click", onStop);
    const cleanupSize = setupBrushSizeControls();
    const cleanupOpacity = setupOpacityControls();
    const cleanupBlur = setupBlurControls();
    const cleanupLayering = setupLayeringControl();
    setupControls();
    resizeCanvas();
    updateCycleStatus();
    saveVideoBtn.disabled = true;
    resetVoiceState();
    canvasWrap.addEventListener("pointerdown", onPointerDown);
    canvasWrap.addEventListener("pointermove", onPointerMove);
    canvasWrap.addEventListener("pointerup", onPointerUp);
    canvasWrap.addEventListener("pointercancel", onPointerUp);
    canvasWrap.addEventListener("pointerleave", onPointerUp);

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      cleanupSize();
      cleanupOpacity();
      cleanupBlur();
      cleanupLayering();
      initBtn.removeEventListener("click", onInitClick);
      resetBtn.removeEventListener("click", resetRitual);
      saveBtn.removeEventListener("click", onSave);
      saveVideoBtn.removeEventListener("click", onSaveVideo);
      exportToggle.removeEventListener("click", onExportToggle);
      mainBtn.removeEventListener("click", onMainClick);
      stopBtn.removeEventListener("click", onStop);
      window.removeEventListener("resize", resizeCanvas);
      canvasWrap.removeEventListener("pointerdown", onPointerDown);
      canvasWrap.removeEventListener("pointermove", onPointerMove);
      canvasWrap.removeEventListener("pointerup", onPointerUp);
      canvasWrap.removeEventListener("pointercancel", onPointerUp);
      canvasWrap.removeEventListener("pointerleave", onPointerUp);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="app">
      <div id="boot-screen" className="overlay">
        <h1>LA VOIX DU SHODO</h1>
        <p className="boot-subtitle">RITUEL VOCAL</p>
        <button id="init-btn">Activer le Micro</button>
      </div>

      <div className="canvas-area" ref={canvasWrapRef}>
        <canvas id="paper-layer" ref={canvasRef}></canvas>
        <div className="paper-texture"></div>
        <div id="ui-layer" className="ui-layer">
          <div className="top-ui">
            <div id="status-msg">
              <div id="rec-dot"></div>
              <span id="status-text">Prêt à écouter</span>
            </div>
            <div id="timer-container">
              <div id="timer-display">7.0</div>
              <div id="timer-bar-bg"><div id="timer-bar"></div></div>
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
              <div className="export-wrap">
                <button id="export-toggle" className="chip-btn" type="button">Exporter</button>
                <div id="export-menu" className="export-menu">
                  <button id="save-btn" className="chip-btn" type="button">Image</button>
                  <button id="save-video-btn" className="chip-btn" type="button">Audio/Vidéo</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="tools-area">
        <div className="minimal-controls">
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
    </div>
  );
}
