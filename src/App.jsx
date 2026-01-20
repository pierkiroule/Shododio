import { useEffect, useRef } from "react";

const brushes = [
  { id: "senbon", name: "Senbon", style: "rake", baseSize: 8, bristles: 18, spread: 1.2, flow: 0.7, jitter: 0.45, grain: 0.35 },
  { id: "kumo", name: "Kumo", style: "mist", baseSize: 12, bristles: 8, spread: 1.4, flow: 0.35, jitter: 0.2, grain: 0.2 },
  { id: "uroko", name: "Uroko", style: "scales", baseSize: 9, bristles: 10, spread: 1.6, flow: 0.45, jitter: 0.3, grain: 0.6 },
  { id: "tsubaki", name: "Tsubaki", style: "petal", baseSize: 10, bristles: 12, spread: 1.1, flow: 0.55, jitter: 0.35, grain: 0.4 },
  { id: "hibana", name: "Hibana", style: "spark", baseSize: 7, bristles: 6, spread: 2.0, flow: 0.5, jitter: 0.6, grain: 0.85 }
];

const inkPalette = [
  { id: "sumi", name: "Sumi Noir", value: "#14110f" },
  { id: "sumi-warm", name: "Sumi Chaud", value: "#2a1d18" },
  { id: "ai", name: "Aï Indigo", value: "#2c3b52" },
  { id: "shu", name: "Shu Vermillon", value: "#b73a26" },
  { id: "kokutan", name: "Kokutan", value: "#1b1a16" },
  { id: "matsu", name: "Matsu", value: "#2c3a2f" }
];

const cycleDurations = [5000, 7000, 3000];

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

const rgba = (rgb, alpha) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

