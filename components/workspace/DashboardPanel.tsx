"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { downloadResultsXlsx } from "@/lib/excel";
import { isPendingException } from "@/lib/exceptionReview";
import { countOptions, exceptionSummary, normalizeQuestion, resultKind } from "@/lib/results";
import { ensureDefaultTemplate } from "@/lib/ensureDefaultTemplate";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { ScanResultRow, TemplateRow } from "@/lib/types";
import { pickDefaultTemplateId } from "@/lib/workspace";

export function DashboardPanel() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [results, setResults] = useState<ScanResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user?.id) {
        try {
          await ensureDefaultTemplate(data.user.id);
        } catch {
          // listing can still proceed
        }
      }
      const { data: rows, error: loadError } = await supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (loadError) {
        setError(loadError.message);
        return;
      }
      const list = (rows ?? []) as TemplateRow[];
      setTemplates(list);
      setTemplateId(pickDefaultTemplateId(list));
    });
  }, []);

  useEffect(() => {
    if (!templateId || !hasSupabaseConfig()) {
      return;
    }
    const supabase = createClient();
    supabase
      .from("scan_results")
      .select("*")
      .eq("template_id", templateId)
      .order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(loadError.message);
          return;
        }
        setResults((data ?? []) as ScanResultRow[]);
      });
  }, [templateId]);

  const template = templates.find((item) => item.id === templateId);
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
        <ShimmerButton
          disabled={!template || results.length === 0}
          className="shadow-lg"
          onClick={() => template && downloadResultsXlsx(template.name, template.questions, results)}
        >
          엑셀
        </ShimmerButton>
      </div>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="유효 투표" value={valid.length} hint="집계에 포함된 장" />
        <StatCard label="예외" value={exceptions.length} hint="선택 한도 초과, 확인 필요" />
        <StatCard label="실패" value={failed.length} hint="인식/용량/타임아웃" />
        <StatCard label="문항 그룹" value={template?.questions.length ?? 0} hint="기본 양식" />
      </section>

      {templates.length === 0 ? (
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
                <span className="text-amber-200"> — {exceptionSummary(row)}</span>
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
