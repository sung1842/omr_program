import type { Marker } from "@/lib/types";

export type DraftRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function clampRect(
  x: number,
  y: number,
  w: number,
  h: number,
  imageWidth: number,
  imageHeight: number,
): { x: number; y: number; w: number; h: number } {
  const x0 = Math.min(x, x + w);
  const y0 = Math.min(y, y + h);
  const x1 = Math.max(x, x + w);
  const y1 = Math.max(y, y + h);
  const nx = Math.max(0, Math.min(x0, imageWidth));
  const ny = Math.max(0, Math.min(y0, imageHeight));
  const nw = Math.max(1, Math.min(x1, imageWidth) - nx);
  const nh = Math.max(1, Math.min(y1, imageHeight) - ny);
  return { x: nx, y: ny, w: nw, h: nh };
}

export function toRelative(
  rect: { x: number; y: number; w: number; h: number },
  imageWidth: number,
  imageHeight: number,
) {
  return {
    x: round6(rect.x / imageWidth),
    y: round6(rect.y / imageHeight),
    w: round6(rect.w / imageWidth),
    h: round6(rect.h / imageHeight),
  };
}

export function fromRelative(
  rect: { x: number; y: number; w: number; h: number },
  imageWidth: number,
  imageHeight: number,
) {
  return {
    x: rect.x * imageWidth,
    y: rect.y * imageHeight,
    w: rect.w * imageWidth,
    h: rect.h * imageHeight,
  };
}

export function assignCornerIds(
  rects: DraftRect[],
): Array<DraftRect & { id: Marker["id"] }> {
  if (rects.length !== 4) {
    return [];
  }
  const withCenter = rects.map((rect) => ({
    ...rect,
    cx: rect.x + rect.w / 2,
    cy: rect.y + rect.h / 2,
  }));
  const byY = [...withCenter].sort((a, b) => a.cy - b.cy);
  const top = byY.slice(0, 2).sort((a, b) => a.cx - b.cx);
  const bottom = byY.slice(2).sort((a, b) => a.cx - b.cx);
  return [
    { id: "tl", x: top[0].x, y: top[0].y, w: top[0].w, h: top[0].h },
    { id: "tr", x: top[1].x, y: top[1].y, w: top[1].w, h: top[1].h },
    { id: "br", x: bottom[1].x, y: bottom[1].y, w: bottom[1].w, h: bottom[1].h },
    { id: "bl", x: bottom[0].x, y: bottom[0].y, w: bottom[0].w, h: bottom[0].h },
  ];
}

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
