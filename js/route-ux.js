/* ============================================================
   SafeWalk v2.8.0 — route-ux.js

   경로 UX + 상태 유지

   주요 기능
   ------------------------------------------------------------
   1. 경로 패널 X
      → 경로 삭제 X
      → 패널만 숨김

   2. 상세 점수 보기 / 길찾기 취소
      → 50 : 50 버튼

   3. 길찾기 취소
      → 이 버튼으로만 실제 길찾기 종료

   4. sessionStorage 경로 유지
      → 다른 사이트 방문 후 돌아오기
      → 새로고침
      → 같은 탭에서 경로 자동 복원

   5. 모바일 Long Press 개선
      → 새 출발지 선택 시 이전 목적지 폐기
      → 새 목적지 직접 선택 시 현재 위치 자동 출발

   6. PC
      → 지도 우클릭으로 출발지 / 목적지 지정

   주의
   ------------------------------------------------------------
   이 파일은 반드시 main.js보다 나중에 로드한다.
   ============================================================ */


/* ============================================================
   설정
   ============================================================ */

const SW_ROUTE_STATE_KEY =
  'safewalk_active_route_v1';


let swRouteRestoring =
  false;


let swRouteRestoreStarted =
  false;


/*
  Long Press 입력 흐름

  none
  origin-await-destination
  destination-await-origin
*/
let swRouteDraftMode =
  'none';


/* ============================================================
   Endpoint 데이터 정리
   ============================================================ */

function swCleanRoutePoint(point){

  if(!point){
    return null;
  }


  const lat =
    Number(point.lat);


  const lng =
    Number(point.lng);


  if(
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ){
    return null;
  }


  return {

    lat,

    lng,

    label:
      String(
        point.label ||
        '지도 선택 지점'
      )
      .slice(
        0,
        120
      ),

    addr:
      String(
        point.addr ||
        ''
      )
      .slice(
        0,
        200
      ),

    src:
      String(
        point.src ||
        ''
      )
      .slice(
        0,
        40
      )

  };

}


/* ============================================================
   sessionStorage
   ============================================================ */

function swReadRouteState(){

  try{

    const raw =
      sessionStorage.getItem(
        SW_ROUTE_STATE_KEY
      );


    if(!raw){
      return null;
    }


    const data =
      JSON.parse(raw);


    const origin =
      swCleanRoutePoint(
        data.origin
      );


    const destination =
      swCleanRoutePoint(
        data.destination
      );


    if(
      !origin ||
      !destination
    ){

      sessionStorage.removeItem(
        SW_ROUTE_STATE_KEY
      );


      return null;

    }


    const group =
      String(
        data.group ||
        ''
      );


    if(
      typeof GROUP !== 'undefined' &&
      !GROUP[group]
    ){

      sessionStorage.removeItem(
        SW_ROUTE_STATE_KEY
      );


      return null;

    }


    return {

      active:
        true,

      group,

      origin,

      destination,

      panelHidden:
        Boolean(
          data.panelHidden
        ),

      savedAt:
        Number(
          data.savedAt
        ) || Date.now()

    };

  }

  catch(error){

    console.warn(
      '[SafeWalk] 경로 상태 읽기 실패:',
      error
    );


    return null;

  }

}


function swSaveRouteState(
  panelHidden
){

  if(
    !routeOrigin ||
    !routeDest
  ){
    return;
  }


  const origin =
    swCleanRoutePoint(
      routeOrigin
    );


  const destination =
    swCleanRoutePoint(
      routeDest
    );


  if(
    !origin ||
    !destination
  ){
    return;
  }


  try{

    sessionStorage.setItem(

      SW_ROUTE_STATE_KEY,

      JSON.stringify({

        active:
          true,

        group:
          grp,

        origin,

        destination,

        panelHidden:
          Boolean(
            panelHidden
          ),

        savedAt:
          Date.now()

      })

    );

  }

  catch(error){

    console.warn(
      '[SafeWalk] 경로 상태 저장 실패:',
      error
    );

  }

}


function swDeleteRouteState(){

  try{

    sessionStorage.removeItem(
      SW_ROUTE_STATE_KEY
    );

  }

  catch(error){}

}


/* ============================================================
   경로가 실제로 존재하는지
   ============================================================ */

function swHasActiveRoute(){

  return Boolean(
    routeOrigin &&
    routeDest
  );

}


/* ============================================================
   스타일
   ============================================================ */

