export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const lerp = (start, end, t) => start + (end - start) * t;

export const randRange = (min, max, rand = Math.random) => min + (max - min) * rand();

export const noise1D = (x, seed = 0) => {
  const value = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
};
