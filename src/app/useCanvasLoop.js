import { useCallback, useEffect, useRef } from "react";
import { brushPresets } from "../brushes/brushPresets";
import { inkPalette } from "../brushes/inks";
import { inkToRgb } from "../brushes/brushUtils";
import { useMicrophone } from "../audio/useMicrophone";
import { clearPaper, resizePaper } from "../engine/Paper";
import { drawBrush } from "../engine/BrushEngine";
import { createSamplerEngine } from "../engine/SamplerEngine";
import { useTouchGuide } from "../interaction/useTouchGuide";
import { useRitualState } from "../ritual/useRitualState";
import { mixColor, paperRgb } from "../utils/color";
import { clamp } from "../utils/math";

export const useCanvasLoop = ({ canvasRef, canvasWrapRef, updateCycles, galleryActionsRef }) => {
  const uiRef = useRef({});
  const audioCtxRef = useRef(null);
  const { phaseRef, startTimeRef, timeLimitRef, remainingTimeRef, setPhase } = useRitualState();
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

    let mediaRecorder;
    let recordedChunks = [];
    let mediaStream;
    let allowLayering = true;
    let previewBusy = false;
    let cycleIndex = 0;
    let resizeObserver;

    const CANVAS_SCALE = 3;
    const PREVIEW_LONG_EDGE = 360;
    const PREVIEW_FPS = 20;
    const MAX_CYCLES = 5;
    const SILENCE_THRESHOLD = 0.01;

    const previewCanvas = document.createElement("canvas");
    const previewCtx = previewCanvas.getContext("2d", { alpha: false });
    const exportCanvas = document.createElement("canvas");
    const exportCtx = exportCanvas.getContext("2d", { alpha: false });
    const sampler = createSamplerEngine({
      previewCanvas,
      previewCtx,
      exportCanvas,
      exportCtx,
      audioCtxRef,
      previewFps: PREVIEW_FPS
    });

    const cyclesRef = { current: [] };

    const mainBtn = document.getElementById("main-btn");
    const statusText = document.getElementById("status-text");
    const recDot = document.getElementById("rec-dot");
    const audioMeter = document.getElementById("audio-meter");
    const specViz = document.getElementById("spectrum-viz");
    const layeringToggle = document.getElementById("layering-toggle");
    const layeringValue = document.getElementById("layering-value");
    const initBtn = document.getElementById("init-btn");
    const resetBtn = document.getElementById("reset-btn");
    const stopBtn = document.getElementById("stop-btn");
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
        exportCanvas,
        previewCanvas,
        canvasScale: CANVAS_SCALE,
        previewLongEdge: PREVIEW_LONG_EDGE,
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

    const drawSpectralBrush = (x1, y1, x2, y2, { dt = 16 } = {}) => {
      const { bands, energy } = audioRef.current;
      const totalVol = bands.low + bands.mid + bands.high + energy.rms;
      if (totalVol < SILENCE_THRESHOLD) return;

      // ✅ encre toujours à jour
      const inkRgb = inkToRgb(activeInkRef.current);
      const adjustedInk = mixColor(inkRgb, paperRgb, 0.2);
      const drive = {
        energy: energy.rms,
        low: bands.low,
        mid: bands.mid,
        high: Math.max(bands.high, energy.peak)
      };
      const { brush, drive: adjustedDrive } = applyAudioGrammar(getAdjustedBrush(), drive, energy.peak);

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
    };

    const updateCycleStatus = () => {
      statusText.innerText = "Prêt à écouter";
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
        await startMicrophone();
        mediaStream = audioRef.current.stream;
        audioCtxRef.current = audioRef.current.ctx;
        setupRecorder();
        document.getElementById("boot-screen").classList.add("hidden");
        loop();
      } catch (error) {
        console.error(error);
        alert("Micro requis.");
      }
    };

    const resetVoice = () => {
      resetTouch();
    };

    const pushCycle = (cycle) => {
      updateCycles((prev) => {
        const next = [...prev, cycle];
        if (next.length > MAX_CYCLES) {
          const removed = next.shift();
          sampler.cleanupCycleAssets(removed);
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
          if (cycle.id === id) sampler.cleanupCycleAssets(cycle);
          return cycle.id !== id;
        });
        cyclesRef.current = next;
        return next;
      });
    };

    const clearGallery = () => {
      updateCycles((prev) => {
        prev.forEach((cycle) => sampler.cleanupCycleAssets(cycle));
        cyclesRef.current = [];
        return [];
      });
    };

    const registerCycle = async () => {
      if (previewBusy) return;
      previewBusy = true;
      try {
        cycleIndex += 1;
        const snapshot = await createImageBitmap(paper);
        const durationSeconds = Math.max(1, (timeLimitRef.current - remainingTimeRef.current) / 1000);
        const cycle = {
          id: `${Date.now()}_${cycleIndex}`,
          duration: durationSeconds,
          seed: Math.random(),
          guide: { x: touchRef.current.x, y: touchRef.current.y },
          audioData: {
            bands: { ...audioRef.current.bands },
            energy: { ...audioRef.current.energy }
          },
          snapshot,
          preview: { avURL: "", imageURL: "" },
          selected: false
        };
        await sampler.createPreviewImage(cycle);
        await sampler.recordPreviewAV(cycle);
        pushCycle(cycle);
      } finally {
        previewBusy = false;
      }
    };

    pointerDrawRef.current.draw = (from, to, dt) => {
      drawSpectralBrush(from.x, from.y, to.x, to.y, { dt });
    };

    const startDrawingCycle = () => {
      setPhase("DRAWING");
      timeLimitRef.current = 10000;
      startTimeRef.current = Date.now();
      remainingTimeRef.current = timeLimitRef.current;
      resetVoice();

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

      if (audioRef.current.ctx && audioRef.current.ctx.state === "suspended") audioRef.current.ctx.resume();
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
      if (audioRef.current.ctx && audioRef.current.ctx.state === "suspended") audioRef.current.ctx.resume();
      void registerCycle();
    };

    const resetRitual = () => {
      setPhase("READY");
      clearAll();
      recordedChunks = [];
      resetVoice();

      mainBtn.innerText = "Peindre";
      mainBtn.style.display = "block";
      stopBtn.style.display = "none";

      if (audioMeter) audioMeter.classList.remove("active");
      updateCycleStatus();
      recDot.classList.remove("active");
    };

    const loop = () => {
      if (phaseRef.current === "DRAWING") {
        const elapsed = Date.now() - startTimeRef.current;
        remainingTimeRef.current = Math.max(0, timeLimitRef.current - elapsed);

        if (remainingTimeRef.current <= 0) {
          setPhase("FINISHED");
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

    const onMainClick = () => {
      if (phaseRef.current === "READY" || phaseRef.current === "FINISHED") startCycle();
    };

    const onStop = () => {
      if (phaseRef.current === "DRAWING") {
        setPhase("FINISHED");
        finishRitual();
      }
    };

    initBtn.addEventListener("click", onInitClick);
    resetBtn.addEventListener("click", resetRitual);
    mainBtn.addEventListener("click", onMainClick);
    stopBtn.addEventListener("click", onStop);

    const cleanupLayering = setupLayeringControl();

    setupControls();
    resizeCanvas();
    updateCycleStatus();
    resetVoice();

    resizeObserver = new ResizeObserver(() => resizeCanvas());
    resizeObserver.observe(canvasWrap);
    window.addEventListener("resize", resizeCanvas);

    galleryActionsRef.current = {
      updateCycleSelection,
      deleteCycle,
      clearGallery,
      exportImageHD: sampler.exportImageHD,
      exportCycleAV: sampler.exportCycleAV,
      exportGlobalImage: sampler.exportGlobalImage,
      exportGroupedAV: sampler.exportGroupedAV,
      exportStopMotionGIF: sampler.exportStopMotionGIF,
      exportZipBundle: sampler.exportZipBundle
    };

    return () => {
      cleanupLayering();

      initBtn.removeEventListener("click", onInitClick);
      resetBtn.removeEventListener("click", resetRitual);
      mainBtn.removeEventListener("click", onMainClick);
      stopBtn.removeEventListener("click", onStop);

      window.removeEventListener("resize", resizeCanvas);
      if (resizeObserver) resizeObserver.disconnect();

      cyclesRef.current.forEach((cycle) => sampler.cleanupCycleAssets(cycle));
    };
  }, [
    audioRef,
    canvasRef,
    canvasWrapRef,
    galleryActionsRef,
    resetTouch,
    setPhase,
    startMicrophone,
    timeLimitRef,
    startTimeRef,
    remainingTimeRef,
    updateCycles
  ]);
};
