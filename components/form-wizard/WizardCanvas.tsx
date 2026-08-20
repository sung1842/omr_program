"use client";

import type { KonvaEventObject } from "konva/lib/Node";
import type Konva from "konva";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Circle, Layer, Rect, Stage, Text, Transformer, Image as KonvaImage } from "react-konva";
import { useTheme } from "@/components/theme-provider";
import { clampRect, fromRelative, toRelative } from "@/lib/geometry";
import { CanvasCloseButton } from "./CanvasCloseButton";
import { CanvasToolbar, type CanvasTool } from "./CanvasToolbar";
import {
  computeFit,
  defaultCircleRel,
  isInsideImage,
  layerToRel,
  panAfterScaleAroundPoint,
  pointerToImage,
  relToLayer,
  squareAroundCenter,
  squareFromDrag,
} from "./canvas-geometry";

export type RelRect = { x: number; y: number; w: number; h: number };

export type CanvasCircle = RelRect & { id: string };

export type CanvasMarkerId = "tl" | "tr" | "br" | "bl";

export type CanvasMarker = RelRect & { id: CanvasMarkerId };

export type WizardCanvasMode = "corners" | "region" | "circles";

export type { CanvasTool };

export type WizardCanvasProps = {
  image: HTMLImageElement | null;
  mode: WizardCanvasMode;
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  drawEnabled?: boolean;
  markers?: Array<{ id: "tl" | "tr" | "br" | "bl"; x: number; y: number; w: number; h: number }>;
  onMarkersChange?: (
    markers: Array<{ id: "tl" | "tr" | "br" | "bl"; x: number; y: number; w: number; h: number }>,
  ) => void;
  region: RelRect | null;
  onRegionChange: (region: RelRect | null) => void;
  onRegionPaste?: (region: RelRect) => void;
  circles: CanvasCircle[];
  onCirclesChange: (circles: CanvasCircle[]) => void;
};

const MIN_DRAW_PX = 6;
const PASTE_OFFSET = 0.02;
const SCREEN_STROKE = 1.45;
const SCREEN_DASH = 5;
const SCREEN_GAP = 4;
const SCREEN_LABEL = 18;
const EMPTY_MARKERS: CanvasMarker[] = [];
const MARKER_LABELS: Record<CanvasMarkerId, string> = {
  tl: "좌상",
  tr: "우상",
  br: "우하",
  bl: "좌하",
};

function offsetRel(rel: RelRect, dx = PASTE_OFFSET, dy = PASTE_OFFSET): RelRect {
  return {
    x: Math.min(Math.max(0, rel.x + dx), Math.max(0, 1 - rel.w)),
    y: Math.min(Math.max(0, rel.y + dy), Math.max(0, 1 - rel.h)),
    w: rel.w,
    h: rel.h,
  };
}

function screenPx(px: number, zoom: number) {
  return px / Math.max(zoom, 0.01);
}

function screenDash(zoom: number) {
  const unit = screenPx(1, zoom);
  return [SCREEN_DASH * unit, SCREEN_GAP * unit];
}

function shouldStartDraw(target: Konva.Node) {
  let node: Konva.Node | null = target;
  while (node) {
    if (node.getClassName() === "Transformer") {
      return false;
    }
    const name = node.name();
    if (name === "region" || name === "circle" || name === "marker" || name === "circle-delete") {
      return false;
    }
    node = node.getParent();
  }
  return true;
}

function readTransformedRect(node: Konva.Node) {
  const scaleX = Math.abs(node.scaleX()) || 1;
  const scaleY = Math.abs(node.scaleY()) || 1;
  node.scaleX(1);
  node.scaleY(1);
  const className = node.getClassName();
  if (className === "Circle") {
    const circle = node as Konva.Circle;
    const radius = Math.max(3, circle.radius() * Math.max(scaleX, scaleY));
    return {
      x: circle.x() - radius,
      y: circle.y() - radius,
      w: radius * 2,
      h: radius * 2,
    };
  }
  if (className === "Ellipse") {
    const ellipse = node as Konva.Ellipse;
    const radius = Math.max(3, ellipse.radiusX() * scaleX, ellipse.radiusY() * scaleY);
    return {
      x: ellipse.x() - radius,
      y: ellipse.y() - radius,
      w: radius * 2,
      h: radius * 2,
    };
  }
  return {
    x: node.x(),
    y: node.y(),
    w: Math.max(4, node.width() * scaleX),
    h: Math.max(4, node.height() * scaleY),
  };
}