function swInjectRouteUxStyles(){

  if(
    document.getElementById(
      'safeWalkRouteUxStyles'
    )
  ){
    return;
  }


  const style =
    document.createElement(
      'style'
    );


  style.id =
    'safeWalkRouteUxStyles';


  style.textContent = `

    /* ========================================================
       상세 점수 / 길찾기 취소
       ======================================================== */

    .sw-route-action-row{

      display:grid;

      grid-template-columns:
        minmax(0,1fr)
        minmax(0,1fr);

      gap:7px;

      width:100%;

      margin-top:7px;

    }


    /*
      기존 CSS에서는 PC에서 상세 버튼이 display:none.
      SafeWalk v2.8에서는 PC/모바일 모두 표시한다.
    */

    .sw-route-action-row
    .route-details-toggle{

      display:flex !important;

      align-items:center;

      justify-content:center;

      width:100% !important;

      min-width:0;

      min-height:44px;

      margin-top:0 !important;

      padding:8px 6px;

      border:0;

      border-radius:10px;

      background:#eff6ff;

      color:#1d4ed8;

      font-family:
        'Noto Sans KR',
        sans-serif;

      font-size:11px;

      font-weight:800;

      cursor:pointer;

      touch-action:manipulation;

      -webkit-user-select:none;

      user-select:none;

      -webkit-appearance:none;

      appearance:none;

    }


    .sw-route-action-row
    .route-details-toggle:active{

      background:#dbeafe;

    }


    /* 진짜 길찾기 종료 버튼 */

    .sw-route-cancel-btn{

      display:flex;

      align-items:center;

      justify-content:center;

      width:100%;

      min-width:0;

      min-height:44px;

      padding:8px 6px;

      border:1px solid #fecdd3;

      border-radius:10px;

      background:#fff1f2;

      color:#be123c;

      font-family:
        'Noto Sans KR',
        sans-serif;

      font-size:11px;

      font-weight:900;

      cursor:pointer;

      touch-action:manipulation;

      -webkit-user-select:none;

      user-select:none;

      -webkit-appearance:none;

      appearance:none;

    }


    .sw-route-cancel-btn:active{

      background:#ffe4e6;

    }


    .sw-route-action-row
    button:focus-visible{

      outline:
        3px solid rgba(37,99,235,.22);

      outline-offset:
        2px;

    }


    /*
      상세 영역은 PC에서도
      접힌 상태를 정상적으로 지원한다.
    */

    .route-details-box:not(.open)
    .route-details{

      display:none !important;

    }


    .route-details-box.open
    .route-details{

      display:block;

    }


    @media (max-width:480px){

      .sw-route-action-row{

        gap:6px;

      }


      .sw-route-action-row
      .route-details-toggle,
      .sw-route-cancel-btn{

        font-size:10.5px;

      }

    }

  `;


  document.head.appendChild(
    style
  );

}


/* ============================================================
   상세 점수는 PC/모바일 모두 기본 접힘

   기존 ui.js:
   PC = 기본 펼침
   모바일 = 기본 접힘

   이번 버전:
   모두 기본 접힘
   ============================================================ */

if(
  typeof resetRouteDetails ===
  'function'
){

  resetRouteDetails =
    function(){

      setRouteDetailsOpen(
        false
      );

    };

}


/* ============================================================
   경로 패널 X

   경로를 지우지 않고 패널만 숨긴다.
   ============================================================ */

function swHideRoutePanel(){

  const panel =
    document.getElementById(
      'routePanel'
    );


  if(!panel){
    return;
  }


  panel.classList.remove(
    'show'
  );


  document.body.classList.remove(
    'route-visible'
  );


  document.body.classList.remove(
    'route-panel-suppressed'
  );


  if(
    typeof syncRoutePanelWithSheet ===
    'function'
  ){

    syncRoutePanelWithSheet();

  }


  if(
    swHasActiveRoute()
  ){

    swSaveRouteState(
      true
    );


    showRouteToast(
      '경로는 지도에 그대로 유지됩니다.'
    );

  }

}


/* ============================================================
   숨겨둔 경로 패널 다시 열기
   ============================================================ */

function swShowRoutePanel(){

  if(
    !swHasActiveRoute()
  ){
    return false;
  }


  const panel =
    document.getElementById(
      'routePanel'
    );


  if(!panel){
    return false;
  }


  document.body.classList.remove(
    'route-panel-suppressed'
  );


  panel.classList.add(
    'show'
  );


  document.body.classList.add(
    'route-visible'
  );


  if(
    typeof syncRoutePanelWithSheet ===
    'function'
  ){

    syncRoutePanelWithSheet();

  }


  swSaveRouteState(
    false
  );


  return true;

}


