/* ============================================================
   SafeWalk v2.2 — config.js

   SafeWalk 공통 설정
   - 생활안전지도
   - VWorld
   - 경로 API
   - 안전시설
   - 점수 계산
   ============================================================ */

const APP_VERSION='v.2.2.0';


/* ============================================================
   생활안전지도
   ============================================================ */

/*
  ↓ 기존 생활안전지도 API 키 입력
*/
const API_KEY='YOUR_SAFEMAP_API_KEY';

const MARKER_API=
  'https://safemap.go.kr/layer/getMarkerLayerPost.json';

const CPTED_LIST_API=
  'https://www.safemap.go.kr/com/cmm/getMapLayerListPost.json';

const MARKER_PAGE_SIZE=500;


/* ============================================================
   줌 게이트
   ============================================================ */

const MIN_DATA_ZOOM=14;

const MAX_ADAPTIVE_ZOOM=17;

const LAYER_BASE_MIN_ZOOM={
  cctv:16,
  bell:MIN_DATA_ZOOM,
  police:MIN_DATA_ZOOM,
  child_house:MIN_DATA_ZOOM
};


/* ============================================================
   경로 API

   Cloudflare Worker
   → OSRM
   → Valhalla
   ============================================================ */

const ROUTE_PROXY_URL=
  'https://safewalk-route.ds-ml.workers.dev';

const OSRM_FOOT_ROUTE_URLS=[
  'https://routing.openstreetmap.de/routed-foot/route/v1/foot'
];

const VALHALLA_ROUTE_URLS=[
  'https://valhalla1.openstreetmap.de/route',
  'https://valhalla.openstreetmap.de/route'
];

const ROUTE_COLOR='#ef4444';

const ROUTE_HALO_COLOR='#ffffff';

const ROUTE_FACILITY_RADIUS_M=150;


/* ============================================================
   VWorld

   - Base WMTS : 2D 일반 배경지도
   - Search    : 장소 / 주소 검색
   ============================================================ */

/*
  ↓ 기존 VWorld API 키 입력
*/
const VWORLD_API_KEY='30093378-543F-3458-B837-16DCF7D945AB';


/*
  VWorld에 등록한 서비스 URL과 일치시키기
*/
const VWORLD_SERVICE_DOMAIN=
  'https://gbe-ds-ml.github.io/2026swai/';


const VWORLD_SEARCH_URL=
  'https://api.vworld.kr/req/search';


/*
  VWorld 2D 일반 배경지도

  공식 WMTS 규칙:
  Base/{z}/{y}/{x}.png

  주의:
  일반 XYZ 서비스처럼
  {z}/{x}/{y}가 아님.
*/
const VWORLD_BASE_TILE_URL=
  'https://api.vworld.kr/req/wmts/1.0.0/'+
  VWORLD_API_KEY+
  '/Base/{z}/{y}/{x}.png';


const SEARCH_PAGE_SIZE=8;


/* ============================================================
   SafeWalk AI 챗봇
   ============================================================ */

const CHAT_API_URL=
  'https://safewalk-chat.ds-ml.workers.dev/chat';

const CHAT_MAX_LENGTH=500;

const CHAT_ROUTE_CANDIDATE_LIMIT=5;


/* ============================================================
   경로 주변 안전시설 조회
   ============================================================ */

const CORRIDOR_CELL_TARGET_M=1200;

const MAX_CORRIDOR_CELLS=6;

const CORRIDOR_BUFFER_M=
  ROUTE_FACILITY_RADIUS_M+40;

const SNAP_WARN_M=80;


/* ============================================================
   마커 캐시
   ============================================================ */

const MARKER_FETCH_PADDING=0.65;

const MARKER_PRUNE_PADDING=0.9;

const MARKER_MOVE_DEBOUNCE_MS=850;


/* ============================================================
   생활안전지도 안전시설 API
   ============================================================ */

const LAYER_API={

  bell:{
    layer:'A2SM_CMMNPOI_EMGBELL',
    style:'A2SM_CMMNPOI_EMGBELL'
  },

  police:{
    layer:'A2SM_CMMNPOI2',
    style:'A2SM_CmmnPoi2'
  },

  child_house:{
    layer:'A2SM_CMMNPOI',
    style:'A2SM_CMMNPOI_05'
  },

  cctv:{
    layer:'A2SM_CCTV_INFO',
    style:'A2SM_CCTV_INFO'
  }

};


/* ============================================================
   생활안전지도 WMS
   ============================================================ */

const WMS_API={

  women:
    'https://safemap.go.kr/openapi2/IF_0080_WMS',

  elder_c:
    'https://safemap.go.kr/openapi2/IF_0082_WMS',

  children:
    'https://safemap.go.kr/openapi2/IF_0081_WMS',

  cpted:
    'https://www.safemap.go.kr/geoserver_pos/safemap/wms'

};


