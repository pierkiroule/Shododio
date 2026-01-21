import { clamp } from "./math";

export const hexToRgb = (hex) => {
  const clean = hex.replace("#", "");
  const intVal = parseInt(clean, 16);
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255
  };
};

export const mixColor = (rgb, target, amount) => ({
  r: Math.round(rgb.r + (target.r - rgb.r) * amount),
  g: Math.round(rgb.g + (target.g - rgb.g) * amount),
  b: Math.round(rgb.b + (target.b - rgb.b) * amount)
});

export const rgba = (rgb, alpha) => `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;

export const paperRgb = { r: 244, g: 241, b: 234 };
