"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { FORM_FILE_ACCEPT, isSupportedFormFile } from "@/lib/loadFormImage";
import { setPendingTemplateFile } from "@/lib/pendingTemplateFile";
import { createClient, hasSupabaseConfig } from "@/lib/supabase/client";
import type { TemplateRow } from "@/lib/types";

export function TemplatesPanel() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig()) {
      return;
    }
    const supabase = createClient();
    supabase
      .from("templates")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(loadError.message);
          return;
        }
        setTemplates((data ?? []) as TemplateRow[]);
      });
  }, []);

  function openEditor(file?: File) {
    if (file) {
      if (!isSupportedFormFile(file)) {
        setError("JPG, PNG, WEBP, PDF만 올릴 수 있습니다.");
        return;
      }
      setPendingTemplateFile(file);
    }
    setError(null);
    router.push("/templates/new");
  }

  return (
    <div className="space-y-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[0.5625rem] tracking-[0.2em] text-white/45">TEMPLATE</p>
          <h3 className="text-base font-semibold">설문지 양식 학습</h3>
        </div>
        <ShimmerButton className="shadow-lg" onClick={() => openEditor()}>
          좌표 찍기
        </ShimmerButton>
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
          const file = event.dataTransfer.files[0];
          if (file) {
            openEditor(file);
          }
        }}
        className={`block cursor-pointer rounded-xl border border-dashed px-3 py-3 text-center sm:px-4 sm:py-4 ${
          dragOver ? "border-cyan-300 bg-cyan-300/10" : "border-white/20 bg-white/5"
        }`}
      >
        <input
          type="file"
          accept={FORM_FILE_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              openEditor(file);
              event.target.value = "";
            }
          }}
        />
        <p className="text-sm font-medium">빈 설문지를 여기에 놓으세요</p>
        <p className="mt-0.5 text-[0.6875rem] text-white/50">
          JPG / PNG / PDF 가능. 올리면 표 모서리와 기표 원을 찍는 화면으로 이동합니다.
        </p>
      </label>

      <ul className="divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10 bg-white/5">
        {templates.length === 0 ? (
          <li className="p-3 text-xs text-white/60">저장된 양식이 없습니다. 위에서 빈 설문지를 올려 주세요.</li>
        ) : (
          templates.map((template) => (
            <li key={template.id} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{template.name}</p>
                <p className="text-[0.6875rem] text-white/50">
                  기준점 {template.markers.length} · 문항 {template.questions.length}
                </p>
              </div>
              <Link href={`/templates/${template.id}`} className="text-xs text-cyan-200 underline">
                좌표 수정
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