/* ============================================================
   안전시설 표시 정보
   ============================================================ */

const LAYER={

  bell:{
    label:'안전비상벨',
    color:'#0891b2',
    emoji:'🔔'
  },

  police:{
    label:'치안시설',
    color:'#7c3aed',
    emoji:'🚔'
  },

  child_house:{
    label:'아동안전지킴이집',
    color:'#059669',
    emoji:'🏠'
  },

  cctv:{
    label:'CCTV',
    color:'#2563eb',
    emoji:'📷'
  }

};


/* ============================================================
   WMS 표시 정보
   ============================================================ */

const WMS_LAYER={

  women:{
    label:'여성밤길안전',
    color:'#db2777'
  },

  elder_c:{
    label:'노인범죄주의',
    color:'#ea580c'
  },

  children:{
    label:'어린이범죄주의',
    color:'#ca8a04'
  },

  cpted:{
    label:'범죄예방환경설계',
    color:'#b45309'
  }

};


/* ============================================================
   이용자 유형
   ============================================================ */

const GROUP={

  child:{
    label:'어린이',
    color:'#059669',
    emoji:'🧒',

    xml:[
      'bell',
      'police',
      'child_house',
      'cctv'
    ],

    wms:[
      'children'
    ],

    special:'child_house'
  },


  youth:{
    label:'여성·청소년',
    color:'#db2777',
    emoji:'🚶‍♀️',

    xml:[
      'bell',
      'police',
      'child_house',
      'cctv'
    ],

    wms:[
      'women'
    ],

    special:null
  },


  elder:{
    label:'노인',
    color:'#ea580c',
    emoji:'👴',

    xml:[
      'bell',
      'police',
      'cctv'
    ],

    wms:[
      'elder_c'
    ],

    special:null
  },


  cpted:{
    label:'CPTED',
    color:'#b45309',
    emoji:'🏗',

    xml:[],

    wms:[
      'cpted'
    ],

    special:null
  }

};


/* ============================================================
   CCTV 아이콘
   ============================================================ */

const CCTV_ICON_URL=
  'assets/poi01_17_1.svg';


/* ============================================================
   안전도 점수
   ============================================================ */

const FACILITY_SCORE_CONFIG={

  police:{
    unit:9,
    cap:17,
    rank:1
  },

  cctv:{
    unit:2,
    cap:11,
    rank:2
  },

  bell:{
    unit:5,
    cap:11,
    rank:2
  },

  child_house:{
    unit:3,
    cap:6,
    rank:3
  }

};


const FACILITY_SCORE_ORDER=[
  'police',
  'cctv',
  'bell',
  'child_house'
];


const FACILITY_TOTAL_CAP=
  FACILITY_SCORE_ORDER.reduce(
    (sum,key)=>
      sum+
      FACILITY_SCORE_CONFIG[key].cap,
    0
  );


const SCORE_BASE=40;


const FACILITY_ROUTE_LABEL={

  police:
    '🚔 치안시설 1순위',

  cctv:
    '📷 CCTV 2순위',

  bell:
    '🔔 안전비상벨 2순위',

  child_house:
    '🏠 아동안전지킴이집 3순위'

};


/* ============================================================
   위치 기억
   ============================================================ */

const LAST_POS_STORAGE_KEY=
  'sw_last_pos';


/*
  16부터 CCTV 표시 가능
*/
const DEFAULT_ZOOM=16;


/* ============================================================
   안심 타이머
   ============================================================ */

const SAFE_TIMER_BUFFER_SEC=600;

const SAFE_TIMER_STORAGE_KEY=
  'sw_safe_timer';

const GUARDIAN_STORAGE_KEY=
  'sw_guardian';


/* ============================================================
   즐겨찾기 / 기존 Audit 호환
   ============================================================ */

const AUDIT_API_URL='';

const AUDIT_STORAGE_KEY=
  'sw_audits';

const AUDIT_MIN_ZOOM=15;


const AUDIT_INDICATORS=[

  {
    key:'light',
    label:'조명',
    desc:'밤에 밝은가요?'
  },

  {
    key:'visible',
    label:'주변 시야',
    desc:'주변이 트여 있고 사람 눈길이 닿나요?'
  },

  {
    key:'feel',
    label:'체감 안심',
    desc:'전체적으로 안심되는 곳인가요?'
  }

];


/* ============================================================
   레거시 안심 편의점 설정

   현재 havens.js에서는 안심 편의점 기능을 사용하지 않지만,
   이전 코드에서 상수를 참조하는 상황을 막기 위해 남겨둔다.
   ============================================================ */

const OVERPASS_URLS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];

const HAVEN_MIN_ZOOM=15;

const HAVEN_MAX_ITEMS=200;


/* ============================================================
   전역 공유 상태
   ============================================================ */

let grp=null;

let auditPickMode=false;
