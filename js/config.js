/* ============================================================
   SafeWalk v2.0 — config.js
   모든 설정값·API 키·레이어 정의를 한 곳에 모은 파일.
   "숫자나 키를 바꾸고 싶다"면 이 파일만 보면 됩니다.
   (다른 파일에서는 여기 있는 상수를 읽기만 합니다)
   ============================================================ */

const APP_VERSION='v.2.1.0';

/* ── 생활안전지도(safemap.go.kr) ── */
const API_KEY='EYQ7ZKD8-EYQ7-EYQ7-EYQ7-EYQ7ZKD8HA';
const MARKER_API='https://safemap.go.kr/layer/getMarkerLayerPost.json';
const CPTED_LIST_API='https://www.safemap.go.kr/com/cmm/getMapLayerListPost.json';
const MARKER_PAGE_SIZE=500;

/* ── 줌 게이트 ── */
const MIN_DATA_ZOOM=14;
const MAX_ADAPTIVE_ZOOM=17;
const LAYER_BASE_MIN_ZOOM={
  cctv:16,
  bell:MIN_DATA_ZOOM,
  police:MIN_DATA_ZOOM,
  child_house:MIN_DATA_ZOOM
};

/* ── 경로 API (Cloudflare Worker 프록시 → OSRM → Valhalla 순 폴백) ── */
const ROUTE_PROXY_URL='https://safewalk-route.ds-ml.workers.dev';
const OSRM_FOOT_ROUTE_URLS=['https://routing.openstreetmap.de/routed-foot/route/v1/foot'];
const VALHALLA_ROUTE_URLS=[
  'https://valhalla1.openstreetmap.de/route',
  'https://valhalla.openstreetmap.de/route'
];
const ROUTE_COLOR='#ef4444';
const ROUTE_HALO_COLOR='#ffffff';
const ROUTE_FACILITY_RADIUS_M=150;

/* ── VWorld 장소 검색 ──
   주의: VWORLD_SERVICE_DOMAIN은 VWorld에 키를 등록할 때 적은 도메인과
   일치해야 합니다. 배포 주소를 바꾸면 VWorld 마이페이지에서 도메인을
   추가 등록하고 이 값도 함께 바꾸세요. */
const VWORLD_API_KEY='30093378-543F-3458-B837-16DCF7D945AB';
const VWORLD_SERVICE_DOMAIN='https://gbe-ds-ml.github.io/ssa/';
const VWORLD_SEARCH_URL='https://api.vworld.kr/req/search';
const SEARCH_PAGE_SIZE=8;

/* ── SafeWalk AI 챗봇 (Cloudflare Worker) ── */
const CHAT_API_URL='https://safewalk-chat.ds-ml.workers.dev/chat';
const CHAT_MAX_LENGTH=500;
const CHAT_ROUTE_CANDIDATE_LIMIT=5;

/* ── 경로 회랑(경로 주변 시설 조회) ──
   CORRIDOR_BUFFER_M: 경로 사각형을 몇 미터 넓혀서 시설을 조회할지.
   판정 반경(150m)보다 반드시 커야 경계의 시설이 누락되지 않습니다. */
const CORRIDOR_CELL_TARGET_M=1200;
const MAX_CORRIDOR_CELLS=6;
const CORRIDOR_BUFFER_M=ROUTE_FACILITY_RADIUS_M+40;
const SNAP_WARN_M=80;

/* ── 마커 캐시 ── */
const MARKER_FETCH_PADDING=0.65;
const MARKER_PRUNE_PADDING=0.9;
const MARKER_MOVE_DEBOUNCE_MS=850;

