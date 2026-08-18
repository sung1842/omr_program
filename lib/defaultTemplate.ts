import { VILLAGE_AGENDA_FORM } from "@/lib/formSpec";
import type { Marker, OptionROI, Question, TemplatePayload } from "@/lib/types";

/** Canonical size of the example 신사2동 투표용지 overlay. */
export const VILLAGE_FORM_WIDTH = 2224;
export const VILLAGE_FORM_HEIGHT = 2867;

function round6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function rel(x: number, y: number, w: number, h: number) {
  return {
    x: round6(x / VILLAGE_FORM_WIDTH),
    y: round6(y / VILLAGE_FORM_HEIGHT),
    w: round6(w / VILLAGE_FORM_WIDTH),
    h: round6(h / VILLAGE_FORM_HEIGHT),
  };
}

function marker(
  id: Marker["id"],
  x: number,
  y: number,
  w = 48,
  h = 36,
): Marker {
  return { id, shape: "square", ...rel(x, y, w, h) };
}

/** 기표란 열. 예산 숫자 오른쪽, 표 오른쪽 끝 안쪽. */
const MARK_X = 2040;
const MARK_W = 148;

/** 특화 2 + 일반 10 + 시설 3. 예시 PDF 오버레이에서 읽은 행 구간. */
const MARK_ROWS: Array<[number, number]> = [
  [575, 640],
  [675, 745],
  [775, 845],
  [875, 945],
  [975, 1045],
  [1078, 1148],
  [1180, 1250],
  [1282, 1352],
  [1382, 1452],
  [1484, 1554],
  [1586, 1656],
  [1685, 1756],
  [1786, 1856],
  [1888, 1958],
  [1989, 2059],
];

export const DEFAULT_TEMPLATE_NAME = VILLAGE_AGENDA_FORM.name;

export function buildVillageAgendaTemplate(): TemplatePayload {
  const boxes = MARK_ROWS.map(([y0, y1]) => rel(MARK_X, y0, MARK_W, y1 - y0));
  let index = 0;
  const questions: Question[] = VILLAGE_AGENDA_FORM.questions.map((spec) => {
    const options: OptionROI[] = spec.options.map((option) => {
      const box = boxes[index];
      index += 1;
      return {
        id: `opt-${option.label}`,
        label: option.label,
        title: option.title,
        ...box,
      };
    });
    return {
      id: `q-${spec.number}`,
      number: spec.number,
      label: spec.label,
      type: spec.type,
      min_select: spec.min_select,
      max_select: spec.max_select,
      on_overflow: spec.on_overflow,
      options,
    };
  });

  return {
    name: DEFAULT_TEMPLATE_NAME,
    image_width: VILLAGE_FORM_WIDTH,
    image_height: VILLAGE_FORM_HEIGHT,
    marker_shape: "square",
    fill_threshold: VILLAGE_AGENDA_FORM.fill_threshold,
    auto_mark_cells: true,
    markers: [
      marker("tl", 42, 255),
      marker("tr", 2148, 255),
      marker("br", 2148, 2072),
      marker("bl", 42, 2072),
    ],
    questions,
  };
}
