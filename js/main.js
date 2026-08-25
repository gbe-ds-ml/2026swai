/* ============================================================
   SafeWalk v2.5.2 — main.js
   앱 시작점: 인트로 화면 버튼, 화면 전환, 초기화.

   [v2.5.2]
   - 모바일 최초 접속/새로고침 시 인트로를 항상 맨 위에서 시작
   - #intro 자체의 scrollTop을 직접 초기화
   - 모바일에서는 intro의 세로 중앙 정렬을 해제
   - 브라우저 스크롤 위치 자동 복원 방지
   - bfcache / 뒤로가기 / 이미지 로딩 후 위치 재보정
   ============================================================ */


/* ============================================================
   모바일 인트로 스크롤 보정
   ============================================================ */

/*
  브라우저가 새로고침이나 뒤로가기 시
  이전 스크롤 위치를 자동 복원하지 않도록 한다.
*/
if(
  'scrollRestoration' in history
){
  history.scrollRestoration='manual';
}


/*
  모바일 또는 터치 기기인지 확인
*/
function isMobileIntroLayout(){

  return window.matchMedia(
    '(max-width:768px), (pointer:coarse)'
  ).matches;

}


/*
  모바일에서는 #intro의 중앙 정렬을 해제한다.

  기존 CSS:
  justify-content:center

  모바일:
  justify-content:flex-start
*/
function prepareIntroTopLayout(){

  const intro=
    document.getElementById('intro');

  const content=
    document.querySelector(
      '#intro .intro-content'
    );


  if(!intro){
    return;
  }


  if(
    isMobileIntroLayout()
  ){

    /*
      콘텐츠가 화면보다 길어져도
      항상 최상단부터 배치
    */
    intro.style.justifyContent=
      'flex-start';


    if(content){

      content.style.flex=
        '0 0 auto';


      /*
        노치 / Dynamic Island 등
        상단 safe-area 확보
      */
      content.style.paddingTop=
        'max(18px, env(safe-area-inset-top, 0px))';

    }

  }

  else{

    /*
      PC에서는 기존 중앙 배치 유지
    */
    intro.style.justifyContent=
      'center';


    if(content){

      content.style.flex='';

      content.style.paddingTop='';

    }

  }

}


/*
  실제 스크롤 주체인 #intro를 직접 맨 위로 이동
*/
function resetIntroScrollToTop(){

  const intro=
    document.getElementById('intro');


  if(!intro){
    return;
  }


  /*
    #intro 자체
  */
  intro.scrollTop=0;
  intro.scrollLeft=0;


  try{

    intro.scrollTo({
      top:0,
      left:0,
      behavior:'auto'
    });

  }

  catch(e){}


  /*
    혹시 브라우저 window 쪽에
    스크롤 값이 남아 있는 경우도 함께 초기화
  */
  window.scrollTo(
    0,
    0
  );


  document.documentElement.scrollTop=0;

  document.body.scrollTop=0;

}


/*
  모바일 브라우저는
  DOM → 폰트 → 이미지 → visual viewport 순으로
  레이아웃이 조금씩 다시 계산될 수 있다.

  따라서 최초 진입 때 짧게 여러 번 보정한다.
*/
function forceIntroToTop(){

  prepareIntroTopLayout();

  resetIntroScrollToTop();


  requestAnimationFrame(
    ()=>{

      resetIntroScrollToTop();


      requestAnimationFrame(
        resetIntroScrollToTop
      );

    }
  );


  setTimeout(
    resetIntroScrollToTop,
    80
  );


  setTimeout(
    resetIntroScrollToTop,
    250
  );

}


/*
  defer 스크립트이므로 이 시점에는
  이미 #intro DOM이 생성되어 있다.

  DOMContentLoaded 전에 모바일 정렬부터 미리 변경한다.
*/
prepareIntroTopLayout();


/* ============================================================
   인트로
   ============================================================ */

function toggleRouteGuide(){

  const guide=
    document.getElementById(
      'routeGuide'
    );


  if(!guide){
    return;
  }


  guide.classList.toggle(
    'open'
  );


  const btn=
    guide.querySelector(
      '.route-guide-more'
    );


  if(btn){

    btn.textContent=

      guide.classList.contains(
        'open'
      )

        ?'점수 계산 접기'

        :'점수 계산 자세히 보기';

  }

}


/* ============================================================
   사용자 유형 선택
   ============================================================ */

function pick(el){

  document
    .querySelectorAll(
      '.age-card'
    )
    .forEach(
      c=>
        c.classList.remove(
          'selected'
        )
    );


  el.classList.add(
    'selected'
  );


  grp=
    el.dataset.group;


  document
    .getElementById(
      'startBtn'
    )
    .classList.add(
      'on'
    );


  /*
    위치·중심 타일을 미리 받아
    지도 진입 속도 개선 — map.js
  */
  warmupLocation();

}


/* ============================================================
   Leaflet 확인
   ============================================================ */

/*
  Leaflet CDN 로드에 실패한 경우
  지도를 시작하지 않고 안내
*/
function ensureLeafletReady(){

  if(
    typeof L!==
    'undefined'
  ){

    return true;

  }


  showRouteToast(
    '지도 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.'
  );


  return false;

}


/* ============================================================
   일반 안전지도 시작
   ============================================================ */

function start(){

  if(!grp){
    return;
  }


  if(
    !ensureLeafletReady()
  ){

    return;

  }


  document
    .getElementById(
      'intro'
    )
    .classList.add(
      'out'
    );


  document
    .getElementById(
      'map-screen'
    )
    .classList.add(
      'show'
    );


  setChromeVisible(
    true
  );


  updateRouteButtonVisibility();


  initMap();

}


