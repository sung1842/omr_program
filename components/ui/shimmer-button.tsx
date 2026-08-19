"use client";

import React, { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export type ShimmerTone = "primary" | "accent" | "danger";

export interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  tone?: ShimmerTone;
  className?: string;
  children?: React.ReactNode;
}

const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor,
      shimmerSize = "0.05em",
      shimmerDuration = "3s",
      borderRadius = "100px",
      background,
      tone = "primary",
      className,
      children,
      disabled,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const resolvedBackground = disabled
      ? "rgb(82, 82, 91)"
      : (background ?? `var(--btn-${tone}-bg)`);
    const resolvedShimmer = disabled
      ? "transparent"
      : (shimmerColor ?? `var(--btn-${tone}-shimmer)`);

    return (
      <button
        type={type}
        style={
          {
            "--spread": "90deg",
            "--shimmer-color": resolvedShimmer,
            "--radius": borderRadius,
            "--speed": shimmerDuration,
            "--cut": shimmerSize,
            "--bg": resolvedBackground,
          } as CSSProperties
        }
        className={cn(
          "group relative z-0 flex h-[1.9rem] items-center justify-center overflow-hidden whitespace-nowrap border px-[0.7rem] py-0 font-sans text-[0.35rem] font-semibold leading-none tracking-tight text-[var(--btn-text)] [background:var(--bg)] [border-radius:var(--radius)]",
          "transform-gpu transition-transform duration-300 ease-in-out",
          disabled
            ? "cursor-not-allowed border-transparent text-zinc-300 shadow-none"
            : cn(
                "cursor-pointer active:translate-y-px",
                tone === "primary" && "border-[color:var(--btn-primary-border)] shadow-[var(--btn-primary-glow)]",
                tone === "accent" && "border-[color:var(--btn-accent-border)] shadow-[var(--btn-accent-glow)]",
                tone === "danger" && "border-[color:var(--btn-danger-border)] shadow-[var(--btn-danger-glow)]",
              ),
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
            "rounded-2xl shadow-[inset_0_-8px_10px_#ffffff1f]",
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
