"use client";

import { BarChart3, ClipboardCheck, FileScan, LogOut, PlayCircle } from "lucide-react";
import { motion, useMotionValue, useSpring, type MotionValue } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { FilmGrain } from "@/components/ui/film-grain";
import { ServiceCard } from "@/components/ui/services-card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { DashboardPanel } from "@/components/workspace/DashboardPanel";
import { ExceptionPanel } from "@/components/workspace/ExceptionPanel";
import { ScanPanel } from "@/components/workspace/ScanPanel";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { chapterIndexFromPath, WORKSPACE_CHAPTERS } from "@/lib/workspace";

const CHAPTER_ICONS = [BarChart3, FileScan, ClipboardCheck];

const CHAPTER_GRADIENTS = ["chapter-card-status", "chapter-card-scan", "chapter-card-exceptions"];

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
            className="h-full w-full object-cover [[data-theme=light]_&]:opacity-20"
            muted
            loop
            playsInline
            preload={index === 0 ? "auto" : "metadata"}
          />
          <div className="cinematic-scrim absolute inset-0 bg-black/55" />
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
      className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-1 rounded-3xl border border-white/12 bg-black/70 p-1.5 pl-2 pr-1.5 shadow-[var(--elev-shadow)] backdrop-blur-2xl"
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

      <div className="relative hidden size-11 md:block">
        <svg viewBox="0 0 44 44" className="absolute inset-0 size-full -rotate-90">
          <circle cx="22" cy="22" r="15" className="stroke-white/10" strokeWidth="2" fill="none" />
          <motion.circle
            cx="22"
            cy="22"
            r="15"
            className="dock-progress-ring"
            strokeWidth="2"
            fill="none"
            strokeDasharray="94"
            style={{ pathLength: smoothProgress }}
          />
        </svg>
        <PlayCircle className="absolute left-1/2 top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 text-white" />
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

export default function CinematicWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const pathIndex = chapterIndexFromPath(pathname);
  const [activeIndex, setActiveIndex] = useState(pathIndex);
  const [email, setEmail] = useState<string | null>(null);
  const configured = hasSupabaseConfig();
  const progress = useMotionValue(pathIndex / Math.max(WORKSPACE_CHAPTERS.length - 1, 1));
  const activeRef = useRef(activeIndex);

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
                variants={{
                  hidden: {},
                  visible: { transition: { staggerChildren: 0.1 } },
                }}
                className="hidden w-[clamp(10.8rem,15vw,13.3rem)] shrink-0 lg:block"
              >
                <ServiceCard
                  index={index}
                  service={{
                    number: chapter.id.padStart(3, "0"),
                    title: chapter.subtitle,
                    description: chapter.description,
                    icon: CHAPTER_ICONS[index],
                    gradient: CHAPTER_GRADIENTS[index],
                  }}
                />
              </motion.aside>

              <div
                data-panel-scroll
                className="h-full min-h-0 min-w-0 flex-1 overflow-y-auto rounded-2xl border border-white/12 bg-black/50 p-4 shadow-[var(--elev-shadow-lg)] backdrop-blur-xl scrollbar-none [[data-theme=light]_&]:bg-paper-strong [[data-theme=light]_&]:backdrop-blur-none"
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
