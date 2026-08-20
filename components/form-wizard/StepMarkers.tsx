"use client";

import { RotateCcw } from "lucide-react";
import { GlassSelect } from "@/components/ui/glass-select";
import { MARKER_LABELS, type MarkerShape } from "@/lib/types";
import type { CanvasMarker } from "./WizardCanvas";

type Props = {
  markers: CanvasMarker[];
  markerShape: MarkerShape;
  onMarkerShapeChange: (shape: MarkerShape) => void;
  onReset: () => void;
  imageWidth: number | null;
  imageHeight: number | null;
};

function formatCoord(value: number, size: number | null) {
  if (size) {
    return String(Math.round(value * size));
  }
  return value.toFixed(3);
}

export function StepMarkers({
  markers,
  markerShape,
  onMarkerShapeChange,
  onReset,
  imageWidth,
  imageHeight,
}: Props) {
  return (
    <div className="space-y-4">
      <label className="wizard-field">
        Marker shape
        <GlassSelect
          value={markerShape}
          onChange={(id) => onMarkerShapeChange(id as MarkerShape)}
          options={[
            { id: "square", label: "Square" },
            { id: "circle", label: "Circle" },
          ]}
        />
      </label>
      <ul className="space-y-1 rounded-xl border border-white/12 bg-white/5 px-3 py-2 text-[0.6875rem] text-white/50">
        {(["tl", "tr", "br", "bl"] as const).map((id) => {
          const marker = markers.find((item) => item.id === id);
          const x = marker ? formatCoord(marker.x, imageWidth) : "—";
          const y = marker ? formatCoord(marker.y, imageHeight) : "—";
          return (
            <li key={id}>
              {MARKER_LABELS[id]}( x : {x}, y : {y} )
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onReset} className="wizard-reset">
        <RotateCcw className="size-3" strokeWidth={2.2} />
        Reset
      </button>
      <p className="wizard-hint">
        표 외곽의 좌상·우상·우하·좌하 상자를 실제 모서리로 옮기세요. 손 도구 또는 마우스 휠(가운데)
        버튼으로 양식을 옮길 수 있습니다. 네 점이 있어야 다음 단계로 갑니다.
      </p>
    </div>
  );
}
