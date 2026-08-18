"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, ClipboardCheck, FileScan, LogOut } from "lucide-react";
import CinematicWorkspace from "@/components/ui/scroll-triggered-video-hero";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { isEditorPath, WORKSPACE_CHAPTERS } from "@/lib/workspace";

const ICONS = [BarChart3, FileScan, ClipboardCheck];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const configured = hasSupabaseConfig();

  return (
    <div className="h-dvh overflow-hidden bg-black text-white">
      {!configured ? (
        <div className="relative z-[60] border-b border-red-400/30 bg-red-950/85 px-4 py-3 text-sm text-red-100 sm:px-6">
          `.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`를
          설정한 뒤 개발 서버를 다시 시작하세요.
        </div>
      ) : null}
      {isEditorPath(pathname) ? <EditorChrome>{children}</EditorChrome> : <CinematicWorkspace />}
    </div>
  );
}

function EditorChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const configured = hasSupabaseConfig();

  useEffect(() => {
    if (!configured) {
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, [configured]);

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_#123,_#05070c_55%)]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="font-mono text-[0.625rem] tracking-[0.18em] text-white/40">PAPER OMR</p>
          <h1 className="text-base font-semibold">양식 편집</h1>
        </div>
        <div className="flex items-center gap-2 text-[0.6875rem] text-white/50">
          <span className="hidden max-w-40 truncate sm:inline">{email ?? "환경 설정 필요"}</span>
          {configured ? (
            <button type="button" onClick={logout} className="rounded-full p-1.5 hover:bg-white/10 hover:text-white">
              <LogOut className="size-3.5" />
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-4 pb-24 text-ink">{children}</main>

      <nav className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-0.5 rounded-3xl border border-white/12 bg-black/70 p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
        {WORKSPACE_CHAPTERS.map((chapter, index) => {
          const Icon = ICONS[index];
          const active =
            chapter.href === "/"
              ? pathname === "/"
              : pathname === chapter.href || pathname.startsWith(`${chapter.href}/`);
          return (
            <Link
              key={chapter.id}
              href={chapter.href}
              className={`flex w-[4.75rem] max-w-[22vw] flex-col items-center gap-1 rounded-2xl px-1.5 py-2 ${
                active ? "bg-white text-black" : "text-white/55 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="size-[1.125rem]" strokeWidth={1.75} />
              <span className="text-[0.5rem] font-medium tracking-wide">{chapter.title}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
