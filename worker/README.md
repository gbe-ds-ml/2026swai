# 시민 안전 감사 Worker 배포 안내

`audit-worker.js`를 배포하면 "시민 안전 평가"가 **모든 사용자가 공유하는 모드**로
바뀝니다. 배포 전에는 각자 브라우저(localStorage)에만 저장되는 로컬 모드로
동작하므로, 배포는 급하지 않습니다.

## 배포 순서 (Cloudflare 대시보드, 무료)

1. **Workers & Pages → Create → Worker** 를 만들고 이름을 `safewalk-audit`으로 지정
2. 편집 화면에 `audit-worker.js` 내용을 통째로 붙여넣기
3. 파일 상단의 `ALLOWED_ORIGINS` 배열에 **실제 배포 도메인**을 추가
   (예: `'https://내계정.github.io'` 또는 `'https://safewalk.pages.dev'`)
4. **KV 네임스페이스 만들기**: Storage & Databases → KV → Create namespace,
   이름은 아무거나 (예: `safewalk-audits`)
5. Worker 설정 → **Bindings → KV Namespace** 추가:
   - Variable name: `AUDITS`  ← 반드시 이 이름이어야 함 (코드의 `env.AUDITS`)
   - Namespace: 4번에서 만든 것 선택
6. Deploy 후 Worker 주소 확인 (예: `https://safewalk-audit.내계정.workers.dev`)
7. `v2/js/config.js`의 `AUDIT_API_URL`에 그 주소를 넣으면 끝:
   ```js
   const AUDIT_API_URL='https://safewalk-audit.내계정.workers.dev';
   ```

## 반드시 함께 할 것

- Cloudflare 대시보드 → Security → **Rate Limiting 규칙(무료 1개)**을
  이 Worker 경로에 걸어두세요 (예: 같은 IP에서 1분에 20회 초과 시 차단).
  안 걸면 외부인이 스크립트로 가짜 평가를 대량 등록할 수 있습니다.
- `ALLOWED_ORIGINS`에 없는 도메인의 요청은 Worker가 403으로 거부합니다.
  로컬 개발용 `http://localhost:8123`은 이미 들어 있습니다.

## 데이터 확인·초기화

- 확인: KV 네임스페이스 → `audits` 키 → JSON 배열이 전체 평가 데이터입니다.
- 초기화: `audits` 키를 삭제하면 됩니다.
- 상한: 최근 2,000건만 유지합니다 (`MAX_AUDITS`).

## 알아둘 한계 (발표 때 정직하게 말하기)

- 로그인이 없으므로 같은 사람이 여러 번 평가할 수 있습니다.
  → Rate Limiting으로 완화, "참고용 체감 지표"로 소개할 것.
- KV는 읽기-수정-쓰기 사이 경합이 있으면 드물게 평가 1건이 유실될 수
  있습니다. 학교 프로젝트 규모에서는 문제되지 않는 수준입니다.