/* ============================================================
   진짜 길찾기 취소

   이 함수만 sessionStorage까지 삭제한다.
   ============================================================ */

function swCancelActiveRoute(){

  /*
    진행 중 계산 / 경로선 / 마커 제거
  */

  if(
    typeof clearRoute ===
    'function'
  ){

    clearRoute(
      true
    );

  }


  /*
    출발지·목적지 실제 데이터 삭제
  */

  routeOrigin =
    null;


  routeDest =
    null;


  activeSlot =
    'dest';


  routeSnapNote =
    '';


  swRouteDraftMode =
    'none';


  if(
    typeof updateSlotUI ===
    'function'
  ){

    updateSlotUI();

  }


  if(
    typeof closeSearchPanel ===
    'function'
  ){

    closeSearchPanel();

  }


  swDeleteRouteState();


  showRouteToast(
    '길찾기를 종료했습니다.'
  );

}


window.swCancelActiveRoute =
  swCancelActiveRoute;


window.swHideRoutePanel =
  swHideRoutePanel;


/* ============================================================
   경로 패널 DOM 수정

   기존:
   [상세 점수 보기]

   변경:
   [상세 점수 보기] [길찾기 취소]
   ============================================================ */

function swPrepareRoutePanelUi(){

  const detailsButton =
    document.getElementById(
      'routeDetailsToggle'
    );


  const box =
    document.getElementById(
      'routeDetailsBox'
    );


  if(
    detailsButton &&
    box &&
    !document.getElementById(
      'swRouteCancelBtn'
    )
  ){

    const row =
      document.createElement(
        'div'
      );


    row.className =
      'sw-route-action-row';


    /*
      기존 상세 버튼 위치에
      action row를 삽입
    */

    detailsButton
      .parentNode
      .insertBefore(
        row,
        detailsButton
      );


    row.appendChild(
      detailsButton
    );


    const cancelButton =
      document.createElement(
        'button'
      );


    cancelButton.type =
      'button';


    cancelButton.id =
      'swRouteCancelBtn';


    cancelButton.className =
      'sw-route-cancel-btn';


    cancelButton.textContent =
      '길찾기 취소';


    cancelButton.setAttribute(
      'aria-label',
      '현재 길찾기 종료'
    );


    cancelButton.addEventListener(

      'click',

      event=>{

        event.preventDefault();

        event.stopPropagation();


        swCancelActiveRoute();

      }

    );


    row.appendChild(
      cancelButton
    );

  }


  /* ========================================================
     기존 X onclick="clearRoute()" 제거
     ======================================================== */

  const closeButton =
    document.querySelector(
      '#routePanel .route-close'
    );


  if(
    closeButton &&
    closeButton.dataset.swRouteUxBound !==
      '1'
  ){

    closeButton.dataset.swRouteUxBound =
      '1';


    /*
      index.html의
      onclick="clearRoute()"
      제거
    */

    closeButton.removeAttribute(
      'onclick'
    );


    closeButton.setAttribute(
      'aria-label',
      '경로 정보 접기'
    );


    closeButton.addEventListener(

      'click',

      event=>{

        event.preventDefault();

        event.stopPropagation();


        swHideRoutePanel();

      }

    );

  }


  /*
    최초에는 상세 점수를 접는다.
  */

  if(
    typeof setRouteDetailsOpen ===
    'function'
  ){

    setRouteDetailsOpen(
      false
    );

  }

}


/* ============================================================
   runSearchRoute 확장

   모든 방식의 길찾기:
   - 검색
   - AI
   - 지도 선택
   - Long Press

   최종적으로 이 함수를 통과하므로
   여기서 상태를 저장한다.
   ============================================================ */

if(
  typeof runSearchRoute ===
  'function'
){

  const swBaseRunSearchRoute =
    runSearchRoute;


  runSearchRoute =
    async function(){

      if(
        routeOrigin &&
        routeDest
      ){

        /*
          새로운 경로를 정상적으로 실행하면
          이전 "패널 숨김" 상태는 해제한다.

          단, 복원 중에는 기존 상태를 유지.
        */

        if(
          !swRouteRestoring
        ){

          swSaveRouteState(
            false
          );

        }

      }


      const result =
        await swBaseRunSearchRoute.apply(
          this,
          arguments
        );


      if(
        routeOrigin &&
        routeDest
      ){

        if(
          !swRouteRestoring
        ){

          swSaveRouteState(
            false
          );

        }

      }


      return result;

    };

}


