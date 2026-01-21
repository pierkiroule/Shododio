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

  const rawLow = (low / lowLimit) * 2.8;
  const rawMid = (mid / (midLimit - lowLimit)) * 3.2;
  const rawHigh = (high / (binCount - midLimit)) * 6.2;

  bands.low += (clamp(rawLow, 0, 1) - bands.low) * 0.25;
  bands.mid += (clamp(rawMid, 0, 1) - bands.mid) * 0.25;
  bands.high += (clamp(rawHigh, 0, 1) - bands.high) * 0.2;

  return bands;
};

export const updateEnergy = (timeData, energy, lastPeakTimeRef) => {
  let sum = 0;
  for (let i = 0; i < timeData.length; i += 1) {
    const v = (timeData[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / timeData.length);
  const normalized = clamp((rms - 0.015) / 0.23, 0, 1);
  energy.rms += (normalized - energy.rms) * 0.3;

  const now = performance.now();
  if (normalized > 0.25 && now - lastPeakTimeRef.current > 120) {
    energy.peak = 1;
    lastPeakTimeRef.current = now;
  }
  energy.peak = Math.max(0, energy.peak - 0.12);

  return energy;
};
