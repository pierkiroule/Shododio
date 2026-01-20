import { useEffect, useRef } from "react";

const brushes = [
  { id: "kasane", name: "Kasane", baseSize: 18, bristles: 18, spread: 1.1, flow: 0.7, jitter: 0.6, grain: 0.35 },
  { id: "kasure", name: "Kasure", baseSize: 12, bristles: 10, spread: 1.8, flow: 0.35, jitter: 0.4, grain: 0.75 },
  { id: "bokashi", name: "Bokashi", baseSize: 26, bristles: 8, spread: 1.3, flow: 0.25, jitter: 0.2, grain: 0.2 },
  { id: "hayai", name: "Hayai", baseSize: 10, bristles: 14, spread: 0.8, flow: 0.55, jitter: 0.9, grain: 0.45 },
  { id: "tsubu", name: "Tsubu", baseSize: 14, bristles: 6, spread: 2.1, flow: 0.4, jitter: 0.5, grain: 0.9 }
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
    let brushSizeScale = 1;
    let opacityScale = 1;
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
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
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
      const radius = Math.max(12, size);
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
      ctx.globalCompositeOperation = "multiply";

      let dx = x2 - x1;
      let dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      let nx = 0;
      let ny = 0;
      if (len > 0) {
        nx = -dy / len;
        ny = dx / len;
      }

      const audioBoost = 1 + localEnergy.rms * 0.9 + localEnergy.peak * 1.1;
      const jitterBase = (localBands.high * 10 + localEnergy.rms * 10) * brush.jitter * audioBoost;

      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        let cx = x1 + (x2 - x1) * t;
        let cy = y1 + (y2 - y1) * t;

        cx += (Math.random() - 0.5) * jitterBase;
        cy += (Math.random() - 0.5) * jitterBase;

        if (whisper) {
          const washSize = (brush.baseSize * brushSizeScale * 1.9 + localBands.low * 20) * pressure;
          ctx.fillStyle = rgba(mistRgb, 0.1 * brush.flow * opacityScale);
          ctx.beginPath();
          ctx.ellipse(cx, cy, washSize, washSize * 0.65, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }

        if (localBands.low > 0.03) {
          const offset = (Math.random() - 0.5) * 20 * localBands.low * brush.spread;
          const bx = cx + nx * offset;
          const by = cy + ny * offset;

          const size = (brush.baseSize * brushSizeScale * 0.6 + localBands.low * 26) * pressure * audioBoost;
          const alpha = 0.1 * localBands.low * brush.flow * (whisper ? 0.5 : 1) * opacityScale;

          ctx.fillStyle = rgba(deepRgb, alpha);
          ctx.beginPath();
          ctx.ellipse(bx, by, size, size * 0.55, Math.random() * Math.PI, 0, Math.PI * 2);
          ctx.fill();

          if (Math.random() < 0.08 * localBands.low) {
            const stainSize = size * (1.6 + localBands.low);
            addStain(ctx, bx, by, stainSize, baseRgb, localBands.low * 0.6);
          }
        }

        if (localBands.mid > 0.02) {
          const widthBoost = whisper ? 1.5 : 1;
          const brushWidth = (brush.baseSize * brushSizeScale * brush.spread + localBands.mid * 22) * pressure * widthBoost * audioBoost;
          const bristles = Math.max(6, Math.round(brush.bristles + localBands.mid * 12));

          for (let b = 0; b < bristles; b += 1) {
            const spread = (Math.random() - 0.5) * brushWidth * 2;

            if (speed > 0.6 && Math.random() > brush.flow) continue;

            const mx = cx + nx * spread;
            const my = cy + ny * spread;

            const size = (0.6 + Math.random()) * pressure * (whisper ? 0.8 : 1) * brushSizeScale;

            let alpha = 0.6 * localBands.mid * brush.flow;
            if (whisper) alpha *= 0.45;
            alpha *= opacityScale;

            if (Math.random() < brush.grain * 0.3) continue;

            ctx.fillStyle = rgba(baseRgb, alpha);
            ctx.beginPath();
            ctx.arc(mx, my, size, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        const splashIntensity = Math.max(localBands.high, localEnergy.peak);
        if (splashIntensity > 0.1) {
          if (Math.random() < 0.3 + splashIntensity * 0.6) {
            const scatter = (8 + splashIntensity * 40) * brush.spread;
            const hx = cx + (Math.random() - 0.5) * scatter;
            const hy = cy + (Math.random() - 0.5) * scatter;

            const size = (0.6 + Math.random() * (1 + splashIntensity)) * brushSizeScale;
            const alpha = 0.75 * splashIntensity * (whisper ? 0.5 : 1) * opacityScale;

            ctx.fillStyle = rgba(mixColor(baseRgb, { r: 255, g: 255, b: 255 }, 0.2), alpha);
            ctx.beginPath();
            ctx.arc(hx, hy, size, 0, Math.PI * 2);
            ctx.fill();
          }

          if (Math.random() < 0.12 * splashIntensity) {
            const len = 14 * splashIntensity;
            const ang = Math.random() * Math.PI * 2;
            ctx.strokeStyle = rgba(mistRgb, 0.5 * splashIntensity * opacityScale);
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
            ctx.stroke();
          }

          if (localEnergy.peak > 0.2 && Math.random() < 0.6) {
            addSplatter(ctx, cx, cy, localEnergy.peak, baseRgb);
            addStain(ctx, cx, cy, 22 + localEnergy.peak * 40, baseRgb, localEnergy.peak);
          }
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
        brushSizeScale = numeric;
        opacityScale = clamp(1.4 - brushSizeScale * 0.5, 0.6, 1.2);
        sizeValue.textContent = `${Math.round(brushSizeScale * 100)}%`;
      };
      const onInput = (event) => updateSizing(event.target.value);
      sizeRange.addEventListener("input", onInput);
      updateSizing(sizeRange.value);
      return () => sizeRange.removeEventListener("input", onInput);
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
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
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
        mainBtn.innerText = "Cycle suivant";
        mainBtn.style.display = "block";
        secBtn.style.display = "none";
        statusText.innerText = `Respiration — prochain cycle ${cycleIndex + 1}/3`;
      } else {
        mainBtn.innerText = "Nouveau Cycle";
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

      mainBtn.innerText = "Lancer le cycle";
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

    const onSave = () => {
      const a = document.createElement("a");
      a.download = `lavoixdushodo_${Date.now()}.png`;
      a.href = paper.toDataURL();
      a.click();
    };

    const preventTouch = (event) => event.preventDefault();

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
    mainBtn.addEventListener("click", onMainClick);
    secBtn.addEventListener("click", onSecondaryClick);

    paper.addEventListener("pointerdown", handleDown);
    paper.addEventListener("pointermove", handleMove);
    paper.addEventListener("pointerup", handleUp);
    paper.addEventListener("touchmove", preventTouch, { passive: false });

    const cleanupPreview = setupPreviewCanvas();
    const cleanupSize = setupBrushSizeControls();
    const cleanupPanel = setupPanelInteractions();
    setupControls();
    resizeCanvas();
    updateCycleStatus();

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      cleanupPreview();
      cleanupSize();
      cleanupPanel();
      stopCountdown();
      initBtn.removeEventListener("click", onInitClick);
      closeReplayBtn.removeEventListener("click", onCloseReplay);
      resetBtn.removeEventListener("click", resetRitual);
      saveBtn.removeEventListener("click", onSave);
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
            <button id="main-btn" className="main-btn">Lancer le cycle</button>
            <button id="secondary-btn" className="main-btn secondary" style={{ display: "none" }}>Terminer l'oeuvre</button>
          </div>
        </div>
      </div>

      <div className="tools-area">
        <div className="tools-row">
          <button id="reset-btn" className="btn-circle" title="Tout effacer">↺</button>
          <button id="save-btn" className="btn-circle" title="Image PNG">↓</button>
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
                  <input id="size-range" type="range" min="0.6" max="1.6" step="0.05" defaultValue="1" />
                  <span id="size-value" className="size-value">100%</span>
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
