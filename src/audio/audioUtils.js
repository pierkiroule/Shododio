export const createAudioContext = () => new (window.AudioContext || window.webkitAudioContext)();

export const createAnalyser = (audioCtx) => {
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.3;
  return analyser;
};

export const resumeAudioContext = (audioCtx) => {
  if (audioCtx && audioCtx.state === "suspended") {
    return audioCtx.resume();
  }
  return Promise.resolve();
};
