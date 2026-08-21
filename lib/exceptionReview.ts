import { VILLAGE_AGENDA_FORM, type FormQuestionDef } from "@/lib/formSpec";
import { normalizeQuestion, resultKind, selectedLabels } from "@/lib/results";
import type { AnswerMap, Question, ScanResultRow, TemplateRow } from "@/lib/types";

export type SelectionMap = Record<string, string[]>;

export function isPendingException(row: ScanResultRow) {
  return !row.reviewed_at && resultKind(row) === "exception";
}

export function isExceptionLog(row: ScanResultRow) {
  return Boolean(row.reviewed_at);
}

export function questionsFromTemplate(template: Pick<TemplateRow, "questions"> | null | undefined): FormQuestionDef[] {
  const questions = template?.questions;
  if (!questions?.length) {
    return VILLAGE_AGENDA_FORM.questions;
  }
  return questions.map((question) => {
    const normalized = normalizeQuestion(question);
    return {
      number: normalized.number,
      label: normalized.label,
      type: "multi",
      min_select: normalized.min_select ?? 0,
      max_select: normalized.max_select ?? Math.max(1, normalized.options.length),
      on_overflow: "exception",
      options: normalized.options.map((option) => ({
        label: option.label,
        title: option.title || option.label,
      })),
    };
  });
}

export function emptySelection(questions: FormQuestionDef[] = VILLAGE_AGENDA_FORM.questions): SelectionMap {
  return Object.fromEntries(questions.map((question) => [String(question.number), []]));
}

export function selectionFromAnswers(
  answers: AnswerMap | null | undefined,
  questions: FormQuestionDef[] = VILLAGE_AGENDA_FORM.questions,
): SelectionMap {
  const next = emptySelection(questions);
  for (const question of questions) {
    const stub = {
      id: `q-${question.number}`,
      number: question.number,
      label: question.label,
      options: question.options.map((option) => ({
        id: option.label,
        label: option.label,
        x: 0,
        y: 0,
        w: 0,
        h: 0,
      })),
    } as Question;
    const allowed = new Set(question.options.map((option) => option.label));
    next[String(question.number)] = selectedLabels(answers, stub).filter((label) => allowed.has(label));
  }
  return next;
}

export function answersFromSelection(
  selection: SelectionMap,
  questions: FormQuestionDef[] = VILLAGE_AGENDA_FORM.questions,
): AnswerMap {
  const answers: AnswerMap = {};
  for (const question of questions) {
    answers[String(question.number)] = [...(selection[String(question.number)] ?? [])];
  }
  return answers;
}

export function selectionLimitError(
  selection: SelectionMap,
  questions: FormQuestionDef[] = VILLAGE_AGENDA_FORM.questions,
): string | null {
  for (const question of questions) {
    const count = selection[String(question.number)]?.length ?? 0;
    if (count > question.max_select) {
      return `${question.label}: ${count}개 선택 (최대 ${question.max_select}개)`;
    }
    if (count < question.min_select) {
      return `${question.label}: ${count}개 선택 (최소 ${question.min_select}개)`;
    }
  }
  return null;
}

export function toggleSelection(
  selection: SelectionMap,
  question: FormQuestionDef,
  label: string,
): SelectionMap {
  const key = String(question.number);
  const current = selection[key] ?? [];
  const has = current.includes(label);
  let next: string[];
  if (question.max_select === 1) {
    next = has ? [] : [label];
  } else if (has) {
    next = current.filter((item) => item !== label);
  } else {
    next = [...current, label];
  }
  return { ...selection, [key]: next };
}

export function formatSelection(selection: SelectionMap): string {
  const labels = Object.values(selection).flat();
  return labels.length > 0 ? labels.join(", ") : "선택 없음";
}

export function reviewActionLabel(row: ScanResultRow) {
  if (!row.reviewed_at) {
    return "대기";
  }
  return row.status === "success" ? "집계 반영" : "집계 제외";
}
