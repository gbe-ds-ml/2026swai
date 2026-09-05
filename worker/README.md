# SafeWalk Worker 운영 안내

## 현재 구성

- `ai-worker.mjs`: 첨부된 AI Worker를 기반으로 정리한 `safewalk-chat` 서버 코드입니다.
- `wrangler.jsonc`: 기존 `safewalk-chat` 이름과 AI 바인딩, 요청 제한 바인딩을 정의합니다.
- `audit-worker.js`: 과거 시민 안전 평가 기능의 보관 코드입니다. 현재 화면의 `js/audit.js`는 기기에 저장하는 즐겨찾기 기능이며, 이 Worker를 호출하지 않습니다.
- 보행 경로 프록시 `safewalk-route`의 서버 원본은 저장소에 없습니다. 이번 변경은 프런트엔드의 경로 실패 처리와 요청 대기시간을 보완합니다.

## AI Worker 배포

GitHub Pages 배포와 Cloudflare Worker 배포는 별개입니다. 이 저장소에 코드를 병합하는 것만으로 운영 중인 AI Worker가 교체되지는 않습니다.

Cloudflare의 해당 계정에 로그인한 환경에서 실행합니다.

```sh
npx wrangler@4 deploy --config worker/wrangler.jsonc
```

Wrangler 4.36.0 이상이 필요합니다. 배포 대상은 기존 `safewalk-chat`이며, 프런트엔드 주소는 `https://safewalk-chat.ds-ml.workers.dev/chat`입니다. 배포 후 루트 경로의 상태 응답에서 버전 `2.6.0`을 확인합니다. API 토큰을 소스에 넣지 않습니다.

필수 바인딩:

| 이름 | 역할 |
|---|---|
| `AI` | Workers AI 호출 |
| `AI_RATE_LIMITER` | IP 기준 60초당 100회 요청 제한 |

요청 제한 설정이 없으면 AI를 호출하지 않고 503으로 응답합니다. 이 제한은 로그인이 없는 서비스의 남용 완화 장치이며 사용자 인증이나 정확한 비용 상한이 아닙니다. 학교·통신사 등에서 공인 IP를 공유하는 경우 여러 사용자가 같은 한도를 사용합니다. Cloudflare 위치별로 적용되므로 실제 이용량과 비용도 별도로 관찰해야 합니다.

## 응답 처리

- 기본 모델: `@cf/zai-org/glm-4.7-flash`
- 보조 모델: `@cf/qwen/qwen3-30b-a3b-fp8`
- 기본 모델의 예외·빈 답변·잘못된 도구 명령·잘린 답변·10초 초과 대기는 보조 모델 재시도 대상입니다.
- 보조 모델까지 실패하면 503으로 응답합니다. 모델별 10초 제한은 응답을 기다리는 시간의 제한이며, 이미 시작된 모델 추론 자체의 취소를 보장하지 않습니다.
- 길찾기 신뢰도는 숫자이고 0.55~1 범위일 때만 허용합니다. 실제 장소 후보 조회와 사용자 확인은 프런트엔드에서 수행합니다.
- 닫히지 않은 추론 태그도 사용자 답변에서 제거합니다.
- JSON 본문은 최대 48 KiB이며, 화면 정보는 이용자 유형·지역명·경로 요약의 허용 항목만 사용합니다. GPS 좌표와 보호자 번호 같은 추가 필드는 전달하지 않습니다. 사용자가 직접 질문에 입력한 정보와 최근 대화는 모델에 전달됩니다.

## 검증

```sh
node --test tests/regression.test.mjs
```

실제 AI 모델과 공공 API의 비용을 발생시키지 않도록 외부 응답을 모의한 회귀 검증입니다. 운영 데이터의 정확성 및 실제 기기의 GPS·화면 상태는 별도로 확인합니다.

## 공식 문서

- [Workers AI 바인딩](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [Workers 요청 제한 바인딩과 적용 범위](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
