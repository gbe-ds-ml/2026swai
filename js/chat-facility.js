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

            myLat=
              lat;

            myLng=
              lng;


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
      5000
    ];


  /*
    작은 검색 반경부터 순차적으로 API를 호출한다.

    예:
    CCTV
    80m → 180m → 400m → ...

    첫 번째로 데이터가 발견된 반경 안에서
    가장 가까운 시설을 선택한다.
  */

  for(
    const radiusM
    of radii
  ){

    const bounds=

      swMakeFacilityBounds(

        origin.lat,

        origin.lng,

        radiusM

      );


    const items=

      await requestSafemapMarkers(

        key,

        bounds

      );


    const candidates=[];


    items.forEach(
      item=>{

        const point=
          parseLayerPoint(
            item
          );


        if(!point){
          return;
        }


        const distanceM=

          distM(

            origin.lat,

            origin.lng,

            point.lat,

            point.lng

          );


        /*
          API 요청 영역은 사각형이다.

          따라서 사각형 모서리 부분처럼
          실제 반경 밖의 시설은 제외한다.
        */

        if(
          distanceM>
          radiusM*
          1.03
        ){

          return;

        }


        /*
          사용자가

          "파출소"
          "지구대"
          "경찰서"

          중 하나를 구체적으로 말한 경우
          그 유형만 남긴다.
        */

        if(subtype){

          const searchText=

            swGetPoliceSearchText(
              item
            );


          if(
            !searchText
              .includes(
                subtype
              )
          ){

            return;

          }

        }


        candidates.push(

          swNormalizeFacilityResult(

            key,

            item,

            point,

            distanceM,

            radiusM

          )

        );

      }
    );


    if(
      candidates.length
    ){

      candidates.sort(

        (
          a,
          b
        )=>

          a.distanceM-
          b.distanceM

      );


      return candidates[0];

    }

  }


  return null;

}


/* ============================================================
   거리 표시
   ============================================================ */

function swFormatFacilityDistance(
  distanceM
){

  if(
    !Number.isFinite(
      distanceM
    )
  ){

    return '-';

  }


  if(
    distanceM<
    1000
  ){

    return (

      Math.max(

        1,

        Math.round(
          distanceM
        )

      )+

      'm'

    );

  }


  return (

    (
      distanceM/
      1000
    )

    .toFixed(

      distanceM>=
        10000
        ?0
        :1

    )+

    'km'

  );

}


/* ============================================================
   시설 종류 텍스트
   ============================================================ */

function swGetFacilityTypeLabel(
  result
){

  const meta=

    SW_CHAT_FACILITY_META[
      result.key
    ];


  return meta

    ?meta.icon+
      ' '+
      meta.label

    :'📍 안전시설';

}


/* ============================================================
   채팅 결과 출력
   ============================================================ */

