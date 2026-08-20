"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { NumberTicker } from "@/components/ui/number-ticker";
import { cn } from "@/lib/utils";

const ACCENTS = {
  cyan: "glow-stat-cyan",
  emerald: "glow-stat-emerald",
  violet: "glow-stat-violet",
  amber: "glow-stat-amber",
  rose: "glow-stat-rose",
  sky: "glow-stat-sky",
} as const;

export function GlowingStatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "cyan",
  index = 0,
  href,
  compact = false,
  orbit = true,
}: {
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  accent?: keyof typeof ACCENTS;
  index?: number;
  href?: string;
  compact?: boolean;
  orbit?: boolean;
}) {
  const card = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08 }}
      className={cn("glow-stat-outer", ACCENTS[accent], compact && "glow-stat-compact", href && "cursor-pointer")}
    >
      <article className="glow-stat-card">
        <span className="glow-stat-ray" aria-hidden />
        <span className="glow-stat-frame" aria-hidden />
        {orbit ? <span className="glow-orbit-dot" aria-hidden /> : null}
        <div className="relative z-10 flex items-start justify-between gap-2">
          <p className="text-[0.6875rem] tracking-wide text-white/55">{label}</p>
          <Icon className="glow-stat-icon size-3.5" strokeWidth={1.75} />
        </div>
        <p className={cn("relative z-10 mt-auto font-mono leading-none tracking-tight", compact ? "text-[1.45rem]" : "text-[1.85rem]")}>
          <NumberTicker className="glow-stat-value" value={value} delay={index * 0.12} />
        </p>
        <p className="relative z-10 mt-1.5 text-[0.625rem] leading-4 text-white/40">{hint}</p>
      </article>
    </motion.div>
  );

  if (href) {
    return (
      <Link href={href} className="block min-w-0" aria-label={`${label} 페이지로 이동`}>
        {card}
      </Link>
    );
  }

  return card;
}
