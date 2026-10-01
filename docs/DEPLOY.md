> **과제6 당시의 참고 문서입니다. 현재 과제7 설치·검사·제출에는 T07-SETUP.md와 T07-EXPLANATION.md를 사용하세요. 아래 공개 접근/미구현 설명은 과제6 기준입니다.**

# Vercel + Supabase 배포 순서

## 1. 압축 해제와 GitHub

압축 안 `pds-diary` 폴더가 프로젝트 루트입니다. GitHub 저장소 첫 화면에 `package.json`, `vercel.json`, `public`, `api`가 바로 보이게 올리세요. `index.html`만 올리는 방식이 아닙니다.

GitHub에서 새 **Public** 저장소(예: `pds-diary`)를 만든 뒤 Add file → Upload files로 프로젝트 내용을 올리고 Commit changes합니다. 브라우저 업로드에서 `.gitignore`, `.env.example` 같은 숨김 파일은 빠질 수 있으니 확인하세요. `.env.example`은 자리표시자만 있으며 실제 키를 넣지 않습니다. 로컬 `.env.local`은 업로드 금지입니다.

## 2. Supabase 설치

1. 새 프로젝트를 만듭니다. 기존 과제와 분리한 전용 프로젝트를 권장합니다.
2. SQL Editor → New query를 엽니다.
3. `supabase/001_schema.sql` **전체**를 복사해 실행합니다. 한 번만 실행합니다. 기존 테이블을 지우거나 덮어쓰는 SQL이 아닙니다.
4. 새 query에서 `supabase/002_study_plan.sql` 전체를 실행합니다. 이 파일은 여러 번 실행해도 고정 ID의 계획/할 일이 중복되지 않습니다.
5. Table Editor에서 `pds_plans` 1행, `pds_tasks` 7행, `pds_sessions` 0행을 확인합니다. 최초 계획 이력도 1행이어야 합니다.
6. 프로젝트의 URL과 서버용 Secret API key를 준비합니다. 화면을 공유할 경우 키는 가리세요. 실제 키를 채팅으로 보내지 마세요.

## 3. Vercel 연결

1. Add New → Project에서 해당 GitHub 저장소를 Import합니다.
2. Root Directory는 `package.json`이 있는 위치입니다. 위처럼 올렸다면 기본 루트입니다.
3. Framework Preset은 **Other**. Build Command `npm run build`, Output Directory `dist`로 설정합니다. `vercel.json`에도 동일하게 지정되어 있습니다.
4. Node.js 22 이상을 선택합니다. 외부 npm 의존성은 없습니다.
5. Environment Variables에 아래 2개를 추가합니다. Production에 반드시 적용하고 Preview도 테스트하려면 Preview에도 적용합니다.

| 이름 | 값 |
|---|---|
| `SUPABASE_URL` | 본인의 `https://....supabase.co` 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | 본인의 서버용 secret key |

구형 service_role 키를 쓰면 두 번째 이름을 `SUPABASE_SERVICE_ROLE_KEY`로 사용합니다. public/anon/publishable 키를 서버용 키 대신 넣지 마세요. `NEXT_PUBLIC_` 같은 공개 접두사를 붙이지 않습니다.

6. Deploy합니다. 이미 배포 후 환경변수를 추가/변경했다면 Redeploy합니다.
7. Deployment Protection 등 접근 제한이 켜져 있으면 공개 과제 URL에서 로그인 요구가 없도록 설정합니다. 설정 명칭은 Vercel 화면 버전에 따라 달라질 수 있습니다.

## 4. 공개 URL에서 직접 확인

1. 시크릿 창에서 배포 주소를 열어 공개 안내와 공부 계획 1개·할 일 7개가 보이는지 확인합니다.
2. 임시 테스트용 할 일을 하나 추가하고 수정·완료·완료 취소·삭제를 확인합니다. 제출용 실제 기록과 테스트를 혼동하지 않도록 제목에 `[테스트]`를 붙이고 끝나면 삭제합니다.
3. 실제 공부 후 실행 기록을 최소 3개 작성합니다. 시작/종료/실제 공부 분/막힌 이유를 입력합니다.
4. 돌아보기 숫자를 눌러 근거 기록을 확인합니다. 개선점을 작성하고 다음 계획으로 연결합니다.
5. 전체 내보내기 JSON을 저장하고 새로고침 후 ID·날짜·분 단위 값이 같은지 확인합니다.
6. `docs/CHECKLIST.md`의 공개·비밀키 점검까지 수행합니다.

## 문제 해결

| 화면/증상 | 확인할 곳 |
|---|---|
| 서버 DB 설정이 필요합니다 | Vercel 환경변수 이름·Production 적용·재배포 |
| DB 요청 실패 | URL/Secret key, SQL 실행 성공 여부 |
| `/api/diary` 404 | `api/diary.js`가 저장소 루트 기준 경로에 있는지, Vercel 배포인지 |
| 데이터 없음 | `002_study_plan.sql` 실행 여부 |
| 다른 변경이 있습니다 | 새로고침 후 최신 내용을 보고 다시 수정 |
| 저장 실패 | 필수값, 날짜 순서, 실제 시간이 시작~종료보다 길지 않은지 |
| HTML 더블클릭 시 실패 | `npm run dev` 또는 Vercel 주소로 접속 |

## 5. T06 기준 커밋 제출

최종 수정까지 GitHub에 올리고 Vercel 배포가 그 커밋인지 확인합니다. GitHub 최신 커밋의 **전체 40자리 SHA**를 사용해 아래 형태를 만듭니다.

`https://github.com/본인계정/저장소/tree/전체40자리커밋SHA`

SHA는 예시 문구를 그대로 쓰지 말고 실제 최종 커밋에서 복사합니다. 별도 해시 파일이나 SHA256 계산은 필요하지 않습니다. 결과물 URL과 이 소스 URL을 `docs/SUBMISSION.md`의 문구에 넣습니다. T07 작업 전 이 주소를 별도로 보관하세요.
