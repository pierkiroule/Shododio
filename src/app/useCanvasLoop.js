import { useCallback, useEffect, useRef } from "react";
import { brushPresets } from "../brushes/brushPresets";
import { inkPalette } from "../brushes/inks";
import { inkToRgb } from "../brushes/brushUtils";
import { useMicrophone } from "../audio/useMicrophone";
import { clearPaper, resizePaper } from "../engine/Paper";
import { drawBrush } from "../engine/BrushEngine";
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
  const pointerDrawRef = useRef({
    draw: null,
    lastTime: 0
  });
  const smoothDriveRef = useRef({ energy: 0, low: 0, mid: 0, high: 0, peak: 0 });
  const onPointerDown = useCallback((point) => {
    if (phaseRef.current !== "DRAWING") return;
    const now = performance.now();
    pointerDrawRef.current.lastTime = now;
    pointerDrawRef.current.lastPoint = point;
    pointerDrawRef.current.draw?.(point, point, 0);
  }, [phaseRef]);
  const onPointerMove = useCallback((from, to) => {
    if (phaseRef.current !== "DRAWING") return;
    const now = performance.now();
    const dt = Math.min(48, now - pointerDrawRef.current.lastTime);
    pointerDrawRef.current.lastTime = now;
    const start = pointerDrawRef.current.lastPoint ?? from;
    if (start) {
      pointerDrawRef.current.draw?.(start, to, dt);
    }
    pointerDrawRef.current.lastPoint = to;
  }, [phaseRef]);
  const onPointerUp = useCallback(() => {
    pointerDrawRef.current.lastPoint = null;
  }, []);
  const { touchRef, resetTouch } = useTouchGuide({
    canvasWrapRef,
    canvasRef,
    onPointerDown,
    onPointerMove,
    onPointerUp
  });

  // ✅ sources stables
  const activeInkRef = useRef(inkPalette[0]);
  const activeBrushRef = useRef(brushPresets[0]);
  const brushEffects = [
    { id: "pulse", label: "Pulse", hint: "Énergie → taille" },
    { id: "bassWash", label: "Marée", hint: "Basses → eau" },
    { id: "midGrain", label: "Granité", hint: "Médiums → grain" },
    { id: "highFilaments", label: "Filaments", hint: "Aigus → jitter" },
    { id: "splatter", label: "Éclats", hint: "Pics → éclaboussures" }
  ];
  const effectsRef = useRef(
    brushEffects.reduce((acc, effect) => ({ ...acc, [effect.id]: true }), {})
  );

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

    uiRef.current = {
      statusText,
      recDot,
      audioMeter,
      specViz,
      specLow,
      specMid,
      specHigh
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
      resizePaper({
        paper,
        canvasWrap,
        exportCanvas,
        canvasScale: CANVAS_SCALE,
        onClear: null
      });
      baseCanvas.width = paper.width;
      baseCanvas.height = paper.height;
      clearAll();
    };

    const getAdjustedBrush = () => {
      const b = activeBrushRef.current;

      return {
        ...b,
        flow: clamp(b.flow, 0.05, 2),
        wetness: clamp(b.wetness, 0.05, 2.5),
        grain: clamp(b.grain, 0, 1)
      };
    };

    const applyAudioGrammar = (brush, drive, peak) => {
      const nextBrush = { ...brush };
      const nextDrive = { ...drive };
      const effects = effectsRef.current;

      if (effects.pulse) {
        const pulse = clamp(0.7 + nextDrive.energy * 1.4 + peak * 0.5, 0.5, 2.2);
        nextBrush.baseSize *= pulse;
        nextBrush.flow = clamp(nextBrush.flow + nextDrive.energy * 0.35, 0.05, 2);
      }

      if (effects.bassWash) {
        nextBrush.wetness = clamp(nextBrush.wetness + nextDrive.low * 1.1, 0.05, 2.5);
        nextBrush.spread = (nextBrush.spread ?? 1) + nextDrive.low * 1.6;
      }

      if (effects.midGrain) {
        nextBrush.grain = clamp(nextBrush.grain + nextDrive.mid * 0.9, 0, 1);
        nextBrush.flow = clamp(nextBrush.flow - nextDrive.mid * 0.12, 0.05, 2);
      }

      if (effects.highFilaments) {
        nextBrush.jitter = clamp(nextBrush.jitter + nextDrive.high * 0.8, 0, 2.5);
        nextBrush.bristles = Math.round((nextBrush.bristles ?? 0) + nextDrive.high * 22);
      }

      if (effects.splatter) {
        nextDrive.high = clamp(nextDrive.high + peak * 0.7, 0, 1.6);
        nextDrive.energy = clamp(nextDrive.energy + peak * 0.5, 0, 1);
      }

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

      brushEffects.forEach((effect) => {
        const label = document.createElement("label");
        label.className = "effect-toggle";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.checked = effectsRef.current[effect.id];
        input.addEventListener("change", (event) => {
          effectsRef.current[effect.id] = event.target.checked;
        });

        const text = document.createElement("span");
        text.className = "effect-text";
        text.textContent = effect.label;

        const hint = document.createElement("span");
        hint.className = "effect-hint";
        hint.textContent = effect.hint;

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
    };

    pointerDrawRef.current.draw = (from, to, dt) => {
      drawSpectralBrush(from.x, from.y, to.x, to.y, { dt, force: true });
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
    };
  }, [
    audioRef,
    canvasRef,
    canvasWrapRef,
    exportActionsRef,
    resetTouch,
    setPhase,
    startMicrophone
  ]);
};