/* ============================================================
   상단 "길찾기" 버튼

   경로 패널을 X로 숨겨둔 상태라면:
   → 새 검색창 X
   → 기존 경로 패널 다시 표시
   ============================================================ */

if(
  typeof startRoutePick ===
  'function'
){

  const swBaseStartRoutePick =
    startRoutePick;


  startRoutePick =
    function(){

      const panel =
        document.getElementById(
          'routePanel'
        );


      /*
        기존 경로는 살아 있는데
        패널만 숨겨져 있는 경우
      */

      if(
        swHasActiveRoute() &&
        panel &&
        !panel.classList.contains(
          'show'
        )
      ){

        swShowRoutePanel();

        return;

      }


      return swBaseStartRoutePick.apply(
        this,
        arguments
      );

    };

}


/* ============================================================
   Long Press 새 경로 처리

   기존 문제:
   출발지만 새로 선택해도 이전 목적지가 남음
   목적지만 새로 선택해도 이전 출발지가 남음

   변경:
   새 경로 입력 흐름으로 취급
   ============================================================ */

function swClearPreviousRouteForDraft(){

  if(
    typeof clearRoute ===
    'function'
  ){

    clearRoute(
      true
    );

  }


  routeSnapNote =
    '';


  /*
    기존 완료 경로는
    새로운 경로 작성이 시작된 순간 폐기
  */

  swDeleteRouteState();

}


/* ============================================================
   출발지 Long Press
   ============================================================ */

if(
  typeof setSafeWalkLongPressOrigin ===
  'function'
){

  setSafeWalkLongPressOrigin =
    async function(latlng){

      if(
        !latlng ||
        !Number.isFinite(latlng.lat) ||
        !Number.isFinite(latlng.lng)
      ){
        return;
      }


      if(map){

        map.closePopup();

      }


      /*
        목적지를 먼저 지정했는데
        GPS가 실패해서 출발지를 기다리던 경우만
        이번 목적지를 보존한다.
      */

      const pendingDestination =

        (
          swRouteDraftMode ===
            'destination-await-origin'

          &&

          routeDest
        )

        ?swCleanRoutePoint(
            routeDest
          )

        :null;


      swClearPreviousRouteForDraft();


      /*
        과거 endpoint 제거
      */

      routeOrigin =
        null;


      routeDest =
        pendingDestination;


      setSlotValue(

        'origin',

        {

          lat:
            latlng.lat,

          lng:
            latlng.lng,

          label:
            '지도 선택 출발지',

          src:
            'map-longpress'

        }

      );


      /*
        지도에 출발지 마커 즉시 표시
      */

      if(
        typeof refreshSafeWalkEndpointPreviewMarkers ===
        'function'
      ){

        refreshSafeWalkEndpointPreviewMarkers();

      }


      /*
        목적지를 먼저 골랐던 경우
        이제 둘 다 있으므로 실행
      */

      if(
        routeDest
      ){

        swRouteDraftMode =
          'none';


        showRouteToast(
          '🚩 출발지를 설정했습니다. 경로를 계산합니다.'
        );


        setTimeout(
          ()=>runSearchRoute(),
          100
        );


        return;

      }


      /*
        출발지만 새로 선택

        이전 목적지는 절대 기억하지 않는다.
      */

      swRouteDraftMode =
        'origin-await-destination';


      activeSlot =
        'dest';


      updateSlotUI();


      showRouteToast(
        '🚩 출발지를 설정했습니다. 목적지를 지정해 주세요.'
      );

    };

}


/* ============================================================
   목적지 Long Press
   ============================================================ */

