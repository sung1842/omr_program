"use client";

import { AlertTriangle, CheckCircle2, Layers, XCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassOptionChart } from "@/components/ui/glass-option-chart";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlowingStatCard } from "@/components/ui/glowing-stat-card";
import { DEFAULT_TEMPLATE_NAME } from "@/lib/defaultTemplate";
import { downloadResultsXlsx } from "@/lib/excel";
import { isPendingException } from "@/lib/exceptionReview";
import { ensureDefaultTemplate } from "@/lib/ensureDefaultTemplate";
import { canDeleteTemplate, deleteWizardTemplate } from "@/lib/form-wizard/saveTemplate";
import { countOptions, normalizeQuestion, resultKind } from "@/lib/results";
import { onScanResultsChanged, onTemplatesChanged, onWorkspaceReset } from "@/lib/scanEvents";
import { resetOmrWorkspace } from "@/lib/resetWorkspace";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { ScanResultRow, TemplateRow } from "@/lib/types";
import { pickDefaultTemplateId } from "@/lib/workspace";

export function DashboardPanel({ active = true }: { active?: boolean }) {
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [results, setResults] = useState<ScanResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const loadGen = useRef(0);
  const templateId = template?.id ?? null;

  const loadTemplates = useCallback(async () => {
    if (!hasSupabaseConfig()) {
      return;
    }
    const supabase = createClient();
    const session = await supabase.auth.getUser();
    if (!session.data.user?.id) {
      return;
    }
    try {
      const seed = await ensureDefaultTemplate(session.data.user.id);
      const { data, error: listError } = await supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (listError) {
        throw listError;
      }
      const rows = (data ?? []) as TemplateRow[];
      const list = rows.length > 0 ? rows : [seed];
      setTemplates(list);
      setTemplate((current) => {
        const preferredId = pickDefaultTemplateId(list);
        return (
          list.find((row) => row.id === current?.id) ??
          list.find((row) => row.id === preferredId) ??
          list[0] ??
          seed
        );
      });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "기본 양식을 준비하지 못했습니다.");
    }
  }, []);

  const loadResults = useCallback(async () => {
    if (!hasSupabaseConfig() || !templateId) {
      return;
    }
    const gen = ++loadGen.current;
    const supabase = createClient();
    try {
      const { data, error: loadError } = await supabase
        .from("scan_results")
        .select("*")
        .eq("template_id", templateId)
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
  }, [templateId]);

  useEffect(() => {
    void loadTemplates();
    const unsubscribeReset = onWorkspaceReset(() => {
      void loadTemplates();
    });
    const unsubscribeTemplates = onTemplatesChanged(() => {
      void loadTemplates();
    });
    return () => {
      unsubscribeReset();
      unsubscribeTemplates();
    };
  }, [loadTemplates]);

  useEffect(() => {
    if (active) {
      void loadTemplates();
    }
  }, [active, loadTemplates]);

  useEffect(() => {
    const unsubscribe = onScanResultsChanged(() => {
      void loadResults();
    });
    if (!hasSupabaseConfig()) {
      return unsubscribe;
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
      void supabase.removeChannel(channel);
    };
  }, [loadResults]);

  useEffect(() => {
    if (!active || !templateId) {
      return;
    }
    void loadResults();
    const timer = window.setInterval(() => {
      void loadResults();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [active, loadResults, templateId]);

  function selectTemplate(id: string) {
    if (template?.id === id) {
      return;
    }
    const next = templates.find((row) => row.id === id);
    if (!next) {
      return;
    }
    setTemplate(next);
    setResults([]);
  }

  async function removeTemplate(id: string) {
    const target = templates.find((row) => row.id === id);
    if (!target || !canDeleteTemplate(target, templates) || deleting) {
      return;
    }
    setDeleting(true);
    setDeletingId(id);
    setError(null);
    try {
      await deleteWizardTemplate(id);
      const remaining = templates.filter((row) => row.id !== id);
      setTemplates(remaining);
      if (template?.id === id) {
        const preferredId = pickDefaultTemplateId(remaining);
        const next = remaining.find((row) => row.id === preferredId) ?? remaining[0] ?? null;
        setTemplate(next);
        setResults([]);
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "양식을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  }

  const templateChoices = useMemo(() => {
    const preferredId = pickDefaultTemplateId(templates);
    return [...templates].sort((a, b) => Number(b.id === preferredId) - Number(a.id === preferredId));
  }, [templates]);

  const selectedLabel =
    template?.name === DEFAULT_TEMPLATE_NAME ? "기본 양식" : (template?.name ?? "기본 양식");

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
      await loadTemplates();
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
    <div className="scan-panel space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 font-mono text-[0.5625rem] tracking-[0.2em] text-white/45">
            <span className="relative flex size-1.5">
              <span className="dashboard-live-dot absolute inline-flex size-full animate-ping rounded-full opacity-60" />
              <span className="dashboard-live-dot relative inline-flex size-1.5 rounded-full" />
            </span>
            DASHBOARD
          </p>
          <h3 className="text-base font-semibold">집계 현황</h3>
          <div className="relative z-40 mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <GlassSelect
              value={template?.id ?? ""}
              onChange={selectTemplate}
              onDelete={(id) => void removeTemplate(id)}
              deletingId={deletingId ?? undefined}
              options={
                templateChoices.length > 0
                  ? templateChoices.map((row) => ({
                      id: row.id,
                      label: row.id === pickDefaultTemplateId(templates) ? "기본 양식" : row.name,
                      deletable: canDeleteTemplate(row, templates),
                    }))
                  : [{ id: "", label: "기본 양식" }]
              }
            />
          </div>
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
                className="rounded-full bg-red-500 px-2.5 py-1 text-[0.625rem] font-semibold text-paper-strong hover:bg-red-400 disabled:opacity-50"
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
              className="inline-flex box-content h-[1em] items-center justify-center rounded-full px-[1.1em] py-[0.32em] text-[15px] font-medium leading-none tracking-[-0.05em] text-white/70 outline outline-1 -outline-offset-1 outline-white/15 hover:bg-white/10 hover:text-white"
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
        <GlowingStatCard
          index={0}
          accent="cyan"
          icon={CheckCircle2}
          label="유효 투표"
          value={valid.length}
          hint="집계에 포함된 장"
        />
        <GlowingStatCard
          index={1}
          accent="amber"
          icon={AlertTriangle}
          label="예외"
          value={exceptions.length}
          hint="선택 한도 초과, 확인 필요"
          href="/exceptions"
        />
        <GlowingStatCard
          index={2}
          accent="rose"
          icon={XCircle}
          label="실패"
          value={failed.length}
          hint="인식/용량/타임아웃"
        />
        <GlowingStatCard
          index={3}
          accent="sky"
          icon={Layers}
          label="문항 그룹"
          value={template?.questions.length ?? 0}
          hint={selectedLabel}
        />
      </section>

      {!template ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
          기본 양식을 아직 준비하지 못했습니다. 잠시 후 다시 열어 주세요.
        </p>
      ) : null}

      <section className="grid gap-2.5">
        {questionStats.map(({ question, options, total }) => (
          <GlassOptionChart
            key={question.id}
            title={question.label}
            caption={`유효 ${total}장 · 최대 ${question.max_select ?? 1}개`}
            options={options}
            total={total}
          />
        ))}
      </section>
    </div>
  );
}
