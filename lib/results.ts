import { optionTitle } from "@/lib/formSpec";
import type {
  AnswerMap,
  ExceptionReason,
  Question,
  ScanResultRow,
  SheetStatus,
} from "@/lib/types";

export function selectedLabels(answers: AnswerMap | null | undefined, question: Question): string[] {
  if (!answers) {
    return [];
  }
  const raw = answers[String(question.number)] ?? answers[question.id];
  if (raw == null || raw === "") {
    return [];
  }
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter(Boolean);
  }
  return String(raw)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatSelected(answers: AnswerMap | null | undefined, question: Question) {
  const labels = selectedLabels(answers, question);
  if (labels.length === 0) {
    return "";
  }
  return labels.join(", ");
}

type DetailsShape = {
  sheet_status?: SheetStatus;
  exception_reasons?: ExceptionReason[];
};

export function readDetails(details: unknown): DetailsShape {
  if (!details || typeof details !== "object") {
    return {};
  }
  return details as DetailsShape;
}

export function resultKind(row: ScanResultRow): "valid" | "exception" | "failed" {
  if (row.status === "failed") {
    return "failed";
  }
  if (row.reviewed_at) {
    return row.status === "success" ? "valid" : "exception";
  }
  if (row.status === "exception") {
    return "exception";
  }
  const details = readDetails(row.details);
  if (details.sheet_status === "exception" || row.error_code === "RULE_OVERFLOW" || row.error_code === "MARK_GEOMETRY" || row.error_code === "RULE_EMPTY") {
    return "exception";
  }
  return "valid";
}

export function exceptionSummary(row: ScanResultRow) {
  if (row.error_message) {
    return row.error_message;
  }
  const reasons = readDetails(row.details).exception_reasons ?? [];
  if (reasons.length === 0) {
    return row.error_code === "MARK_GEOMETRY" ? "기표 칸 침범" : row.error_code === "RULE_EMPTY" ? "선택이 없습니다" : "선택 한도 초과";
  }
  return reasons.map((reason) => reason.message).join(" / ");
}

export function normalizeQuestion(question: Question): Question {
  const type = question.type === "single" ? "single" : "multi";
  const minSelect = Number.isFinite(question.min_select) ? Math.max(0, Number(question.min_select)) : 0;
  const fallbackMax = type === "single" ? 1 : Math.max(1, question.options.length || 1);
  const maxSelect = Number.isFinite(question.max_select)
    ? Math.max(0, Number(question.max_select))
    : fallbackMax;
  return {
    ...question,
    type,
    min_select: minSelect,
    max_select: maxSelect,
    on_overflow: "exception",
  };
}

export type OptionCount = {
  label: string;
  title: string;
  count: number;
};

export function countOptions(question: Question, validRows: ScanResultRow[]): OptionCount[] {
  const counts = new Map<string, number>();
  for (const option of question.options) {
    counts.set(option.label, 0);
  }
  for (const row of validRows) {
    for (const label of selectedLabels(row.answers, question)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([label, count]) => ({
    label,
    title: optionTitle(question, label),
    count,
  }));
}
