export const throttle = (fn, wait = 120) => {
  let lastTime = 0;
  let timeout;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - lastTime);
    if (remaining <= 0) {
      lastTime = now;
      fn(...args);
    } else {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        lastTime = Date.now();
        fn(...args);
      }, remaining);
    }
  };
};

export const clampFps = (deltaMs, maxDelta = 48) => Math.min(maxDelta, deltaMs);
