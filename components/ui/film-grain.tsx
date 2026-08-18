"use client";

import { cn } from "@/lib/utils";

export function FilmGrain({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 z-20 opacity-[0.08] mix-blend-overlay", className)}>
      <div
        className="absolute inset-0 h-full w-full"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat",
        }}
      />
    </div>
  );
}
