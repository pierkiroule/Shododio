import { paperRgb } from "../utils/color";

export const clearPaper = (ctx, width, height) => {
  // Fond papier
  ctx.fillStyle = `rgb(${paperRgb.r}, ${paperRgb.g}, ${paperRgb.b})`;
  ctx.fillRect(0, 0, width, height);

  // Grain papier — CLAIR (ne tue plus la couleur)
  for (let i = 0; i < 60000; i += 1) {
    const shade = Math.random();
    ctx.fillStyle = `rgba(255,255,255,${shade * 0.035})`;
    ctx.fillRect(
      Math.random() * width,
      Math.random() * height,
      1,
      1
    );
  }
};

export const resizePaper = ({
  paper,
  canvasWrap,
  exportCanvas,
  previewCanvas,
  canvasScale,
  previewLongEdge,
  onClear
}) => {
  const rect = canvasWrap.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * canvasScale));
  const height = Math.max(1, Math.floor(rect.height * canvasScale));
  if (paper.width === width && paper.height === height) return;

  paper.width = width;
  paper.height = height;

  exportCanvas.width = width;
  exportCanvas.height = height;

  const ratio = width / height;
  const previewWidth =
    ratio >= 1 ? previewLongEdge : Math.round(previewLongEdge * ratio);
  const previewHeight =
    ratio >= 1 ? Math.round(previewLongEdge / ratio) : previewLongEdge;

  previewCanvas.width = Math.max(1, previewWidth);
  previewCanvas.height = Math.max(1, previewHeight);

  onClear?.(width, height);
};