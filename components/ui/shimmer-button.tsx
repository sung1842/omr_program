"use client";

import React, { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = "#ecfeff",
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "100px",
      background = "rgba(8, 145, 178, 1)",
      className,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const resolvedBackground = disabled ? "rgb(82, 82, 91)" : background;

    return (
      <button
        type={type}
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": disabled ? "transparent" : shimmerColor,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": resolvedBackground,
          } as CSSProperties
        }
        className={cn(
          "group relative z-0 flex h-6 items-center justify-center overflow-hidden whitespace-nowrap border px-2 py-0 font-sans text-[0.4375rem] font-semibold tracking-tight text-[#fff] [background:var(--bg)] [border-radius:var(--radius)]",
          "transform-gpu transition-transform duration-300 ease-in-out",
          disabled
            ? "cursor-not-allowed border-transparent text-zinc-300"
            : "cursor-pointer border-cyan-200/35 active:translate-y-px",
          className,
        )}
        ref={ref}
        disabled={Boolean(disabled)}
        {...props}
      >
        {!disabled ? (
          <div className={cn("-z-30 blur-[2px]", "absolute inset-0 overflow-visible [container-type:size]")}>
            <div className="absolute inset-0 h-[100cqh] animate-shimmer-slide [aspect-ratio:1] [border-radius:0] [mask:none]">
              <div className="animate-spin-around absolute -inset-full w-auto rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))] [translate:0_0]" />
            </div>
          </div>
        ) : null}
        <span className="relative z-10">{children}</span>

        <div
          className={cn(
            "pointer-events-none absolute inset-0 size-full",
            "rounded-2xl px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_#ffffff1f]",
            "transform-gpu transition-all duration-300 ease-in-out",
            disabled
              ? "shadow-none"
              : "group-hover:shadow-[inset_0_-6px_10px_#ffffff3f] group-active:shadow-[inset_0_-10px_10px_#ffffff3f]",
          )}
        />

        <div className="absolute -z-20 [background:var(--bg)] [border-radius:var(--radius)] [inset:var(--cut)]" />
      </button>
    );
  },
);

ShimmerButton.displayName = "ShimmerButton";

export { ShimmerButton };
