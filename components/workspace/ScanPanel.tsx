"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, XCircle } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassSelect } from "@/components/ui/glass-select";
import { GlowingStatCard } from "@/components/ui/glowing-stat-card";
import { ensureDefaultTemplate } from "@/lib/ensureDefaultTemplate";
import { canDeleteTemplate, deleteWizardTemplate, readActiveTemplateId, rememberActiveTemplate } from "@/lib/form-wizard/saveTemplate";
import { FORM_FILE_ACCEPT } from "@/lib/loadFormImage";
import { onTemplatesChanged, onWorkspaceReset } from "@/lib/scanEvents";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { useOmrQueue } from "@/lib/useOmrQueue";
import type { AnswerMap, TemplateRow } from "@/lib/types";
import { pickDefaultTemplateId } from "@/lib/workspace";

export function ScanPanel({ active = true }: { active?: boolean }) {
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { items, running, preparing, addFiles, clear, processPending, retryFailed } = useOmrQueue();

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }
    const supabase = createClient();
    async function loadUserTemplate() {
      const session = await supabase.auth.getUser();
      const id = session.data.user?.id ?? null;
      setUserId(id);
      if (!id) {
        setTemplate(null);
        setTemplates([]);
        return;
      }
      try {
        const seed = await ensureDefaultTemplate(id);
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
          const remembered = readActiveTemplateId();
          const preferredId = pickDefaultTemplateId(list);
          return (
            list.find((row) => row.id === current?.id) ??
            list.find((row) => row.id === remembered) ??
            list.find((row) => row.id === preferredId) ??
            list[0] ??
            seed
          );
        });
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "기본 양식을 준비하지 못했습니다.");
      }
    }
    void loadUserTemplate();
    const unsubscribeReset = onWorkspaceReset(() => {
      void loadUserTemplate();
    });
    const unsubscribeTemplates = onTemplatesChanged(() => {
      void loadUserTemplate();
    });
    return () => {
      unsubscribeReset();
      unsubscribeTemplates();
    };
  }, [active]);

  function selectTemplate(id: string) {
    if (template?.id === id) {
      return;
    }
    const next = templates.find((row) => row.id === id);
    if (!next) {
      return;
    }
    setTemplate(next);
    rememberActiveTemplate(next.id);
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
        if (next) {
          rememberActiveTemplate(next.id);
        }
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

  const counts = useMemo(() => {
    return {
      pending: items.filter((item) => item.status === "pending").length,
      processing: items.filter((item) => item.status === "processing").length,
      success: items.filter((item) => item.status === "success").length,
      exception: items.filter((item) => item.status === "exception").length,
      failed: items.filter((item) => item.status === "failed").length,
      total: items.length,
    };
  }, [items]);
  const failedItems = items.filter((item) => item.status === "failed");
  const done = counts.total > 0 && counts.pending === 0 && counts.processing === 0 && !running;

  async function start() {
    if (!template || !userId) {
      setError("로그인이 필요합니다.");
      return;
    }
    setError(null);
    try {
      await processPending(template, userId);
    } catch (startError) {
      setError(startError instanceof Error ? startError.message : "처리를 시작하지 못했습니다.");
    }
  }

  async function retry() {
    if (!template || !userId) {
      return;
    }
    setError(null);
    await retryFailed(template, userId);
  }

  return (
    <div className="scan-panel space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[0.5625rem] tracking-[0.2em] text-white/45">BATCH</p>
          <h3 className="text-base font-semibold">대량 스캔 처리</h3>
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
            <Link href="/templates/new" className="scan-register-link">
              양식 등록
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-1.5">
          <GlassButton
            disabled={Boolean(running || preparing || counts.pending === 0)}
            onClick={start}
          >
            {running ? "처리 중..." : "분석 시작"}
          </GlassButton>
          <GlassButton disabled={Boolean(running || items.length === 0)} onClick={clear}>
            목록 리셋
          </GlassButton>
        </div>
      </div>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      <label
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          void addFiles(event.dataTransfer.files);
        }}
        className={`block cursor-pointer rounded-xl border border-dashed px-3 py-3 text-center sm:px-4 sm:py-4 ${
          dragOver ? "border-[var(--scan-accent)] bg-[color-mix(in_srgb,var(--scan-accent)_14%,transparent)]" : "border-white/20 bg-white/5"
        }`}
      >
        <input
          type="file"
          accept={FORM_FILE_ACCEPT}
          multiple
          className="hidden"
          onChange={(event) => {
            if (event.target.files) {
              void addFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />
        <p className="text-sm font-medium">
          {preparing ?? "설문 PDF / 스캔 이미지를 놓으세요"}
        </p>
        <p className="mt-0.5 text-[0.6875rem] text-white/50">
          같은 양식 PDF면 됩니다. 기울기는 표 모서리로 맞추고, 저장된 원 좌표로 채점합니다.
        </p>
      </label>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <GlowingStatCard compact orbit={false} index={0} accent="sky" icon={Clock3} label="대기" value={counts.pending} hint="아직 분석 전" />
        <GlowingStatCard compact orbit={false} index={1} accent="violet" icon={LoaderCircle} label="처리 중" value={counts.processing} hint="채점 진행" />
        <GlowingStatCard compact orbit={false} index={2} accent="emerald" icon={CheckCircle2} label="유효" value={counts.success} hint="집계에 포함" />
        <GlowingStatCard compact orbit={false} index={3} accent="amber" icon={AlertTriangle} label="예외" value={counts.exception} hint="확인 필요" />
        <GlowingStatCard compact orbit={false} index={4} accent="rose" icon={XCircle} label="실패" value={counts.failed} hint="인식 오류" />
      </section>

      {counts.total > 0 ? (
        <div className="h-1 overflow-hidden rounded bg-white/10">
          <div
            className="h-full bg-[var(--scan-accent)] shadow-[0_0_10px_color-mix(in_srgb,var(--scan-accent)_55%,transparent)]"
            style={{
              width: `${Math.round(((counts.success + counts.exception + counts.failed) / counts.total) * 100)}%`,
            }}
          />
        </div>
      ) : null}

      <section className="overflow-x-auto rounded-xl border border-white/10 bg-white/5">
        <table className="w-full min-w-[32rem] text-left text-xs">
          <thead className="border-b border-white/10 text-[0.625rem] text-white/45">
            <tr>
              <th className="px-3 py-1.5 font-medium">파일</th>
              <th className="px-3 py-1.5 font-medium">상태</th>
              <th className="px-3 py-1.5 font-medium">인식 항목</th>
              <th className="px-3 py-1.5 font-medium">원인</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-white/45">
                  아직 업로드된 파일이 없습니다.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t border-white/10">
                  <td className="px-3 py-1.5">{item.filename}</td>
                  <td className={`px-3 py-1.5 ${statusTone(item.status)}`}>{statusLabel(item.status)}</td>
                  <td className="px-3 py-1.5 text-white/80">{sheetAnswers(item.answers, item.status)}</td>
                  <td className={`px-3 py-1.5 ${item.status === "failed" ? "text-red-300" : item.status === "exception" ? "text-amber-200" : ""}`}>
                    {item.status === "exception" ? "" : (item.errorMessage ?? "")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {done && failedItems.length > 0 ? (
        <section className="rounded-xl border border-red-400/30 bg-red-500/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-medium">실패한 파일 (DLQ)</h4>
            <button type="button" onClick={retry} className="h-8 rounded-lg bg-red-400 px-3 text-[0.4375rem] text-black">
              실패한 파일만 다시 시도
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-xs">
            {failedItems.map((item) => (
              <li key={item.id}>
                <span className="font-medium">{item.filename}</span>
                <span className="text-red-200"> — {item.errorMessage}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function sheetAnswers(answers: AnswerMap | undefined, status: string) {
  if (status === "pending" || status === "processing" || status === "failed") {
    return "";
  }
  if (!answers) {
    return "선택 없음";
  }
  const labels = Object.values(answers).flatMap((value) =>
    Array.isArray(value) ? value : value ? [String(value)] : [],
  );
  return labels.length > 0 ? labels.join(", ") : "선택 없음";
}

function statusTone(status: string) {
  switch (status) {
    case "pending":
      return "text-sky-300";
    case "processing":
      return "text-violet-300";
    case "success":
      return "text-emerald-300";
    case "exception":
      return "text-amber-200";
    case "failed":
      return "text-red-300";
    default:
      return "";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "pending":
      return "대기";
    case "processing":
      return "처리 중";
    case "success":
      return "유효";
    case "exception":
      return "예외";
    case "failed":
      return "실패";
    default:
      return status;
  }
}
