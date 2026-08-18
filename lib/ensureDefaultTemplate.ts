import { buildVillageAgendaTemplate, DEFAULT_TEMPLATE_NAME } from "@/lib/defaultTemplate";
import { createClient } from "@/lib/supabase/client";
import type { TemplateRow } from "@/lib/types";

export async function ensureDefaultTemplate(userId: string): Promise<TemplateRow> {
  const supabase = createClient();
  const payload = buildVillageAgendaTemplate();
  const { auto_mark_cells: _auto, ...row } = payload;
  const { data: existing, error: loadError } = await supabase
    .from("templates")
    .select("*")
    .eq("name", DEFAULT_TEMPLATE_NAME)
    .order("created_at", { ascending: true })
    .limit(1);

  if (loadError) {
    throw loadError;
  }
  if (existing?.[0]) {
    const current = existing[0] as TemplateRow;
    if (current.fill_threshold > 0.04) {
      await supabase
        .from("templates")
        .update({ fill_threshold: payload.fill_threshold })
        .eq("id", current.id);
    }
    return { ...current, fill_threshold: payload.fill_threshold, auto_mark_cells: true };
  }

  const { data, error } = await supabase
    .from("templates")
    .insert({
      ...row,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    throw error ?? new Error("기본 양식을 저장하지 못했습니다.");
  }
  return { ...(data as TemplateRow), auto_mark_cells: true };
}
