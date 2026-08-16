/* ============================================================
   SafeWalk — 시민 안전 감사 Worker (safewalk-audit)
   Cloudflare Workers + KV 무료 티어로 동작합니다.

   API:
   - GET  /   → { ok:true, audits:[{lat,lng,scores,ts}, ...] }
   - POST /   → body {lat,lng,scores:{light,visible,feel}} 저장

   배포 방법은 같은 폴더의 README.md 참고.
   배포 후 Worker 주소를 js/config.js의 AUDIT_API_URL에 넣으세요.
   ============================================================ */

/* 우리 서비스 도메인만 허용 — 배포 주소로 바꿔 주세요 */
const ALLOWED_ORIGINS=[
  'http://localhost:8123',
  'https://gbe-ds-ml.github.io'
  /* 예: 'https://safewalk.pages.dev' */
];

const KV_KEY='audits';       /* 전체 평가를 JSON 배열 하나로 저장 */
const MAX_AUDITS=2000;       /* 학교 프로젝트 규모 상한 */
const SCORE_KEYS=['light','visible','feel'];

function corsHeaders(origin){
  const allowed=ALLOWED_ORIGINS.includes(origin)?origin:ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':allowed,
    'Access-Control-Allow-Methods':'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type',
    'Content-Type':'application/json; charset=utf-8'
  };
}
function json(body,status,origin){
  return new Response(JSON.stringify(body),{status,headers:corsHeaders(origin)});
}

function validateAudit(data){
  if(!data||typeof data!=='object')return '잘못된 요청 본문';
  const lat=Number(data.lat),lng=Number(data.lng);
  /* 대한민국 대략 범위만 허용 */
  if(!Number.isFinite(lat)||lat<33||lat>39)return '위도 범위 오류';
  if(!Number.isFinite(lng)||lng<124||lng>132)return '경도 범위 오류';
  const s=data.scores;
  if(!s||typeof s!=='object')return '평가 점수 없음';
  for(const k of SCORE_KEYS){
    const v=Number(s[k]);
    if(!Number.isInteger(v)||v<0||v>2)return '점수 형식 오류: '+k;
  }
  return null;
}

export default {
  async fetch(request,env){
    const origin=request.headers.get('Origin')||'';

    if(request.method==='OPTIONS'){
      return new Response(null,{status:204,headers:corsHeaders(origin)});
    }

    /* 등록된 도메인에서 온 요청만 처리(무료 사용량 보호) */
    if(origin&&!ALLOWED_ORIGINS.includes(origin)){
      return json({ok:false,error:'허용되지 않은 도메인'},403,origin);
    }

    if(request.method==='GET'){
      const raw=await env.AUDITS.get(KV_KEY);
      const audits=raw?JSON.parse(raw):[];
      return json({ok:true,audits},200,origin);
    }

    if(request.method==='POST'){
      let data=null;
      try{data=await request.json();}catch(e){}
      const err=validateAudit(data);
      if(err)return json({ok:false,error:err},400,origin);

      const raw=await env.AUDITS.get(KV_KEY);
      const audits=raw?JSON.parse(raw):[];
      audits.push({
        lat:Number(Number(data.lat).toFixed(6)),
        lng:Number(Number(data.lng).toFixed(6)),
        scores:{
          light:Number(data.scores.light),
          visible:Number(data.scores.visible),
          feel:Number(data.scores.feel)
        },
        ts:Date.now()
      });
      /* 오래된 것부터 잘라 상한 유지 */
      const trimmed=audits.slice(-MAX_AUDITS);
      await env.AUDITS.put(KV_KEY,JSON.stringify(trimmed));
      return json({ok:true,count:trimmed.length},200,origin);
    }

    return json({ok:false,error:'지원하지 않는 메서드'},405,origin);
  }
};