export default function App() {
  const canvasRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const previewCanvasRef = useRef(null);

  useEffect(() => {
    const paper = canvasRef.current;
    const canvasWrap = canvasWrapRef.current;
    const previewCanvas = previewCanvasRef.current;
    if (!paper || !canvasWrap || !previewCanvas) return undefined;

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
    let isDown = false;
    let lx;
    let ly;
    const CANVAS_SCALE = 3;
    const MIN_BRUSH_SCALE = 0.12;
    let brushSizeScale = 1;
    let opacityScale = 1;
    let inkLoadScale = 1;
    let zoomLevel = 1;
    const bands = { low: 0, mid: 0, high: 0 };
    const SILENCE_THRESHOLD = 0.01;
    const audioEnergy = { rms: 0, peak: 0 };
    let lastPeakTime = 0;
    let mediaRecorder;
    let recordedChunks = [];
    let activeBrush = brushes[0];
    let activeInk = inkPalette[0];
    let cycleMode = "single";
    let cycleIndex = 0;
    let previewCtx;
    let previewDown = false;
    let previewLx;
    let previewLy;
    let resizeObserver;
    let countdownTimer;
    let countdownValue = 0;
    let countdownActive = false;

    const mainBtn = document.getElementById("main-btn");
    const secBtn = document.getElementById("secondary-btn");
    const statusText = document.getElementById("status-text");
    const recDot = document.getElementById("rec-dot");
    const timerContainer = document.getElementById("timer-container");
    const specViz = document.getElementById("spectrum-viz");
    const countdownDisplay = document.getElementById("countdown-display");

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

    const addDrip = (ctx, cx, cy, length, baseRgb, intensity) => {
      const dripLength = Math.max(6, length);
      const dripWidth = Math.max(1.5, length * 0.18);
      const grad = ctx.createLinearGradient(cx, cy, cx, cy + dripLength);
      grad.addColorStop(0, rgba(baseRgb, 0.18 * intensity * opacityScale));
      grad.addColorStop(1, rgba(baseRgb, 0));
      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = dripWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + dripLength);
      ctx.stroke();
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
      const inkLoad = clamp(inkLoadScale, 0.5, 1.8);
      const baseRgb = hexToRgb(activeInk.value);
      const deepRgb = mixColor(baseRgb, { r: 0, g: 0, b: 0 }, 0.35);
      const mistRgb = mixColor(baseRgb, { r: 255, g: 255, b: 255 }, 0.5);

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
      const jitterBase = (1.5 + localBands.high * 6 + localEnergy.rms * 5) * brush.jitter * audioBoost * (0.6 + sizeResponse * 0.4) * (1 - inkLoad * 0.12);

      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        let cx = x1 + (x2 - x1) * t;
        let cy = y1 + (y2 - y1) * t;

        cx += (Math.random() - 0.5) * jitterBase;
        cy += (Math.random() - 0.5) * jitterBase;

        const strokeTaper = Math.sin(Math.PI * t);
        const flowScale = clamp(brush.flow * inkLoad, 0.2, 1.9);
        const strokeAlpha = (0.3 + strokeTaper * 0.9) * flowScale * opacityScale;

        if (brush.style === "mist") {
          const washSize = (brush.baseSize * brushSizeScale * 1.9 + localBands.low * 18) * pressure * sizeResponse * (0.8 + inkLoad * 0.35);
          ctx.fillStyle = rgba(mistRgb, 0.08 * strokeAlpha);
          ctx.beginPath();
          ctx.ellipse(cx, cy, washSize, washSize * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();

          if (Math.random() < 0.15 + bandBoost * 0.4) {
            addStain(ctx, cx, cy, washSize * (0.8 + bandBoost) * (0.9 + inkLoad * 0.4), baseRgb, (0.4 + bandBoost * 0.5) * inkLoad);
          }
        }

        if (brush.style === "rake") {
          const rakeWidth = (brush.baseSize * brushSizeScale * 1.1 + localBands.mid * 8) * pressure * sizeResponse;
          const bristles = Math.max(8, Math.round(brush.bristles + localBands.high * 12));
          const alphaBase = (0.12 + localBands.mid * 0.6 + localEnergy.rms * 0.4) * flowScale * opacityScale * (0.55 + strokeTaper * 0.65);

          for (let b = 0; b < bristles; b += 1) {
            if (Math.random() < brush.grain * 0.2) continue;
            const spread = (Math.random() - 0.5) * rakeWidth * brush.spread * 2;
            const mx = cx + nx * spread;
            const my = cy + ny * spread;
            const length = (3 + Math.random() * 8 + localBands.low * 12) * sizeResponse * (0.9 + inkLoad * 0.25);
            const width = (0.4 + Math.random() * 0.6) * sizeResponse * (0.8 + strokeTaper * 0.5);
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
              baseSize * (0.8 + Math.random() * 0.6) * (0.85 + inkLoad * 0.3),
              angle,
              baseRgb,
              (0.2 + localBands.mid * 0.6 + localEnergy.rms * 0.2) * flowScale * opacityScale * (0.6 + strokeTaper * 0.6)
            );
          }
          if (Math.random() < 0.2 + bandBoost * 0.3) {
            addStain(ctx, cx, cy, baseSize * 1.2 * (0.85 + inkLoad * 0.35), baseRgb, (0.4 + bandBoost * 0.4) * inkLoad);
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
              baseSize * (0.7 + Math.random() * 0.6) * (0.85 + inkLoad * 0.25),
              angle,
              deepRgb,
              (0.18 + localBands.low * 0.6 + localEnergy.rms * 0.2) * flowScale * opacityScale * (0.6 + strokeTaper * 0.6)
            );
          }
        }

        if (brush.style === "spark") {
          const burst = Math.max(localBands.high, localEnergy.peak);
          const sparkCount = 1 + Math.floor(burst * 4 * (1.1 - inkLoad * 0.2));
          for (let s = 0; s < sparkCount; s += 1) {
            const angle = Math.random() * Math.PI * 2;
            const length = (4 + Math.random() * 12) * (0.5 + burst) * sizeResponse;
            drawSpark(ctx, cx, cy, length, angle, mistRgb, 0.3 + burst * 0.4, 0.4 + Math.random() * 0.8);
          }
          if (Math.random() < 0.4 + burst * 0.35) {
            const scatter = (8 + burst * 22) * brush.spread;
            const hx = cx + (Math.random() - 0.5) * scatter;
            const hy = cy + (Math.random() - 0.5) * scatter;
            const size = (0.5 + Math.random() * (1 + burst * 1.2)) * sizeResponse;
            ctx.fillStyle = rgba(baseRgb, (0.25 + burst * 0.6) * opacityScale * (0.7 + inkLoad * 0.4));
            ctx.beginPath();
            ctx.arc(hx, hy, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (whisper && brush.style !== "mist") {
          const hazeSize = (brush.baseSize * brushSizeScale * 0.7 + localBands.low * 6) * pressure * sizeResponse;
          ctx.fillStyle = rgba(mistRgb, 0.05 * flowScale * opacityScale);
          ctx.beginPath();
          ctx.ellipse(cx, cy, hazeSize, hazeSize * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }

        const splashIntensity = Math.max(localBands.high, localEnergy.peak) * (0.9 + inkLoad * 0.3);
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
            addSplatter(ctx, cx, cy, localEnergy.peak * inkLoad, baseRgb);
            addStain(ctx, cx, cy, (14 + localEnergy.peak * 26) * (0.85 + inkLoad * 0.4), baseRgb, localEnergy.peak * inkLoad);
          }
        }

        const bleed = clamp((inkLoad - 1) * 0.9 + localBands.low * 0.2, 0, 1);
        if (bleed > 0.08 && Math.random() < bleed * 0.2) {
          addDrip(ctx, cx, cy, 12 + bleed * 30, baseRgb, bleed);
        }
      }

      ctx.restore();
    };

    const updateCycleStatus = () => {
      if (cycleMode === "haiku") {
        statusText.innerText = `Haïku — cycle ${cycleIndex + 1}/3`;
      } else {
        statusText.innerText = "Prêt à tracer";
      }
    };

    const getPreviewDrive = () => {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 450);
      return {
        bands: {
          low: clamp(0.25 + pulse * 0.25, 0, 1),
          mid: clamp(0.35 + pulse * 0.3, 0, 1),
          high: clamp(0.2 + pulse * 0.25, 0, 1)
        },
        energy: {
          rms: clamp(0.45 + pulse * 0.25, 0, 1),
          peak: clamp(0.2 + pulse * 0.35, 0, 1)
        },
        force: true
      };
    };

    const getTestDrive = () => {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 700);
      return {
        bands: {
          low: clamp(0.2 + pulse * 0.2, 0, 1),
          mid: clamp(0.4 + pulse * 0.25, 0, 1),
          high: clamp(0.25 + pulse * 0.2, 0, 1)
        },
        energy: {
          rms: clamp(0.35 + pulse * 0.2, 0, 1),
          peak: clamp(0.15 + pulse * 0.25, 0, 1)
        },
        force: true
      };
    };

    const clearPreview = () => {
      if (!previewCtx) return;
      previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewCtx.fillStyle = "rgba(255,255,255,0.8)";
      previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    };

    const setupPreviewCanvas = () => {
      previewCtx = previewCanvas.getContext("2d");
      clearPreview();
      const previewPanel = document.getElementById("preview-panel");
      const previewToggle = document.getElementById("preview-toggle");

      const onPreviewDown = (event) => {
        previewDown = true;
        previewCanvas.setPointerCapture(event.pointerId);
        previewLx = event.offsetX;
        previewLy = event.offsetY;
      };

      const onPreviewMove = (event) => {
        if (!previewDown) return;
        const x = event.offsetX;
        const y = event.offsetY;
        if (previewLx !== undefined) {
          drawSpectralBrush(previewCtx, previewLx, previewLy, x, y, getPreviewDrive());
        }
        previewLx = x;
        previewLy = y;
      };

      const onPreviewUp = (event) => {
        previewDown = false;
        previewCanvas.releasePointerCapture(event.pointerId);
        previewLx = undefined;
        previewLy = undefined;
      };

      previewCanvas.addEventListener("pointerdown", onPreviewDown);
      previewCanvas.addEventListener("pointermove", onPreviewMove);
      previewCanvas.addEventListener("pointerup", onPreviewUp);

      const previewClear = document.getElementById("preview-clear");
      previewClear.addEventListener("click", clearPreview);
      previewToggle.addEventListener("click", () => {
        const isHidden = previewPanel.classList.toggle("hidden");
        previewToggle.textContent = isHidden ? "Afficher la zone de test" : "Masquer la zone de test";
      });

      return () => {
        previewCanvas.removeEventListener("pointerdown", onPreviewDown);
        previewCanvas.removeEventListener("pointermove", onPreviewMove);
        previewCanvas.removeEventListener("pointerup", onPreviewUp);
        previewClear.removeEventListener("click", clearPreview);
      };
    };

    const setupBrushSizeControls = () => {
      const sizeRange = document.getElementById("size-range");
      const sizeValue = document.getElementById("size-value");
      const updateSizing = (value) => {
        const numeric = parseFloat(value);
        const normalized = clamp(numeric, 0, 1.2);
        brushSizeScale = normalized === 0 ? MIN_BRUSH_SCALE : normalized;
        opacityScale = clamp(1.05 - brushSizeScale * 0.25, 0.5, 1);
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

    const setupInkLoadControls = () => {
      const inkRange = document.getElementById("ink-range");
      const inkValue = document.getElementById("ink-value");
      const updateInkLoad = (value) => {
        const numeric = parseFloat(value);
        inkLoadScale = clamp(numeric, 0.5, 1.6);
        inkValue.textContent = `${Math.round(inkLoadScale * 100)}%`;
      };
      const onInput = (event) => updateInkLoad(event.target.value);
      inkRange.addEventListener("input", onInput);
      inkRange.addEventListener("change", onInput);
      updateInkLoad(inkRange.value);
      return () => {
        inkRange.removeEventListener("input", onInput);
        inkRange.removeEventListener("change", onInput);
      };
    };

    const setupPanelInteractions = () => {
      const panel = document.getElementById("tool-panel");
      const toggleBtn = document.getElementById("panel-toggle");
      const onToggle = () => {
        const isCollapsed = panel.classList.toggle("collapsed");
        toggleBtn.textContent = isCollapsed ? "Afficher" : "Masquer";
      };
      toggleBtn.addEventListener("click", onToggle);
      return () => toggleBtn.removeEventListener("click", onToggle);
    };

    const setupControls = () => {
      const brushContainer = document.getElementById("brush-options");
      const colorContainer = document.getElementById("color-options");
      const cycleContainer = document.getElementById("cycle-options");
      brushContainer.innerHTML = "";
      colorContainer.innerHTML = "";
      cycleContainer.innerHTML = "";

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

      const cycles = [
        { id: "single", name: "7s" },
        { id: "haiku", name: "Haïku 5·7·3" }
      ];

      cycles.forEach((cycle, index) => {
        const btn = document.createElement("button");
        btn.className = "chip-btn";
        btn.textContent = cycle.name;
        btn.dataset.cycleId = cycle.id;
        if (index === 0) btn.classList.add("active");
        btn.addEventListener("click", () => {
          cycleMode = cycle.id;
          cycleIndex = 0;
          [...cycleContainer.querySelectorAll(".chip-btn")].forEach((el) => el.classList.remove("active"));
          btn.classList.add("active");
          updateCycleStatus();
        });
        cycleContainer.appendChild(btn);
      });
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
          const url = URL.createObjectURL(blob);
          document.getElementById("final-video").src = url;

          document.getElementById("dl-video-btn").onclick = () => {
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = `lavoixdushodo_${Date.now()}.webm`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
          };
          showReplay();
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

    const getPointerPos = (event) => {
      const rect = paper.getBoundingClientRect();
      const scaleX = paper.width / rect.width;
      const scaleY = paper.height / rect.height;
      return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      };
    };

    const handleMove = (event) => {
      if (!isDown) return;
      const { x, y } = getPointerPos(event);
      if (y > paper.height) {
        lx = x;
        ly = y;
        return;
      }
      if (lx !== undefined) {
        if (phase === "DRAWING") {
          drawSpectralBrush(ctxP, lx, ly, x, y);
        } else if (phase === "READY" || phase === "PAUSED") {
          drawSpectralBrush(ctxP, lx, ly, x, y, getTestDrive());
        }
      }
      lx = x;
      ly = y;
    };

    const handleDown = (event) => {
      isDown = true;
      const { x, y } = getPointerPos(event);
      lx = x;
      ly = y;
      handleMove(event);
    };

    const handleUp = () => {
      isDown = false;
      lx = undefined;
      ly = undefined;
    };

    const getCycleDuration = () => {
      if (cycleMode === "haiku") {
        return cycleDurations[cycleIndex] || cycleDurations[cycleDurations.length - 1];
      }
      return 7000;
    };

    const startDrawingCycle = () => {
      phase = "DRAWING";
      timeLimit = getCycleDuration();
      startTime = Date.now();
      remainingTime = timeLimit;

      if (mediaRecorder && mediaRecorder.state === "inactive") {
        mediaRecorder.start();
      } else if (mediaRecorder && mediaRecorder.state === "paused") {
        mediaRecorder.resume();
      }

      recDot.classList.add("active");
      mainBtn.style.display = "none";
      secBtn.style.display = "none";
      timerContainer.style.opacity = 1;
      specViz.style.opacity = 1;
      if (cycleMode === "haiku") {
        statusText.innerText = `Encre haïku — cycle ${cycleIndex + 1}/3`;
      } else {
        statusText.innerText = "Enregistrement en cours...";
      }

      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    };

    const stopCountdown = () => {
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = undefined;
      }
      countdownActive = false;
      countdownDisplay.classList.remove("active");
    };

    const beginCountdown = () => {
      if (countdownActive) return;
      stopCountdown();
      phase = "COUNTDOWN";
      statusText.innerText = "Départ imminent";
      countdownValue = 3;
      countdownActive = true;
      countdownDisplay.textContent = countdownValue.toString();
      countdownDisplay.classList.add("active");
      countdownTimer = window.setInterval(() => {
        countdownValue -= 1;
        countdownDisplay.textContent = countdownValue.toString();
        if (countdownValue <= 0) {
          stopCountdown();
          startDrawingCycle();
        }
      }, 1000);
    };

    const startCycle = () => {
      clearAll();
      beginCountdown();
    };

    const pauseCycle = () => {
      phase = "PAUSED";

      if (mediaRecorder && mediaRecorder.state === "recording") {
        mediaRecorder.pause();
      }

      recDot.classList.remove("active");
      if (cycleMode === "haiku") {
        cycleIndex += 1;
        if (cycleIndex >= cycleDurations.length) {
          finishRitual();
          return;
        }
        mainBtn.innerText = "Kiai suivant";
        mainBtn.style.display = "block";
        secBtn.style.display = "none";
        statusText.innerText = `Respiration — prochain cycle ${cycleIndex + 1}/3`;
      } else {
        mainBtn.innerText = "Relancer Kiai";
        mainBtn.style.display = "block";
        secBtn.style.display = "block";
        statusText.innerText = "Pause. Ajoutez ou terminez.";
      }
    };

    const finishRitual = () => {
      stopCountdown();
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }

      timerContainer.style.opacity = 0;
      mainBtn.style.display = "none";
      secBtn.style.display = "none";
      statusText.innerText = "Rituel Terminé";
      recDot.classList.remove("active");
      cycleIndex = 0;
    };

    const showReplay = () => {
      document.getElementById("replay-overlay").classList.add("active");
      const v = document.getElementById("final-video");
      v.play();
    };

    const resetRitual = () => {
      phase = "READY";
      stopCountdown();
      clearAll();
      recordedChunks = [];
      cycleIndex = 0;

      mainBtn.innerText = "Kiai";
      mainBtn.style.display = "block";
      secBtn.style.display = "none";

      timerContainer.style.opacity = 0;
      updateCycleStatus();
      recDot.classList.remove("active");
    };

    const loop = () => {
      if (phase === "DRAWING") {
        const elapsed = Date.now() - startTime;
        remainingTime = Math.max(0, timeLimit - elapsed);
        const ratio = remainingTime / timeLimit;

        document.getElementById("timer-display").innerText = (remainingTime / 1000).toFixed(1);
        document.getElementById("timer-bar").style.transform = `scaleX(${ratio})`;

        if (remainingTime <= 0) {
          pauseCycle();
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
    const closeReplayBtn = document.getElementById("close-replay-btn");
    const resetBtn = document.getElementById("reset-btn");
    const saveBtn = document.getElementById("save-btn");
    const zoomBtn = document.getElementById("zoom-btn");

    const onSave = () => {
      const a = document.createElement("a");
      a.download = `lavoixdushodo_${Date.now()}.png`;
      a.href = paper.toDataURL();
      a.click();
    };

    const preventTouch = (event) => event.preventDefault();

    const updateZoom = (nextZoom) => {
      zoomLevel = nextZoom;
      canvasWrap.style.setProperty("--canvas-zoom", zoomLevel.toString());
      zoomBtn.classList.toggle("active", zoomLevel > 1);
      zoomBtn.title = zoomLevel > 1 ? "Zoom arrière" : "Zoom avant";
    };

    const onZoomToggle = () => {
      updateZoom(zoomLevel > 1 ? 1 : 1.5);
    };

    const onCloseReplay = () => {
      document.getElementById("replay-overlay").classList.remove("active");
      recordedChunks = [];
    };
    const onMainClick = () => {
      if (phase === "READY" || phase === "PAUSED") startCycle();
    };
    const onSecondaryClick = () => {
      if (phase === "PAUSED") {
        phase = "FINISHED";
        finishRitual();
      }
    };

    initBtn.addEventListener("click", onInitClick);
    closeReplayBtn.addEventListener("click", onCloseReplay);
    resetBtn.addEventListener("click", resetRitual);
    saveBtn.addEventListener("click", onSave);
    zoomBtn.addEventListener("click", onZoomToggle);
    mainBtn.addEventListener("click", onMainClick);
    secBtn.addEventListener("click", onSecondaryClick);

    paper.addEventListener("pointerdown", handleDown);
    paper.addEventListener("pointermove", handleMove);
    paper.addEventListener("pointerup", handleUp);
    paper.addEventListener("touchmove", preventTouch, { passive: false });

    const cleanupPreview = setupPreviewCanvas();
    const cleanupSize = setupBrushSizeControls();
    const cleanupInk = setupInkLoadControls();
    const cleanupPanel = setupPanelInteractions();
    setupControls();
    resizeCanvas();
    updateCycleStatus();
    updateZoom(1);

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      cleanupPreview();
      cleanupSize();
      cleanupPanel();
      cleanupInk();
      stopCountdown();
      initBtn.removeEventListener("click", onInitClick);
      closeReplayBtn.removeEventListener("click", onCloseReplay);
      resetBtn.removeEventListener("click", resetRitual);
      saveBtn.removeEventListener("click", onSave);
      zoomBtn.removeEventListener("click", onZoomToggle);
      mainBtn.removeEventListener("click", onMainClick);
      secBtn.removeEventListener("click", onSecondaryClick);
      paper.removeEventListener("pointerdown", handleDown);
      paper.removeEventListener("pointermove", handleMove);
      paper.removeEventListener("pointerup", handleUp);
      paper.removeEventListener("touchmove", preventTouch);
      window.removeEventListener("resize", resizeCanvas);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="app">
      <div id="boot-screen" className="overlay">
        <h1>LA VOIX DU SHODO</h1>
        <p className="boot-subtitle">RITUEL SPECTRAL</p>
        <button id="init-btn">Activer le Pinceau</button>
      </div>

      <div id="replay-overlay" className="replay-overlay">
        <video id="final-video" playsInline loop controls></video>
        <div className="replay-controls">
          <button id="dl-video-btn" className="replay-btn">Sauvegarder Vidéo</button>
          <button id="close-replay-btn" className="replay-btn">Fermer</button>
        </div>
      </div>

      <div className="canvas-area" ref={canvasWrapRef}>
        <canvas id="paper-layer" ref={canvasRef}></canvas>
        <div className="paper-texture"></div>
        <div id="ui-layer" className="ui-layer">
          <div className="top-ui">
            <div id="status-msg">
              <div id="rec-dot"></div>
              <span id="status-text">Prêt à tracer</span>
            </div>
            <div id="countdown-display" className="countdown-display">3</div>

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
            <button id="main-btn" className="main-btn kiai-btn">Kiai</button>
            <button id="secondary-btn" className="main-btn secondary" style={{ display: "none" }}>Terminer l'oeuvre</button>
          </div>
        </div>
      </div>

      <div className="tools-area">
        <div className="tools-row">
          <button id="reset-btn" className="btn-circle" title="Tout effacer">↺</button>
          <button id="save-btn" className="btn-circle" title="Image PNG">↓</button>
          <button id="zoom-btn" className="btn-circle" title="Zoom avant">🔍</button>
        </div>

        <div className="tools-panels">
          <div id="tool-panel" className="controls-panel card">
            <div className="panel-header">
              <span>Encre &amp; Pinceau</span>
              <button id="panel-toggle" className="panel-toggle" type="button">Masquer</button>
            </div>
            <div className="panel-body">
              <div className="control-group inline">
                <div className="control-label">Pinceaux</div>
                <div id="brush-options" className="option-row compact"></div>
              </div>
              <div className="control-group inline">
                <div className="control-label">Encres</div>
                <div id="color-options" className="option-row compact"></div>
              </div>
              <div className="control-group inline">
                <div className="control-label">Taille du tracé</div>
                <div className="size-row">
                  <input id="size-range" type="range" min="0" max="1.2" step="0.05" defaultValue="1" />
                  <span id="size-value" className="size-value">100%</span>
                </div>
              </div>
              <div className="control-group inline">
                <div className="control-label">Charge d&apos;encre</div>
                <div className="size-row">
                  <input id="ink-range" type="range" min="0.5" max="1.6" step="0.05" defaultValue="1" />
                  <span id="ink-value" className="size-value">100%</span>
                </div>
              </div>
              <div className="control-group inline">
                <div className="control-label">Cycle</div>
                <div id="cycle-options" className="option-row"></div>
              </div>
            </div>
          </div>

          <div className="preview-card card">
            <div className="panel-header">
              <span>Zone de test</span>
              <button id="preview-toggle" className="panel-toggle" type="button">Afficher la zone de test</button>
            </div>
            <div className="preview-panel hidden" id="preview-panel">
              <canvas id="preview-canvas" ref={previewCanvasRef} width="210" height="120"></canvas>
              <button id="preview-clear" className="chip-btn" type="button">Effacer</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
