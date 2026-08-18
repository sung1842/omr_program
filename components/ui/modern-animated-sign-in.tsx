"use client";

import {
  memo,
  useEffect,
  useRef,
  useState,
  type ForwardedRef,
  type ReactNode,
} from "react";
import { motion, useAnimation, useInView, useMotionTemplate, useMotionValue } from "motion/react";
import { cn } from "@/lib/utils";

export const SpotlightInput = memo(function SpotlightInput({
  className,
  type,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { ref?: ForwardedRef<HTMLInputElement> }) {
  const radius = 110;
  const [visible, setVisible] = useState(false);
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove({ currentTarget, clientX, clientY }: React.MouseEvent<HTMLDivElement>) {
    const { left, top } = currentTarget.getBoundingClientRect();
    mouseX.set(clientX - left);
    mouseY.set(clientY - top);
  }

  return (
    <motion.div
      style={{
        background: useMotionTemplate`
          radial-gradient(
            ${visible ? `${radius}px` : "0px"} circle at ${mouseX}px ${mouseY}px,
            #67e8f9,
            transparent 80%
          )
        `,
      }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      className="group/input rounded-xl p-[1.5px] transition duration-300"
    >
      <input
        type={type}
        className={cn(
          "h-11 w-full rounded-[10px] border-0 bg-black/55 px-3 text-sm text-white shadow-[0px_0px_1px_1px_#334155] outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-cyan-300/40",
          className,
        )}
        {...props}
      />
    </motion.div>
  );
});

type BoxRevealProps = {
  children: ReactNode;
  width?: string;
  duration?: number;
  className?: string;
};

export const BoxReveal = memo(function BoxReveal({
  children,
  width = "fit-content",
  duration,
  className,
}: BoxRevealProps) {
  const mainControls = useAnimation();
  const slideControls = useAnimation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (isInView) {
      slideControls.start("visible");
      mainControls.start("visible");
    }
  }, [isInView, mainControls, slideControls]);

  return (
    <div ref={ref} style={{ width }} className={cn("relative overflow-hidden", className)}>
      <motion.div
        variants={{
          hidden: { opacity: 0, y: 48 },
          visible: { opacity: 1, y: 0 },
        }}
        initial="hidden"
        animate={mainControls}
        transition={{ duration: duration ?? 0.45, delay: 0.18 }}
      >
        {children}
      </motion.div>
      <motion.div
        variants={{ hidden: { left: 0 }, visible: { left: "100%" } }}
        initial="hidden"
        animate={slideControls}
        transition={{ duration: duration ?? 0.45, ease: "easeIn" }}
        className="absolute inset-y-1 left-0 right-0 z-20 rounded bg-cyan-300"
      />
    </div>
  );
});

export function BottomGradient() {
  return (
    <>
      <span className="absolute inset-x-0 -bottom-px block h-px w-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-0 transition duration-500 group-hover/btn:opacity-100" />
      <span className="absolute inset-x-10 -bottom-px mx-auto block h-px w-1/2 bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-0 blur-sm transition duration-500 group-hover/btn:opacity-100" />
    </>
  );
}

export function Ripple({
  mainCircleSize = 180,
  mainCircleOpacity = 0.22,
  numCircles = 8,
  className,
}: {
  mainCircleSize?: number;
  mainCircleOpacity?: number;
  numCircles?: number;
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 flex items-center justify-center", className)}>
      {Array.from({ length: numCircles }, (_, index) => {
        const size = mainCircleSize + index * 64;
        const opacity = Math.max(mainCircleOpacity - index * 0.025, 0.03);
        return (
          <span
            key={index}
            className="absolute animate-ripple rounded-full border border-white/15 bg-white/5"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              opacity,
              animationDelay: `${index * 0.08}s`,
              top: "50%",
              left: "50%",
            }}
          />
        );
      })}
    </div>
  );
}
