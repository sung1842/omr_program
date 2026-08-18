import * as XLSX from "xlsx";
import { optionTitle } from "@/lib/formSpec";
import {
  countOptions,
  exceptionSummary,
  formatSelected,
  normalizeQuestion,
  resultKind,
} from "@/lib/results";
import type { Question, ScanResultRow } from "@/lib/types";

export function downloadResultsXlsx(
  templateName: string,
  questions: Question[],
  rows: ScanResultRow[],
) {
  const validRows = rows.filter((row) => resultKind(row) === "valid");
  const exceptionRows = rows.filter((row) => resultKind(row) === "exception");
  const failedRows = rows.filter((row) => resultKind(row) === "failed");
  const ordered = questions.map(normalizeQuestion).sort((a, b) => a.number - b.number);

  const tallyHeader = ["그룹", "항목", "사업명", "선택 횟수"];
  const tallyData = ordered.flatMap((question) =>
    countOptions(question, validRows).map((option) => [
      question.label,
      option.label,
      option.title,
      option.count,
    ]),
  );

  const responseHeader = [
    "파일명",
    "처리시각",
    ...ordered.map((question) => question.label),
  ];
  const responseData = validRows.map((row) => [
    row.filename,
    new Date(row.created_at).toLocaleString("ko-KR"),
    ...ordered.map((question) =>
      formatSelected(row.answers, question)
        .split(", ")
        .filter(Boolean)
        .map((label) => optionTitle(question, label))
        .join(", "),
    ),
  ]);

  const exceptionSheet = XLSX.utils.aoa_to_sheet([
    ["파일명", "처리시각", "예외 사유", ...ordered.map((question) => question.label)],
    ...exceptionRows.map((row) => [
      row.filename,
      new Date(row.created_at).toLocaleString("ko-KR"),
      exceptionSummary(row),
      ...ordered.map((question) => formatSelected(row.answers, question)),
    ]),
  ]);

  const failSheet = XLSX.utils.aoa_to_sheet([
    ["파일명", "처리시각", "오류코드", "오류메시지"],
    ...failedRows.map((row) => [
      row.filename,
      new Date(row.created_at).toLocaleString("ko-KR"),
      row.error_code ?? "",
      row.error_message ?? "",
    ]),
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([tallyHeader, ...tallyData]),
    "항목별 횟수",
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([responseHeader, ...responseData]),
    "유효 응답",
  );
  XLSX.utils.book_append_sheet(workbook, exceptionSheet, "예외");
  XLSX.utils.book_append_sheet(workbook, failSheet, "실패");
  const filename = `${templateName.replace(/[\\/:*?"<>|]/g, "_")}_집계.xlsx`;
  XLSX.writeFile(workbook, filename);
}
