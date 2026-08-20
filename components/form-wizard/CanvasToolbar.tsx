"use client";

import { Circle, Hand, MousePointer2, Square } from "lucide-react";
import { cn } from "@/lib/utils";

export type CanvasTool = "select" | "pan" | "circle" | "rect";

const TOOLS: { id: CanvasTool; label: string; icon: typeof Hand }[] = [
  { id: "select", label: "선택", icon: MousePointer2 },
  { id: "pan", label: "이동", icon: Hand },
  { id: "circle", label: "원", icon: Circle },
  { id: "rect", label: "범위", icon: Square },
];

export function CanvasToolbar({
  tool,
  onToolChange,
  drawEnabled,
}: {
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
  drawEnabled: boolean;
}) {
  return (
    <div className="absolute left-3 top-3 z-20 flex gap-0.5 rounded-xl border border-white/12 bg-black/70 p-1 shadow-[var(--elev-shadow)] backdrop-blur-xl [[data-theme=light]_&]:border-line [[data-theme=light]_&]:bg-paper-strong">
      {TOOLS.map((item) => {
        const Icon = item.icon;
        const disabled = (item.id === "circle" || item.id === "rect") && !drawEnabled;
        const active = tool === item.id;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onToolChange(item.id)}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition",
              active
                ? "bg-white text-black [[data-theme=light]_&]:bg-navy [[data-theme=light]_&]:text-paper-strong"
                : "text-white/70 hover:bg-white/10 hover:text-white [[data-theme=light]_&]:text-ink/70 [[data-theme=light]_&]:hover:bg-box [[data-theme=light]_&]:hover:text-ink",
              "disabled:pointer-events-none disabled:opacity-35",
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} />
          </button>
        );
      })}
    </div>
  );
}
