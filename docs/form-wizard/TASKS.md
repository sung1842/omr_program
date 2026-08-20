# 양식 마법사 — 병렬 작업 분할

다른 에이전트는 이 파일을 연 뒤 `architecture.md`와 `.cursor/skills/omr-form-wizard/SKILL.md`를 읽고 시작한다. **자기 열 파일만** 수정한다. GitHub에 푸시하지 않는다.

나중에 마법사 껍데기(단계·패널·버튼)는 사용자가 준 21st.dev 등 프롬프트·링크로 디자인한다. 지금은 기존 Tailwind/버튼으로 동작만 만든다. 설문 이미지와 원/상자 드래그는 항상 Konva(`WizardCanvas`)에 둔다.

## 세이브 포인트

로컬 태그 `savepoint-pre-form-wizard` = 마법사 착수 직전 `main` (배포본과 같은 커밋). 푸시하지 않음.

롤백: `git switch main` 후 `git reset --hard savepoint-pre-form-wizard` (로컬만. 사용자 요청 없이 실행 금지).

## 동시에 가능 (파일 겹침 없음)

| 에이전트 | 하는 일 | 수정 가능 | 금지 |
| --- | --- | --- | --- |
| A 검출 API | `action: detect_circles` | `api/omr.py`만 | score 동작 변경, 프론트, 푸시 |
| B 검출 클라이언트 | 브라우저에서 detect 호출 | `lib/form-wizard/**`만 | `api/omr.py`, `lib/types.ts`, 푸시 |
| C Konva 캔버스 | 이미지 위 상자·원 드래그 | `components/form-wizard/WizardCanvas.tsx` 및 같은 폴더 캔버스 전용 파일 | `templates/new/page.tsx`, `api/omr.py`, 껍데기 리디자인, 푸시 |
| D 마법사 흐름 | 4단계 조립, 임시 껍데기 | `components/form-wizard/FormWizard.tsx`, Step 컴포넌트, `app/(app)/templates/new/page.tsx` | `api/omr.py`, `WizardCanvas` 기하 로직, 21st 껍데기(프롬프트 오기 전), 푸시 |

A와 B는 요청/응답 JSON만 맞추면 된다. C는 `WizardCanvas`를 export하고, D는 import만 한다. D는 C의 파일을 직접 고치지 않는다.

## 이후 한 명 (A–D 합친 뒤)

| 에이전트 | 하는 일 | 수정 가능 |
| --- | --- | --- |
| E 저장·스캔 연결 | `templates` upsert, 스캔 화면에서 양식 고르기 | `components/workspace/TemplatesPanel.tsx`, `components/workspace/ScanPanel.tsx`, `lib/ensureDefaultTemplate.ts` (필요 시). `lib/types.ts`는 이때만 `question_region` 같은 선택 필드 추가 |

E는 채점 엔진(`score`)과 예외 탭·현황·초기화를 건드리지 않는다.

## 에이전트 프롬프트 (복사)

공통 전문:

```
GitHub에 푸시하지 마라. CLAUDE.md/AGENTS.md 루트는 수정하지 마라.
먼저 읽어라: docs/form-wizard/architecture.md, docs/form-wizard/TASKS.md, .cursor/skills/omr-form-wizard/SKILL.md
자기 담당 파일만 수정해라. 신사2동 defaultTemplate 좌표는 건드리지 마라.
스캔 채점 시 원을 다시 찾지 마라. 산출물은 기존 TemplatePayload 계약과 맞아야 한다.
```

**A:** 공통 + `api/omr.py`에만 `action=detect_circles` 추가. 기존 score 경로·응답은 그대로. ROI 상대좌표 → 링 원 후보(상대 x,y,w,h,score). Hobby 한 함수, OpenCV 추가 배포 없음.

**B:** 공통 + `lib/form-wizard/`에 detect fetch 헬퍼. `lib/omrClient.ts`의 score는 수정하지 말고 새 파일에서 `/api/omr`를 호출. A의 JSON 키를 그대로 따른다.

**C:** 공통 + Konva `WizardCanvas`: 빈 양식 이미지, 문항 상자 그리기, 원 이동/추가/삭제. 시각은 최소(선·핸들). 21st/외부 캔버스 UI로 Stage를 바꾸지 마라.

**D:** 공통 + 4단계 FormWizard가 C의 캔버스를 끼운다. 1 빈 양식 업로드 2 모서리 4점 3 문항마다 상자+제목+최소/최대 4 검토·임계값·저장 UI(저장 API는 스텁이어도 됨, E가 연결). 껍데기는 기존 앱 버튼/타이포. 사용자가 나중에 줄 프롬프트로 리디자인할 자리만 주석으로 표시.

**E:** 공통 + TASKS.md의 E 열만. A–D가 만든 마법사 저장을 Supabase `templates`에 넣고 스캔에서 양식을 고르게 한다.
