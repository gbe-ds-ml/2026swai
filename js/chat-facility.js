/* ============================================================
   SafeWalk v2.3 — chat-facility.js

   현재 위치 기준 "가장 가까운 안전시설" 챗봇 기능

   원칙
   1. AI가 시설명이나 좌표를 추측하지 않는다.
   2. 브라우저 Geolocation으로 실제 현재 위치를 확인한다.
   3. 생활안전지도 SafeMap 실제 시설 API를 조회한다.
   4. 현재 위치와 시설의 직선거리를 계산한다.
   5. 가장 가까운 시설을 채팅창에 표시한다.
   6. 지도에서 보기 / 여기로 길찾기를 제공한다.

   지원 예시
   - 가장 가까운 치안시설 알려줘
   - 근처 경찰서 어디야?
   - 가까운 파출소 찾아줘
   - 가장 가까운 안전비상벨
   - 근처 어린이안전지킴이집 있어?
   - 가까운 CCTV 보여줘
   - 내 주변 안전시설 알려줘

   기존 chat.js는 수정하지 않는다.
   ============================================================ */


/* ============================================================
   상태
   ============================================================ */

let swFacilityRequestToken=0;

let swFacilityPreviewMarker=null;


/* ============================================================
   시설 설정
   ============================================================ */

const SW_CHAT_FACILITY_META={

  police:{
    label:'치안시설',
    icon:'🚔',

    /*
      경찰시설은 상대적으로 희소하므로
      작은 범위부터 최대 30km까지 단계적으로 조회한다.
    */
    radii:[
      400,
      1000,
      2500,
      6000,
      15000,
      30000
    ]
  },


  bell:{
    label:'안전비상벨',
    icon:'🆘',

    radii:[
      150,
      350,
      800,
      1800,
      4500,
      10000
    ]
  },


  child_house:{
    label:'어린이안전지킴이집',
    icon:'🏠',

    radii:[
      250,
      600,
      1500,
      3500,
      8000,
      15000
    ]
  },


  cctv:{
    label:'CCTV',
    icon:'📷',

    /*
      CCTV는 특히 서울 등에서 데이터가 매우 많으므로
      80m부터 작은 반경으로 조회한다.
    */
    radii:[
      80,
      180,
      400,
      800,
      1600,
      3000
    ]
  }

};


const SW_CHAT_FACILITY_ALL_KEYS=[
  'police',
  'bell',
  'child_house',
  'cctv'
];


/* ============================================================
   자연어 안전시설 요청 판별
   ============================================================ */

