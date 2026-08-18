# 종이 설문지 OMR 집계

스캔한 설문지 이미지를 1장씩 인식해 Supabase에 적재하고, 문항별 현황과 엑셀 내려받기를 제공하는 웹 서비스입니다. 프론트는 Next.js(Vercel), 인식 API는 Python Serverless(`opencv-python-headless` + `numpy`만 사용)입니다.

## 로컬 실행

1. Supabase 프로젝트에서 Authentication > Providers > Email을 켜고, 필요하면 Confirm email을 끕니다(내부 툴 초기 설정용).
2. SQL Editor에서 `supabase/migrations/20260818120000_init_omr.sql`을 실행합니다.
3. `.env.example`을 복사해 `.env.local`을 만들고 URL/anon key를 넣습니다. **service role 키는 넣지 않습니다.**
4. Python 의존성을 설치합니다.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

5. 터미널 두 개를 켭니다.

```bash
npm run dev:omr
npm run dev
```

`next dev`는 `/api/omr`를 `http://127.0.0.1:8000/api/omr`로 프록시합니다. Python 서버 없이 대량 처리를 돌리면 네트워크 오류로 실패합니다.

6. http://localhost:3000 에서 관리자 로그인합니다. 아이디 `test1234`, 비밀번호는 DB에 넣어 둔 고정 계정입니다. 이후 **대량 처리 → 예외 확인(필요 시) → 현황/엑셀** 순으로 사용합니다.
7. 예외 이미지·수작업을 쓰려면 SQL Editor에서 `supabase/migrations/20260819003000_exception_review.sql`도 실행합니다. (이미지 저장 버킷 `scan-sheets`, `scan_results` 업데이트 권한)

## Vercel 배포

- Root Directory는 이 저장소입니다. `api/omr.py`가 Python Serverless Function으로 붙습니다.
- Environment Variables에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`만 등록합니다.
- Hobby 제한을 코드가 전제로 합니다: 요청 4.5MB, 함수 10초, 의존성 2개.

용량이 50MB를 넘기면 `opencv-python-headless` 버전을 낮춰 보세요. GUI용 `opencv-python`은 사용하지 않습니다.

## 처리 규칙

| 상황 | 동작 |
| --- | --- |
| 504 / 타임아웃 / 일시적 네트워크 | 프론트에서 1s → 2s → 4s 백오프, 최대 3회 |
| 413 용량 초과 | 즉시 실패. 업로드 전 JPEG 압축으로 4.5MB를 넘기지 않음 |
| 400 기준점 실패·이미지 손상 | 백엔드 메시지를 그대로 failed 큐에 표시 |
| 실패 목록 | 처리가 끝난 뒤 DLQ로 모으고, 실패한 파일만 다시 시도 |

이미지는 1,000장이어도 서버로 일괄 전송하지 않습니다. 브라우저 큐가 `pending / success / failed`를 나누고 한 장씩 POST합니다.
