"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { DEFAULT_TEMPLATE_NAME } from "@/lib/defaultTemplate";
import { ensureDefaultTemplate } from "@/lib/ensureDefaultTemplate";
import { FORM_FILE_ACCEPT } from "@/lib/loadFormImage";
import { onWorkspaceReset } from "@/lib/scanEvents";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { useOmrQueue } from "@/lib/useOmrQueue";
import type { AnswerMap, TemplateRow } from "@/lib/types";

export function ScanPanel({ active: _active = true }: { active?: boolean }) {
  const [template, setTemplate] = useState<TemplateRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
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
        return;
      }
      try {
        setTemplate(await ensureDefaultTemplate(id));
        setError(null);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "기본 양식을 준비하지 못했습니다.");
      }
    }
    void loadUserTemplate();
    return onWorkspaceReset(() => {
      void loadUserTemplate();
    });
  }, []);

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
  const exceptionItems = items.filter((item) => item.status === "exception");
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[0.5625rem] tracking-[0.2em] text-white/45">BATCH</p>
          <h3 className="text-base font-semibold">대량 스캔 처리</h3>
          <p className="mt-0.5 text-[0.6875rem] text-white/50">{DEFAULT_TEMPLATE_NAME} · 좌표 학습 없이 바로 채점</p>
        </div>
        <div className="flex flex-wrap items-end gap-1.5">
          <ShimmerButton
            disabled={Boolean(running || preparing || counts.pending === 0)}
            className="shadow-lg"
            onClick={start}
          >
            {running ? "처리 중..." : "대기열 처리 시작"}
          </ShimmerButton>
          <ShimmerButton
            disabled={Boolean(running || items.length === 0)}
            background="rgba(15, 118, 110, 1)"
            className="shadow-lg"
            onClick={clear}
          >
            큐 비우기
          </ShimmerButton>
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
          dragOver ? "border-cyan-300 bg-cyan-300/10" : "border-white/20 bg-white/5"
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
          같은 양식 PDF면 됩니다. 기울기는 표 모서리로 맞추고, 기표 원 15개는 자동으로 찾습니다.
        </p>
      </label>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Count label="대기" value={counts.pending} />
        <Count label="처리 중" value={counts.processing} />
        <Count label="유효" value={counts.success} />
        <Count label="예외" value={counts.exception} />
        <Count label="실패" value={counts.failed} />
      </section>

      {counts.total > 0 ? (
        <div className="h-1 overflow-hidden rounded bg-white/10">
          <div
            className="h-full bg-emerald-400"
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
                  <td className="px-3 py-1.5">{statusLabel(item.status)}</td>
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

      {exceptionItems.length > 0 ? (
        <section className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3">
          <h4 className="text-sm font-medium">예외 파일</h4>
          <p className="mt-1 text-[0.6875rem] text-white/55">
            인식은 됐지만 선택이 없거나, 특화·일반·시설 선택 개수가 규칙과 다릅니다.{" "}
            <Link href="/exceptions" className="text-cyan-200 underline">
              예외 확인
            </Link>
            에서 이미지를 보고 직접 반영할 수 있습니다.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {exceptionItems.map((item) => (
              <li key={item.id}>
                <span className="font-medium">{item.filename}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <p className="text-[0.625rem] text-white/45">{label}</p>
      <p className="font-mono text-xl leading-none">{value}</p>
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
