"use client";

import { BarChart3, ClipboardCheck, FileScan, LogOut, PlayCircle } from "lucide-react";
import { motion, useMotionValue, useSpring, type MotionValue, type Variants } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FilmGrain } from "@/components/ui/film-grain";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DashboardPanel } from "@/components/workspace/DashboardPanel";
import { ExceptionPanel } from "@/components/workspace/ExceptionPanel";
import { ScanPanel } from "@/components/workspace/ScanPanel";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { chapterIndexFromPath, WORKSPACE_CHAPTERS } from "@/lib/workspace";

const textContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const textReveal: Variants = {
  hidden: { y: "100%", opacity: 0 },
  visible: {
    y: "0%",
    opacity: 1,
    transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] },
  },
};

const fadeIn: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: 0.08, ease: "easeOut" },
  },
};

const CHAPTER_ICONS = [BarChart3, FileScan, ClipboardCheck];
const SNAP_THRESHOLD = 90;
const SNAP_COOLDOWN_MS = 720;

const PANELS = [DashboardPanel, ScanPanel, ExceptionPanel] as const;

function VideoBackground({ currentChapterIndex }: { currentChapterIndex: number }) {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);

  useEffect(() => {
    videoRefs.current.forEach((video, index) => {
      if (!video) {
        return;
      }
      if (index === currentChapterIndex) {
        void video.play().catch(() => undefined);
      } else {
        video.pause();
      }
    });
  }, [currentChapterIndex]);

  return (
    <div className="absolute inset-0 h-full w-full overflow-hidden bg-black">
      {WORKSPACE_CHAPTERS.map((chapter, index) => (
        <motion.div
          key={chapter.id}
          initial={false}
          animate={{
            opacity: index === currentChapterIndex ? 1 : 0,
            zIndex: index === currentChapterIndex ? 10 : 0,
          }}
          transition={{ duration: 0.7, ease: "easeInOut" }}
          className="absolute inset-0 h-full w-full"
        >
          <video
            ref={(node) => {
              videoRefs.current[index] = node;
            }}
            src={chapter.videoUrl}
            className="h-full w-full object-cover"
            muted
            loop
            playsInline
            preload={index === 0 ? "auto" : "metadata"}
          />
          <div className="absolute inset-0 bg-black/55" />
        </motion.div>
      ))}
      <FilmGrain />
    </div>
  );
}