function swAppendFacilityResults(
  results,
  command
){

  hideChatTyping();


  if(
    !Array.isArray(
      results
    )||
    !results.length
  ){

    appendChatMessage(

      'bot',

      '현재 위치 주변에서 요청한 안전시설을 찾지 못했습니다. 생활안전지도 데이터 제공 범위에 따라 일부 지역은 결과가 없을 수 있습니다.',

      true

    );

    return;

  }


  /*
    기존 SafeWalk chat.js의
    길찾기 결과 카드 디자인을 그대로 사용한다.
  */

  const bubble=

    appendChatRouteBubble();


  if(!bubble){
    return;
  }


  const lead=

    document.createElement(
      'div'
    );


  lead.className=
    'chat-route-lead';


  if(
    results.length===
    1
  ){

    lead.textContent=

      '현재 위치에서 가장 가까운 '+

      SW_CHAT_FACILITY_META[
        results[0].key
      ].label+

      '입니다.';

  }

  else{

    lead.textContent=
      '현재 위치 기준 가까운 안전시설을 종류별로 확인했습니다.';

  }


  bubble.appendChild(
    lead
  );


  const sub=

    document.createElement(
      'div'
    );


  sub.className=
    'chat-route-sub';


  sub.textContent=
    '거리는 GPS 좌표 기준 직선거리입니다. 실제 보행거리는 “여기로 길찾기”에서 확인해 주세요.';


  bubble.appendChild(
    sub
  );


  results.forEach(
    (
      result,
      index
    )=>{

      /* ── 시설 정보 카드 ── */

      const card=

        document.createElement(
          'div'
        );


      card.className=
        'chat-route-summary';


      card.style.marginTop=

        index===0

          ?'10px'

          :'12px';


      /* 시설 종류 */

      const typeLabel=

        document.createElement(
          'div'
        );


      typeLabel.className=
        'label';


      typeLabel.textContent=

        swGetFacilityTypeLabel(
          result
        );


      /* 시설명 */

      const name=

        document.createElement(
          'div'
        );


      name.className=
        'value';


      name.textContent=
        result.name;


      /* 거리 */

      const distanceLabel=

        document.createElement(
          'div'
        );


      distanceLabel.className=
        'label';


      distanceLabel.textContent=
        '직선거리';


      const distance=

        document.createElement(
          'div'
        );


      distance.className=
        'value';


      distance.textContent=

        swFormatFacilityDistance(
          result.distanceM
        );


      card.append(

        typeLabel,

        name,

        distanceLabel,

        distance

      );


      /* 주소 */

      if(
        result.addr
      ){

        const addrLabel=

          document.createElement(
            'div'
          );


        addrLabel.className=
          'label';


        addrLabel.textContent=
          '주소';


        const addr=

          document.createElement(
            'div'
          );


        addr.className=
          'value';


        addr.textContent=
          result.addr;


        card.append(

          addrLabel,

          addr

        );

      }


      bubble.appendChild(
        card
      );


      /* ── 버튼 ── */

      const actions=

        document.createElement(
          'div'
        );


      actions.className=
        'chat-route-actions';


      actions.style.marginTop=
        '7px';


      /* 지도에서 보기 */

      const mapBtn=

        document.createElement(
          'button'
        );


      mapBtn.type=
        'button';


      mapBtn.className=
        'chat-route-btn secondary';


      mapBtn.textContent=
        '지도에서 보기';


      mapBtn.addEventListener(

        'click',

        ()=>

          swShowFacilityOnMap(
            result
          )

      );


      /* 길찾기 */

      const routeBtn=

        document.createElement(
          'button'
        );


      routeBtn.type=
        'button';


      routeBtn.className=
        'chat-route-btn primary';


      routeBtn.textContent=
        '여기로 길찾기';


      routeBtn.addEventListener(

        'click',

        ()=>

          swRouteToFacility(
            result
          )

      );


      actions.append(

        mapBtn,

        routeBtn

      );


      bubble.appendChild(
        actions
      );

    }
  );


  scrollChatToBottom();

}


/* ============================================================
   시설 미리보기 마커 제거
   ============================================================ */

function swClearFacilityPreview(){

  if(
    swFacilityPreviewMarker&&
    map
  ){

    try{

      if(

        map.hasLayer(
          swFacilityPreviewMarker
        )

      ){

        map.removeLayer(
          swFacilityPreviewMarker
        );

      }

    }catch(e){}

  }


  swFacilityPreviewMarker=
    null;

}


/* ============================================================
   지도에서 보기
   ============================================================ */

function swShowFacilityOnMap(
  result
){

  if(!map){

    appendChatMessage(

      'bot',

      '지도가 아직 준비되지 않았습니다.',

      true

    );

    return;

  }


  swClearFacilityPreview();


  /*
    기존 layers.js의 mkMarker()를 사용하므로
    SafeWalk 기존 시설 마커와 동일한 팝업을 사용한다.
  */

  try{

    swFacilityPreviewMarker=

      mkMarker(

        result.key,

        result.lat,

        result.lng,

        result.raw

      )

      .addTo(
        map
      );

  }

  catch(error){

    console.warn(

      '안전시설 미리보기 마커 생성 실패:',

      error

    );


    swFacilityPreviewMarker=

      L.marker(

        [
          result.lat,
          result.lng
        ]

      )

      .addTo(
        map
      );

  }


  /*
    CCTV처럼 밀집된 시설은
    충분히 확대해서 보여준다.
  */

  const zoom=

    Math.max(

      map.getZoom(),

      result.key===
        'cctv'

        ?17

        :16

    );


  closeChatPanel();


  map.flyTo(

    [
      result.lat,
      result.lng
    ],

    zoom,

    {
      duration:.8
    }

  );


  setTimeout(

    ()=>{

      if(

        swFacilityPreviewMarker&&
        map&&
        map.hasLayer(
          swFacilityPreviewMarker
        )

      ){

        try{

          swFacilityPreviewMarker
            .openPopup();

        }catch(e){}

      }

    },

    850

  );

}


