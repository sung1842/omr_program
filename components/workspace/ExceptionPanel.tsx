"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GlassButton } from "@/components/ui/glass-button";
import {
  answersFromSelection,
  formatSelection,
  isExceptionLog,
  isPendingException,
  reviewActionLabel,
  selectionFromAnswers,
  selectionLimitError,
  toggleSelection,
  type SelectionMap,
} from "@/lib/exceptionReview";
import { VILLAGE_AGENDA_FORM } from "@/lib/formSpec";
import { isPdfPath, signedSheetUrl, removeScanSheet } from "@/lib/sheetStorage";
import { onScanResultsChanged, emitScanResultsChanged } from "@/lib/scanEvents";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { ScanResultRow } from "@/lib/types";

type Tab = "queue" | "log";

export function ExceptionPanel({ active = true }: { active?: boolean }) {
  const [tab, setTab] = useState<Tab>("queue");
  const [rows, setRows] = useState<ScanResultRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selection, setSelection] = useState<SelectionMap>(selectionFromAnswers(null));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"actual" | "fit">("actual");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const loadGen = useRef(0);
  const load = useCallback(async () => {
    if (!hasSupabaseConfig()) {
      return;
    }
    const gen = ++loadGen.current;
    const supabase = createClient();
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
    setRows((data ?? []) as ScanResultRow[]);
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }
    const supabase = createClient();
    void (async () => {
      const session = await supabase.auth.getUser();
      setUserId(session.data.user?.id ?? null);
    })();
    void load();
    const unsubscribe = onScanResultsChanged(() => {
      void load();
    });
    const channel = supabase
      .channel("scan-results-exceptions")
      .on("postgres_changes", { event: "*", schema: "public", table: "scan_results" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      unsubscribe();
      void supabase.removeChannel(channel);
    };
  }, [load]);

  useEffect(() => {
    if (active) {
      void load();
    }
  }, [active, load]);

  const pending = useMemo(() => rows.filter(isPendingException), [rows]);
  const logs = useMemo(() => rows.filter(isExceptionLog), [rows]);
  const list = tab === "queue" ? pending : logs;
  const selected = list.find((row) => row.id === selectedId) ?? list[0] ?? null;

  const viewPath = selected?.source_path ?? selected?.image_path ?? null;
  const isPdf = isPdfPath(viewPath);
  const pdfUrl = imageUrl
    ? `${imageUrl}#page=${selected?.source_page ?? 1}&view=FitH`
    : null;

  useEffect(() => {
    if (!selected) {
      setSelectedId(null);
      setImageUrl(null);
      return;
    }
    setSelectedId(selected.id);
    setSelection(selectionFromAnswers(selected.answers));
    if (!hasSupabaseConfig() || !viewPath) {
      setImageUrl(null);
      return;
    }
    const supabase = createClient();
    signedSheetUrl(supabase, viewPath).then(setImageUrl);
  }, [selected?.id, viewPath, selected?.answers]);

  const limitError = tab === "queue" ? selectionLimitError(selection) : null;

  async function save(mode: "include" | "exclude") {
    if (!selected || !userId) {
      return;
    }
    if (mode === "include" && limitError) {
      setError(limitError);
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const answers = answersFromSelection(selection);
    const details =
      selected.details && typeof selected.details === "object"
        ? { ...(selected.details as Record<string, unknown>) }
        : {};
    const payload = {
      answers,
      status: mode === "include" ? "success" : "exception",
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId,
      error_code: mode === "include" ? null : selected.error_code,
      error_message:
        mode === "include" ? null : selected.error_message || "수작업으로 집계에서 제외",
      details: {
        ...details,
        sheet_status: mode === "include" ? "ok" : "exception",
        manual_review: true,
        review_action: mode === "include" ? "include" : "exclude",
        original_exception_reasons: details.exception_reasons ?? [],
        exception_reasons: mode === "include" ? [] : details.exception_reasons ?? [],
      },
    };
    const { error: saveError } = await supabase.from("scan_results").update(payload).eq("id", selected.id);
    if (!saveError) {
      await releaseReviewedSource(supabase, selected);
    }
    setSaving(false);
    if (saveError) {
      setError(
        saveError.message.includes("reviewed_at")
          ? "DB에 수작업 컬럼이 없습니다. supabase/migrations/20260819003000_exception_review.sql 을 실행하세요."
          : saveError.message,
      );
      return;
    }
    emitScanResultsChanged();
    await load();
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-mono text-[0.5625rem] tracking-[0.2em] text-white/45">EXCEPTION</p>
          <h3 className="text-base font-semibold">예외 수작업</h3>
          <p className="mt-0.5 text-[11px] text-white/50">
            PDF는 예외로 걸린 장만 따로 보관합니다. 그 이미지를 보고 기표 항목을 직접 체크한 뒤
            집계에 반영합니다.
          </p>
        </div>
        <div className="flex rounded-lg border border-white/15 bg-black/30 p-0.5 text-xs">
          <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
            대기 {pending.length}
          </TabButton>
          <TabButton active={tab === "log"} onClick={() => setTab("log")}>
            처리 로그 {logs.length}
          </TabButton>
        </div>
      </div>

      {error ? <p className="text-xs text-red-300">{error}</p> : null}

      <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)]">
        <section className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/10 bg-white/5 lg:max-h-[calc(100dvh-16rem)]">
          <p className="sticky top-0 z-10 border-b border-white/10 bg-black/50 px-3 py-2 text-[10px] tracking-wide text-white/45 backdrop-blur [[data-theme=light]_&]:bg-paper-strong">
            {tab === "queue" ? "예외 목록" : "처리 완료 로그"}
          </p>
          {list.length === 0 ? (
            <p className="px-3 py-6 text-xs text-white/50">
              {tab === "queue" ? "대기 중인 예외가 없습니다." : "아직 처리한 예외가 없습니다."}
            </p>
          ) : (
            <ul>
              {list.map((row) => {
                const active = selected?.id === row.id;
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(row.id)}
                      className={`flex w-full flex-col items-start gap-0.5 border-b border-white/5 px-3 py-2.5 text-left ${
                        active ? "bg-cyan-300/15" : "hover:bg-white/5"
                      }`}
                    >
                      <span className="w-full truncate text-xs font-medium">{row.filename}</span>
                      <span className="text-[10px] text-white/45">
                        {tab === "log"
                          ? `${reviewActionLabel(row)} · ${formatTime(row.reviewed_at)}`
                          : formatTime(row.created_at)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="min-w-0 space-y-3">
          {!selected ? (
            <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-xs text-white/50">
              왼쪽 목록에서 장을 고르세요.
            </p>
          ) : (
            <>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="truncate text-sm font-medium">{selected.filename}</h4>
                  <p className="text-[10px] text-white/45">{formatTime(selected.created_at)}</p>
                </div>
                {imageUrl ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
                    {isPdf ? (
                      <span className="rounded border border-white/15 px-2 py-1 text-white/60">
                        업로드 원본 PDF · {selected.source_page ?? 1}쪽
                      </span>
                    ) : (
                      <>
                        {selected.source_page ? (
                          <span className="rounded border border-white/15 px-2 py-1 text-white/60">
                            {selected.source_page}쪽만 보관
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setZoom("actual")}
                          className={`rounded px-2 py-1 ${zoom === "actual" ? "bg-white text-black" : "border border-white/15 text-white/60"}`}
                        >
                          원본 크기
                        </button>
                        <button
                          type="button"
                          onClick={() => setZoom("fit")}
                          className={`rounded px-2 py-1 ${zoom === "fit" ? "bg-white text-black" : "border border-white/15 text-white/60"}`}
                        >
                          화면 맞춤
                        </button>
                      </>
                    )}
                    <a
                      href={pdfUrl ?? imageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-white/15 px-2 py-1 text-cyan-200"
                    >
                      새 탭에서 열기
                    </a>
                  </div>
                ) : null}
                <div
                  className={`mt-2 rounded-lg border border-white/10 bg-zinc-200 ${
                    isPdf ? "" : "max-h-[min(72dvh,50rem)] overflow-auto"
                  }`}
                >
                  {!imageUrl ? (
                    <p className="px-4 py-10 text-center text-xs text-zinc-700">
                      {viewPath
                        ? "원본을 불러오지 못했습니다."
                        : selected.reviewed_at
                          ? "처리가 끝나 보관본은 삭제했습니다."
                          : "이 장은 보관본이 없습니다. 다시 스캔하면 원본이 보입니다."}
                    </p>
                  ) : isPdf ? (
                    <iframe
                      key={pdfUrl ?? undefined}
                      src={pdfUrl ?? undefined}
                      title={selected.filename}
                      className="block h-[min(72dvh,50rem)] w-full rounded-lg"
                    />
                  ) : (
                    <img
                      src={imageUrl}
                      alt={selected.filename}
                      className={zoom === "actual" ? "block h-auto w-auto max-w-none" : "block h-auto w-full"}
                    />
                  )}
                </div>
              </div>

              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save("include");
                }}
              >
                {VILLAGE_AGENDA_FORM.questions.map((question) => {
                  const chosen = selection[String(question.number)] ?? [];
                  return (
                    <fieldset key={question.number} className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <legend className="px-1 text-xs font-medium">
                        {question.label}
                        <span className="ml-2 font-normal text-white/45">
                          {question.min_select === question.max_select
                            ? `${question.max_select}개`
                            : `${question.min_select}~${question.max_select}개`}{" "}
                          · {chosen.length}개
                        </span>
                      </legend>
                      <ul className="mt-2 space-y-1.5">
                        {question.options.map((option) => {
                          const checked = chosen.includes(option.label);
                          return (
                            <li key={option.label}>
                              <label className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 hover:bg-white/5">
                                <input
                                  type="checkbox"
                                  className="mt-0.5 size-3.5 accent-cyan-400"
                                  checked={checked}
                                  disabled={tab === "log"}
                                  onChange={() =>
                                    setSelection((current) => toggleSelection(current, question, option.label))
                                  }
                                />
                                <span className="text-[11px] leading-4">
                                  <span className="font-medium text-white/90">{option.label}</span>
                                  <span className="text-white/50"> · {option.title}</span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  );
                })}

                {tab === "queue" ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <GlassButton type="submit" disabled={saving || Boolean(limitError)}>
                      {saving ? "저장 중..." : "집계 반영"}
                    </GlassButton>
                    <GlassButton disabled={saving} onClick={() => void save("exclude")}>
                      집계 제외
                    </GlassButton>
                    {limitError ? (
                      <p className="text-[11px] font-medium text-amber-200">{limitError}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-white/55">
                    {reviewActionLabel(selected)} · 반영 항목 {formatSelection(selection)}
                  </p>
                )}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * Detaches the reviewed row from its stored page image and deletes the file
 * once no other row still points at it.
 */
async function releaseReviewedSource(
  supabase: ReturnType<typeof createClient>,
  row: ScanResultRow,
) {
  await supabase
    .from("scan_results")
    .update({ image_path: null, source_path: null })
    .eq("id", row.id);
  await removeScanSheet(supabase, row.image_path);
  if (!row.source_path) {
    return;
  }
  const { data, error } = await supabase
    .from("scan_results")
    .select("id")
    .eq("source_path", row.source_path)
    .limit(1);
  if (error || (data ?? []).length > 0) {
    return;
  }
  await removeScanSheet(supabase, row.source_path);
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 ${active ? "bg-white text-black" : "text-white/55 hover:text-white"}`}
    >
      {children}
    </button>
  );
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return new Date(value).toLocaleString("ko-KR");
}
