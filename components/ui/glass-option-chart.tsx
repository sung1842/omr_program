"use client";

import { motion } from "motion/react";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";

export type GlassOptionBar = {
  label: string;
  title: string;
  count: number;
};

export function GlassOptionChart({
  title,
  caption,
  options,
  total,
}: {
  title: string;
  caption: string;
  options: GlassOptionBar[];
  total: number;
}) {
  const peak = Math.max(total, ...options.map((option) => option.count), 1);

  return (
    <article className="option-chart-card rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-xs font-medium tracking-wide">{title}</h4>
        <p className="shrink-0 text-[0.625rem] text-white/45">{caption}</p>
      </div>
      <ul className="mt-3 space-y-2.5">
        {options.map((option, index) => {
          const ratio = option.count / peak;
          return (
            <li key={option.label}>
              <div className="mb-1 flex items-end justify-between gap-3 text-[0.625rem] text-white/55">
                <span className="min-w-0">
                  <span className="text-white/85">{option.label}</span>
                  {option.title && option.title !== option.label ? (
                    <span className="mt-0.5 block truncate text-[0.5625rem] text-white/40">
                      {option.title}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-mono text-white/70">
                  <NumberTicker value={option.count} delay={0.04 * index} />회
                </span>
              </div>
              <div className="glass-bar-track">
                <motion.div
                  className={cn("glass-bar-fill", ratio === 0 && "opacity-0")}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.round(ratio * 100)}%` }}
                  transition={{
                    duration: 0.85,
                    delay: 0.08 + index * 0.06,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
