# T06 확인표

이 표는 확인 방법입니다. 실제 Vercel/Supabase 확인 결과는 수행한 후 기록합니다. 개인정보/비밀키를 캡처에 포함하지 마세요.

| 기준 | 확인 방법 | 배포 후 결과 |
|---|---|---|
| C04~C07 | 계획 기간·우선순위·성공 기준·예상 분을 저장하고 재조회 | 미확인 |
| C08 | 계획 수정 후 버전1을 열어 수정 전 내용 유지 확인 | 미확인 |
| C09~C17 | 테스트 할 일 생성·수정·완료·취소·삭제, 날짜/태그/분 저장 | 미확인 |
| C18~C20 | 제목/태그 검색, 상태/태그 필터, 정렬 동률까지 확인 | 미확인 |
| C21~C22 | 아래 중복 요청 검사 후 완료 이력 1개, 현재 완료 수 +1 확인 | 미확인 |
| C23~C27 | 실제 공부 기록 추가 후 시작/끝/실제 분/막힘과 계획 불변 확인 | 미확인 |
| C28~C32 | 직접 계산한 대상 할 일 수·완료·지연·막힘·시간과 비교 | 미확인 |
| C83 | 각 숫자를 눌러 해당 할 일·실행 기록 추적 | 미확인 |
| C33 | 개선점 저장 후 새 계획에 동일 문구와 원본 연결 확인 | 미확인 |
| C34~C35 | Supabase 표 저장 확인, 새로고침 전후 export의 ID/날짜/값/단위 비교 | 미확인 |
| C78~C81 | 본인 계획1·할일5·실행3 이상, 집계 모두 0 아님 | 미확인 |
| C36 | 전체 JSON에 모든 사용자 자료·이력 포함 확인 | 미확인 |
| C82 | 첫 화면에서 과제 지정 공개 안내 원문 확인 | 미확인 |
| C57 | 스크립트 문자열이 문자로 보이고 실행되지 않는지 확인 | 미확인 |
| C58 | 아래 비밀값 검사 | 미확인 |
| C59~C60 | SUBMISSION.md의 4줄+3줄을 본인의 결과로 완성 | 미확인 |
| C01 | 결과물/전체 커밋 소스 URL을 새 시크릿 창에서 로그인 없이 열기 | 미확인 |

## 중복 완료 검사

임시 `[테스트] 중복 완료` 할 일을 새로 만듭니다. 완료 전 내보내기를 저장합니다. 개발자 도구 Console에서 아래를 실행합니다. 운영 비밀키는 필요 없습니다. 자기 앱 주소에서만 실행합니다.

```js
const before = await fetch('/api/diary').then(r => r.json());
const t = before.tasks.find(t => t.title === '[테스트] 중복 완료' && !t.deleted_at && t.status === 'open');
if (!t) throw new Error('테스트 할 일을 먼저 만드세요.');
const body = {action:'task.complete', request_id:crypto.randomUUID(), data:{id:t.id, completion_cycle:t.completion_cycle}};
const send = b => fetch('/api/diary', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b)}).then(async r=>({status:r.status,body:await r.json()}));
console.log(await Promise.all([send(body),send(body)]));
// 다른 요청 키로 같은 완료를 다시 보내도 한 주기에 완료 기록은 하나
console.log(await send({...body,request_id:crypto.randomUUID()}));
const after = await fetch('/api/diary').then(r => r.json());
console.log({completionRecords:after.completions.filter(c=>c.task_id===t.id&&c.cycle===t.completion_cycle).length,
 doneIncrease:after.tasks.filter(x=>x.plan_id===t.plan_id&&!x.deleted_at&&x.status==='done').length-before.tasks.filter(x=>x.plan_id===t.plan_id&&!x.deleted_at&&x.status==='done').length});
// 기대: completionRecords:1, doneIncrease:1
```

결과를 캡처한 뒤 테스트 할 일을 삭제합니다. 완료 취소 후 다시 완료한 경우는 새로운 완료 주기로 취급하며 현재 완료 수는 여전히 할 일 기준으로 1입니다.

## 스크립트 문자열 검사

임시 할 일 제목에 `<img src=x onerror="alert('T06')">`를 넣습니다. 글자 그대로 보이며 이미지/팝업이 없어야 합니다. 저장·재조회·검색·돌아보기 근거에서도 확인하고 테스트 할 일을 삭제합니다.

## 비밀값 검사

1. GitHub 최신 소스뿐 아니라 커밋 이력에 실제 키, `.env.local`이 없는지 확인합니다.
2. Vercel 정적 배포 파일은 `public`에서만 생성됩니다. 브라우저 Sources에서 실제 키가 없는지 검색합니다.
3. Network에서 `/api/diary` 응답과 요청에 실제 키가 없는지 확인합니다. 서버에서 Supabase로 가는 요청은 브라우저 Network에 나오지 않아야 합니다.
4. 브라우저 Console, Vercel 로그에 실제 키가 없는지 확인합니다. 실패 상황에서도 확인합니다.
5. 노출 이력이 있으면 키를 폐기·교체하고 과거 기록을 정리합니다. 단순히 마지막 파일에서 삭제했다고 통과 처리하지 않습니다.

## 새로고침 비교

내보내기를 두 번 받아 `exported_at`만 제외하고 내용이 같은지 비교합니다. 중간에 수정/완료하지 않습니다. JSON의 UTC 표기와 화면의 서울 표기가 같은 순간인지 확인합니다. 테스트 증거는 실제 실행한 날짜를 적어 보관합니다.
