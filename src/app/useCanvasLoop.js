import { useEffect, useRef } from "react";
import { brushPresets } from "../brushes/brushPresets";
import { inkPalette } from "../brushes/inks";
import { inkToRgb } from "../brushes/brushUtils";
import { useMicrophone } from "../audio/useMicrophone";
import { clearPaper, resizePaper } from "../engine/Paper";
import { drawBrush } from "../engine/BrushEngine";
import { createSamplerEngine } from "../engine/SamplerEngine";
import { createVoiceState, resetVoiceState, stepVoiceTrajectory } from "../engine/TrajectoryEngine";
import { useTouchGuide } from "../interaction/useTouchGuide";
import { useRitualState } from "../ritual/useRitualState";
import { clamp } from "../utils/math";

export const useCanvasLoop = ({ canvasRef, canvasWrapRef, updateCycles, galleryActionsRef }) => {
  const uiRef = useRef({});
  const audioCtxRef = useRef(null);
  const { phaseRef, startTimeRef, timeLimitRef, remainingTimeRef, setPhase } = useRitualState();
  const { touchRef, resetTouch } = useTouchGuide({ canvasWrapRef, canvasRef });

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
    let lastFrameTime = performance.now();
    let previewBusy = false;
    let cycleIndex = 0;
    let brushSizeScale = 1;
    let inkFlow = 0.72;
    let waterRatio = 0.28;
    let activeBrush = brushPresets[0];
    let activeInk = inkPalette[0];
    let resizeObserver;

    const CANVAS_SCALE = 3;
    const PREVIEW_LONG_EDGE = 360;
    const PREVIEW_FPS = 20;
    const MAX_CYCLES = 5;
    const MIN_BRUSH_SCALE = 0.05;
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

    const voiceState = createVoiceState();
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
      const flowScale = 0.3 + inkFlow;
      const wetnessScale = 0.35 + waterRatio * 1.4;
      const grainScale = 1 - waterRatio * 0.35;
      const jitterScale = 0.8 + waterRatio * 0.4;
      const sizeScale = Math.max(0.35, brushSizeScale);
      return {
        ...activeBrush,
        baseSize: activeBrush.baseSize * sizeScale,
        flow: clamp(activeBrush.flow * flowScale, 0.05, 2),
        wetness: clamp(activeBrush.wetness * wetnessScale, 0.05, 2.5),
        grain: clamp(activeBrush.grain * grainScale, 0, 1),
        jitter: activeBrush.jitter * jitterScale * (0.75 + sizeScale * 0.35),
        bristles: Math.round(activeBrush.bristles * (0.5 + sizeScale * 0.7)),
        spread: activeBrush.spread * (0.6 + sizeScale * 0.9)
      };
    };

    const drawSpectralBrush = (x1, y1, x2, y2, { dt = 16, force = false } = {}) => {
      const { bands, energy } = audioRef.current;
      const totalVol = bands.low + bands.mid + bands.high + energy.rms;
      if (!force && totalVol < SILENCE_THRESHOLD) return;
      drawBrush(ctxP, { x: x1, y: y1 }, { x: x2, y: y2 }, {
        ink: inkToRgb(activeInk),
        brush: getAdjustedBrush(),
        drive: {
          energy: energy.rms,
          low: bands.low,
          mid: bands.mid,
          high: Math.max(bands.high, energy.peak)
        },
        dt
      });
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

      brushPresets.forEach((brush, index) => {
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
      resetVoiceState(voiceState, paper, touchRef.current);
      lastFrameTime = performance.now();
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
          preview: {
            avURL: "",
            imageURL: ""
          },
          selected: false
        };
        await sampler.createPreviewImage(cycle);
        await sampler.recordPreviewAV(cycle);
        pushCycle(cycle);
      } finally {
        previewBusy = false;
      }
    };

    const paintFromVoice = (timestamp) => {
      const delta = Math.min(48, timestamp - lastFrameTime);
      lastFrameTime = timestamp;

      stepVoiceTrajectory({
        voiceState,
        paper,
        canvasScale: CANVAS_SCALE,
        delta,
        bands: audioRef.current.bands,
        energy: audioRef.current.energy,
        touchState: touchRef.current,
        draw: (x1, y1, x2, y2, dt) => drawSpectralBrush(x1, y1, x2, y2, { dt })
      });
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

        paintFromVoice(performance.now());

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
    const cleanupSize = setupBrushSizeControls();
    const cleanupOpacity = setupDilutionControls();
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
      cleanupSize();
      cleanupOpacity();
      cleanupLayering();
      initBtn.removeEventListener("click", onInitClick);
      resetBtn.removeEventListener("click", resetRitual);
      mainBtn.removeEventListener("click", onMainClick);
      stopBtn.removeEventListener("click", onStop);
      window.removeEventListener("resize", resizeCanvas);
      if (resizeObserver) resizeObserver.disconnect();
      cyclesRef.current.forEach((cycle) => sampler.cleanupCycleAssets(cycle));
    };
  }, [audioRef, canvasRef, canvasWrapRef, galleryActionsRef, resetTouch, setPhase, startMicrophone, timeLimitRef, startTimeRef, remainingTimeRef, updateCycles]);
};
