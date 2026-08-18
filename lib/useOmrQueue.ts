"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OmrRequestError, recognizeSheet } from "@/lib/omrClient";
import { isPdfFile, loadPdfPagesAsFiles } from "@/lib/loadFormImage";
import { emitScanResultsChanged, onWorkspaceReset } from "@/lib/scanEvents";
import { removeScanSheets, uploadSourceFile } from "@/lib/sheetStorage";
import { createClient } from "@/lib/supabase/client";
import type { ExceptionReason, QueueItem, ScanResultStatus, TemplateRow } from "@/lib/types";

function isImageFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|tif{1,2}|bmp)$/i.test(file.name)
  );
}

/** One storage path per uploaded file, so a retry overwrites instead of piling up copies. */
const sourceIds = new WeakMap<File, string>();

function sourceIdOf(file: File) {
  const existing = sourceIds.get(file);
  if (existing) {
    return existing;
  }
  const next = crypto.randomUUID();
  sourceIds.set(file, next);
  return next;
}

function selectedLabelCount(answers: Record<string, unknown> | null | undefined) {
  if (!answers) {
    return 0;
  }
  return Object.values(answers).reduce((total, value) => {
    if (Array.isArray(value)) {
      return total + value.filter(Boolean).length;
    }
    return total + (value ? 1 : 0);
  }, 0);
}

/**
 * Drops stored originals once every page from them landed cleanly. A multi-page PDF
 * stays until its last unreviewed exception or failure is gone.
 */
async function releaseCleanSources(
  supabase: ReturnType<typeof createClient>,
  sourcePaths: Map<File, string | null>,
) {
  const paths = Array.from(new Set(Array.from(sourcePaths.values()).filter(Boolean) as string[]));
  if (paths.length === 0) {
    return;
  }
  const { data, error } = await supabase
    .from("scan_results")
    .select("source_path, status, reviewed_at")
    .in("source_path", paths);
  if (error) {
    return;
  }
  const keep = new Set(
    (data ?? [])
      .filter(
        (row) =>
          row.status === "failed" || (row.status === "exception" && !row.reviewed_at),
      )
      .map((row) => row.source_path as string),
  );
  await removeScanSheets(
    supabase,
    paths.filter((path) => !keep.has(path)),
  );
}

