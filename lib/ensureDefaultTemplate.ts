import { buildVillageAgendaTemplate, DEFAULT_TEMPLATE_NAME } from "@/lib/defaultTemplate";
import { createClient } from "@/lib/supabase/client";
import type { Question, TemplateRow } from "@/lib/types";

function withCurrentFormLayout(current: Question[], fresh: Question[]): Question[] {
  return current.map((question, index) => {
    const spec = fresh[index];
    if (!spec) {
      return question;
    }
    return {
      ...question,
      min_select: spec.min_select,
      max_select: spec.max_select,
      on_overflow: spec.on_overflow,
      options: question.options.map((option, optionIndex) => {
        const source = spec.options[optionIndex];
        if (!source) {
          return option;
        }
        return {
          ...option,
          x: source.x,
          y: source.y,
          w: source.w,
          h: source.h,
          circle: source.circle,
        };
      }),
    };
  });
}

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
    const questions = withCurrentFormLayout(current.questions, payload.questions);
    await supabase
      .from("templates")
      .update({
        image_width: payload.image_width,
        image_height: payload.image_height,
        markers: payload.markers,
        fill_threshold: payload.fill_threshold,
        questions,
      })
      .eq("id", current.id);
    return {
      ...current,
      image_width: payload.image_width,
      image_height: payload.image_height,
      markers: payload.markers,
      fill_threshold: payload.fill_threshold,
      questions,
      auto_mark_cells: false,
    };
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
  return { ...(data as TemplateRow), auto_mark_cells: false };
}
