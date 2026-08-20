"use client";

import { useEffect, useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

export function NumberTicker({
  value,
  className,
  delay = 0,
}: {
  value: number;
  className?: string;
  delay?: number;
}) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  const started = useRef(false);

  useEffect(() => {
    const from = started.current ? count.get() : 0;
    const isFirst = !started.current;
    started.current = true;
    if (from === value) {
      count.set(value);
      return;
    }
    const delta = Math.abs(value - from);
    const controls = animate(count, value, {
      duration: !isFirst && delta < 8 ? 0.45 : Math.min(1.6, 0.7 + delay),
      ease: "easeOut",
      delay: isFirst ? delay : 0,
    });
    return () => controls.stop();
  }, [count, delay, value]);

  return (
    <motion.span className={cn("tabular-nums", className)}>
      {rounded}
    </motion.span>
  );
}
