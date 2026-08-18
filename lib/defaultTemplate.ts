import { VILLAGE_AGENDA_FORM } from "@/lib/formSpec";
import type { Marker, OptionROI, Question, TemplatePayload } from "@/lib/types";

/** Canonical overlay size measured from 1234.pdf (table layer). */
export const VILLAGE_FORM_WIDTH = 2224;
export const VILLAGE_FORM_HEIGHT = 2868;

/**
 * 기표란 칸·원. Hough/격자 재탐지 금지 — 워프 후 이 픽셀을 그대로 쓴다.
 * 1234.pdf overlay에서 빈 인쇄 원을 링 피팅. 색칠된 5칸은 그 칸의 세로 중앙(같은 원 열).
 */
const CELL_X = 2036;
const CELL_W = 152;
const CELL_H = 101;
const CIRCLE_R = 21;
/** [cx, cy] overlay pixels. 열은 아래로 갈수록 약간 왼쪽. */
const CIRCLES: readonly [number, number][] = [
  [2154, 613],
  [2153, 714],
  [2153, 816],
  [2152, 917],
  [2152, 1018],
  [2151, 1119],
  [2151, 1219],
  [2150, 1321],
  [2149, 1421],
  [2149, 1523],
  [2148, 1623],
  [2147, 1725],
  [2147, 1826],
  [2147, 1926],
  [2146, 2028],
];

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

function marker(id: Marker["id"], x: number, y: number, w = 48, h = 36): Marker {
  return { id, shape: "square", ...rel(x, y, w, h) };
}

function markRow(index: number): { cell: ReturnType<typeof rel>; circle: ReturnType<typeof rel> } {
  const [cx, cy] = CIRCLES[index];
  return {
    cell: rel(CELL_X, cy - CELL_H / 2, CELL_W, CELL_H),
    circle: rel(cx - CIRCLE_R, cy - CIRCLE_R, CIRCLE_R * 2, CIRCLE_R * 2),
  };
}

export const DEFAULT_TEMPLATE_NAME = VILLAGE_AGENDA_FORM.name;

export function buildVillageAgendaTemplate(): TemplatePayload {
  let index = 0;
  const questions: Question[] = VILLAGE_AGENDA_FORM.questions.map((spec) => {
    const options: OptionROI[] = spec.options.map((option) => {
      const row = markRow(index);
      index += 1;
      return {
        id: `opt-${option.label}`,
        label: option.label,
        title: option.title,
        ...row.cell,
        circle: row.circle,
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
    auto_mark_cells: false,
    markers: [
      marker("tl", 36, CIRCLES[0][1] - CELL_H / 2),
      marker("tr", 2188, CIRCLES[0][1] - CELL_H / 2),
      marker("br", 2188, CIRCLES[14][1] + CELL_H / 2),
      marker("bl", 36, CIRCLES[14][1] + CELL_H / 2),
    ],
    questions,
  };
}
