"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BevelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function BevelButton({ active = false, className, type = "button", ...props }: BevelButtonProps) {
  return (
    <button
      type={type}
      data-active={active}
      className={cn(
        "relative flex-1 rounded-md px-1 py-2 text-[0.6875rem] font-semibold tracking-wide transition-[box-shadow,transform,background-color] duration-150",
        "disabled:pointer-events-none disabled:opacity-40",
        active
          ? "bg-gradient-to-b from-navy to-navy-strong text-paper-strong shadow-[inset_0_1px_0_rgba(255,255,255,0.16),inset_0_2px_6px_rgba(0,0,0,0.32)]"
          : "border border-white/12 bg-gradient-to-b from-white/12 to-white/5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(0,0,0,0.3)] hover:from-white/16 active:translate-y-px [[data-theme=light]_&]:border-line [[data-theme=light]_&]:from-paper-strong [[data-theme=light]_&]:to-box [[data-theme=light]_&]:text-ink [[data-theme=light]_&]:shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-1px_0_rgba(18,24,40,0.08),0_1px_2px_rgba(18,24,40,0.08)] [[data-theme=light]_&]:hover:brightness-[0.99] [[data-theme=light]_&]:active:shadow-[inset_0_2px_4px_rgba(18,24,40,0.16)]",
        className,
      )}
      {...props}
    />
  );
}
