import { clamp } from "../utils/math";

export const createVoiceState = () => ({
  x: 0,
  y: 0,
  angle: 0,
  velocity: 0
});

export const resetVoiceState = (voiceState, paper, touchState) => {
  voiceState.x = paper.width * (0.35 + Math.random() * 0.3);
  voiceState.y = paper.height * (0.35 + Math.random() * 0.3);
  voiceState.angle = Math.random() * Math.PI * 2;
  voiceState.velocity = 0;
  touchState.strength = 0;
  touchState.active = false;
  touchState.swipePower = 0;
  touchState.tapBoost = 0;
  touchState.longPress = false;
};

export const stepVoiceTrajectory = ({
  voiceState,
  paper,
  canvasScale,
  delta,
  bands,
  energy,
  touchState,
  draw
}) => {
  const loudness = clamp(energy.rms + energy.peak * 0.6, 0, 1.2);
  const tapBoost = touchState.tapBoost ?? 0;
  const targetVelocity = clamp(1 + tapBoost * 6, 0.8, 8);
  voiceState.velocity += (targetVelocity - voiceState.velocity) * 0.15;

  const turnAmount = (Math.random() - 0.5) * (0.18 + bands.high * 1.1 + loudness * 0.8);
  voiceState.angle += turnAmount;

  if (touchState.strength > 0) {
    const dxTouch = touchState.x - voiceState.x;
    const dyTouch = touchState.y - voiceState.y;
    const touchAngle = Math.atan2(dyTouch, dxTouch);
    const angleDiff = Math.atan2(Math.sin(touchAngle - voiceState.angle), Math.cos(touchAngle - voiceState.angle));
    const distance = Math.hypot(dxTouch, dyTouch);
    const pull = clamp(touchState.strength * (1 - clamp(distance / (paper.width * 0.7), 0, 1)), 0, 1);
    voiceState.angle += angleDiff * (0.06 + pull * 0.2);

    if (touchState.swipePower > 0) {
      const swipeDiff = Math.atan2(
        Math.sin(touchState.swipeAngle - voiceState.angle),
        Math.cos(touchState.swipeAngle - voiceState.angle)
      );
      voiceState.angle += swipeDiff * (0.05 + touchState.swipePower * 0.18) * touchState.strength;
    }

    if (!touchState.active) {
      touchState.strength = Math.max(0, touchState.strength - delta * 0.0014);
    }
    touchState.swipePower = Math.max(0, touchState.swipePower - delta * 0.002);
  }
  touchState.tapBoost = Math.max(0, touchState.tapBoost - delta * 0.0012);

  const dx = Math.cos(voiceState.angle) * voiceState.velocity * (delta / 16);
  const dy = Math.sin(voiceState.angle) * voiceState.velocity * (delta / 16);
  const nx = voiceState.x + dx;
  const ny = voiceState.y + dy;

  draw?.(voiceState.x, voiceState.y, nx, ny, delta);

  voiceState.x = nx;
  voiceState.y = ny;

  const margin = 40 * canvasScale;
  if (voiceState.x < margin) {
    voiceState.x = margin;
    voiceState.angle = Math.PI - voiceState.angle;
  } else if (voiceState.x > paper.width - margin) {
    voiceState.x = paper.width - margin;
    voiceState.angle = Math.PI - voiceState.angle;
  }

  if (voiceState.y < margin) {
    voiceState.y = margin;
    voiceState.angle = -voiceState.angle;
  } else if (voiceState.y > paper.height - margin) {
    voiceState.y = paper.height - margin;
    voiceState.angle = -voiceState.angle;
  }
};
