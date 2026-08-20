"use client";

import { X } from "lucide-react";

export function CanvasCloseButton({
  left,
  top,
  label,
  onDelete,
}: {
  left: number;
  top: number;
  label: string;
  onDelete: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="wizard-shape-close"
      style={{ left, top }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDelete();
      }}
    >
      <X className="size-2.5" strokeWidth={2.4} />
    </button>
  );
}
