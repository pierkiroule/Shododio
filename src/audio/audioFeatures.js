import { clamp } from "../utils/math";

export const updateFrequencyBands = (data, bands) => {
  const binCount = data.length;
  const lowLimit = Math.floor(binCount * 0.08);
  const midLimit = Math.floor(binCount * 0.45);

  let low = 0;
  let mid = 0;
  let high = 0;

  for (let i = 0; i < binCount; i += 1) {
    const v = data[i] / 255;
    if (i < lowLimit) low += v;
    else if (i < midLimit) mid += v;
    else high += v;
  }

  const rawLow = (low / lowLimit) * 3;
  const rawMid = (mid / (midLimit - lowLimit)) * 3.6;
  const rawHigh = (high / (binCount - midLimit)) * 6.6;

  const shapedLow = clamp(Math.pow(rawLow, 0.85), 0, 1);
  const shapedMid = clamp(Math.pow(rawMid, 0.8), 0, 1);
  const shapedHigh = clamp(Math.pow(rawHigh, 0.75), 0, 1);

  bands.low += (shapedLow - bands.low) * 0.35;
  bands.mid += (shapedMid - bands.mid) * 0.35;
  bands.high += (shapedHigh - bands.high) * 0.28;

  return bands;
};

export const updateEnergy = (timeData, energy, lastPeakTimeRef) => {
  let sum = 0;
  for (let i = 0; i < timeData.length; i += 1) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / timeData.length);
  const normalized = clamp((rms - 0.012) / 0.2, 0, 1);
  energy.rms += (normalized - energy.rms) * 0.36;

  const now = performance.now();
  if (normalized > 0.22 && now - lastPeakTimeRef.current > 110) {
    energy.peak = 1;
    lastPeakTimeRef.current = now;
  }
  energy.peak = Math.max(0, energy.peak - 0.14);

  return energy;
};
