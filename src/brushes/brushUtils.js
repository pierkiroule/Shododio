import { hexToRgb } from "../utils/color";

export const inkToRgb = (ink) => {
  if (!ink || !ink.value) {
    return { r: 0, g: 0, b: 0 };
  }

  const v = ink.value;

  // Cas 1 : objet RGB { r, g, b }
  if (
    typeof v === "object" &&
    Number.isFinite(v.r) &&
    Number.isFinite(v.g) &&
    Number.isFinite(v.b)
  ) {
    return {
      r: Math.round(v.r),
      g: Math.round(v.g),
      b: Math.round(v.b)
    };
  }

  // Cas 2 : string hex "#rrggbb"
  if (typeof v === "string") {
    const rgb = hexToRgb(v);
    if (rgb) return rgb;
  }

  // Fallback ultime (jamais gris par surprise)
  return { r: 0, g: 0, b: 0 };
};