# 양식 마법사 — 병렬 작업 분할

## 이렇게 나눠 맡겨라

채팅을 **네 개** 연다. 각 창에는 아래 **그 에이전트 블록 하나만** 붙여넣는다. 이 파일 전체나 A–D를 한 번에 넣지 마라. 그러면 넷이 같은 기능을 처음부터 끝까지 만든다.

나중에 껍데기(단계·패널·버튼)는 사용자가 준 21st.dev 프롬프트·링크로 입힌다. 지금은 동작만. 설문 이미지와 원/상자 드래그는 Konva(`WizardCanvas`)에만 둔다.

로컬 태그 `savepoint-pre-form-wizard`로만 롤백한다. 푸시하지 마라.

---

## 에이전트 A — 붙여넣기 전부

```
너는 에이전트 A만 한다. B/C/D/E 구현 금지. 다른 에이전트가 프론트와 클라이언트를 만든다.

먼저 읽어라: docs/form-wizard/architecture.md, docs/form-wizard/TASKS.md (A 섹션만), .cursor/skills/omr-form-wizard/SKILL.md
GitHub 푸시 금지. 루트 CLAUDE.md / AGENTS.md 수정 금지. 신사2동 defaultTemplate 좌표 금지.
스캔 채점(score)에서 원을 다시 찾지 마라.

할 일: api/omr.py에만 action=detect_circles 추가.
- 입력: image_base64, region(상대 x,y,w,h)
- 출력: circles[{x,y,w,h,score}], rejected_count
- 빈 양식 ROI에서 링(구멍 있는 원)만. 원형도·반지름·y정렬·격자 스냅. Hough는 보조.
- 기존 action 없는 요청은 지금처럼 score. score 응답 필드 바꾸지 마라.
- OpenCV를 쓰는 Vercel 함수는 기존 하나. 새 함수/새 패키지 배포 없음.

수정 가능: api/omr.py 만
수정 금지: components/, lib/, app/, 그 외 전부
```

---

## 에이전트 B — 붙여넣기 전부

```
너는 에이전트 B만 한다. A/C/D/E 구현 금지. detect API 본문은 A가 api/omr.py에 넣는다.

먼저 읽어라: docs/form-wizard/architecture.md, docs/form-wizard/TASKS.md (B 섹션만), .cursor/skills/omr-form-wizard/SKILL.md
GitHub 푸시 금지. 루트 CLAUDE.md / AGENTS.md 수정 금지.

할 일: lib/form-wizard/ 안에 detect 호출 헬퍼만 만들어라.
- POST /api/omr  body: { action: "detect_circles", image_base64, region }
- 응답 타입: circles[{x,y,w,h,score}], rejected_count
- lib/omrClient.ts의 score 함수는 수정하지 마라. 새 파일에서 호출해라.
- lib/types.ts의 TemplatePayload는 수정하지 마라. 마법사 전용 타입은 lib/form-wizard/ 안에 둬라.

수정 가능: lib/form-wizard/ 만
수정 금지: api/omr.py, lib/omrClient.ts, lib/types.ts, components/, app/
```

---

## 에이전트 C — 붙여넣기 전부

```
너는 에이전트 C만 한다. A/B/D/E 구현 금지. 4단계 마법사 껍데기와 라우트는 D가 만든다.

먼저 읽어라: docs/form-wizard/architecture.md, docs/form-wizard/TASKS.md (C 섹션만), .cursor/skills/omr-form-wizard/SKILL.md
GitHub 푸시 금지. 루트 CLAUDE.md / AGENTS.md 수정 금지.

할 일: Konva 캔버스만. components/form-wizard/WizardCanvas.tsx (필요하면 같은 폴더의 canvas 전용 파일).
- 빈 양식 이미지 표시
- 문항 상자 드래그로 그리기/크기 조절
- 원 이동/추가/삭제, D가 넣을 수 있게 props로 상태 입출력
- 선·핸들만. 예쁜 마법사 UI, 21st.dev, tldraw, Fabric 금지. Stage를 다른 캔버스 라이브러리로 바꾸지 마라.

수정 가능: components/form-wizard/WizardCanvas.tsx 및 canvas-* 파일만
수정 금지: FormWizard.tsx, Step*.tsx, app/, api/, lib/form-wizard 헬퍼, lib/omrClient.ts
WizardCanvas를 export만 하고 페이지에 연결하지 마라. 연결은 D 몫이다.
```

---

## 에이전트 D — 붙여넣기 전부

```
너는 에이전트 D만 한다. A/B/C/E 구현 금지. 원 검출 API·Konva 기하·저장 API는 다른 에이전트 몫이다.

먼저 읽어라: docs/form-wizard/architecture.md, docs/form-wizard/TASKS.md (D 섹션만), .cursor/skills/omr-form-wizard/SKILL.md
GitHub 푸시 금지. 루트 CLAUDE.md / AGENTS.md 수정 금지.

할 일: 4단계 흐름만 조립.
1 빈 양식 업로드  2 모서리 4점  3 문항마다 상자+제목+최소/최대  4 검토·임계값
- components/form-wizard/FormWizard.tsx 와 Step 컴포넌트
- app/(app)/templates/new/page.tsx 에서 FormWizard 렌더
- C가 만든 WizardCanvas를 import만 해라. WizardCanvas.tsx 내용을 고치지 마라.
- detect 호출은 B가 만든 lib/form-wizard 헬퍼를 import만 해라. 헬퍼를 다시 만들지 마라. B가 아직 없으면 시그니처만 맞춰 호출하고, 없으면 빈 원 배열로 진행되게 해라.
- 저장은 버튼·콜백만. Supabase upsert는 E가 한다.
- 껍데기는 기존 앱 버튼/타이포. 21st.dev 리디자인 금지. 나중에 프롬프트로 갈아끼울 자리에 주석: FORM_WIZARD_CHROME

수정 가능: FormWizard.tsx, Step*.tsx, app/(app)/templates/new/page.tsx
수정 금지: WizardCanvas.tsx, api/omr.py, lib/omrClient.ts, ScanPanel, 예외/현황
```

---

## 에이전트 E — A–D 끝난 뒤, 붙여넣기 전부

```
너는 에이전트 E만 한다. A–D를 다시 구현하지 마라.

먼저 읽어라: docs/form-wizard/architecture.md, docs/form-wizard/TASKS.md (E 섹션만), .cursor/skills/omr-form-wizard/SKILL.md
GitHub 푸시 금지.

할 일: 마법사 결과를 Supabase templates에 저장하고, 스캔 화면에서 양식 이름을 고르게 해라.
수정 가능: TemplatesPanel.tsx, ScanPanel.tsx, ensureDefaultTemplate.ts, 필요 시 lib/types.ts에 선택 필드만
수정 금지: api/omr.py의 score, 예외 탭, 현황 초기화, defaultTemplate 좌표, WizardCanvas 기하
```