if(
  typeof setSafeWalkLongPressDestination ===
  'function'
){

  setSafeWalkLongPressDestination =
    async function(latlng){

      if(
        !latlng ||
        !Number.isFinite(latlng.lat) ||
        !Number.isFinite(latlng.lng)
      ){
        return;
      }


      if(map){

        map.closePopup();

      }


      /*
        방금 이번 경로에서 직접 고른 출발지만 보존.

        예전 경로 출발지는 절대 보존하지 않는다.
      */

      const pendingOrigin =

        (
          swRouteDraftMode ===
            'origin-await-destination'

          &&

          routeOrigin
        )

        ?swCleanRoutePoint(
            routeOrigin
          )

        :null;


      swClearPreviousRouteForDraft();


      routeOrigin =
        pendingOrigin;


      routeDest =
        null;


      setSlotValue(

        'dest',

        {

          lat:
            latlng.lat,

          lng:
            latlng.lng,

          label:
            '지도 선택 목적지',

          src:
            'map-longpress'

        }

      );


      /*
        출발지를 먼저 직접 선택했던 경우
      */

      if(
        routeOrigin
      ){

        swRouteDraftMode =
          'none';


        if(
          typeof refreshSafeWalkEndpointPreviewMarkers ===
          'function'
        ){

          refreshSafeWalkEndpointPreviewMarkers();

        }


        showRouteToast(
          '🏁 목적지를 설정했습니다. 경로를 계산합니다.'
        );


        setTimeout(
          ()=>runSearchRoute(),
          100
        );


        return;

      }


      /*
        목적지만 바로 선택한 경우

        이전 출발지 X
        현재 GPS → 새 출발지
      */

      showRouteToast(
        '📍 현재 위치를 출발지로 설정하고 있습니다.'
      );


      try{

        const current =

          await getSafeWalkCurrentOrigin();


        setSlotValue(
          'origin',
          current
        );


        swRouteDraftMode =
          'none';


        if(
          typeof refreshSafeWalkEndpointPreviewMarkers ===
          'function'
        ){

          refreshSafeWalkEndpointPreviewMarkers();

        }


        showRouteToast(
          '🏁 현재 위치에서 선택한 목적지까지 경로를 계산합니다.'
        );


        setTimeout(
          ()=>runSearchRoute(),
          120
        );

      }

      catch(error){

        console.warn(
          '[SafeWalk] 현재 위치 자동 출발지 설정 실패:',
          error
        );


        /*
          목적지는 유지하고
          사용자가 출발지를 직접 선택하도록 한다.
        */

        swRouteDraftMode =
          'destination-await-origin';


        activeSlot =
          'origin';


        updateSlotUI();


        if(
          typeof refreshSafeWalkEndpointPreviewMarkers ===
          'function'
        ){

          refreshSafeWalkEndpointPreviewMarkers();

        }


        showRouteToast(
          '현재 위치를 확인하지 못했습니다. 출발지를 직접 지정해 주세요.'
        );

      }

    };

}


/* ============================================================
   PC 우클릭

   모바일:
   꾹 누르기

   PC:
   우클릭

   둘 다 동일 팝업 사용
   ============================================================ */

function swBindDesktopRouteContextMenu(){

  if(
    !map ||
    !map.getContainer
  ){
    return;
  }


  /*
    터치 중심 기기에서는 Long Press 사용
  */

  if(
    !window.matchMedia(
      '(pointer:fine)'
    ).matches
  ){
    return;
  }


  const mapEl =
    map.getContainer();


  if(
    mapEl.dataset.swRouteRightClick ===
      '1'
  ){
    return;
  }


  mapEl.dataset.swRouteRightClick =
    '1';


  const handler =
    event=>{

      if(
        grp ===
        'cpted'
      ){
        return;
      }


      if(
        typeof routePickMode !==
          'undefined'

        &&

        routePickMode
      ){
        return;
      }


      if(
        typeof auditPickMode !==
          'undefined'

        &&

        auditPickMode
      ){
        return;
      }


      if(
        typeof isSafeWalkLongPressTargetAllowed ===
          'function'

        &&

        !isSafeWalkLongPressTargetAllowed(
          event.target
        )
      ){
        return;
      }


      event.preventDefault();

      event.stopPropagation();


      const rect =
        mapEl.getBoundingClientRect();


      const point =
        L.point(

          event.clientX -
          rect.left,

          event.clientY -
          rect.top

        );


      const latlng =
        map.containerPointToLatLng(
          point
        );


      if(
        typeof openSafeWalkLongPressPopup ===
        'function'
      ){

        openSafeWalkLongPressPopup(
          latlng
        );

      }

    };


  mapEl.addEventListener(
    'contextmenu',
    handler
  );


  if(
    typeof mapDomCleanups !==
      'undefined'

    &&

    Array.isArray(
      mapDomCleanups
    )
  ){

    mapDomCleanups.push(

      ()=>{

        mapEl.removeEventListener(
          'contextmenu',
          handler
        );

      }

    );

  }

}


/* ============================================================
   initMap 확장

   PC 우클릭 바인딩
   ============================================================ */

