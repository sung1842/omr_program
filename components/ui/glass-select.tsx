"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

export type GlassSelectOption = {
  id: string;
  label: string;
  deletable?: boolean;
};

function MarqueeLabel({ text }: { text: string }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const wrap = wrapRef.current;
    const label = textRef.current;
    if (!wrap || !label) {
      return;
    }

    function measure() {
      if (!wrap || !label) {
        return;
      }
      setOverflow(label.scrollWidth > wrap.clientWidth + 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [text]);

  return (
    <span ref={wrapRef} className="scan-marquee">
      <span className={cn("scan-marquee-track", overflow && "can-marquee")}>
        <span ref={textRef} className="scan-marquee-item">
          {text}
        </span>
        {overflow ? (
          <span className="scan-marquee-item" aria-hidden>
            {text}
          </span>
        ) : null}
      </span>
    </span>
  );
}

export function GlassSelect({
  value,
  options,
  onChange,
  onDelete,
  deletingId,
  placeholder = "선택",
  className,
}: {
  value: string;
  options: GlassSelectOption[];
  onChange: (id: string) => void;
  onDelete?: (id: string) => void;
  deletingId?: string;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setConfirmingId(null);
    }
  }, [open]);

  return (
    <div ref={rootRef} className={cn("scan-template-wrap", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn("scan-template-select", open && "is-open")}
      >
        <MarqueeLabel text={selected?.label ?? placeholder} />
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="scan-template-menu"
          >
            {options.map((option) => {
              const active = option.id === value;
              const confirming = confirmingId === option.id;
              const busy = deletingId === option.id;
              const showDelete = Boolean(onDelete && option.deletable);
              return (
                <li key={option.id} className={cn("scan-template-choice", active && "is-active")}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className="scan-template-option"
                    onClick={() => {
                      onChange(option.id);
                      setOpen(false);
                    }}
                  >
                    <MarqueeLabel text={option.label} />
                    {active ? <Check className="scan-template-check size-3.5 shrink-0" strokeWidth={2.4} /> : null}
                  </button>
                  {showDelete ? (
                    confirming ? (
                      <span className="scan-template-delete-confirm">
                        <button
                          type="button"
                          disabled={busy}
                          className="scan-template-delete-yes"
                          onClick={() => {
                            if (busy) {
                              return;
                            }
                            onDelete?.(option.id);
                          }}
                        >
                          {busy ? "지우는 중" : "삭제"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className="scan-template-delete-no"
                          onClick={() => setConfirmingId(null)}
                        >
                          취소
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        aria-label={`${option.label} 삭제`}
                        className="scan-template-delete"
                        onClick={() => setConfirmingId(option.id)}
                      >
                        <Trash2 className="size-3.5" strokeWidth={2.2} />
                      </button>
                    )
                  ) : null}
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
