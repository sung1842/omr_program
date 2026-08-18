import type { OverflowAction, Question } from "@/lib/types";

export type FormOptionDef = {
  label: string;
  title: string;
};

export type FormQuestionDef = {
  number: number;
  label: string;
  type: "multi";
  min_select: number;
  max_select: number;
  on_overflow: OverflowAction;
  options: FormOptionDef[];
};

export const VILLAGE_AGENDA_FORM = {
  name: "2027 신사2동 마을의제 선정 투표",
  marker_shape: "square" as const,
  /** Circle-hole blackness. 0.28 catches scribbles; raise if empty rings fire. */
  fill_threshold: 0.28,
  questions: [
    {
      number: 1,
      label: "프로그램 사업 특화",
      type: "multi",
      min_select: 0,
      max_select: 1,
      on_overflow: "exception",
      options: [
        {
          label: "우리마을",
          title: "신사2동 일상의 쉼표 : 우리마을 작은 음악회",
        },
        {
          label: "윤동주",
          title: "시(詩)가 흐르는 신사 : 윤동주와 걷는 마을 문학길",
        },
      ],
    },
    {
      number: 2,
      label: "프로그램 사업 일반",
      type: "multi",
      min_select: 0,
      max_select: 4,
      on_overflow: "exception",
      options: [
        { label: "일반1", title: "달빛 아래 낭만 극장 : 신사2동 도서관 옥상 문화 산책" },
        { label: "일반2", title: "AI와 친구 되기 ‘신사 스마트 톡톡(Talk Talk)’" },
        { label: "일반3", title: "세대공감 ‘흥’ 한마당 : 우리 가족 뽐내기 대회" },
        { label: "일반4", title: "지구 수호대 ‘신사 키즈’ : 어린이 환경 에코 탐험" },
        { label: "일반5", title: "함께해서 행복한 ‘댕댕이 신사’ : 펫티켓 산책 교실" },
        { label: "일반6", title: "스트레스 펀치! 건강 업! 신사2동 활력 복싱 교실" },
        { label: "일반7", title: "봉산 ‘썰(SSR)런’ : 신사2동 쓰레기 줍고 러닝하기" },
        { label: "일반8", title: "세대 통합 바둑 살롱 ‘신사동 신의 한 수’" },
        { label: "일반9", title: "지구를 구하는 등산 크루 ‘신사 줍깅 대장정’" },
        { label: "일반10", title: "악필 탈출, 당당한 내글씨! 신사동 실용 펜글씨 교정 교실" },
      ],
    },
    {
      number: 3,
      label: "시설 사업",
      type: "multi",
      min_select: 0,
      max_select: 1,
      on_overflow: "exception",
      options: [
        {
          label: "시설1",
          title: "‘내를 건너서 숲으로 도서관’ 옥외 문화공간 환경개선 사업",
        },
        {
          label: "시설2",
          title: "이랜드타운아파트 뒷산 입구 노후 계단 정비 사업",
        },
        {
          label: "시설3",
          title: "상신중학교 뒷길~편백숲 노후시설 및 길 정비 사업",
        },
      ],
    },
  ] satisfies FormQuestionDef[],
};

export function createVillageAgendaQuestions(): Question[] {
  return VILLAGE_AGENDA_FORM.questions.map((question) => ({
    id: crypto.randomUUID(),
    number: question.number,
    label: question.label,
    type: question.type,
    min_select: question.min_select,
    max_select: question.max_select,
    on_overflow: question.on_overflow,
    options: [],
  }));
}

export function nextOptionDef(question: Question): FormOptionDef | null {
  const spec = VILLAGE_AGENDA_FORM.questions.find(
    (item) => item.number === question.number || item.label === question.label,
  );
  if (!spec) {
    return null;
  }
  return spec.options[question.options.length] ?? null;
}

export function optionTitle(question: Question, label: string) {
  const spec = VILLAGE_AGENDA_FORM.questions.find(
    (item) => item.number === question.number || item.label === question.label,
  );
  const fromSpec = spec?.options.find((option) => option.label === label)?.title;
  if (fromSpec) {
    return fromSpec;
  }
  const fromRoi = question.options.find((option) => option.label === label)?.title;
  return fromRoi || label;
}
