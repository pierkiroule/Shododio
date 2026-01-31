import { useCallback, useEffect, useRef } from "react";
import { createAnalyser, createAudioContext } from "./audioUtils";
import { updateEnergy, updateFrequencyBands } from "./audioFeatures";

export const useMicrophone = ({ onSpectrum, onReady } = {}) => {
  const audioRef = useRef({
    ctx: null,
    analyser: null,
    data: null,
    timeData: null,
    stream: null,
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
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioCtx = createAudioContext();
    const analyser = createAnalyser(audioCtx);
    audioCtx.createMediaStreamSource(stream).connect(analyser);

    audioRef.current.ctx = audioCtx;
    audioRef.current.analyser = analyser;
    audioRef.current.data = new Uint8Array(analyser.frequencyBinCount);
    audioRef.current.timeData = new Uint8Array(analyser.fftSize);
    audioRef.current.stream = stream;

    stopLoop();
    startLoop();

    if (onReady) onReady(audioRef.current);
  }, [onReady, startLoop, stopLoop]);

  useEffect(() => () => {
    stopLoop();
    if (audioRef.current.stream) {
      audioRef.current.stream.getTracks().forEach((track) => track.stop());
    }
    if (audioRef.current.ctx) {
      audioRef.current.ctx.close();
    }
  }, [stopLoop]);

  return {
    audioRef,
    startMicrophone
  };
};