function swParseNearbyFacilityCommand(message){

  const text=
    String(message||'')

      .replace(
        /[\r\n\t]+/g,
        ' '
      )

      .replace(
        /\s+/g,
        ' '
      )

      .trim();


  if(!text){
    return null;
  }


  const compact=
    text.replace(
      /\s+/g,
      ''
    );


  /*
    단순 개념 질문은 안전시설 위치 조회로 가로채지 않는다.

    예:
    "CCTV가 뭐야?"
    "치안시설 설명해줘"
    "비상벨은 어떤 기능이야?"
  */

  const explanationOnly=

    /(?:뭐야|무엇이야|무엇인가|뜻이야|정의|설명해|차이가뭐|어떤기능|의미가뭐)/

      .test(
        compact
      );


  /*
    실제 주변 시설 검색으로 판단할 표현
  */

  const proximityIntent=

    /(?:가장가까|제일가까|가까운|가까이|근처|주변|내주변|내근처|현재위치|내위치|여기|이곳|어디|찾아줘|찾아주세요|보여줘|보여주세요|알려줘|알려주세요|있어|있나요|있는곳|위치)/

      .test(
        compact
      );


  const keys=[];


  /* ── 치안시설 ── */

  if(

    /(?:치안시설|경찰서|파출소|지구대|경찰시설|경찰관서)/

      .test(
        compact
      )

  ){

    keys.push(
      'police'
    );

  }


  /* ── 비상벨 ── */

  if(

    /(?:안전비상벨|비상벨|긴급비상벨)/

      .test(
        compact
      )

  ){

    keys.push(
      'bell'
    );

  }


  /* ── 어린이안전지킴이집 ── */

  if(

    /(?:어린이안전지킴이집|아동안전지킴이집|안전지킴이집|지킴이집)/

      .test(
        compact
      )

  ){

    keys.push(
      'child_house'
    );

  }


  /* ── CCTV ── */

  if(

    /(?:CCTV|씨씨티비|방범카메라|방범CCTV)/i

      .test(
        compact
      )

  ){

    keys.push(
      'cctv'
    );

  }


  /*
    특정 종류 없이

    "내 주변 안전시설"
    "근처 안전 인프라"

    라고 묻는 경우 4종류를 모두 조회한다.
  */

  const genericSafety=

    /(?:안전시설|안전인프라|안전시설물|주변안전|근처안전시설)/

      .test(
        compact
      );


  if(
    !keys.length &&
    !genericSafety
  ){

    return null;

  }


  /*
    "치안시설이 뭐야?"

    같은 질문이면 기존 AI로 보낸다.
  */

  if(
    explanationOnly &&
    !proximityIntent
  ){

    return null;

  }


  /*
    명시적 시설은 있지만 위치 의도가 없으면
    역시 기존 AI에게 넘긴다.
  */

  if(
    !proximityIntent &&
    !genericSafety
  ){

    return null;

  }


  /*
    경찰시설의 세부 유형

    "파출소"
    "지구대"
    "경찰서"

    를 따로 요청하면 해당 시설만 찾는다.
  */

  let policeSubtype=null;


  if(
    keys.includes(
      'police'
    )
  ){

    if(
      /파출소/.test(
        compact
      )
    ){

      policeSubtype=
        '파출소';

    }

    else if(
      /지구대/.test(
        compact
      )
    ){

      policeSubtype=
        '지구대';

    }

    else if(
      /경찰서/.test(
        compact
      )
    ){

      policeSubtype=
        '경찰서';

    }

  }


  return {

    keys:[
      ...new Set(

        keys.length
          ?keys
          :SW_CHAT_FACILITY_ALL_KEYS

      )
    ],

    generic:
      genericSafety &&
      keys.length===0,

    policeSubtype,

    originalMessage:
      text

  };

}


/* ============================================================
   실제 현재 위치 확인
   ============================================================ */

/*
  map.js는 위치 권한이 실패한 경우
  지도 표시를 위해 기본 좌표를 사용할 수 있다.

  "가장 가까운 시설"에서 기본 좌표를 사용하면 위험하므로
  Geolocation API를 다시 호출하여
  실제 GPS가 확인된 경우에만 시설을 조회한다.
*/

function swResolveFacilityOrigin(){

  return new Promise(
    (
      resolve,
      reject
    )=>{

      if(
        !navigator.geolocation
      ){

        reject(
          new Error(
            '현재 위치 기능을 지원하지 않는 브라우저입니다.'
          )
        );

        return;

      }


      navigator.geolocation
        .getCurrentPosition(

          position=>{

            const lat=
              Number(
                position.coords.latitude
              );


            const lng=
              Number(
                position.coords.longitude
              );


            if(
              !Number.isFinite(lat) ||
              !Number.isFinite(lng)
            ){

              reject(
                new Error(
                  '현재 위치 좌표가 올바르지 않습니다.'
                )
              );

              return;

            }


            /*
              이후 지도에서 보기 및 길찾기도
              같은 실제 위치를 사용하도록 갱신
            */

            if(!acceptGPSPosition(position)){reject(new Error('현재 위치를 확인하지 못했습니다.'));return;}


            if(
              typeof writeLastPos===
              'function'
            ){

              try{

                writeLastPos(
                  lat,
                  lng
                );

              }catch(e){}

            }


            if(
              typeof drawMe===
                'function' &&
              map
            ){

              try{

                drawMe();

              }catch(e){}

            }


            resolve({

              lat,

              lng,

              accuracy:
                Number(
                  position.coords.accuracy
                )||
                null

            });

          },


          error=>{

            reject(

              error||

              new Error(
                '현재 위치를 확인하지 못했습니다.'
              )

            );

          },


          {

            timeout:
              8000,

            enableHighAccuracy:
              false,

            maximumAge:
              30000

          }

        );

    }
  );

}


/* ============================================================
   검색용 Bounds 생성
   ============================================================ */

