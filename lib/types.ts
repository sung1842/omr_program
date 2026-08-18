export const VERCEL_PAYLOAD_LIMIT = Math.floor(4.5 * 1024 * 1024);
export const TARGET_IMAGE_BYTES = Math.floor(3.0 * 1024 * 1024);
export const OMR_TIMEOUT_MS = 11_000;
export const MAX_RETRIES = 3;
export const MAX_MARKERS = 4;

export const MARKER_LABELS: Record<string, string> = {
  tl: "좌상",
  tr: "우상",
  br: "우하",
  bl: "좌하",
};

export type MarkerShape = "square" | "circle";
export type QuestionType = "single" | "multi";
export type OverflowAction = "exception";
export type SheetStatus = "ok" | "exception";

export type Marker = {
  id: "tl" | "tr" | "br" | "bl";
  x: number;
  y: number;
  w: number;
  h: number;
  shape: MarkerShape;
};

export type RelRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OptionROI = RelRect & {
  id: string;
  label: string;
  title?: string;
  /** Printed circle inside the 기표란 cell. Fixed overlay coordinates; do not re-detect. */
  circle?: RelRect;
};

export type Question = {
  id: string;
  number: number;
  label: string;
  type?: QuestionType;
  min_select?: number;
  max_select?: number;
  on_overflow?: OverflowAction;
  options: OptionROI[];
};

export type TemplatePayload = {
  name: string;
  image_width: number;
  image_height: number;
  marker_shape: MarkerShape;
  markers: Marker[];
  questions: Question[];
  fill_threshold: number;
  auto_mark_cells?: boolean;
};

export type TemplateRow = TemplatePayload & {
  id: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type QueueStatus = "pending" | "processing" | "success" | "exception" | "failed";

export type AnswerMap = Record<string, string | string[] | null>;

export type QueueItem = {
  id: string;
  /** Page image handed to the recognizer. */
  file: File;
  /** Untouched upload this page came from, kept for human review. */
  source: File;
  sourcePage: number;
  filename: string;
  status: QueueStatus;
  attempts: number;
  errorCode?: string;
  errorMessage?: string;
  answers?: AnswerMap;
};

export type ScanResultStatus = "success" | "exception" | "failed";

export type ScanResultRow = {
  id: string;
  job_id: string | null;
  template_id: string;
  filename: string;
  status: ScanResultStatus;
  answers: AnswerMap | null;
  details: unknown;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  image_path?: string | null;
  source_path?: string | null;
  source_page?: number | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

export type ExceptionReason = {
  number: string;
  label: string;
  selected_count: number;
  max_select: number;
  message: string;
  kind?: "count" | "geometry" | "empty";
  option_label?: string;
};

export type OmrSuccess = {
  ok: true;
  answers: AnswerMap;
  details: unknown;
  marker_count: number;
  sheet_status?: SheetStatus;
  exception_reasons?: ExceptionReason[];
  alignment?: string;
};

export type OmrFailure = {
  ok: false;
  error_code: string;
  error: string;
};
