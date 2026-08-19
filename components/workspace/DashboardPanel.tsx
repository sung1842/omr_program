"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import { downloadResultsXlsx } from "@/lib/excel";
import { isPendingException } from "@/lib/exceptionReview";
import { ensureDefaultTemplate } from "@/lib/ensureDefaultTemplate";
import { countOptions, normalizeQuestion, resultKind } from "@/lib/results";
import { onScanResultsChanged, onWorkspaceReset } from "@/lib/scanEvents";
import { resetOmrWorkspace } from "@/lib/resetWorkspace";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { ScanResultRow, TemplateRow } from "@/lib/types";

export function DashboardPanel({ active = true }: { active?: boolean }) {
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [results, setResults] = useState<ScanResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const loadGen = useRef(0);

  const loadTemplate = useCallback(async () => {
    if (!hasSupabaseConfig()) {
      return;
    }
    const supabase = createClient();
    const session = await supabase.auth.getUser();
    if (!session.data.user?.id) {
      return;
    }
    const nextTemplate = await ensureDefaultTemplate(session.data.user.id);
    setTemplate(nextTemplate);
  }, []);

  const loadResults = useCallback(async () => {
    if (!hasSupabaseConfig()) {
      return;
    }
    const gen = ++loadGen.current;
    const supabase = createClient();
    try {
      const { data, error: loadError } = await supabase
        .from("scan_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (gen !== loadGen.current) {
        return;
      }
      if (loadError) {
        setError(loadError.message);
        return;
      }
      setError(null);
      setResults((data ?? []) as ScanResultRow[]);
    } catch (loadError) {
      if (gen !== loadGen.current) {
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "현황을 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void loadTemplate();
    void loadResults();
    const unsubscribe = onScanResultsChanged(() => {
      void loadResults();
    });
    const unsubscribeReset = onWorkspaceReset(() => {
      void loadTemplate();
      void loadResults();
    });
    if (!hasSupabaseConfig()) {
      return () => {
        unsubscribe();
        unsubscribeReset();
      };
    }
    const supabase = createClient();
    const channel = supabase
      .channel("scan-results-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "scan_results" }, () => {
        void loadResults();
      })
      .subscribe();
    return () => {
      unsubscribe();
      unsubscribeReset();
      void supabase.removeChannel(channel);
    };
  }, [loadTemplate, loadResults]);

  useEffect(() => {
    if (!active) {
      return;
    }
    void loadResults();
    const timer = window.setInterval(() => {
      void loadResults();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, loadResults]);

  async function handleReset() {
    if (!hasSupabaseConfig() || resetting) {
      return;
    }
    const supabase = createClient();
    const session = await supabase.auth.getUser();
    if (!session.data.user?.id) {
      setError("로그인이 필요합니다.");
      return;
    }
    setResetting(true);
    setError(null);
    try {
      await resetOmrWorkspace(session.data.user.id);
      setConfirmReset(false);
      await loadTemplate();
      await loadResults();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "초기화에 실패했습니다.");
    } finally {
      setResetting(false);
    }
  }

  const valid = results.filter((row) => resultKind(row) === "valid");
  const exceptions = results.filter(isPendingException);
  const failed = results.filter((row) => resultKind(row) === "failed");

  const questionStats = useMemo(() => {
    if (!template) {
      return [];
    }
    return [...template.questions]
      .map(normalizeQuestion)
      .sort((a, b) => a.number - b.number)
      .map((question) => ({
        question,
        options: countOptions(question, valid),
        total: valid.length,
      }));
  }, [template, valid]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[0.5625rem] tracking-[0.2em] text-white/45">DASHBOARD</p>
          <h3 className="text-base font-semibold">집계 현황</h3>
        </div>
        <div className="flex items-center gap-2">
          {confirmReset ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="max-w-44 text-[0.625rem] leading-4 text-amber-100/80">
                집계·예외·업로드 파일을 모두 지웁니다. 양식은 기본값으로 다시 만듭니다.
              </p>
              <button
                type="button"
                disabled={resetting}
                onClick={() => void handleReset()}
                className="rounded-full bg-red-500 px-2.5 py-1 text-[0.625rem] font-semibold text-white hover:bg-red-400 disabled:opacity-50"
              >
                {resetting ? "지우는 중..." : "확인"}
              </button>
              <button
                type="button"
                disabled={resetting}
                onClick={() => setConfirmReset(false)}
                className="rounded-full px-2.5 py-1 text-[0.625rem] text-white/60 hover:bg-white/10"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center rounded-full border border-white/15 px-[1.1em] py-[0.32em] text-[15px] font-medium leading-none tracking-tight text-white/70 hover:bg-white/10 hover:text-white"
            >
              초기화
            </button>
          )}
          <GlassButton
            disabled={!template || results.length === 0}
            onClick={() => template && downloadResultsXlsx(template.name, template.questions, results)}
          >
            엑셀
          </GlassButton>
        </div>
      </div>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="유효 투표" value={valid.length} hint="집계에 포함된 장" />
        <StatCard label="예외" value={exceptions.length} hint="선택 한도 초과, 확인 필요" />
        <StatCard label="실패" value={failed.length} hint="인식/용량/타임아웃" />
        <StatCard label="문항 그룹" value={template?.questions.length ?? 0} hint="기본 양식" />
      </section>

      {!template ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
          기본 양식을 아직 준비하지 못했습니다. 잠시 후 다시 열어 주세요.
        </p>
      ) : null}

      <section className="grid gap-2 md:grid-cols-1">
        {questionStats.map(({ question, options, total }) => (
          <article key={question.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-xs font-medium">{question.label}</h4>
              <p className="shrink-0 text-[0.625rem] text-white/45">유효 {total}장 · 최대 {question.max_select ?? 1}개</p>
            </div>
            <ul className="mt-2 space-y-1.5">
              {options.map((option) => {
                const ratio = total === 0 ? 0 : option.count / total;
                return (
                  <li key={option.label}>
                    <div className="mb-0.5 flex justify-between gap-3 text-[0.625rem] text-white/55">
                      <span>
                        <span className="text-white/80">{option.label}</span>
                        {option.title && option.title !== option.label ? ` · ${option.title}` : ""}
                      </span>
                      <span className="shrink-0 font-mono">
                        {option.count}회
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded bg-white/10">
                      <div className="h-full bg-cyan-300" style={{ width: `${Math.round(ratio * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>

      {exceptions.length > 0 ? (
        <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">예외 장 (집계 제외)</h4>
            <Link href="/exceptions" className="text-[11px] text-cyan-200 underline">
              수작업 처리
            </Link>
          </div>
          <ul className="mt-2 max-h-48 space-y-1 overflow-auto text-xs">
            {exceptions.map((row) => (
              <li key={row.id}>
                <span className="font-medium">{row.filename}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <article className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <p className="text-[0.6875rem] text-white/50">{label}</p>
      <p className="mt-0.5 font-mono text-2xl leading-none">{value}</p>
      <p className="mt-1 text-[0.625rem] text-white/40">{hint}</p>
    </article>
  );
}
