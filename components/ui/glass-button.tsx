"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const glassButtonVariants = cva("glass-button relative cursor-pointer rounded-full", {
  variants: {
    size: {
      default: "",
      sm: "",
      lg: "",
      icon: "h-10 w-10",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

const glassButtonWrapVariants = cva("glass-button-wrap cursor-pointer rounded-full", {
  variants: {
    size: {
      default: "text-lg",
      sm: "text-[15px]",
      lg: "text-xl",
      icon: "text-base",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

const glassButtonTextVariants = cva("glass-button-text", {
  variants: {
    size: {
      default: "",
      sm: "",
      lg: "",
      icon: "flex h-10 w-10 items-center justify-center !p-0",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

export interface GlassButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof glassButtonVariants> {
  contentClassName?: string;
}

const GlassButton = React.forwardRef<HTMLButtonElement, GlassButtonProps>(
  ({ className, children, size, contentClassName, type = "button", ...props }, ref) => {
    return (
      <div className={cn(glassButtonWrapVariants({ size }), className)}>
        <button type={type} className={cn(glassButtonVariants({ size }))} ref={ref} {...props}>
          <span className={cn(glassButtonTextVariants({ size }), contentClassName)}>{children}</span>
        </button>
        <div className="glass-button-shadow rounded-full" />
      </div>
    );
  },
);
GlassButton.displayName = "GlassButton";

export { GlassButton, glassButtonVariants };
