export const WORKSPACE_CHAPTERS = [
  {
    id: "01",
    href: "/",
    slug: "status",
    title: "현황",
    subtitle: "집계가 한눈에",
    videoUrl: "https://ik.imagekit.io/kqmrslzuq/Videos/1.mp4",
    description: "응답 분포와 성공·실패를 바로 확인하고 엑셀로 내려받습니다.",
    hints: ["문항별 분포를 바로 확인", "실패·예외 건만 골라 보기", "집계 결과를 엑셀로 저장"],
  },
  {
    id: "02",
    href: "/scan",
    slug: "scan",
    title: "대량 처리",
    subtitle: "한 장씩, 안정적으로",
    videoUrl: "https://ik.imagekit.io/kqmrslzuq/Videos/3.mp4?updatedAt=1766415070663",
    description: "채워진 설문 PDF를 올리면 기표 원 15개를 자동으로 읽고 집계합니다.",
    hints: ["좌표를 손으로 찍지 않아도 됨", "같은 양식 PDF를 그대로 업로드", "기울기는 표 모서리로 보정"],
  },
  {
    id: "03",
    href: "/exceptions",
    slug: "exceptions",
    title: "예외 확인",
    subtitle: "눈으로 확인하고 반영",
    videoUrl: "https://ik.imagekit.io/kqmrslzuq/Videos/2.mp4?updatedAt=1766414784088",
    description: "한도 초과 등 예외 장의 이미지를 보고, 체크박스로 실제 기표를 DB에 넣습니다.",
    hints: ["대기 목록에서 장을 선택", "이미지와 문항을 대조해 체크", "완료분은 로그에서 다시 확인"],
  },
] as const;

export type WorkspaceChapter = (typeof WORKSPACE_CHAPTERS)[number];

export function chapterIndexFromPath(pathname: string) {
  if (pathname.startsWith("/exceptions") || pathname.startsWith("/templates")) {
    return 2;
  }
  if (pathname.startsWith("/scan")) {
    return 1;
  }
  return 0;
}

export function isEditorPath(pathname: string) {
  return pathname === "/templates/new" || pathname.startsWith("/templates/new/");
}

import { DEFAULT_TEMPLATE_NAME } from "@/lib/defaultTemplate";

export function pickDefaultTemplateId<T extends { id: string; name: string; created_at?: string }>(rows: T[]) {
  const seeds = rows.filter((row) => row.name === DEFAULT_TEMPLATE_NAME);
  if (seeds.length > 0) {
    return [...seeds].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))[0].id;
  }
  return rows[0]?.id ?? "";
}
