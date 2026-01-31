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

export const useCanvasLoop = ({ canvasRef, canvasWrapRef }) => {
  const uiRef = useRef({});
  const { phaseRef, setPhase } = useRitualState();
  const pointerDrawRef = useRef({
    draw: null,
    lastTime: 0
  });
  const onPointerDown = useCallback((point) => {
    const now = performance.now();
    pointerDrawRef.current.lastTime = now;
    pointerDrawRef.current.lastPoint = point;
    pointerDrawRef.current.draw?.(point, point, 0);
  }, []);
  const onPointerMove = useCallback((from, to) => {
    if (phaseRef.current !== "DRAWING" && phaseRef.current !== "READY") return;
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

    let allowLayering = true;
    let resizeObserver;

    const CANVAS_SCALE = 3;
    const SILENCE_THRESHOLD = 0.01;

    const mainBtn = document.getElementById("main-btn");
    const statusText = document.getElementById("status-text");
    const recDot = document.getElementById("rec-dot");
    const audioMeter = document.getElementById("audio-meter");
    const specViz = document.getElementById("spectrum-viz");
    const layeringToggle = document.getElementById("layering-toggle");
    const layeringValue = document.getElementById("layering-value");
    const initBtn = document.getElementById("init-btn");
    const resetBtn = document.getElementById("reset-btn");
    const specLow = document.getElementById("spec-low");
    const specMid = document.getElementById("spec-mid");
    const specHigh = document.getElementById("spec-high");

    uiRef.current = {
      mainBtn,
      statusText,
      recDot,
      audioMeter,
      specViz,
      specLow,
      specMid,
      specHigh
    };

    const clearAll = () => clearPaper(ctxP, paper.width, paper.height);

    const resizeCanvas = () => {
      resizePaper({
        paper,
        canvasWrap,
        canvasScale: CANVAS_SCALE,
        onClear: () => clearAll()
      });
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

    const drawSpectralBrush = (x1, y1, x2, y2, { dt = 16, force = false } = {}) => {
      const { bands, energy } = audioRef.current;
      const totalVol = bands.low + bands.mid + bands.high + energy.rms;
      if (!force && totalVol < SILENCE_THRESHOLD) return;

      // ✅ encre toujours à jour
      const inkRgb = inkToRgb(activeInkRef.current);
      const adjustedInk = mixColor(inkRgb, paperRgb, 0.2);

      drawBrush(
        ctxP,
        { x: x1, y: y1 },
        { x: x2, y: y2 },
        {
          ink: adjustedInk,
          brush: getAdjustedBrush(),
          drive: {
            energy: energy.rms,
            low: bands.low,
            mid: bands.mid,
            high: Math.max(bands.high, energy.peak)
          },
          dt
        }
      );
    };

    const updateCycleStatus = () => {
      statusText.innerText = "Prêt à écouter";
    };

    const setupControls = () => {
      const brushContainer = document.getElementById("brush-options");
      const colorContainer = document.getElementById("color-options");
      brushContainer.innerHTML = "";
      colorContainer.innerHTML = "";

      brushPresets.forEach((brush, index) => {
        const btn = document.createElement("button");
        btn.className = "chip-btn";
        btn.textContent = brush.name;
        btn.dataset.brushId = brush.id;
        if (index === 0) btn.classList.add("active");

        btn.addEventListener("click", () => {
          activeBrushRef.current = brush;
          [...brushContainer.querySelectorAll(".chip-btn")].forEach((el) => el.classList.remove("active"));
          btn.classList.add("active");
        });

        brushContainer.appendChild(btn);
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

    const startAudio = async () => {
      try {
        await startMicrophone();
        document.getElementById("boot-screen").classList.add("hidden");
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

    const startDrawingCycle = () => {
      setPhase("DRAWING");
      resetVoice();

      recDot.classList.add("active");
      mainBtn.disabled = true;
      if (audioMeter) audioMeter.classList.add("active");
      if (specViz) specViz.style.opacity = 1;
      statusText.innerText = "Voix en peinture...";

      if (audioRef.current.ctx && audioRef.current.ctx.state === "suspended") audioRef.current.ctx.resume();
    };

    const startCycle = () => {
      if (!allowLayering) clearAll();
      startDrawingCycle();
    };

    const resetRitual = () => {
      setPhase("READY");
      clearAll();
      resetVoice();

      mainBtn.innerText = "Peindre";
      mainBtn.style.display = "block";
      mainBtn.disabled = false;

      if (audioMeter) audioMeter.classList.remove("active");
      updateCycleStatus();
      recDot.classList.remove("active");
    };

    const onInitClick = () => {
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        DeviceMotionEvent.requestPermission().then(() => startAudio()).catch(() => startAudio());
      } else {
        startAudio();
      }
    };

    const onMainClick = () => {
      if (phaseRef.current === "READY") startCycle();
    };

    initBtn.addEventListener("click", onInitClick);
    resetBtn.addEventListener("click", resetRitual);
    mainBtn.addEventListener("click", onMainClick);

    const cleanupLayering = setupLayeringControl();

    setupControls();
    resizeCanvas();
    updateCycleStatus();
    resetVoice();

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      cleanupLayering();

      initBtn.removeEventListener("click", onInitClick);
      resetBtn.removeEventListener("click", resetRitual);
      mainBtn.removeEventListener("click", onMainClick);

      window.removeEventListener("resize", resizeCanvas);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [
    audioRef,
    canvasRef,
    canvasWrapRef,
    resetTouch,
    setPhase,
    startMicrophone
  ]);
};
