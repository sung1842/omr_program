"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const light = theme === "light";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? "다크 모드로 변경" : "라이트 모드로 변경"}
      title={light ? "다크 모드" : "라이트 모드"}
      className={cn(
        "rounded-full p-1 text-white/55 transition hover:bg-white/10 hover:text-white",
        className,
      )}
    >
      {light ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
    </button>
  );
}
