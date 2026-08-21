import { DEFAULT_TEMPLATE_NAME } from "@/lib/defaultTemplate";
import { emitScanResultsChanged, emitTemplatesChanged } from "@/lib/scanEvents";
import { removeScanSheets } from "@/lib/sheetStorage";
import { createClient } from "@/lib/supabase/client";
import type { TemplatePayload, TemplateRow } from "@/lib/types";

const ACTIVE_TEMPLATE_KEY = "omr.activeTemplateId";

export function rememberActiveTemplate(id: string) {
  try {
    sessionStorage.setItem(ACTIVE_TEMPLATE_KEY, id);
  } catch {
    // Private mode or blocked storage — ScanPanel still lists templates.
  }
}

export function readActiveTemplateId(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_TEMPLATE_KEY);
  } catch {
    return null;
  }
}

export function clearActiveTemplate(id?: string) {
  try {
    if (!id || sessionStorage.getItem(ACTIVE_TEMPLATE_KEY) === id) {
      sessionStorage.removeItem(ACTIVE_TEMPLATE_KEY);
    }
  } catch {
    // ignore
  }
}

export function isSeedTemplate(name: string) {
  return name === DEFAULT_TEMPLATE_NAME;
}

export function seedTemplateId(rows: Array<{ id: string; name: string; created_at?: string }>) {
  const seeds = rows.filter((row) => row.name === DEFAULT_TEMPLATE_NAME);
  if (seeds.length === 0) {
    return "";
  }
  return [...seeds].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))[0].id;
}

export function canDeleteTemplate(
  template: { id: string; name: string } | null,
  templates: Array<{ id: string; name: string; created_at?: string }>,
) {
  if (!template) {
    return false;
  }
  const lockedId = seedTemplateId(templates);
  return Boolean(lockedId) && template.id !== lockedId;
}

/** Insert a wizard TemplatePayload into `templates`. Login required. */
export async function saveWizardTemplate(payload: TemplatePayload): Promise<TemplateRow> {
  const supabase = createClient();
  const session = await supabase.auth.getUser();
  if (session.error || !session.data.user) {
    throw new Error("로그인이 필요합니다.");
  }

  const { auto_mark_cells: _auto, ...row } = payload;
  const { data, error } = await supabase
    .from("templates")
    .insert({
      name: row.name,
      image_width: row.image_width,
      image_height: row.image_height,
      marker_shape: row.marker_shape,
      markers: row.markers,
      questions: row.questions,
      fill_threshold: row.fill_threshold,
      created_by: session.data.user.id,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error || !data) {
    throw error ?? new Error("양식을 저장하지 못했습니다.");
  }

  const saved = data as TemplateRow;
  rememberActiveTemplate(saved.id);
  emitTemplatesChanged();
  return saved;
}

export async function deleteWizardTemplate(id: string) {
  const supabase = createClient();
  const { data: rows, error: listError } = await supabase
    .from("templates")
    .select("id, name, created_at")
    .order("created_at", { ascending: true });
  if (listError) {
    throw listError;
  }
  const templates = (rows ?? []) as Array<{ id: string; name: string; created_at: string }>;
  const target = templates.find((row) => row.id === id);
  if (!target) {
    throw new Error("양식을 찾지 못했습니다.");
  }
  if (!canDeleteTemplate(target, templates)) {
    throw new Error("기본 양식은 삭제할 수 없습니다.");
  }

  const { data: results, error: resultsError } = await supabase
    .from("scan_results")
    .select("source_path, image_path")
    .eq("template_id", id)
    .range(0, 9999);
  if (resultsError) {
    throw resultsError;
  }
  const sheetPaths = [
    ...new Set(
      (results ?? []).flatMap((row) => [row.source_path, row.image_path]).filter((path): path is string => Boolean(path)),
    ),
  ];
  await removeScanSheets(supabase, sheetPaths);

  const { error: deleteResultsError } = await supabase.from("scan_results").delete().eq("template_id", id);
  if (deleteResultsError) {
    throw deleteResultsError;
  }
  const { error: deleteJobsError } = await supabase.from("scan_jobs").delete().eq("template_id", id);
  if (deleteJobsError) {
    throw deleteJobsError;
  }
  const { error } = await supabase.from("templates").delete().eq("id", id);
  if (error) {
    throw error;
  }
  clearActiveTemplate(id);
  emitTemplatesChanged();
  emitScanResultsChanged();
}