if(
  typeof initMap ===
  'function'
){

  const swBaseInitMap =
    initMap;


  initMap =
    function(){

      const result =
        swBaseInitMap.apply(
          this,
          arguments
        );


      swBindDesktopRouteContextMenu();


      return result;

    };

}


/* ============================================================
   경로 복원 준비

   initMap의 GPS onLocated가 늦게 실행되면서
   복원한 경로 화면을 다시 현재 위치로 이동시키는 일을
   줄이기 위해 저장된 마지막 GPS를 먼저 넣는다.
   ============================================================ */

function swWarmRestoreLocation(){
  // 저장 좌표는 initMap의 지도 중심으로만 사용한다. GPS 측정값은 복원하지 않는다.
  warmupLocation();
}

/* ============================================================
   저장된 route 자동 복원
   ============================================================ */

async function swRestoreActiveRoute(){

  if(
    swRouteRestoreStarted
  ){
    return;
  }


  const state =
    swReadRouteState();


  if(!state){
    return;
  }


  if(
    state.group ===
    'cpted'
  ){

    swDeleteRouteState();

    return;
  }


  swRouteRestoreStarted =
    true;


  swRouteRestoring =
    true;


  try{

    grp =
      state.group;


    /*
      인트로 카드 표시도 복원
    */

    document
      .querySelectorAll(
        '.age-card'
      )
      .forEach(
        card=>{

          card.classList.toggle(

            'selected',

            card.dataset.group ===
              grp

          );

        }
      );


    const startBtn =
      document.getElementById(
        'startBtn'
      );


    if(startBtn){

      startBtn.classList.add(
        'on'
      );

    }


    /*
      마지막 위치를 먼저 넣어
      지도 초기화 후 GPS 리셋 지연을 줄인다.
    */

    swWarmRestoreLocation();


    /*
      지도 화면이 아직 없다면 자동 진입
    */

    if(!map){

      start();

    }


    routeOrigin =
      state.origin;


    routeDest =
      state.destination;


    activeSlot =
      'dest';


    updateSlotUI();


    /*
      map 생성 직후 한 프레임 대기
    */

    await new Promise(
      resolve=>
        setTimeout(
          resolve,
          120
        )
    );


    await runSearchRoute();


    /*
      사용자가 이전에 X로 패널을 접어둔 상태라면
      복원 후에도 패널만 숨긴다.
    */

    if(
      state.panelHidden
    ){

      swHideRoutePanel();

    }

    else{

      swSaveRouteState(
        false
      );

    }

  }

  catch(error){

    console.warn(
      '[SafeWalk] 저장 경로 복원 실패:',
      error
    );

  }

  finally{

    swRouteRestoring =
      false;

  }

}


/* ============================================================
   페이지가 외부로 이동하기 직전

   활성 경로를 마지막으로 한 번 저장
   ============================================================ */

window.addEventListener(

  'pagehide',

  ()=>{

    if(
      swHasActiveRoute()
    ){

      const panel =
        document.getElementById(
          'routePanel'
        );


      const hidden =
        Boolean(
          panel &&
          !panel.classList.contains(
            'show'
          )
        );


      swSaveRouteState(
        hidden
      );

    }

  }

);


/* ============================================================
   bfcache 복귀

   브라우저가 페이지 메모리를 그대로 보존했다면
   기존 지도는 건드리지 않는다.

   페이지가 재구성된 경우 저장 경로 복원.
   ============================================================ */

window.addEventListener(

  'pageshow',

  ()=>{

    if(
      map &&
      swHasActiveRoute()
    ){

      /*
        bfcache로 그대로 돌아온 경우
        아무것도 재계산하지 않는다.
      */

      return;

    }


    if(
      !swRouteRestoreStarted
    ){

      swRestoreActiveRoute();

    }

  }

);


/* ============================================================
   DOM 준비
   ============================================================ */

function swInitRouteUx(){

  swInjectRouteUxStyles();


  swPrepareRoutePanelUi();


  /*
    활성 경로가 저장돼 있으면
    새로고침/외부 페이지 복귀 시 자동 복원
  */

  swRestoreActiveRoute();

}


/* ============================================================
   시작
   ============================================================ */

if(
  document.readyState ===
  'loading'
){

  document.addEventListener(

    'DOMContentLoaded',

    swInitRouteUx,

    {
      once:true
    }

  );

}

else{

  swInitRouteUx();

}


console.log(
  '[SafeWalk v2.8] 경로 유지 UX 활성화'
);