/* ============================================================
   시설까지 길찾기
   ============================================================ */

function swRouteToFacility(
  result
){

  if(!map){

    appendChatMessage(

      'bot',

      '지도가 아직 준비되지 않았습니다.',

      true

    );

    return;

  }


  /*
    기존 SafeWalk 정책:
    CPTED 전용 화면에서는 일반 보행 길찾기 미지원
  */

  if(
    grp===
    'cpted'
  ){

    appendChatMessage(

      'bot',

      'CPTED 화면에서는 일반 보행 길찾기를 실행할 수 없습니다. 어린이·여성·청소년·노인 안전지도로 이동한 뒤 다시 시도해 주세요.',

      true

    );

    return;

  }


  if(

    !Number.isFinite(
      myLat
    )||

    !Number.isFinite(
      myLng
    )

  ){

    appendChatMessage(

      'bot',

      '현재 위치를 확인하지 못했습니다. 위치 권한을 허용한 뒤 다시 시도해 주세요.',

      true

    );

    return;

  }


  swClearFacilityPreview();


  /*
    기존 SafeWalk 길찾기 시스템의
    출발지 / 도착지를 직접 설정한다.
  */

  routeOrigin={

    lat:
      myLat,

    lng:
      myLng,

    label:
      '📍 현재 위치',

    addr:
      (
        document
          .getElementById(
            'locTxt'
          )
          ?.textContent||
        ''
      )
      .trim(),

    src:
      'gps'

  };


  routeDest={

    lat:
      result.lat,

    lng:
      result.lng,

    label:
      result.name,

    addr:
      result.addr||
      '',

    src:
      'safemap-nearest-facility'

  };


  activeSlot=
    'dest';


  updateSlotUI();


  appendChatMessage(

    'bot',

    result.name+
    '까지 SafeWalk 보행 경로를 계산합니다.'

  );


  closeChatPanel();


  setTimeout(

    ()=>
      runSearchRoute(),

    120

  );

}


/* ============================================================
   안전시설 검색 실행
   ============================================================ */

async function swBeginFacilityCommand(
  command
){

  if(

    !command||
    !command.keys||
    !command.keys.length

  ){

    return;

  }


  /*
    layers.js가 정상적으로 로드되었는지 확인
  */

  if(

    typeof requestSafemapMarkers!==
    'function'

  ){

    hideChatTyping();


    appendChatMessage(

      'bot',

      '생활안전지도 시설 조회 기능을 사용할 수 없습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.',

      true

    );


    return;

  }


  const token=
    ++swFacilityRequestToken;


  try{

    let origin;


    /*
      반드시 실제 위치를 다시 확인한다.
    */

    try{

      origin=

        await swResolveFacilityOrigin();

    }

    catch(
      locationError
    ){

      if(

        token!==
        swFacilityRequestToken

      ){

        return;

      }


      hideChatTyping();


      appendChatMessage(

        'bot',

        '가까운 안전시설을 찾으려면 실제 현재 위치가 필요합니다. 브라우저의 위치 권한을 허용한 뒤 다시 질문해 주세요.',

        true

      );


      return;

    }


    if(

      token!==
      swFacilityRequestToken

    ){

      return;

    }


    /*
      예:
      "내 주변 안전시설"

      → 경찰
      → 비상벨
      → 지킴이집
      → CCTV

      네 종류를 병렬 조회
    */

    const settled=

      await Promise.allSettled(

        command.keys.map(

          key=>

            swFindNearestFacility(

              key,

              origin,

              {

                policeSubtype:

                  command
                    .policeSubtype

              }

            )

        )

      );


    if(

      token!==
      swFacilityRequestToken

    ){

      return;

    }


    /*
      정상적으로 발견된 시설만 추출
    */

    const results=

      settled

        .filter(

          item=>

            item.status===
              'fulfilled'&&

            item.value

        )

        .map(

          item=>
            item.value

        )

        /*
          여러 시설인 경우
          실제 가까운 순으로 정렬
        */

        .sort(

          (
            a,
            b
          )=>

            a.distanceM-
            b.distanceM

        );


    swAppendFacilityResults(

      results,

      command

    );

  }

  catch(error){

    console.error(

      '주변 안전시설 조회 오류:',

      error

    );


    if(

      token!==
      swFacilityRequestToken

    ){

      return;

    }


    hideChatTyping();


    appendChatMessage(

      'bot',

      '생활안전지도에서 주변 시설을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.',

      true

    );

  }

}