export function WizardCanvas({
  image,
  mode,
  tool,
  onToolChange,
  drawEnabled = false,
  markers,
  onMarkersChange,
  region,
  onRegionChange,
  onRegionPaste,
  circles,
  onCirclesChange,
}: WizardCanvasProps) {
  const { theme } = useTheme();
  const dark = theme !== "light";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const skipClickRef = useRef(false);
  const panDragRef = useRef<{ x: number; y: number } | null>(null);
  const clipboardRef = useRef<{ kind: "circle" | "region"; x: number; y: number; w: number; h: number } | null>(
    null,
  );
  const scaleRef = useRef(1);
  const [stageSize, setStageSize] = useState({ width: 800, height: 640 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  scaleRef.current = scale;
  const [drawing, setDrawing] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const drawingRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const finishDrawRef = useRef<() => void>(() => undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const markerList = markers ?? EMPTY_MARKERS;

  function startDrawing(next: { x: number; y: number; w: number; h: number }) {
    skipClickRef.current = false;
    drawingRef.current = next;
    setDrawing(next);
  }

  function updateDrawing(next: { x: number; y: number; w: number; h: number }) {
    drawingRef.current = next;
    setDrawing(next);
  }

  function stopDrawing() {
    const current = drawingRef.current;
    drawingRef.current = null;
    setDrawing(null);
    return current;
  }

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    const observer = new ResizeObserver(() => {
      setStageSize({
        width: Math.max(320, node.clientWidth),
        height: Math.max(420, node.clientHeight),
      });
    });
    observer.observe(node);
    setStageSize({
      width: Math.max(320, node.clientWidth),
      height: Math.max(420, node.clientHeight),
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    drawingRef.current = null;
    setDrawing(null);
  }, [mode, tool]);

  useEffect(() => {
    if (mode === "region") {
      setSelectedId(region ? "region" : null);
    }
  }, [mode, region]);

  useEffect(() => {
    if (mode === "circles") {
      setSelectedId((current) => (circles.some((circle) => circle.id === current) ? current : null));
    }
  }, [mode, circles]);

  useEffect(() => {
    if (mode === "corners") {
      setSelectedId((current) => (markerList.some((marker) => marker.id === current) ? current : null));
    }
  }, [mode, markerList]);

  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, [image]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) {
      return;
    }
    function startPan(event: MouseEvent) {
      if (event.button !== 1) {
        return;
      }
      event.preventDefault();
      panDragRef.current = { x: event.clientX, y: event.clientY };
      setPanning(true);
      drawingRef.current = null;
      setDrawing(null);
    }
    function movePan(event: MouseEvent) {
      const drag = panDragRef.current;
      if (!drag) {
        return;
      }
      event.preventDefault();
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      panDragRef.current = { x: event.clientX, y: event.clientY };
      const zoom = scaleRef.current || 1;
      setPan((current) => ({ x: current.x + dx / zoom, y: current.y + dy / zoom }));
    }
    function stopPan() {
      if (!panDragRef.current) {
        return;
      }
      panDragRef.current = null;
      setPanning(false);
    }
    function onWindowMouseUp(event: MouseEvent) {
      if (!panDragRef.current) {
        return;
      }
      if (event.button === 1 || (event.buttons & 4) === 0) {
        stopPan();
      }
    }
    function blockAutoscroll(event: MouseEvent) {
      if (event.button === 1) {
        event.preventDefault();
      }
    }
    node.addEventListener("mousedown", startPan, { capture: true, passive: false });
    node.addEventListener("auxclick", blockAutoscroll);
    window.addEventListener("mousemove", movePan);
    window.addEventListener("mouseup", onWindowMouseUp);
    window.addEventListener("blur", stopPan);
    return () => {
      node.removeEventListener("mousedown", startPan, { capture: true });
      node.removeEventListener("auxclick", blockAutoscroll);
      window.removeEventListener("mousemove", movePan);
      window.removeEventListener("mouseup", onWindowMouseUp);
      window.removeEventListener("blur", stopPan);
    };
  }, []);

  useEffect(() => {
    function onWindowDrawUp(event: MouseEvent) {
      if (event.button !== 0) {
        return;
      }
      finishDrawRef.current();
    }
    window.addEventListener("mouseup", onWindowDrawUp);
    return () => window.removeEventListener("mouseup", onWindowDrawUp);
  }, []);

  const fitLayout = useMemo(() => {
    if (!image) {
      return { fit: 1, imageX: 0, imageY: 0 };
    }
    return computeFit(image.width, image.height, stageSize.width, stageSize.height);
  }, [image, stageSize.height, stageSize.width]);

  const { fit, imageX, imageY } = fitLayout;
  const originX = imageX + pan.x;
  const originY = imageY + pan.y;

  function toRelFromLayer(layerX: number, layerY: number, layerW: number, layerH: number) {
    if (!image) {
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    return layerToRel(
      layerX,
      layerY,
      layerW,
      layerH,
      image.width,
      image.height,
      originX,
      originY,
      fit,
    );
  }

  function commitNodeRect(id: string, node: Konva.Node) {
    if (!image) {
      return;
    }
    const raw = readTransformedRect(node);
    const squared = circles.some((circle) => circle.id === id)
      ? squareAroundCenter(raw.x, raw.y, raw.w, raw.h)
      : raw;
    const rel = toRelFromLayer(squared.x, squared.y, squared.w, squared.h);
    if (id === "region") {
      onRegionChange(rel);
      return;
    }
    if (circles.some((circle) => circle.id === id)) {
      onCirclesChange(circles.map((circle) => (circle.id === id ? { ...circle, ...rel } : circle)));
      return;
    }
    if (!onMarkersChange) {
      return;
    }
    onMarkersChange(
      markerList.map((marker) => (marker.id === id ? { ...marker, ...rel } : marker)),
    );
  }

  useLayoutEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) {
      return;
    }
    if (drawing || !selectedId || !image) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }
    const layer = transformer.getLayer();
    if (!layer) {
      return;
    }
    const node = layer.findOne((item: Konva.Node) => item.id() === selectedId);
    transformer.nodes(node ? [node] : []);
    transformer.forceUpdate();
    layer.batchDraw();
  }, [circles, drawing, image, markerList, mode, region, selectedId, stageSize, scale, pan]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      const withModifier = event.ctrlKey || event.metaKey;
      if (withModifier && event.code === "KeyC") {
        if (selectedId === "region" && region) {
          event.preventDefault();
          clipboardRef.current = { kind: "region", ...region };
        } else if (selectedId) {
          const circle = circles.find((item) => item.id === selectedId);
          if (circle) {
            event.preventDefault();
            if (image) {
              const px = fromRelative(circle, image.width, image.height);
              clipboardRef.current = {
                kind: "circle",
                ...toRelative(squareAroundCenter(px.x, px.y, px.w, px.h), image.width, image.height),
              };
            } else {
              clipboardRef.current = {
                kind: "circle",
                x: circle.x,
                y: circle.y,
                w: circle.w,
                h: circle.h,
              };
            }
          }
        }
        return;
      }
      if (withModifier && event.code === "KeyV") {
        const clip = clipboardRef.current;
        if (!clip || mode === "corners") {
          return;
        }
        event.preventDefault();
        const pasted = offsetRel(clip);
        if (clip.kind === "circle") {
          const id = crypto.randomUUID();
          const squared =
            image != null
              ? (() => {
                  const px = fromRelative(pasted, image.width, image.height);
                  return toRelative(
                    squareAroundCenter(px.x, px.y, px.w, px.h),
                    image.width,
                    image.height,
                  );
                })()
              : pasted;
          onCirclesChange([...circles, { id, ...squared }]);
          setSelectedId(id);
          return;
        }
        if (onRegionPaste) {
          onRegionPaste(pasted);
        } else {
          onRegionChange(pasted);
        }
        setSelectedId("region");
        return;
      }
      if (event.key === "Escape") {
        setSelectedId(null);
        return;
      }
      if (mode === "corners" || !selectedId || selectedId === "region") {
        return;
      }
      if (event.key !== "Backspace" && event.key !== "Delete") {
        return;
      }
      event.preventDefault();
      onCirclesChange(circles.filter((circle) => circle.id !== selectedId));
      setSelectedId(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [circles, image, mode, onCirclesChange, onRegionChange, onRegionPaste, region, selectedId]);

  function toImagePoint(stageX: number, stageY: number) {
    return pointerToImage(stageX, stageY, originX, originY, fit, scale);
  }

  const questionEdit = mode === "region" || mode === "circles";
  const canDrawRect = drawEnabled && tool === "rect";
  const canDrawCircle = drawEnabled && tool === "circle";
  const markerInteractive = mode === "corners" && tool === "select";
  const regionInteractive = questionEdit && (tool === "select" || tool === "rect");
  const circleInteractive = questionEdit && (tool === "select" || tool === "circle");

  function onMouseDown(event: KonvaEventObject<MouseEvent>) {
    if (event.evt.button !== 0) {
      return;
    }
    if (tool === "pan") {
      panDragRef.current = { x: event.evt.clientX, y: event.evt.clientY };
      setPanning(true);
      drawingRef.current = null;
      setDrawing(null);
      return;
    }
    if (!image || drawingRef.current || !shouldStartDraw(event.target)) {
      return;
    }
    if (tool === "select" || (!canDrawRect && !canDrawCircle)) {
      setSelectedId(null);
      return;
    }
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }
    const point = toImagePoint(pointer.x, pointer.y);
    if (!isInsideImage(point.x, point.y, image.width, image.height)) {
      return;
    }
    startDrawing({ x: point.x, y: point.y, w: 1, h: 1 });
  }

  function onMouseMove(event: KonvaEventObject<MouseEvent>) {
    const current = drawingRef.current;
    if (panDragRef.current || !current || !image) {
      return;
    }
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!pointer) {
      return;
    }
    const point = toImagePoint(pointer.x, pointer.y);
    const next = {
      x: current.x,
      y: current.y,
      w: point.x - current.x,
      h: point.y - current.y,
    };
    updateDrawing(canDrawCircle ? squareFromDrag(next.x, next.y, next.w, next.h) : next);
  }

  function onMouseUp() {
    if (panDragRef.current) {
      return;
    }
    const current = stopDrawing();
    skipClickRef.current = false;
    if (!current || !image) {
      return;
    }
    const draft = canDrawCircle
      ? squareFromDrag(current.x, current.y, current.w, current.h)
      : current;
    const rect = clampRect(draft.x, draft.y, draft.w, draft.h, image.width, image.height);
    if (canDrawRect) {
      if (rect.w < MIN_DRAW_PX || rect.h < MIN_DRAW_PX) {
        return;
      }
      const rel = toRelative(rect, image.width, image.height);
      onRegionChange(rel);
      setSelectedId("region");
      return;
    }
    if (!canDrawCircle) {
      return;
    }
    if (rect.w < MIN_DRAW_PX || rect.h < MIN_DRAW_PX) {
      const rel = defaultCircleRel(current.x, current.y, image.width, image.height);
      const id = crypto.randomUUID();
      onCirclesChange([...circles, { id, ...rel }]);
      setSelectedId(id);
      return;
    }
    const squared = squareAroundCenter(rect.x, rect.y, rect.w, rect.h);
    const rel = toRelative(squared, image.width, image.height);
    const id = crypto.randomUUID();
    onCirclesChange([...circles, { id, ...rel }]);
    setSelectedId(id);
  }
  finishDrawRef.current = onMouseUp;

  function deleteCircle(id: string) {
    onCirclesChange(circles.filter((circle) => circle.id !== id));
    setSelectedId(null);
  }

  const selectedCircle = circleInteractive ? circles.find((circle) => circle.id === selectedId) : null;
  const selectedCircleLayer =
    selectedCircle && image
      ? relToLayer(selectedCircle, image.width, image.height, originX, originY, fit)
      : null;
  const regionLayer =
    image && region ? relToLayer(region, image.width, image.height, originX, originY, fit) : null;

  const zoom = scale;
  const strokeW = screenPx(SCREEN_STROKE, zoom);
  const selectedStrokeW = screenPx(SCREEN_STROKE + 0.35, zoom);
  const dash = screenDash(zoom);
  const labelSize = screenPx(SCREEN_LABEL, zoom);
  const markerStroke = dark ? "rgba(232, 121, 249, 0.95)" : "rgba(192, 38, 211, 0.92)";
  const markerFill = dark ? "rgba(217, 70, 239, 0.16)" : "rgba(192, 38, 211, 0.12)";
  const markerText = dark ? "rgba(250, 232, 255, 0.95)" : "rgba(162, 28, 175, 0.92)";
  const regionStroke = dark ? "rgba(251, 113, 133, 0.92)" : "rgba(225, 29, 72, 0.88)";
  const regionFill = regionInteractive ? "rgba(244, 63, 94, 0.14)" : "rgba(244, 63, 94, 0.08)";
  const circleStroke = dark ? "rgba(56, 189, 248, 0.92)" : "rgba(2, 132, 199, 0.88)";
  const circleFill = "rgba(56, 189, 248, 0.12)";
  const strokeForMode = canDrawCircle || circleInteractive ? circleStroke : canDrawRect || regionInteractive ? regionStroke : markerStroke;

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-0 w-full overflow-hidden bg-box"
    >
      {image ? (
        <CanvasToolbar tool={tool} onToolChange={onToolChange} drawEnabled={drawEnabled} />
      ) : null}
      <Stage
        width={stageSize.width}
        height={stageSize.height}
        scaleX={scale}
        scaleY={scale}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={(event) => {
          event.evt.preventDefault();
          const nextScale = Math.min(3, Math.max(0.5, event.evt.deltaY > 0 ? scale * 0.95 : scale * 1.05));
          if (nextScale === scale) {
            return;
          }
          setPan((current) =>
            panAfterScaleAroundPoint(
              current,
              scale,
              nextScale,
              stageSize.width / 2,
              stageSize.height / 2,
            ),
          );
          setScale(nextScale);
        }}
        style={{
          cursor: panning || tool === "pan" ? (panning ? "grabbing" : "grab") : tool === "select" ? "default" : image ? "crosshair" : "default",
        }}
      >
        <Layer>
          {image ? (
            <KonvaImage
              image={image}
              x={originX}
              y={originY}
              width={image.width * fit}
              height={image.height * fit}
            />
          ) : null}
          {image
            ? markerList.map((marker) => {
                const rect = relToLayer(marker, image.width, image.height, originX, originY, fit);
                const interactive = markerInteractive;
                return (
                  <Rect
                    key={marker.id}
                    id={marker.id}
                    name="marker"
                    x={rect.x}
                    y={rect.y}
                    width={rect.w}
                    height={rect.h}
                    stroke={markerStroke}
                    strokeWidth={selectedId === marker.id ? selectedStrokeW : strokeW}
                    dash={dash}
                    fill={markerFill}
                    listening={interactive}
                    draggable={interactive && Boolean(onMarkersChange)}
                    onMouseDown={(event) => {
                      if (event.evt.button !== 0) {
                        return;
                      }
                      event.cancelBubble = true;
                      if (onMarkersChange) {
                        setSelectedId(marker.id);
                      }
                    }}
                    onClick={() => {
                      if (onMarkersChange) {
                        setSelectedId(marker.id);
                      }
                    }}
                    onDragStart={() => {
                      skipClickRef.current = true;
                      setSelectedId(marker.id);
                    }}
                    onDragEnd={(event) => {
                      skipClickRef.current = true;
                      commitNodeRect(marker.id, event.target);
                    }}
                    onTransformStart={() => {
                      skipClickRef.current = true;
                    }}
                    onTransformEnd={(event) => {
                      skipClickRef.current = true;
                      commitNodeRect(marker.id, event.target);
                    }}
                  />
                );
              })
            : null}
          {image
            ? markerList.map((marker) => {
                const rect = relToLayer(marker, image.width, image.height, originX, originY, fit);
                return (
                  <Text
                    key={`${marker.id}-label`}
                    x={rect.x}
                    y={rect.y - labelSize - screenPx(3, zoom)}
                    text={MARKER_LABELS[marker.id]}
                    fill={markerText}
                    fontSize={labelSize}
                    fontStyle="bold"
                    listening={false}
                  />
                );
              })
            : null}
          {regionLayer ? (
            <Rect
              id="region"
              name="region"
              x={regionLayer.x}
              y={regionLayer.y}
              width={regionLayer.w}
              height={regionLayer.h}
              stroke={regionStroke}
              strokeWidth={selectedId === "region" ? selectedStrokeW : strokeW}
              dash={dash}
              fill={regionFill}
              hitStrokeWidth={10}
              listening={regionInteractive}
              draggable={regionInteractive}
              onMouseDown={(event) => {
                if (event.evt.button !== 0) {
                  return;
                }
                event.cancelBubble = true;
                setSelectedId("region");
              }}
              onDragStart={() => {
                skipClickRef.current = true;
                setSelectedId("region");
              }}
              onDragEnd={(event) => {
                skipClickRef.current = true;
                commitNodeRect("region", event.target);
              }}
              onTransformStart={() => {
                skipClickRef.current = true;
              }}
              onTransformEnd={(event) => {
                skipClickRef.current = true;
                commitNodeRect("region", event.target);
              }}
            />
          ) : null}
          {image
            ? circles.map((circle) => {
                const rect = relToLayer(circle, image.width, image.height, originX, originY, fit);
                const side = Math.max(rect.w, rect.h);
                const interactive = circleInteractive;
                return (
                  <Circle
                    key={circle.id}
                    id={circle.id}
                    name="circle"
                    x={rect.x + rect.w / 2}
                    y={rect.y + rect.h / 2}
                    radius={side / 2}
                    stroke={circleStroke}
                    strokeWidth={selectedId === circle.id ? selectedStrokeW : strokeW}
                    dash={dash}
                    fill={circleFill}
                    hitStrokeWidth={12}
                    listening={interactive}
                    draggable={interactive}
                    onMouseDown={(event) => {
                      if (event.evt.button !== 0) {
                        return;
                      }
                      event.cancelBubble = true;
                      setSelectedId(circle.id);
                    }}
                    onClick={() => setSelectedId(circle.id)}
                    onDragStart={() => {
                      skipClickRef.current = true;
                      setSelectedId(circle.id);
                    }}
                    onDragEnd={(event) => {
                      skipClickRef.current = true;
                      commitNodeRect(circle.id, event.target);
                    }}
                    onTransformStart={() => {
                      skipClickRef.current = true;
                    }}
                    onTransformEnd={(event) => {
                      skipClickRef.current = true;
                      commitNodeRect(circle.id, event.target);
                    }}
                  />
                );
              })
            : null}
          {drawing && image && canDrawCircle ? (
            <Circle
              x={originX + (drawing.x + drawing.w / 2) * fit}
              y={originY + (drawing.y + drawing.h / 2) * fit}
              radius={Math.max(Math.abs(drawing.w), Math.abs(drawing.h)) * fit / 2}
              stroke={circleStroke}
              strokeWidth={strokeW}
              dash={dash}
              listening={false}
            />
          ) : null}
          {drawing && image && !canDrawCircle ? (
            <Rect
              x={originX + Math.min(drawing.x, drawing.x + drawing.w) * fit}
              y={originY + Math.min(drawing.y, drawing.y + drawing.h) * fit}
              width={Math.abs(drawing.w) * fit}
              height={Math.abs(drawing.h) * fit}
              stroke={regionStroke}
              strokeWidth={strokeW}
              dash={dash}
              listening={false}
            />
          ) : null}
          <Transformer
            ref={transformerRef}
            rotateEnabled={false}
            flipEnabled={false}
            ignoreStroke
            padding={1}
            anchorSize={5}
            borderStrokeWidth={strokeW}
            anchorFill="#fff"
            anchorStroke={strokeForMode}
            borderStroke={strokeForMode}
            enabledAnchors={
              selectedId && circles.some((circle) => circle.id === selectedId)
                ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                : [
                    "top-left",
                    "top-right",
                    "bottom-left",
                    "bottom-right",
                    "top-center",
                    "bottom-center",
                    "middle-left",
                    "middle-right",
                  ]
            }
            keepRatio={Boolean(selectedId && circles.some((circle) => circle.id === selectedId))}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 8 || newBox.height < 8) {
                return oldBox;
              }
              if (selectedId && circles.some((circle) => circle.id === selectedId)) {
                const side = Math.max(Math.abs(newBox.width), Math.abs(newBox.height));
                return { ...newBox, width: side, height: side };
              }
              return newBox;
            }}
          />
        </Layer>
      </Stage>
      {selectedCircleLayer ? (
        <CanvasCloseButton
          left={(selectedCircleLayer.x + selectedCircleLayer.w) * scale}
          top={selectedCircleLayer.y * scale}
          label="Delete circle"
          onDelete={() => {
            if (selectedId) {
              deleteCircle(selectedId);
            }
          }}
        />
      ) : null}
      {regionLayer && selectedId === "region" && regionInteractive ? (
        <CanvasCloseButton
          left={(regionLayer.x + regionLayer.w) * scale}
          top={regionLayer.y * scale}
          label="Delete box"
          onDelete={() => {
            onRegionChange(null);
            setSelectedId(null);
          }}
        />
      ) : null}
    </div>
  );
}

export default WizardCanvas;