export function useOmrQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [running, setRunning] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);
  const runningRef = useRef(false);
  const itemsRef = useRef<QueueItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    return onWorkspaceReset(() => {
      runningRef.current = false;
      setRunning(false);
      setPreparing(null);
      setItems([]);
    });
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const hasPdf = list.some(isPdfFile);
    if (hasPdf) {
      setPreparing("PDF를 페이지 이미지로 바꾸는 중...");
    }
    const next: QueueItem[] = [];
    try {
      for (const file of list) {
        try {
          const pages = isPdfFile(file)
            ? await loadPdfPagesAsFiles(file, (done, total) => {
                setPreparing(`PDF ${done}/${total}페이지 변환 중...`);
              })
            : isImageFile(file)
              ? [file]
              : [];
          if (pages.length === 0) {
            next.push({
              id: crypto.randomUUID(),
              file,
              source: file,
              sourcePage: 1,
              filename: file.name,
              status: "failed",
              attempts: 0,
              errorCode: "UNSUPPORTED",
              errorMessage: "JPG, PNG, PDF만 올릴 수 있습니다.",
            });
            continue;
          }
          pages.forEach((page, index) => {
            next.push({
              id: crypto.randomUUID(),
              file: page,
              source: file,
              sourcePage: index + 1,
              filename: page.name,
              status: "pending",
              attempts: 0,
            });
          });
        } catch (error) {
          next.push({
            id: crypto.randomUUID(),
            file,
            source: file,
            sourcePage: 1,
            filename: file.name,
            status: "failed",
            attempts: 0,
            errorCode: "PDF_DECODE",
            errorMessage: error instanceof Error ? error.message : "PDF를 열 수 없습니다.",
          });
        }
      }
      setItems((current) => [...current, ...next]);
    } finally {
      setPreparing(null);
    }
  }, []);

  const clear = useCallback(() => {
    if (runningRef.current) {
      return;
    }
    setItems([]);
  }, []);

  const runBatch = useCallback(
    async (template: TemplateRow, userId: string, targets: QueueItem[]) => {
      if (runningRef.current || targets.length === 0) {
        return;
      }
      runningRef.current = true;
      setRunning(true);

      const supabase = createClient();
      const { data: job, error: jobError } = await supabase
        .from("scan_jobs")
        .insert({
          template_id: template.id,
          total_count: targets.length,
          success_count: 0,
          failed_count: 0,
          created_by: userId,
        })
        .select("id")
        .single();

      if (jobError) {
        runningRef.current = false;
        setRunning(false);
        throw jobError;
      }

      // Store every upload untouched before recognition runs. Whatever happens next,
      // an exception always has the original bytes to show.
      const sourcePaths = new Map<File, string | null>();
      const sources = Array.from(new Set(targets.map((item) => item.source)));
      for (let index = 0; index < sources.length; index += 1) {
        setPreparing(`원본 보관 중 ${index + 1}/${sources.length}...`);
        const source = sources[index];
        sourcePaths.set(
          source,
          await uploadSourceFile(supabase, userId, sourceIdOf(source), source),
        );
      }
      setPreparing(null);

      let successCount = 0;
      let exceptionCount = 0;
      let failedCount = 0;

      for (const item of targets) {
        const sourcePath = sourcePaths.get(item.source) ?? null;
        const sourceColumns: { source_path: string | null; source_page: number | null } = {
          source_path: sourcePath,
          source_page: sourcePath ? item.sourcePage : null,
        };
        updateItem(item.id, { status: "processing", attempts: item.attempts + 1 });
        try {
          const result = await recognizeSheet(item.file, template);
          const reasons = (result.exception_reasons ?? []) as ExceptionReason[];
          const emptySheet = selectedLabelCount(result.answers) === 0;
          if (emptySheet && !reasons.some((reason) => reason.kind === "empty")) {
            reasons.push({
              number: "",
              label: "용지",
              selected_count: 0,
              max_select: 0,
              kind: "empty",
              message: "선택이 없습니다",
            });
          }
          const isException = result.sheet_status === "exception" || reasons.length > 0 || emptySheet;
          const status: ScanResultStatus = isException ? "exception" : "success";
          const reasonText = reasons.map((reason) => reason.message).join(" / ");
          const errorCode = isException ? (emptySheet ? "RULE_EMPTY" : "RULE_OVERFLOW") : null;
          const resultId = crypto.randomUUID();
          const payload = {
            id: resultId,
            job_id: job.id,
            template_id: template.id,
            filename: item.filename,
            status,
            answers: result.answers,
            details: {
              ...(typeof result.details === "object" && result.details ? result.details : {}),
              sheet_status: isException ? "exception" : "ok",
              exception_reasons: reasons,
            },
            error_code: errorCode,
            error_message: isException ? reasonText || "선택이 없습니다" : null,
            created_by: userId,
            ...sourceColumns,
          };
          let { error } = await supabase.from("scan_results").insert(payload);
          if (error && sourcePath) {
            const withoutSource = { ...payload };
            delete (withoutSource as Record<string, unknown>).source_path;
            delete (withoutSource as Record<string, unknown>).source_page;
            ({ error } = await supabase.from("scan_results").insert(withoutSource));
          }
          if (error && status === "exception") {
            ({ error } = await supabase.from("scan_results").insert({
              ...payload,
              status: "success",
            }));
          }
          if (error) {
            throw error;
          }
          emitScanResultsChanged();
          if (isException) {
            exceptionCount += 1;
            updateItem(item.id, {
              status: "exception",
              answers: result.answers,
              errorCode: errorCode ?? "RULE_OVERFLOW",
              errorMessage: reasonText || "선택이 없습니다",
            });
          } else {
            successCount += 1;
            updateItem(item.id, {
              status: "success",
              answers: result.answers,
              errorCode: undefined,
              errorMessage: undefined,
            });
          }
        } catch (error) {
          failedCount += 1;
          const requestError =
            error instanceof OmrRequestError
              ? error
              : new OmrRequestError(
                  500,
                  "INTERNAL",
                  error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.",
                );
          await supabase.from("scan_results").insert({
            job_id: job.id,
            template_id: template.id,
            filename: item.filename,
            status: "failed",
            error_code: requestError.code,
            error_message: requestError.message,
            created_by: userId,
            ...sourceColumns,
          });
          updateItem(item.id, {
            status: "failed",
            errorCode: requestError.code,
            errorMessage: requestError.message,
          });
          emitScanResultsChanged();
        }
      }

      await releaseCleanSources(supabase, sourcePaths);

      const { error: jobUpdateError } = await supabase
        .from("scan_jobs")
        .update({
          success_count: successCount,
          failed_count: failedCount,
          exception_count: exceptionCount,
        })
        .eq("id", job.id);
      if (jobUpdateError) {
        await supabase
          .from("scan_jobs")
          .update({
            success_count: successCount,
            failed_count: failedCount,
          })
          .eq("id", job.id);
      }

      runningRef.current = false;
      setRunning(false);
      emitScanResultsChanged();
    },
    [updateItem],
  );

  const processPending = useCallback(
    async (template: TemplateRow, userId: string) => {
      const pending = itemsRef.current.filter((item) => item.status === "pending");
      await runBatch(template, userId, pending);
    },
    [runBatch],
  );

  const retryItems = useCallback(
    async (template: TemplateRow, userId: string, ids?: string[]) => {
      const failed = itemsRef.current.filter(
        (item) => item.status === "failed" && (!ids || ids.includes(item.id)),
      );
      if (failed.length === 0) {
        return;
      }
      const idSet = new Set(failed.map((item) => item.id));
      setItems((current) =>
        current.map((item) =>
          idSet.has(item.id)
            ? {
                ...item,
                status: "pending",
                errorCode: undefined,
                errorMessage: undefined,
              }
            : item,
        ),
      );
      await runBatch(
        template,
        userId,
        failed.map((item) => ({
          ...item,
          status: "pending",
          errorCode: undefined,
          errorMessage: undefined,
        })),
      );
    },
    [runBatch],
  );

  const retryFailed = useCallback(
    async (template: TemplateRow, userId: string) => {
      await retryItems(template, userId);
    },
    [retryItems],
  );

  return { items, running, preparing, addFiles, clear, processPending, retryFailed, retryItems };
}
