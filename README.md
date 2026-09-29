# 플랜두씨 다이어리 — T06

정보처리기사 실기 공부용 Plan → Do → See 웹앱입니다. HTML/CSS/브라우저 JavaScript, Vercel Node.js Functions, Supabase PostgreSQL을 사용합니다. React/Next.js 없이 동작하며 런타임 외부 npm 의존성이 없습니다.

**T06은 의도적으로 공개 읽기·쓰기 앱입니다.** 누구나 화면과 API에서 자료를 읽고 변경할 수 있습니다. 민감한 기록을 넣지 마세요. T07에서 로그인뿐 아니라 서버의 소유권 검사까지 바꾸기 전에는 개인용 비공개 앱이 아닙니다.

## 처음 설치하기

상세한 클릭 순서는 `docs/DEPLOY.md`에 있습니다.

1. 과제6 전용 Supabase 프로젝트를 만듭니다. SQL Editor에서 `supabase/001_schema.sql`을 한 번 실행합니다.
2. 이어서 `supabase/002_study_plan.sql`을 실행합니다. 승인된 공부 계획 1개와 할 일 7개만 넣으며 실행 기록은 넣지 않습니다.
3. 이 폴더 **안의 파일과 폴더 전체**를 공개 GitHub 저장소 루트에 올립니다. `api`, `lib`, `public`, `supabase`, `contracts` 등을 모두 포함합니다. `.env.local`은 절대 올리지 않습니다.
4. Vercel에서 해당 GitHub 저장소를 Import합니다. Framework Preset: Other, Build Command: `npm run build`, Output Directory: `dist`, Node.js 22 이상.
5. Vercel 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`를 설정하고 Deploy합니다. 키는 서버용 Secret key입니다. 구형 service_role 키라면 변수 이름 `SUPABASE_SERVICE_ROLE_KEY`를 사용해도 됩니다. 둘 중 하나만 설정하세요.
6. 첫 화면과 기록을 확인합니다. 배포 접근 제한이 있다면 해제하여 결과물 주소를 시크릿 창에서 확인합니다.

HTML을 더블클릭하거나 GitHub Pages / Live Server로 열면 DB API가 실행되지 않습니다. Vercel 배포 또는 아래 개발 서버가 필요합니다.

## 로컬 실행

Node.js 22 이상에서 프로젝트 루트 터미널:

```sh
cp .env.example .env.local
# .env.local의 두 값을 본인의 실제 프로젝트 값으로 수정
npm run dev
```

Windows PowerShell에서는 첫 명령 대신 `Copy-Item .env.example .env.local`을 사용합니다. 주소는 `http://localhost:3000`입니다. 저장은 연결한 실제 Supabase에 반영됩니다.

```sh
npm test
npm run build
```

## 자료 규칙

- 단위: 정수 분. 입력 시 서울 시간, DB 실행 시각은 timestamptz, JSON은 UTC 오프셋 포함.
- 기간 필터: 선택 계획에 딸린 **할 일의 마감일**이 양끝 날짜를 포함한 기간에 속하는지로 결정.
- ‘계획한 할 일’ = 대상 기간에 속한 삭제되지 않은 할 일 수.
- ‘완료’ = 그중 현재 done 상태인 수. 완료 이벤트 수를 합산하지 않음.
- ‘지연’ = 그중 서울 오늘보다 마감일이 앞선 미완료 수.
- ‘막힘’ = 공백이 아닌 막힘 이유가 하나 이상 있는 대상 할 일 수. 같은 할 일의 여러 기록은 한 번만 셈.
- 예상 시간 = 대상 할 일의 예상 시간 합, 실제 시간 = 대상 할 일에 연결된 모든 실행 기록의 실제 시간 합.
- 차이 = 실제 − 예상. 비어 있으면 모두 0.
- 할 일 완료는 실행 기록과 별개입니다. 공부 기록을 저장한 뒤 필요하면 할 일을 완료하세요.
- 완료 취소 시 현재 완료 수는 감소하고 이력은 보존됩니다. 새 완료 주기만 다시 완료할 수 있습니다.
- 삭제는 soft delete이며 화면/집계에서 제외하되 전체 내보내기에는 이력과 연결 기록이 남습니다.
- 계획 수정 시 최초 버전을 포함해 스냅샷을 계속 보존합니다. 타인의 동시 수정은 revision 충돌로 거절합니다.
- 돌아보기 저장은 당시 집계·근거 ID·개선점을 저장하고 새 계획과 원자적으로 연결합니다. 기존 돌아보기는 당시 값, 대시보드는 현재 값입니다.
- 전체 JSON 내보내기에는 계획 이력·삭제 자료·완료 이력·돌아보기까지 포함됩니다. 요청 재시도 캐시는 내부 운영 자료이므로 제외합니다.

정확한 테이블, 관계, 날짜 규칙: `contracts/pds-schema-v2.json`.

## 구성

| 경로 | 역할 |
|---|---|
| `public/` | 브라우저 화면·스타일·집계 코드 |
| `api/diary.js` | Vercel의 공개 GET/POST 서버 API |
| `lib/db.js` | 서버에서만 Supabase RPC 호출 |
| `supabase/001_schema.sql` | 테이블·제약·트리거·RPC·권한 |
| `supabase/002_study_plan.sql` | 실제 사용 예정인 공부 계획·할 일 |
| `contracts/pds-schema-v2.json` | DB와 날짜/집계 규칙 계약 |
| `docs/CHECKLIST.md` | T06 항목별 확인 방법 |
| `docs/T07-HANDOVER.md` | 인증 전환과 5일 기록 준비 |
| `docs/SUBMISSION.md` | 실제 검증 후 채울 제출문 |
| `docs/VALIDATION.md` | 개발 환경 검증 결과와 미검증 범위 |

## 보안 경계

Supabase 테이블은 RLS를 켜고 anon/authenticated 직접 권한과 RPC 실행 권한을 막았습니다. Vercel 서버는 secret/service-role 권한으로 고정 RPC만 실행합니다. 이는 비밀키 보호/직접 DB 접근 제한이며 **T06 앱 자체의 사용자 인증이나 개인 자료 보호를 의미하지 않습니다.** API는 공개입니다. 같은 출처 검사도 인증의 대체가 아닙니다.

브라우저에는 키를 보내지 않으며 오류 원문·DB 응답 상세·환경변수를 로그에 출력하지 않습니다. 입력 문자열은 HTML escape 처리하고 CSP는 인라인 스크립트를 막습니다. 운영 키를 GitHub에 올린 적이 있다면 삭제만으로 해결되지 않으므로 폐기·교체하고 과거 Git 기록도 확인하세요.

T07에서는 현재 공개 API와 관리키 경로를 그대로 두면 안 됩니다. `docs/T07-HANDOVER.md`를 먼저 읽으세요.

참조: https://vercel.com/docs/functions/runtimes/node-js · https://supabase.com/docs/guides/getting-started/api-keys · https://supabase.com/docs/guides/database/postgres/row-level-security

선택: 로컬 PostgreSQL 호환 엔진으로 DB 제약/RPC를 다시 검사하려면 `npm install --no-save --package-lock=false @electric-sql/pglite` 후 `node tests/database-check.mjs`를 실행합니다. 이 검사는 임시 메모리 DB만 사용하며 실제 Supabase를 수정하지 않습니다. 테스트 패키지는 배포 앱의 의존성으로 필요하지 않습니다.