function swMakeFacilityBounds(
  lat,
  lng,
  radiusM
){

  /*
    위도 1도 ≈ 111.32km
  */

  const latDelta=
    radiusM/
    111320;


  /*
    경도는 위도에 따라 실제 거리가 달라진다.
  */

  const cosLat=
    Math.max(

      .2,

      Math.cos(
        lat*
        Math.PI/
        180
      )

    );


  const lngDelta=

    radiusM/
    (
      111320*
      cosLat
    );


  return L.latLngBounds(

    [
      lat-latDelta,
      lng-lngDelta
    ],

    [
      lat+latDelta,
      lng+lngDelta
    ]

  );

}


/* ============================================================
   경찰 시설 세부 유형 판별 문자열
   ============================================================ */

function swGetPoliceSearchText(
  item
){

  const info=
    getFacilityInfo(
      'police',
      item
    );


  return [

    info.name,

    xv(
      item,
      'fclty_ty'
    ),

    xv(
      item,
      'fclty_nm'
    )

  ]

  .filter(
    Boolean
  )

  .join(
    ' '
  );

}


/* ============================================================
   시설 결과 표준화
   ============================================================ */

function swNormalizeFacilityResult(
  key,
  item,
  point,
  distanceM,
  radiusM
){

  const info=
    getFacilityInfo(
      key,
      item
    );


  return {

    key,

    name:
      info.name||
      SW_CHAT_FACILITY_META[
        key
      ]?.label||
      '안전시설',

    addr:
      info.addr||
      '',

    lat:
      point.lat,

    lng:
      point.lng,

    distanceM,

    radiusM,

    raw:
      item

  };

}


/* ============================================================
   특정 시설의 가장 가까운 위치 검색
   ============================================================ */

async function swFindNearestFacility(
  key,
  origin,
  options={}
){

  const meta=
    SW_CHAT_FACILITY_META[
      key
    ];


  if(!meta){

    throw new Error(
      '지원하지 않는 안전시설 종류입니다.'
    );

  }


  const subtype=

    key==='police'

      ?String(
          options
            .policeSubtype||
          ''
        )
        .trim()

      :'';


  const radii=

    meta.radii||

    [
      500,
      1500,
      …56927 tokens truncated…apped;
    }


    /* ========================================
       메인 화면 ←

       안내만 종료하고
       기존 경로 저장/복원 로직은 그대로 유지
       ======================================== */

    if(
      typeof goBack ===
      'function' &&
      !goBack._swNavWrapped
    ){

      const prev =
        goBack;


      const wrapped =
        function(...args){

          closeOriginMismatchDialog();


          if(navigationMode){

            resetNavigationState();

          }


          return prev.apply(
            this,
            args
          );

        };


      wrapped._swNavWrapped =
        true;


      window.goBack =
        wrapped;
    }
  }


  /* ==========================================================
     초기화
     ========================================================== */

  function init(){

    injectStyles();


    ensureOriginMismatchDialog();


    installWrappers();


    buildUI();


    watchRoute();


    /*
      다른 SafeWalk JS 초기화 순서에 대비
    */

    setTimeout(
      installWrappers,
      500
    );


    setTimeout(
      installWrappers,
      1500
    );


    /* ========================================
       1초마다

       - 경로 상태 확인
       - 안내 중이면 GPS 진행도 갱신
       ======================================== */

    setInterval(

      ()=>{

        watchRoute();


        if(navigationMode){

          updateNavigation(
            false
          );

        }

      },

      UPDATE_MS

    );


    /* ========================================
       route-ux가 DOM을 다시 구성하더라도
       안내 UI 복구
       ======================================== */

    const panel =
      document.getElementById(
        'routePanel'
      );


    if(
      panel &&
      typeof MutationObserver !==
      'undefined'
    ){

      let timer =
        null;


      const observer =
        new MutationObserver(
          ()=>{

            clearTimeout(
              timer
            );


            timer =
              setTimeout(
                ()=>{

                  buildUI();

                  renderButtons();

                },
                60
              );

          }
        );


      observer.observe(

        panel,

        {
          childList:true,
          subtree:true
        }

      );

    }
  }


  /* ==========================================================
     DOM 준비 후 시작
     ========================================================== */

  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(

      'DOMContentLoaded',

      init,

      {
        once:true
      }

    );

  }else{

    init();

  }

})();

