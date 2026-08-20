import { clampRect, fromRelative, toRelative } from "@/lib/geometry";

export type PixelRect = { x: number; y: number; w: number; h: number };

export function computeFit(
  imageWidth: number,
  imageHeight: number,
  stageWidth: number,
  stageHeight: number,
) {
  const fit = Math.min(stageWidth / imageWidth, stageHeight / imageHeight, 1);
  return {
    fit,
    imageX: (stageWidth - imageWidth * fit) / 2,
    imageY: (stageHeight - imageHeight * fit) / 2,
  };
}

export function pointerToImage(
  pointerX: number,
  pointerY: number,
  imageX: number,
  imageY: number,
  fit: number,
  scale: number,
) {
  return {
    x: (pointerX / scale - imageX) / fit,
    y: (pointerY / scale - imageY) / fit,
  };
}

/** Keep the viewport point fixed when Stage scale is applied from (0, 0). */
export function panAfterScaleAroundPoint(
  pan: { x: number; y: number },
  oldScale: number,
  newScale: number,
  pointX: number,
  pointY: number,
) {
  if (oldScale === newScale) {
    return pan;
  }
  return {
    x: pan.x + pointX / newScale - pointX / oldScale,
    y: pan.y + pointY / newScale - pointY / oldScale,
  };
}

export function relToLayer(
  rel: PixelRect,
  imageWidth: number,
  imageHeight: number,
  imageX: number,
  imageY: number,
  fit: number,
) {
  const rect = fromRelative(rel, imageWidth, imageHeight);
  return {
    x: imageX + rect.x * fit,
    y: imageY + rect.y * fit,
    w: rect.w * fit,
    h: rect.h * fit,
  };
}

export function layerToRel(
  layerX: number,
  layerY: number,
  layerW: number,
  layerH: number,
  imageWidth: number,
  imageHeight: number,
  imageX: number,
  imageY: number,
  fit: number,
) {
  const clamped = clampRect(
    (layerX - imageX) / fit,
    (layerY - imageY) / fit,
    layerW / fit,
    layerH / fit,
    imageWidth,
    imageHeight,
  );
  return toRelative(clamped, imageWidth, imageHeight);
}

export function defaultCircleRel(
  cx: number,
  cy: number,
  imageWidth: number,
  imageHeight: number,
) {
  const side = Math.max(16, Math.min(imageWidth, imageHeight) * 0.028);
  return toRelative(
    clampRect(cx - side / 2, cy - side / 2, side, side, imageWidth, imageHeight),
    imageWidth,
    imageHeight,
  );
}

export function isInsideImage(x: number, y: number, imageWidth: number, imageHeight: number) {
  return x >= 0 && y >= 0 && x <= imageWidth && y <= imageHeight;
}

/** Square bounding box from a corner drag. Uses the longer side so the circle covers the drag. */
export function squareFromDrag(x: number, y: number, w: number, h: number) {
  const sx = w < 0 ? -1 : 1;
  const sy = h < 0 ? -1 : 1;
  const side = Math.max(Math.abs(w), Math.abs(h), 1);
  return { x, y, w: sx * side, h: sy * side };
}

/** Keep the center, force width === height. */
export function squareAroundCenter(x: number, y: number, w: number, h: number) {
  const side = Math.max(Math.abs(w), Math.abs(h), 1);
  return {
    x: x + w / 2 - side / 2,
    y: y + h / 2 - side / 2,
    w: side,
    h: side,
  };
}