/* ============================================================
   CPTED 지도 시작
   ============================================================ */

function startCpted(){

  if(
    !ensureLeafletReady()
  ){

    return;

  }


  grp=
    'cpted';


  document
    .querySelectorAll(
      '.age-card'
    )
    .forEach(
      c=>
        c.classList.remove(
          'selected'
        )
    );


  document
    .getElementById(
      'startBtn'
    )
    .classList.remove(
      'on'
    );


  document
    .getElementById(
      'intro'
    )
    .classList.add(
      'out'
    );


  document
    .getElementById(
      'map-screen'
    )
    .classList.add(
      'show'
    );


  setChromeVisible(
    true
  );


  updateRouteButtonVisibility();


  clearRoute();


  initMap();

}


/* ============================================================
   지도 → 메인 화면
   ============================================================ */

function goBack(){

  document.body
    .classList.remove(
      'route-panel-suppressed'
    );


  document
    .getElementById(
      'intro'
    )
    .classList.remove(
      'out'
    );


  document
    .getElementById(
      'map-screen'
    )
    .classList.remove(
      'show'
    );


  const sheet=
    document.getElementById(
      'sheet'
    );


  if(sheet){

    applyLayerSheetState(
      false,
      false
    );

  }


  setChromeVisible(
    false
  );


  clearRoute();


  cptedTapRequestToken++;


  clearCptedGuide(
    true
  );


  /*
    진행 중이던 AI 길찾기 대화 흐름 무효화
  */
  chatRouteRequestToken++;

  chatRouteFlow=null;


  disableOldChatRouteControls();


  /*
    v2.1 기능 정리

    안심 타이머는 귀갓길 보호가 목적이므로
    여기서는 끄지 않는다.
  */
  resetAuditFeature();

  resetHavenFeature();

  closeEmergencyPanel();

  stopSiren();


  if(watchId){

    navigator.geolocation
      .clearWatch(
        watchId
      );


    watchId=null;

  }


  mapDomCleanups
    .forEach(
      fn=>fn()
    );


  mapDomCleanups=[];


  if(map){

    map.remove();

    map=null;

  }


  myMark=null;


  layers={};

  wmsTiles={};

  chipOn={};

  counts={};


  markerCache={};

  markerFetchBounds={};

  markerFetchZoom={};

  markerFetchTruncated={};


  layerMinZoom={};


  safeFacilityPoints=[];

  safeFacilitySeen=
    new Set();


  suppressMoveFetch=false;

  zoomBlocked=false;


  closeSearchPanel();


  routeOrigin=null;

  routeDest=null;

  activeSlot='dest';

  routeSnapNote='';


  updateSlotUI();


  const spr=
    document.getElementById(
      'spResults'
    );


  if(spr){

    spr.innerHTML='';

  }


  const spi=
    document.getElementById(
      'spInput'
    );


  if(spi){

    spi.value='';

  }


  /*
    ★ 지도에서 메인으로 돌아왔을 때도
    항상 맨 위부터 표시
  */
  forceIntroToTop();

}


/* ============================================================
   부팅
   ============================================================ */

/*
  defer 스크립트는 DOMContentLoaded 직전에
  선언 순서대로 실행된다.

  Leaflet CDN이 실패해도
  인트로 화면 자체는 정상적으로 표시한다.
*/
document.addEventListener(
  'DOMContentLoaded',
  function(){


    /*
      모바일 인트로를 먼저 최상단으로 고정
    */
    forceIntroToTop();


    bindViewportSync();


    bindSearchInput();


    bindChatInput();


    const ver=
      document.getElementById(
        'versionTag'
      );


    if(ver){

      ver.textContent=
        APP_VERSION;

    }


    /*
      진행 중이던 안심 타이머 복원
    */
    restoreSafeTimer();


    document
      .getElementById(
        'loading'
      )
      .classList.add(
        'hide'
      );


    /*
      로딩 화면이 사라지면서 발생하는
      레이아웃 재계산 이후 다시 최상단 보정
    */
    requestAnimationFrame(
      forceIntroToTop
    );

  }
);


/* ============================================================
   페이지 전체 로딩 완료

   SafeWalk 로고 이미지와 웹폰트의 크기가 확정된 뒤
   마지막으로 다시 한 번 최상단을 맞춘다.
   ============================================================ */

window.addEventListener(
  'load',
  function(){


    const intro=
      document.getElementById(
        'intro'
      );


    if(
      intro &&
      !intro.classList.contains(
        'out'
      )
    ){

      forceIntroToTop();

    }

  }
);


/* ============================================================
   모바일 뒤로가기 / bfcache 복원
   ============================================================ */

window.addEventListener(
  'pageshow',
  function(){


    const intro=
      document.getElementById(
        'intro'
      );


    if(
      intro &&
      !intro.classList.contains(
        'out'
      )
    ){

      forceIntroToTop();

    }

  }
);


/* ============================================================
   화면 방향 변경

   가로 ↔ 세로 회전 시
   모바일/PC 레이아웃 조건만 다시 계산한다.

   사용자가 직접 스크롤한 상태를 계속 0으로 만들지 않도록
   일반 resize 이벤트에서는 scrollTop을 강제하지 않는다.
   ============================================================ */

window.addEventListener(
  'orientationchange',
  function(){

    setTimeout(
      ()=>{

        prepareIntroTopLayout();


        const intro=
          document.getElementById(
            'intro'
          );


        if(
          intro &&
          !intro.classList.contains(
            'out'
          )
        ){

          resetIntroScrollToTop();

        }

      },
      120
    );

  }
);