/* ── 레이어 정의 ── */
const LAYER_API={
  bell:{layer:'A2SM_CMMNPOI_EMGBELL',style:'A2SM_CMMNPOI_EMGBELL'},
  police:{layer:'A2SM_CMMNPOI2',style:'A2SM_CmmnPoi2'},
  child_house:{layer:'A2SM_CMMNPOI',style:'A2SM_CMMNPOI_05'},
  cctv:{layer:'A2SM_CCTV_INFO',style:'A2SM_CCTV_INFO'}
};
const WMS_API={
  women:'https://safemap.go.kr/openapi2/IF_0080_WMS',
  elder_c:'https://safemap.go.kr/openapi2/IF_0082_WMS',
  children:'https://safemap.go.kr/openapi2/IF_0081_WMS',
  cpted:'https://www.safemap.go.kr/geoserver_pos/safemap/wms'
};
const LAYER={
  bell:{label:'안전비상벨',color:'#0891b2',emoji:'🔔'},
  police:{label:'치안시설',color:'#7c3aed',emoji:'🚔'},
  child_house:{label:'어린이안전지킴이집',color:'#059669',emoji:'🏠'},
  cctv:{label:'CCTV',color:'#2563eb',emoji:'📷'}
};
const WMS_LAYER={
  women:{label:'여성밤길안전',color:'#db2777'},
  elder_c:{label:'노인범죄주의',color:'#ea580c'},
  children:{label:'어린이범죄주의',color:'#ca8a04'},
  cpted:{label:'범죄예방환경설계',color:'#b45309'}
};
const GROUP={
  child:{label:'어린이',color:'#059669',emoji:'🧒',xml:['bell','police','child_house','cctv'],wms:['children'],special:'child_house'},
  youth:{label:'여성·청소년',color:'#db2777',emoji:'🚶‍♀️',xml:['bell','police','child_house','cctv'],wms:['women'],special:null},
  elder:{label:'노인',color:'#ea580c',emoji:'👴',xml:['bell','police','cctv'],wms:['elder_c'],special:null},
  cpted:{label:'CPTED',color:'#b45309',emoji:'🏗',xml:[],wms:['cpted'],special:null}
};

/* 생활안전지도 CCTV 공식 아이콘 — v2에서는 로컬 파일 사용(정부 서버 의존 제거) */
const CCTV_ICON_URL='assets/poi01_17_1.svg';

/* ── 안전도 점수 설정 ──
   unit: 시설 1개당 점수(거리 감쇠 적용 전) / cap: 항목별 최대 점수
   인트로 화면의 안내 문구와 반드시 함께 수정하세요. */
const FACILITY_SCORE_CONFIG={
  police:{unit:9,cap:17,rank:1},
  cctv:{unit:2,cap:11,rank:2},
  bell:{unit:5,cap:11,rank:2},
  child_house:{unit:3,cap:6,rank:3}
};
const FACILITY_SCORE_ORDER=['police','cctv','bell','child_house'];
const FACILITY_TOTAL_CAP=FACILITY_SCORE_ORDER.reduce((s,k)=>s+FACILITY_SCORE_CONFIG[k].cap,0);
const SCORE_BASE=40;
const FACILITY_ROUTE_LABEL={
  police:'🚔 치안시설 1순위',
  cctv:'📷 CCTV 2순위',
  bell:'🔔 안전비상벨 2순위',
  child_house:'🏠 어린이안전지킴이집 3순위'
};

/* ── 위치 기억(빠른 초기 지도 표시용) ── */
const LAST_POS_STORAGE_KEY='sw_last_pos';
/* 시작 시 기본 배율 — 16이면 CCTV 레이어(최소 줌 16)까지 바로 보인다 */
const DEFAULT_ZOOM=16;

/* ── 안심 타이머(도착 확인) ── */
const SAFE_TIMER_BUFFER_SEC=600;           /* 예상 시간에 더하는 여유(10분) */
const SAFE_TIMER_STORAGE_KEY='sw_safe_timer';
const GUARDIAN_STORAGE_KEY='sw_guardian';  /* 보호자 전화번호(localStorage) */

/* ── 시민 안전 감사(SafetiPin 방식) ──
   AUDIT_API_URL이 비어 있으면 localStorage에만 저장하는 "로컬 모드"로
   동작합니다. v2/worker/의 Worker를 배포한 뒤 그 주소를 넣으면
   모든 사용자가 평가를 공유하는 "공유 모드"가 됩니다. */
const AUDIT_API_URL='';
const AUDIT_STORAGE_KEY='sw_audits';
const AUDIT_MIN_ZOOM=15;
const AUDIT_INDICATORS=[
  {key:'light',label:'조명',desc:'밤에 밝은가요?'},
  {key:'visible',label:'주변 시야',desc:'주변이 트여 있고 사람 눈길이 닿나요?'},
  {key:'feel',label:'체감 안심',desc:'전체적으로 안심되는 곳인가요?'}
];

/* ── 안심 편의점(24시간 대피처) — OpenStreetMap Overpass API ── */
const OVERPASS_URLS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const HAVEN_MIN_ZOOM=15;
const HAVEN_MAX_ITEMS=200;

/* ── 전역 공유 상태 ──
   grp: 현재 선택된 이용자 유형('child'|'youth'|'elder'|'cpted'|null)
   auditPickMode: 안전 감사 지점 선택 모드(지도 탭 대기)
   여러 파일이 함께 사용하므로 여기(가장 먼저 로드되는 파일)에 선언합니다. */
let grp=null;
let auditPickMode=false;
