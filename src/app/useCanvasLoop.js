import { useEffect, useRef } from "react";
import { brushPresets } from "../brushes/brushPresets";
import { inkPalette } from "../brushes/inks";
import { inkToRgb } from "../brushes/brushUtils";
import { useMicrophone } from "../audio/useMicrophone";
import { clearPaper, resizePaper } from "../engine/Paper";
import { drawBrush } from "../engine/BrushEngine";
import { createVoiceState, resetVoiceState, stepVoiceTrajectory } from "../engine/TrajectoryEngine";
import { useTouchGuide } from "../interaction/useTouchGuide";
import { useRitualState } from "../ritual/useRitualState";
import { mixColor, paperRgb } from "../utils/color";
import { clamp } from "../utils/math";

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export const useCanvasLoop = ({ canvasRef, canvasWrapRef, exportActionsRef }) => {
  const uiRef = useRef({});
  const { phaseRef, setPhase } = useRitualState();
  const smoothDriveRef = useRef({ energy: 0, low: 0, mid: 0, high: 0, peak: 0 });
  const voiceStateRef = useRef(createVoiceState());
  const animationFrameRef = useRef(0);
  const lastFrameTimeRef = useRef(0);
  const { touchRef, resetTouch } = useTouchGuide({ canvasWrapRef, canvasRef });

  // ✅ sources stables
  const activeInkRef = useRef(inkPalette[0]);
  const activeBrushRef = useRef(brushPresets[0]);
  const tipPatterns = [
    { id: "classic", label: "Classique", hint: "Flux velouté" },
    { id: "claws", label: "Filaments", hint: "Souffle d’encre" },
    { id: "halo", label: "Auréoles", hint: "Vapeur lumineuse" },
    { id: "halo-complex", label: "Nébuleuse", hint: "Textures auréolées" }
  ];

  const toCssColor = (v) => {
    if (!v) return "rgb(0,0,0)";
    if (typeof v === "string") return v;
    return `rgb(${v.r}, ${v.g}, ${v.b})`;
  };

  const { audioRef, startMicrophone } = useMicrophone({
    onSpectrum: ({ bands }) => {
      const { specLow, specMid, specHigh } = uiRef.current;
      if (!specLow || phaseRef.current !== "DRAWING") return;
      specLow.style.transform = `scaleY(${bands.low})`;
      specMid.style.transform = `scaleY(${bands.mid})`;
      specHigh.style.transform = `scaleY(${bands.high})`;
    }
  });

  useEffect(() => {
    const paper = canvasRef.current;
    const canvasWrap = canvasWrapRef.current;
    if (!paper || !canvasWrap) return undefined;

    const ctxP = paper.getContext("2d", { alpha: false });

    let resizeObserver;

    const CANVAS_SCALE = Math.min(2, window.devicePixelRatio || 1);
    const SILENCE_THRESHOLD = 0.01;

    const statusText = document.getElementById("status-text");
    const recDot = document.getElementById("rec-dot");
    const audioMeter = document.getElementById("audio-meter");
    const specViz = document.getElementById("spectrum-viz");
    const initBtn = document.getElementById("init-btn");
    const resetBtn = document.getElementById("reset-btn");
    const specLow = document.getElementById("spec-low");
    const specMid = document.getElementById("spec-mid");
    const specHigh = document.getElementById("spec-high");
    const brushIndicator = document.getElementById("brush-indicator");

    uiRef.current = {
      statusText,
      recDot,
      audioMeter,
      specViz,
      specLow,
      specMid,
      specHigh,
      brushIndicator
    };

    const clearAll = () => {
      clearPaper(baseCtx, paper.width, paper.height);
      ctxP.drawImage(baseCanvas, 0, 0);
    };

    const exportCanvas = document.createElement("canvas");
    const exportCtx = exportCanvas.getContext("2d", { alpha: false });
    const baseCanvas = document.createElement("canvas");
    const baseCtx = baseCanvas.getContext("2d", { alpha: false });

    const resizeCanvas = () => {
      let snapshot = null;
      if (baseCanvas.width > 0 && baseCanvas.height > 0) {
        snapshot = document.createElement("canvas");
        snapshot.width = baseCanvas.width;
        snapshot.height = baseCanvas.height;
        const snapshotCtx = snapshot.getContext("2d");
        snapshotCtx?.drawImage(baseCanvas, 0, 0);
      }

      resizePaper({
        paper,
        canvasWrap,
        exportCanvas,
        canvasScale: CANVAS_SCALE,
        onClear: null
      });
      baseCanvas.width = paper.width;
      baseCanvas.height = paper.height;

      clearPaper(baseCtx, paper.width, paper.height);
      if (snapshot) {
        baseCtx.drawImage(snapshot, 0, 0, baseCanvas.width, baseCanvas.height);
      }
      ctxP.drawImage(baseCanvas, 0, 0);
    };

    const getAdjustedBrush = () => {
      const b = activeBrushRef.current;

      return {
        ...b,
        flow: clamp(b.flow, 0.05, 2),
        wetness: clamp(b.wetness, 0.05, 2.5),
        grain: clamp(b.grain, 0, 1),
        tipPattern: b.tipPattern ?? "classic"
      };
    };

    const applyAudioGrammar = (brush, drive, peak) => {
      const nextBrush = { ...brush };
      const nextDrive = { ...drive };
      const pulse = clamp(0.6 + nextDrive.energy * 1.6 + peak * 0.8, 0.5, 2.6);
      const impact = clamp(nextDrive.high * 1.2 + peak * 1.1, 0, 2);
      nextBrush.baseSize *= pulse;
      nextBrush.flow = clamp(nextBrush.flow + nextDrive.energy * 0.45, 0.05, 2);

      nextBrush.wetness = clamp(nextBrush.wetness + nextDrive.low * 1.25 + peak * 0.2, 0.05, 2.8);
      nextBrush.spread = (nextBrush.spread ?? 1) + nextDrive.low * 1.8;

      nextBrush.grain = clamp(nextBrush.grain + nextDrive.mid * 1.1, 0, 1);
      nextBrush.flow = clamp(nextBrush.flow - nextDrive.mid * 0.18, 0.05, 2);

      nextBrush.jitter = clamp(nextBrush.jitter + impact * 1.1, 0, 3);
      nextBrush.bristles = Math.round((nextBrush.bristles ?? 0) + impact * 24);

      nextDrive.high = clamp(nextDrive.high + peak * 0.9, 0, 1.8);
      nextDrive.energy = clamp(nextDrive.energy + peak * 0.65, 0, 1);

      return { brush: nextBrush, drive: nextDrive };
    };

    const getLiveDrive = () => {
      const { bands, energy } = audioRef.current;
      return {
        energy: energy.rms,
        low: bands.low,
        mid: bands.mid,
        high: Math.max(bands.high, energy.peak),
        peak: energy.peak
      };
    };

    const smoothDrive = (liveDrive, dt = 16) => {
      const safeDt = Math.max(1, Math.min(48, dt));
      const t = 1 - Math.exp(-safeDt / 120);
      const prev = smoothDriveRef.current;
      const next = {
        energy: prev.energy + (liveDrive.energy - prev.energy) * t,
        low: prev.low + (liveDrive.low - prev.low) * t,
        mid: prev.mid + (liveDrive.mid - prev.mid) * t,
        high: prev.high + (liveDrive.high - prev.high) * t,
        peak: prev.peak + (liveDrive.peak - prev.peak) * t
      };
      smoothDriveRef.current = next;
      return next;
    };

    const blendDrive = (baseDrive, liveDrive) => {
      const mix = 0.65;
      return {
        energy: clamp(baseDrive.energy * (1 - mix) + liveDrive.energy * mix, 0, 1),
        low: clamp(baseDrive.low * (1 - mix) + liveDrive.low * mix, 0, 1.2),
        mid: clamp(baseDrive.mid * (1 - mix) + liveDrive.mid * mix, 0, 1.2),
        high: clamp(baseDrive.high * (1 - mix) + liveDrive.high * mix, 0, 1.6)
      };
    };

    const bakeStroke = ({ from, to, ink, brush, drive, seed, dt }) => {
      drawBrush(baseCtx, from, to, {
        ink,
        brush,
        drive,
        dt,
        seed
      });
    };

    const drawSpectralBrush = (x1, y1, x2, y2, { dt = 16, force = false } = {}) => {
      const liveDrive = getLiveDrive();
      const smoothedDrive = smoothDrive(liveDrive, dt);
      const totalVol = liveDrive.low + liveDrive.mid + liveDrive.high + liveDrive.energy;
      if (totalVol < SILENCE_THRESHOLD && !force) return;

      // ✅ encre toujours à jour
      const inkRgb = inkToRgb(activeInkRef.current);
      const adjustedInk = mixColor(inkRgb, paperRgb, 0.2);
      const baseBrush = getAdjustedBrush();
      const baseDrive = {
        energy: smoothedDrive.energy,
        low: smoothedDrive.low,
        mid: smoothedDrive.mid,
        high: smoothedDrive.high
      };
      const blendedDrive = blendDrive(baseDrive, smoothedDrive);
      const { brush, drive: adjustedDrive } = applyAudioGrammar(baseBrush, blendedDrive, smoothedDrive.peak);

      drawBrush(
        ctxP,
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        {
          ink: adjustedInk,
          brush,
          drive: adjustedDrive,
          dt
        }
      );
      bakeStroke({
        from: { x: x1, y: y1 },
        to: { x: x2, y: y2 },
        ink: adjustedInk,
        brush: baseBrush,
        drive: baseDrive,
        dt,
        seed: Math.floor(Math.random() * 1e9)
      });
    };

    const updateCycleStatus = (label = "Prêt à écouter") => {
      statusText.innerText = label;
    };

    const setupControls = () => {
      const brushContainer = document.getElementById("brush-effects");
      const colorContainer = document.getElementById("color-options");
      brushContainer.innerHTML = "";
      colorContainer.innerHTML = "";

      tipPatterns.forEach((pattern) => {
        const label = document.createElement("label");
        label.className = "effect-toggle";

        const input = document.createElement("input");
        input.type = "radio";
        input.name = "tip-pattern";
        input.checked = activeBrushRef.current.tipPattern === pattern.id;
        input.addEventListener("change", (event) => {
          if (!event.target.checked) return;
          activeBrushRef.current = {
            ...activeBrushRef.current,
            tipPattern: pattern.id
          };
        });

        const text = document.createElement("span");
        text.className = "effect-text";
        text.textContent = pattern.label;

        const hint = document.createElement("span");
        hint.className = "effect-hint";
        hint.textContent = pattern.hint;

        label.appendChild(input);
        label.appendChild(text);
        label.appendChild(hint);
        brushContainer.appendChild(label);
      });

      inkPalette.forEach((ink, index) => {
        const chip = document.createElement("button");
        chip.className = "color-chip";
        chip.style.backgroundColor = toCssColor(ink.value);
        chip.title = ink.name;
        chip.dataset.inkId = ink.id;
        if (index === 0) chip.classList.add("active");

        chip.addEventListener("click", () => {
          activeInkRef.current = ink;
          [...colorContainer.querySelectorAll(".color-chip")].forEach((el) => el.classList.remove("active"));
          chip.classList.add("active");
        });

        colorContainer.appendChild(chip);
      });
    };

    const startAudio = async () => {
      try {
        await startMicrophone();
        document.getElementById("boot-screen").classList.add("hidden");
        setPhase("DRAWING");
        recDot.classList.add("active");
        if (audioMeter) audioMeter.classList.add("active");
        if (specViz) specViz.style.opacity = 1;
        statusText.innerText = "Voix en peinture...";
      } catch (error) {
        console.error(error);
        alert("Micro requis.");
      }
    };

    const resetVoice = () => {
      resetTouch();
      resetVoiceState(voiceStateRef.current, paper, touchRef.current);
    };

    const tick = (time) => {
      animationFrameRef.current = window.requestAnimationFrame(tick);
      if (brushIndicator) {
        const rect = canvasWrap.getBoundingClientRect();
        const scaleX = rect.width > 0 ? rect.width / paper.width : 1;
        const scaleY = rect.height > 0 ? rect.height / paper.height : 1;
        brushIndicator.style.left = `${voiceStateRef.current.x * scaleX}px`;
        brushIndicator.style.top = `${voiceStateRef.current.y * scaleY}px`;
        brushIndicator.style.opacity = "1";
      }
      if (phaseRef.current !== "DRAWING") {
        lastFrameTimeRef.current = time;
        return;
      }
      const lastTime = lastFrameTimeRef.current || time;
      const dt = Math.min(48, Math.max(8, time - lastTime));
      lastFrameTimeRef.current = time;

      stepVoiceTrajectory({
        voiceState: voiceStateRef.current,
        paper,
        canvasScale: CANVAS_SCALE,
        delta: dt,
        bands: audioRef.current.bands,
        energy: audioRef.current.energy,
        touchState: touchRef.current,
        draw: (x1, y1, x2, y2, stepDt) => {
          drawSpectralBrush(x1, y1, x2, y2, { dt: stepDt });
        }
      });

    };

    const resetRitual = () => {
      clearAll();
      smoothDriveRef.current = { energy: 0, low: 0, mid: 0, high: 0, peak: 0 };
      resetVoice();

      updateCycleStatus(phaseRef.current === "DRAWING" ? "Voix en peinture..." : "Prêt à écouter");
    };

    const onInitClick = () => {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission().then(() => startAudio()).catch(() => startAudio());
      } else {
        startAudio();
      }
    };

    initBtn.addEventListener("click", onInitClick);
    resetBtn.addEventListener("click", resetRitual);

    setupControls();
    resizeCanvas();
    updateCycleStatus();
    resetVoice();
    animationFrameRef.current = window.requestAnimationFrame(tick);

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);
    window.addEventListener("resize", resizeCanvas);

    exportActionsRef.current = {
      exportImageHD: () => {
        exportCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
        exportCtx.drawImage(paper, 0, 0, exportCanvas.width, exportCanvas.height);
        exportCanvas.toBlob((blob) => {
          if (!blob) return;
          downloadBlob(blob, "shodo.png");
        }, "image/png");
      }
    };

    return () => {
      initBtn.removeEventListener("click", onInitClick);
      resetBtn.removeEventListener("click", resetRitual);

      window.removeEventListener("resize", resizeCanvas);
      if (resizeObserver) resizeObserver.disconnect();
      window.cancelAnimationFrame(animationFrameRef.current);
    };
  }, [
    audioRef,
    canvasRef,
    canvasWrapRef,
    exportActionsRef,
    resetTouch,
    setPhase,
    startMicrophone,
    touchRef
  ]);
};
