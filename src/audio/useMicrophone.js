import { useCallback, useEffect, useRef } from "react";
import { createAnalyser, createAudioContext, resumeAudioContext } from "./audioUtils";
import { updateEnergy, updateFrequencyBands } from "./audioFeatures";

export const useMicrophone = ({ onSpectrum, onReady } = {}) => {
  const audioRef = useRef({
    ctx: null,
    analyser: null,
    data: null,
    timeData: null,
    stream: null,
    sourceNode: null,
    mediaElement: null,
    fileUrl: null,
    bands: { low: 0, mid: 0, high: 0 },
    energy: { rms: 0, peak: 0 }
  });
  const rafRef = useRef(null);
  const lastPeakTimeRef = useRef(0);
  const lastTickRef = useRef(0);
  const TARGET_FPS = 30;

  const stopLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopSources = useCallback(() => {
    const audio = audioRef.current;
    if (audio.stream) {
      audio.stream.getTracks().forEach((track) => track.stop());
    }
    if (audio.sourceNode) {
      audio.sourceNode.disconnect();
    }
    if (audio.mediaElement) {
      audio.mediaElement.pause();
      audio.mediaElement.src = "";
    }
    if (audio.fileUrl) {
      URL.revokeObjectURL(audio.fileUrl);
    }

    audio.stream = null;
    audio.sourceNode = null;
    audio.mediaElement = null;
    audio.fileUrl = null;
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (!audioRef.current.ctx || audioRef.current.ctx.state === "closed") {
      audioRef.current.ctx = createAudioContext();
    }
    return audioRef.current.ctx;
  }, []);

  const setupAnalyser = useCallback((audioCtx) => {
    const analyser = createAnalyser(audioCtx);
    audioRef.current.analyser = analyser;
    audioRef.current.data = new Uint8Array(analyser.frequencyBinCount);
    audioRef.current.timeData = new Uint8Array(analyser.fftSize);
    return analyser;
  }, []);

  const startLoop = useCallback(() => {
    const loop = () => {
      const now = performance.now();
      if (now - lastTickRef.current < 1000 / TARGET_FPS) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }
      lastTickRef.current = now;

      const audio = audioRef.current;
      if (!audio.analyser || !audio.data || !audio.timeData) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      audio.analyser.getByteFrequencyData(audio.data);
      audio.analyser.getByteTimeDomainData(audio.timeData);

      updateFrequencyBands(audio.data, audio.bands);
      updateEnergy(audio.timeData, audio.energy, lastPeakTimeRef);

      if (onSpectrum) {
        onSpectrum({ bands: audio.bands, energy: audio.energy });
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, [onSpectrum]);

  const startMicrophone = useCallback(async () => {
    stopSources();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = ensureAudioContext();
    await resumeAudioContext(audioCtx);
    const analyser = setupAnalyser(audioCtx);
    const sourceNode = audioCtx.createMediaStreamSource(stream);
    sourceNode.connect(analyser);

    audioRef.current.stream = stream;
    audioRef.current.sourceNode = sourceNode;

    stopLoop();
    startLoop();

    if (onReady) onReady(audioRef.current);
  }, [ensureAudioContext, onReady, setupAnalyser, startLoop, stopLoop, stopSources]);

  const startAudioFile = useCallback(async (file) => {
    if (!file) return;
    stopSources();

    const audioCtx = ensureAudioContext();
    await resumeAudioContext(audioCtx);
    const analyser = setupAnalyser(audioCtx);

    const mediaElement = new Audio();
    const fileUrl = URL.createObjectURL(file);
    mediaElement.src = fileUrl;
    mediaElement.loop = true;
    mediaElement.preload = "auto";
    mediaElement.crossOrigin = "anonymous";

    const sourceNode = audioCtx.createMediaElementSource(mediaElement);
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);

    audioRef.current.mediaElement = mediaElement;
    audioRef.current.fileUrl = fileUrl;
    audioRef.current.sourceNode = sourceNode;

    await mediaElement.play();

    stopLoop();
    startLoop();

    if (onReady) onReady(audioRef.current);
  }, [ensureAudioContext, onReady, setupAnalyser, startLoop, stopLoop, stopSources]);

  useEffect(() => () => {
    stopLoop();
    stopSources();
    if (audioRef.current.ctx) {
      audioRef.current.ctx.close();
    }
  }, [stopLoop, stopSources]);

  return {
    audioRef,
    startMicrophone,
    startAudioFile
  };
};
