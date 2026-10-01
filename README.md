# 플랜두씨 다이어리 2 — T07

제출한 T06 커밋 `efa3fdd90ef05f0e083b2fda8abab54c83ed0ac0`에서 이어 만든 버전입니다. 기존 다이어리의 계획·할 일·실행 기록·돌아보기를 유지하고 인증, 서버의 소유권 검사, 실제 5일 관찰, 계정 관리 기능을 추가합니다.

## 먼저 알아둘 것

- 이 ZIP을 **기존 `stujh00/my-pds-diary` 저장소에 변경 사항으로 적용**하세요. 새 저장소에 ZIP만 올리면 T06 커밋이 조상에 남아야 하는 조건을 만족하지 못합니다.
- 실제 공부 자료는 공개 GitHub에 넣지 않습니다. 백업 JSON과 생성한 복원 SQL도 올리지 않습니다.
- 실제 5일 원기록과 배포 요청·응답 증거는 사용자가 배포된 앱에서 남겨야 합니다. 자동 테스트 결과가 실제 사용 기록을 대신하지 않습니다.

## 기존 Supabase DB를 이어 쓰는 설치 순서

1. T06 ‘전체 자료 내보내기’로 백업합니다. 이미 이 프로젝트의 `001_schema.sql`과 `002_study_plan.sql`을 실행했다면 **다시 실행하지 않습니다.**
2. 기존 Supabase 프로젝트의 SQL Editor에서 **`supabase/003_t07_auth.sql`만** 실행합니다. 기존 표와 값은 유지됩니다. 이전 공개 RPC는 제거되므로 T06의 옛 배포/Preview에서도 그 RPC로 자료를 읽을 수 없습니다. 새 코드 배포 전까지 기존 앱은 DB 오류를 표시할 수 있습니다.
3. 기존 GitHub 저장소에 새 파일과 변경 파일을 반영하고 Vercel에 재배포합니다. Node.js 22 이상, `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`(또는 구형 `SUPABASE_SERVICE_ROLE_KEY`)를 사용합니다. SDK는 서버에서만 실행하며 브라우저용 Auth 키를 추가할 필요가 없습니다. `LOCAL_HTTP=1`을 Vercel에 설정하지 마세요.
4. 결과물 첫 화면에서 본인의 이메일로 가입합니다. 이메일 인증이 켜져 있다면 메일 인증 후 로그인합니다. 실습용 두 계정을 메일 없이 만들려면 Supabase Authentication의 이메일 인증 설정을 꺼야 합니다. 그 경우 이메일 소유 확인이 없다는 한계를 설명서에 적습니다.
5. Supabase **Authentication → Users**에서 **본인 계정의 UUID**를 확인합니다. `supabase/004_assign_owner.template.sql`의 `REPLACE_WITH_VERIFIED_OWNER_UUID`만 그 UUID로 바꾸고 SQL Editor에서 실행합니다. 이 단계 전에는 새 계정에 자료가 없어도 정상입니다. ‘첫 가입자에게 자동으로 기존 자료를 주는’ 동작은 없습니다.
6. 앱에서 새로고침합니다. 기존 계획·할 일·실행 기록이 본인 계정에 표시되는지 확인합니다. 사용자 제공 백업 기준은 계획 3개, 할 일 15개(삭제 이력 포함), 실행 기록 6건입니다. 실제 공부 계획에는 삭제되지 않은 할 일 7개와 실행 기록 3건/90분이 있습니다. 마감일은 바꾸지 않습니다.
7. 본인 자료가 확인되면 ‘5일 관찰’에서 질문과 처음 규칙을 정하고 그날부터 실제 기록을 시작합니다. 관찰 시작 전에 공부한 기록은 관찰 원기록으로 선택할 수 없습니다.

전체 설치·검사·증빙 절차는 [docs/T07-SETUP.md](docs/T07-SETUP.md), 구현 설명 초안은 [docs/T07-EXPLANATION.md](docs/T07-EXPLANATION.md)을 참고하세요.

## 다른 T07 DB에 복원하는 경우

T06와 다른 프로젝트를 쓸 때만 새 DB에 `001_schema.sql` → `003_t07_auth.sql`을 실행합니다. **002 예시 계획은 실행하지 않습니다.** 본인 계정 생성 뒤 아래 명령으로 비공개 복원 SQL을 생성해 새 DB에서 실행합니다.

```sh
node scripts/restore-t06.mjs /path/to/pds-all-2026-10-01.json VERIFIED_OWNER_UUID
```

생성 파일 `local-data/restore-private.sql`은 원기록을 포함하므로 GitHub에 올리지 않습니다. 이전 T06 DB에서도 공개 RPC를 폐쇄해야 기존 공개 API로 내 자료가 계속 노출되는 것을 막을 수 있습니다.

## 로컬 실행 및 검사

```sh
npm ci
# .env.example을 .env.local로 복사하고 서버 전용 값을 로컬에서 입력합니다.
# 로컬 HTTP에서만 .env.local에 LOCAL_HTTP=1을 추가합니다.
npm run dev
npm test
npm run build
node --env-file-if-exists=.env.local scripts/check-secrets.mjs
```

- Auth: Supabase Auth, bcrypt(관리형 서비스), 서버 SDK `@supabase/supabase-js` **2.117.2**.
- 앱 세션: Node.js `crypto.randomBytes`의 256비트 난수, SHA-256으로 저장, 서버에서 즉시 폐기 가능, 1시간 만료. 비밀번호 해시는 SDK/인증 서비스에 맡기며 앱의 SHA-256은 난수 세션 식별자 저장에만 씁니다.
- 직접 DB 접근: 브라우저 역할은 모든 다이어리 표와 RPC에 권한이 없습니다. 서버 전용 RPC가 매 요청마다 살아 있는 세션과 주인을 확인합니다. 서버 Secret/Service role은 RLS를 우회하므로 소유권 검사를 생략하면 안 됩니다.
- 로컬 SQL 검증: PGlite(PostgreSQL)로 실제 마이그레이션, 양방향 접근 제한, 세션 폐기, 계정 삭제, 관찰 규칙을 검사합니다. Supabase Auth 실제 가입/로그인 및 Vercel 배포 검사는 별도로 필요합니다.