/* ============================================================
   기존 sendChatMessage 확장
   ============================================================ */

/*
  기존 chat.js의 sendChatMessage()를 저장한다.

  시설 검색 질문이 아니면
  기존 함수에 그대로 넘긴다.

  따라서 기존 기능:

  - Workers AI
  - 일반 안전 질문
  - 자연어 길찾기
  - VWorld 후보 선택
  - 경로 설명

  모두 그대로 유지된다.
*/

const swBaseSendChatMessage=
  sendChatMessage;


/*
  기존 전역 함수를 새 함수로 교체
*/

sendChatMessage=

  async function(){


    if(
      chatBusy
    ){

      return;

    }


    const input=

      document
        .getElementById(
          'chatInput'
        );


    const message=

      String(

        input
          ?input.value
          :''

      )

      .trim();


    /*
      빈 메시지나 글자수 초과는
      기존 함수가 처리한다.
    */

    if(

      !message||

      message.length>
        CHAT_MAX_LENGTH

    ){

      return swBaseSendChatMessage();

    }


    /*
      주변 안전시설 질문인지 확인
    */

    const facilityCommand=

      swParseNearbyFacilityCommand(
        message
      );


    /*
      안전시설 위치 질문이 아니면
      기존 chat.js로 그대로 전달
    */

    if(
      !facilityCommand
    ){

      return swBaseSendChatMessage();

    }


    /*
      여기부터는 안전시설 직접 조회
    */

    appendChatMessage(

      'user',

      message

    );


    if(input){

      input.value='';

      input.style.height=
        '44px';

    }


    if(

      typeof dismissMobileKeyboard===
      'function'

    ){

      dismissMobileKeyboard();

    }


    setChatBusy(
      true
    );


    showChatTyping();


    try{

      await swBeginFacilityCommand(
        facilityCommand
      );

    }

    finally{

      setChatBusy(
        false
      );


      if(

        typeof syncViewportChrome===
        'function'

      ){

        requestAnimationFrame(
          syncViewportChrome
        );

      }

    }

  };


/* ============================================================
   빠른 질문 버튼 추가
   ============================================================ */

function swAddFacilityQuickButton(){

  const quick=

    document.querySelector(
      '#chatPanel .chat-quick'
    );


  if(

    !quick||

    quick.querySelector(
      '[data-sw-facility-quick="1"]'
    )

  ){

    return;

  }


  const btn=

    document.createElement(
      'button'
    );


  btn.type=
    'button';


  btn.className=
    'chat-quick-btn';


  btn.dataset
    .swFacilityQuick=
    '1';


  btn.textContent=
    '가까운 안전시설';


  btn.addEventListener(

    'click',

    ()=>{

      askChatQuick(
        '내 주변 안전시설 알려줘'
      );

    }

  );


  /*
    가장 앞쪽에 추가
  */

  quick.prepend(
    btn
  );

}


/* ============================================================
   DOM 준비 후 빠른 질문 버튼 생성
   ============================================================ */

if(

  document.readyState===
  'loading'

){

  document.addEventListener(

    'DOMContentLoaded',

    swAddFacilityQuickButton,

    {
      once:true
    }

  );

}

else{

  swAddFacilityQuickButton();

}
