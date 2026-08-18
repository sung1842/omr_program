"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OmrRequestError, recognizeSheet } from "@/lib/omrClient";
import { isPdfFile, loadPdfPagesAsFiles } from "@/lib/loadFormImage";
import { uploadScanSheet } from "@/lib/sheetStorage";
import { createClient } from "@/lib/supabase/client";
import type { ExceptionReason, QueueItem, ScanResultStatus, TemplateRow } from "@/lib/types";

function isImageFile(file: File) {
  return (
    file.type.startsWith("image/") ||
    /\.(png|jpe?g|webp|tif{1,2}|bmp)$/i.test(file.name)
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
              filename: file.name,
              status: "failed",
              attempts: 0,
              errorCode: "UNSUPPORTED",
              errorMessage: "JPG, PNG, PDF만 올릴 수 있습니다.",
            });
            continue;
          }
          for (const page of pages) {
            next.push({
              id: crypto.randomUUID(),
              file: page,
              filename: page.name,
              status: "pending",
              attempts: 0,
            });
          }
        } catch (error) {
          next.push({
            id: crypto.randomUUID(),
            file,
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

      let successCount = 0;
      let exceptionCount = 0;
      let failedCount = 0;

      for (const item of targets) {
        updateItem(item.id, { status: "processing", attempts: item.attempts + 1 });
        try {
          const result = await recognizeSheet(item.file, template);
          const reasons = (result.exception_reasons ?? []) as ExceptionReason[];
          const isException = result.sheet_status === "exception" || reasons.length > 0;
          const status: ScanResultStatus = isException ? "exception" : "success";
          const reasonText = reasons.map((reason) => reason.message).join(" / ");
          const geometry = reasons.some((reason) => reason.kind === "geometry");
          const errorCode = isException
            ? geometry
              ? "MARK_GEOMETRY"
              : "RULE_OVERFLOW"
            : null;
          const resultId = crypto.randomUUID();
          const imagePath = isException
            ? await uploadScanSheet(supabase, userId, resultId, item.file)
            : null;
          const payload = {
            id: resultId,
            job_id: job.id,
            template_id: template.id,
            filename: item.filename,
            status,
            answers: result.answers,
            details: result.details,
            error_code: errorCode,
            error_message: isException ? reasonText || "선택 한도 초과" : null,
            created_by: userId,
            ...(imagePath ? { image_path: imagePath } : {}),
          };
          let { error } = await supabase.from("scan_results").insert(payload);
          if (error && imagePath) {
            const withoutImage = { ...payload };
            delete withoutImage.image_path;
            ({ error } = await supabase.from("scan_results").insert(withoutImage));
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
          if (isException) {
            exceptionCount += 1;
            updateItem(item.id, {
              status: "exception",
              answers: result.answers,
              errorCode: errorCode ?? "RULE_OVERFLOW",
              errorMessage: reasonText || "선택 한도 초과",
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
          });
          updateItem(item.id, {
            status: "failed",
            errorCode: requestError.code,
            errorMessage: requestError.message,
          });
        }
      }

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
