import { hexToRgb } from "../utils/color";

export const inkToRgb = (ink) => (ink ? hexToRgb(ink.value) : { r: 0, g: 0, b: 0 });

// TODO: add procedural grain/noise helpers when new brush types arrive.
