"use client";

import { Eye, EyeOff } from "lucide-react";
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type MouseEvent } from "react";
import { BottomGradient, BoxReveal, Ripple, SpotlightInput } from "@/components/ui/modern-animated-sign-in";
import { FilmGrain } from "@/components/ui/film-grain";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ADMIN_EMAIL, ADMIN_USERNAME } from "@/lib/auth";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { WORKSPACE_CHAPTERS } from "@/lib/workspace";

const LOGIN_VIDEO = WORKSPACE_CHAPTERS[0].videoUrl;

export function CinematicLogin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stageRef = useRef<HTMLDivElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = hasSupabaseConfig();

  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);
  const glowX = useSpring(useTransform(mouseX, [0, 1], [20, 80]), { stiffness: 80, damping: 18 });
  const glowY = useSpring(useTransform(mouseY, [0, 1], [18, 72]), { stiffness: 80, damping: 18 });
  const spotlight = useMotionTemplate`radial-gradient(42rem circle at ${glowX}% ${glowY}%, rgba(103,232,249,0.16), transparent 55%)`;

  function onPointerMove(event: MouseEvent<HTMLDivElement>) {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    mouseX.set((event.clientX - bounds.left) / bounds.width);
    mouseY.set((event.clientY - bounds.top) / bounds.height);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) {
      setError("Supabase 환경 변수가 없습니다.");
      return;
    }
    if (username !== ADMIN_USERNAME) {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
      return;
    }

    setPending(true);
    setError(null);
    const supabase = createClient();
    const next = searchParams.get("next") || "/";
    try {
      const { error: signError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password,
      });
      if (signError) {
        throw new Error("아이디 또는 비밀번호가 올바르지 않습니다.");
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("아이디 또는 비밀번호가 올바르지 않습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      ref={stageRef}
      onMouseMove={onPointerMove}
      className="relative min-h-dvh overflow-hidden bg-black text-white"
    >
      <video
        src={LOGIN_VIDEO}
        className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70"
        autoPlay
        muted
        loop
        playsInline
      />
      <div className="absolute inset-0 bg-gradient-to-br from-black via-black/75 to-cyan-950/40" />
      <motion.div className="absolute inset-0" style={{ background: spotlight }} />
      <FilmGrain />
      <div className="absolute right-4 top-4 z-40 sm:right-6 sm:top-6">
        <ThemeToggle className="rounded-full border border-white/12 bg-black/40 p-2 backdrop-blur-md" />
      </div>

      <div className="relative z-30 mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-6 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1fr)_min(26rem,38vw)] lg:gap-8 lg:px-10">
        <div className="relative hidden min-h-[26.25rem] items-center lg:flex">
          <Ripple className="opacity-70" />
          <div className="relative z-10 max-w-md">
            <p className="font-mono text-[0.6875rem] tracking-[0.22em] text-cyan-200/80">PAPER OMR</p>
            <h2 className="mt-3 text-[clamp(1.75rem,4vw,2.25rem)] font-semibold tracking-tight">종이 설문,<br />바로 집계</h2>
            <p className="mt-4 text-sm leading-6 text-white/65">
              관리자만 접속할 수 있는 내부 집계 시스템입니다.
            </p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28, rotateX: 8 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-md"
        >
          <form
            onSubmit={onSubmit}
            className="rounded-3xl border border-white/12 bg-black/45 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8"
          >
            <BoxReveal>
              <p className="font-mono text-[0.6875rem] tracking-[0.22em] text-cyan-200/80">PAPER OMR</p>
            </BoxReveal>
            <BoxReveal className="mt-3">
              <h1 className="text-[clamp(1.5rem,4vw,1.875rem)] font-semibold tracking-tight">관리자 로그인</h1>
            </BoxReveal>
            <BoxReveal className="mt-2" width="100%">
              <p className="text-sm text-white/65">등록된 관리자 계정으로만 집계 시스템에 들어올 수 있습니다.</p>
            </BoxReveal>

            <label className="mt-8 block text-sm text-white/80">
              <BoxReveal>아이디</BoxReveal>
              <div className="mt-2">
                <SpotlightInput
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="관리자 아이디"
                />
              </div>
            </label>

            <label className="mt-5 block text-sm text-white/80">
              <BoxReveal>비밀번호</BoxReveal>
              <div className="relative mt-2">
                <SpotlightInput
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="비밀번호"
                  className="pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-white/50 hover:text-white"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>

            {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}

            <BoxReveal width="100%" className="mt-6 overflow-visible">
              <button
                type="submit"
                disabled={pending}
                className="group/btn relative block h-11 w-full rounded-xl bg-gradient-to-br from-white to-white/80 text-sm font-medium text-black disabled:opacity-50"
              >
                {pending ? "처리 중..." : "로그인 →"}
                <BottomGradient />
              </button>
            </BoxReveal>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