function WorkspaceDock({
  activeIndex,
  progress,
  email,
  onJump,
  onLogout,
}: {
  activeIndex: number;
  progress: MotionValue<number>;
  email: string | null;
  onJump: (index: number) => void;
  onLogout: () => void;
}) {
  const smoothProgress = useSpring(progress, { stiffness: 100, damping: 30 });
  const configured = hasSupabaseConfig();

  return (
    <motion.div
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-3xl border border-white/12 bg-black/70 p-1.5 pl-2 pr-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.25 }}
    >
      <div className="flex items-end gap-0.5">
        {WORKSPACE_CHAPTERS.map((chapter, index) => {
          const Icon = CHAPTER_ICONS[index];
          const active = index === activeIndex;
          return (
            <button
              key={chapter.id}
              type="button"
              onClick={() => onJump(index)}
              className={`flex w-[4.75rem] max-w-[22vw] flex-col items-center gap-1 rounded-2xl px-1.5 py-2 transition ${
                active
                  ? "bg-white text-black shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                  : "text-white/55 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="size-[1.125rem]" strokeWidth={1.75} />
              <span className="text-[0.5rem] font-medium tracking-wide">{chapter.title}</span>
            </button>
          );
        })}
      </div>

      <div className="relative hidden h-11 w-11 items-center justify-center md:flex">
        <svg className="h-full w-full -rotate-90">
          <circle cx="22" cy="22" r="15" className="stroke-white/10" strokeWidth="2" fill="none" />
          <motion.circle
            cx="22"
            cy="22"
            r="15"
            className="stroke-cyan-300"
            strokeWidth="2"
            fill="none"
            strokeDasharray="94"
            style={{ pathLength: smoothProgress }}
          />
        </svg>
        <PlayCircle className="absolute size-[0.8125rem] text-white" />
      </div>

      <div className="flex items-center gap-0.5 border-l border-white/10 pl-1.5 pr-1 sm:gap-1.5 sm:pl-2.5 sm:pr-1.5">
        <span className="hidden max-w-24 truncate text-[0.625rem] text-white/45 lg:inline">
          {email ?? "환경 설정 필요"}
        </span>
        <ThemeToggle />
        {configured ? (
          <button type="button" onClick={onLogout} className="rounded-full p-1 text-white/55 hover:bg-white/10 hover:text-white">
            <LogOut className="size-3.5" />
          </button>
        ) : null}
      </div>
    </motion.div>
  );
}

function canScrollInside(target: EventTarget | null, deltaY: number) {
  const node = target instanceof Element ? target.closest("[data-panel-scroll]") : null;
  if (!(node instanceof HTMLElement)) {
    return false;
  }
  const atTop = node.scrollTop <= 0;
  const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
  if (deltaY < 0 && !atTop) {
    return true;
  }
  if (deltaY > 0 && !atBottom) {
    return true;
  }
  return false;
}

export default function CinematicWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const pathIndex = chapterIndexFromPath(pathname);
  const [activeIndex, setActiveIndex] = useState(pathIndex);
  const [email, setEmail] = useState<string | null>(null);
  const configured = hasSupabaseConfig();
  const progress = useMotionValue(pathIndex / Math.max(WORKSPACE_CHAPTERS.length - 1, 1));
  const activeRef = useRef(activeIndex);
  const lockedRef = useRef(false);
  const accRef = useRef(0);
  const touchStartY = useRef(0);

  activeRef.current = activeIndex;

  const goTo = useCallback(
    (index: number) => {
      const next = Math.min(Math.max(index, 0), WORKSPACE_CHAPTERS.length - 1);
      if (next === activeRef.current) {
        return;
      }
      setActiveIndex(next);
      progress.set(next / Math.max(WORKSPACE_CHAPTERS.length - 1, 1));
      const href = WORKSPACE_CHAPTERS[next].href;
      if (pathname !== href) {
        router.replace(href, { scroll: false });
      }
    },
    [pathname, progress, router],
  );

  useEffect(() => {
    const next = chapterIndexFromPath(pathname);
    setActiveIndex(next);
    progress.set(next / Math.max(WORKSPACE_CHAPTERS.length - 1, 1));
  }, [pathname, progress]);

  useEffect(() => {
    if (!configured) {
      return;
    }
    const supabase = createClient();
    void (async () => {
      const session = await supabase.auth.getUser();
      setEmail(session.data.user?.email ?? null);
    })();
  }, [configured]);

  useEffect(() => {
    const lock = () => {
      lockedRef.current = true;
      window.setTimeout(() => {
        lockedRef.current = false;
        accRef.current = 0;
      }, SNAP_COOLDOWN_MS);
    };

    const snapByDelta = (delta: number) => {
      if (lockedRef.current) {
        return;
      }
      accRef.current += delta;
      if (accRef.current > SNAP_THRESHOLD) {
        goTo(activeRef.current + 1);
        lock();
      } else if (accRef.current < -SNAP_THRESHOLD) {
        goTo(activeRef.current - 1);
        lock();
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (canScrollInside(event.target, event.deltaY)) {
        return;
      }
      event.preventDefault();
      snapByDelta(event.deltaY);
    };

    const onTouchStart = (event: TouchEvent) => {
      touchStartY.current = event.touches[0]?.clientY ?? 0;
    };

    const onTouchEnd = (event: TouchEvent) => {
      const endY = event.changedTouches[0]?.clientY ?? touchStartY.current;
      const delta = touchStartY.current - endY;
      if (canScrollInside(event.target, delta)) {
        return;
      }
      if (Math.abs(delta) < 40) {
        return;
      }
      event.preventDefault();
      snapByDelta(delta > 0 ? SNAP_THRESHOLD + 1 : -(SNAP_THRESHOLD + 1));
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [goTo]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <section className="relative h-dvh overflow-hidden">
      <VideoBackground currentChapterIndex={activeIndex} />

      <WorkspaceDock
        activeIndex={activeIndex}
        progress={progress}
        email={email}
        onJump={goTo}
        onLogout={logout}
      />

      <div className="relative z-30 h-full px-3 pb-20 pt-3 sm:px-4 sm:pb-24 sm:pt-4 md:px-6 lg:px-8">
        {WORKSPACE_CHAPTERS.map((chapter, index) => {
          const Panel = PANELS[index];
          const active = index === activeIndex;
          return (
            <motion.div
              key={chapter.id}
              initial={false}
              animate={{
                opacity: active ? 1 : 0,
                x: active ? 0 : index < activeIndex ? -36 : 36,
              }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className={`absolute inset-x-3 top-3 bottom-20 flex items-start gap-3 sm:inset-x-4 sm:top-4 sm:bottom-24 sm:gap-4 md:inset-x-6 lg:inset-x-8 lg:gap-6 ${
                active ? "pointer-events-auto z-10" : "pointer-events-none z-0"
              }`}
            >
              <motion.aside
                initial={false}
                animate={active ? "visible" : "hidden"}
                variants={textContainer}
                className="hidden w-[clamp(12.5rem,18vw,16.25rem)] shrink-0 lg:block"
              >
                <div className="rounded-2xl border border-white/12 bg-black/35 p-4 backdrop-blur-md">
                  <motion.div variants={fadeIn} className="mb-3 flex items-center gap-3">
                    <div className="h-px w-7 bg-cyan-300" />
                    <span className="text-[0.625rem] font-semibold uppercase tracking-[0.24em] text-cyan-200">
                      Chapter {chapter.id}
                    </span>
                  </motion.div>
                  <div className="mb-2 overflow-hidden py-0.5">
                    <motion.h2 variants={textReveal} className="text-2xl font-black leading-tight tracking-tight text-white">
                      {chapter.subtitle}
                    </motion.h2>
                  </div>
                  <motion.p variants={fadeIn} className="text-xs leading-5 text-white/70">
                    {chapter.description}
                  </motion.p>
                  <motion.ul variants={fadeIn} className="mt-3 space-y-1.5">
                    {chapter.hints.map((hint) => (
                      <li key={hint} className="flex items-start gap-2 text-[0.6875rem] leading-4 text-white/80">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-cyan-300" />
                        {hint}
                      </li>
                    ))}
                  </motion.ul>
                </div>
              </motion.aside>

              <div
                data-panel-scroll
                className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto rounded-2xl border border-white/12 bg-black/50 p-4 shadow-2xl backdrop-blur-xl scrollbar-none"
              >
                <Panel active={active} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
