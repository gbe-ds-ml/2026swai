/* ============================================================
   SafeWalk v2.6.0 — map-longpress.js

   모바일 지도 Long Press 경로 지점 설정

   동작
   - 지도에서 약 650ms 길게 누르기
   - 손가락 이동량 12px 이하일 때만 Long Press 인정
   - 출발지 / 목적지 선택 팝업 표시
   - 출발지·목적지가 모두 지정되면 자동 길찾기

   제외
   - PC 마우스
   - CPTED 화면
   - 기존 지도 직접 선택 모드
   - 즐겨찾기 지도 선택 모드
   - 마커 / 팝업 / 지도 컨트롤 위 터치
   ============================================================ */


/* ============================================================
   설정
   ============================================================ */

const SW_LONG_PRESS_MS = 650;

const SW_LONG_PRESS_MOVE_LIMIT = 12;


/* ============================================================
   스타일
   ============================================================ */

function injectSafeWalkLongPressStyles(){

  if(
    document.getElementById(
      'safeWalkLongPressStyles'
    )
  ){
    return;
  }


  const style =
    document.createElement(
      'style'
    );


  style.id =
    'safeWalkLongPressStyles';


  style.textContent = `

    /* iOS 길게 누르기 메뉴 방지 */
    .sw-longpress-enabled{
      -webkit-touch-callout:none;
      -webkit-user-select:none;
      user-select:none;
    }


    /* Long Press 팝업 */

    .sw-longpress-popup{
      min-width:210px;
    }


    .sw-longpress-badge{
      display:inline-flex;
      align-items:center;
      gap:4px;

      margin-bottom:6px;

      padding:3px 8px;

      border-radius:999px;

      background:#eff6ff;

      color:#1d4ed8;

      font-size:10px;
      font-weight:800;
    }


    .sw-longpress-title{
      margin-bottom:4px;

      padding-right:10px;

      color:var(--navy);

      font-size:14px;
      font-weight:900;
      line-height:1.35;
    }


    .sw-longpress-desc{
      color:var(--gray);

      font-size:10.5px;
      line-height:1.45;
    }


    .sw-longpress-actions{
      display:grid;

      grid-template-columns:
        minmax(0,1fr)
        minmax(0,1fr);

      gap:7px;

      margin-top:11px;
    }


    .sw-longpress-btn{
      min-width:0;
      min-height:46px;

      padding:8px 6px;

      border-radius:11px;

      font-family:
        'Noto Sans KR',
        sans-serif;

      font-size:11px;
      font-weight:900;
      line-height:1.25;

      cursor:pointer;

      touch-action:manipulation;

      -webkit-appearance:none;
      appearance:none;
    }


    .sw-longpress-btn.origin{
      border:1px solid #bfdbfe;

      background:#eff6ff;

      color:#1d4ed8;
    }


    .sw-longpress-btn.dest{
      border:1px solid
        var(--route-red,#e11d48);

      background:
        var(--route-red,#e11d48);

      color:#fff;
    }


    .sw-longpress-btn:active{
      transform:scale(.97);
    }


    .sw-longpress-btn:focus-visible{
      outline:3px solid
        rgba(37,99,235,.28);

      outline-offset:2px;
    }

  `;


  document.head.appendChild(
    style
  );

}


/* ============================================================
   Long Press 가능 상태 확인
   ============================================================ */

function canUseSafeWalkLongPress(){

  /*
    지도가 아직 없음
  */
  if(
    typeof map === 'undefined' ||
    !map
  ){
    return false;
  }


  /*
    CPTED 지도에서는 기존
    "가장 가까운 CPTED" 터치 기능 유지
  */
  if(
    typeof grp !== 'undefined' &&
    grp === 'cpted'
  ){
    return false;
  }


  /*
    기존 길찾기 지도 선택 모드가 우선
  */
  if(
    typeof routePickMode !== 'undefined' &&
    routePickMode
  ){
    return false;
  }


  /*
    즐겨찾기 위치 선택 모드가 우선
  */
  if(
    typeof auditPickMode !== 'undefined' &&
    auditPickMode
  ){
    return false;
  }


  /*
    패널이 열린 상태에서는 사용하지 않음
  */
  if(
    document.body.classList.contains(
      'search-open'
    )
  ){
    return false;
  }


  if(
    document.body.classList.contains(
      'chat-open'
    )
  ){
    return false;
  }


  return true;

}


/* ============================================================
   마커 / 버튼 / 팝업 등 위에서는 Long Press 금지
   ============================================================ */

function isSafeWalkLongPressTargetAllowed(target){

  if(
    !target ||
    typeof target.closest !== 'function'
  ){
    return true;
  }


  const blocked =
    target.closest(

      [
        '.leaflet-control',
        '.leaflet-popup',
        '.leaflet-marker-icon',
        '.leaflet-marker-shadow',
        '.leaflet-tooltip',

        'button',
        'a',
        'input',
        'textarea',
        'select',
        'label'

      ].join(',')

    );


  return !blocked;

}


/* ============================================================
   경로 지점 설정
   ============================================================ */

function setSafeWalkLongPressPoint(
  slot,
  latlng
){

  if(
    !latlng ||
    !Number.isFinite(latlng.lat) ||
    !Number.isFinite(latlng.lng)
  ){
    return;
  }


  /*
    팝업 닫기
  */

  if(map){

    map.closePopup();

  }


  /*
    search.js의 기존 슬롯 구조 사용
  */

  activeSlot =
    slot;


  setSlotValue(

    slot,

    {

      lat:
        latlng.lat,

      lng:
        latlng.lng,

      label:
        '지도 선택 지점',

      src:
        'map-longpress'

    }

  );


  /* ========================================================
     출발지 + 목적지가 모두 지정됨
     → 바로 길찾기
     ======================================================== */

  if(
    routeOrigin &&
    routeDest
  ){

    showRouteToast(

      slot === 'origin'

        ?'🚩 출발지를 설정했습니다. 경로를 계산합니다.'

        :'🏁 목적지를 설정했습니다. 경로를 계산합니다.'

    );


    /*
      팝업이 닫힌 뒤 UI가 한 프레임 갱신된 후 실행
    */

    setTimeout(

      ()=>{

        runSearchRoute();

      },

      80

    );


    return;

  }


  /* ========================================================
     한쪽만 설정된 경우

     다음 Long Press가 자연스럽게
     반대쪽 슬롯을 설정하도록 activeSlot 변경
     ======================================================== */

  if(
    slot === 'origin'
  ){

    activeSlot =
      'dest';


    updateSlotUI();


    showRouteToast(
      '🚩 출발지를 설정했습니다. 지도를 다시 길게 눌러 목적지를 지정하세요.'
    );

  }

  else{

    activeSlot =
      'origin';


    updateSlotUI();


    showRouteToast(
      '🏁 목적지를 설정했습니다. 지도를 다시 길게 눌러 출발지를 지정하세요.'
    );

  }

}


/* ============================================================
   Long Press 팝업
   ============================================================ */

function openSafeWalkLongPressPopup(latlng){

  if(
    !map ||
    !latlng
  ){
    return;
  }


  /*
    기존 팝업 닫기
  */

  map.closePopup();


  /* ========================================================
     팝업 DOM
     ======================================================== */

  const box =
    document.createElement(
      'div'
    );


  box.className =
    'sw-longpress-popup';


  /* badge */

  const badge =
    document.createElement(
      'div'
    );


  badge.className =
    'sw-longpress-badge';


  badge.textContent =
    '📍 지도에서 선택';


  /* title */

  const title =
    document.createElement(
      'div'
    );


  title.className =
    'sw-longpress-title';


  title.textContent =
    '이 위치를 경로에 사용할까요?';


  /* description */

  const desc =
    document.createElement(
      'div'
    );


  desc.className =
    'sw-longpress-desc';


  desc.textContent =
    '출발지 또는 목적지로 지정할 수 있습니다.';


  /* actions */

  const actions =
    document.createElement(
      'div'
    );


  actions.className =
    'sw-longpress-actions';


  /* ========================================================
     출발지 버튼
     ======================================================== */

  const originBtn =
    document.createElement(
      'button'
    );


  originBtn.type =
    'button';


  originBtn.className =
    'sw-longpress-btn origin';


  originBtn.textContent =
    '🚩 출발지로 설정';


  originBtn.addEventListener(

    'click',

    event=>{

      event.preventDefault();

      event.stopPropagation();


      setSafeWalkLongPressPoint(

        'origin',

        latlng

      );

    }

  );


  /* ========================================================
     목적지 버튼
     ======================================================== */

  const destBtn =
    document.createElement(
      'button'
    );


  destBtn.type =
    'button';


  destBtn.className =
    'sw-longpress-btn dest';


  destBtn.textContent =
    '🏁 목적지로 설정';


  destBtn.addEventListener(

    'click',

    event=>{

      event.preventDefault();

      event.stopPropagation();


      setSafeWalkLongPressPoint(

        'dest',

        latlng

      );

    }

  );


  actions.append(

    originBtn,

    destBtn

  );


  box.append(

    badge,

    title,

    desc,

    actions

  );


  /*
    팝업 안 버튼을 눌렀을 때
    지도 터치로 전달되지 않도록 차단
  */

  if(
    typeof L !== 'undefined' &&
    L.DomEvent
  ){

    L.DomEvent.disableClickPropagation(
      box
    );


    L.DomEvent.disableScrollPropagation(
      box
    );

  }


  /* ========================================================
     Leaflet 팝업

     closeOnClick:false가 중요함.

     Long Press 후 손을 떼면서 발생하는
     지도 click 이벤트가 팝업을 즉시 닫는 것을 방지.
     ======================================================== */

  L.popup({

    className:
      'safepopup',

    closeButton:
      true,

    closeOnClick:
      false,

    autoClose:
      true,

    maxWidth:
      290

  })

  .setLatLng(
    latlng
  )

  .setContent(
    box
  )

  .openOn(
    map
  );

}


/* ============================================================
   Long Press 이벤트
   ============================================================ */

function bindSafeWalkLongPress(){

  if(
    !map ||
    !map.getContainer
  ){
    return;
  }


  const mapEl =
    map.getContainer();


  /*
    중복 바인딩 방지
  */

  if(
    mapEl.dataset.swLongPressBound ===
    '1'
  ){
    return;
  }


  mapEl.dataset.swLongPressBound =
    '1';


  mapEl.classList.add(
    'sw-longpress-enabled'
  );


  let state = null;

  let timer = null;


  /* ========================================================
     타이머 제거
     ======================================================== */

  function clearLongPressTimer(){

    if(timer){

      clearTimeout(
        timer
      );


      timer =
        null;

    }

  }


  /* ========================================================
     상태 초기화
     ======================================================== */

  function resetLongPressState(){

    clearLongPressTimer();

    state =
      null;

  }


  /* ========================================================
     pointerdown
     ======================================================== */

  function onPointerDown(event){

    /*
      모바일 touch / stylus만
    */

    if(
      event.pointerType ===
      'mouse'
    ){
      return;
    }


    /*
      멀티터치의 보조 포인터 제외
    */

    if(
      event.isPrimary ===
      false
    ){

      resetLongPressState();

      return;

    }


    if(
      !canUseSafeWalkLongPress()
    ){
      return;
    }


    if(
      !isSafeWalkLongPressTargetAllowed(
        event.target
      )
    ){
      return;
    }


    resetLongPressState();


    state = {

      pointerId:
        event.pointerId,

      x:
        event.clientX,

      y:
        event.clientY,

      fired:
        false

    };


    /* ======================================================
       Long Press timer
       ====================================================== */

    timer =
      setTimeout(

        ()=>{

          if(
            !state ||
            state.pointerId !==
              event.pointerId
          ){
            return;
          }


          if(
            !canUseSafeWalkLongPress()
          ){

            resetLongPressState();

            return;

          }


          state.fired =
            true;


          /*
            브라우저 좌표
            →
            Leaflet 지도 좌표
          */

          const rect =
            mapEl.getBoundingClientRect();


          const point =
            L.point(

              state.x -
              rect.left,

              state.y -
              rect.top

            );


          const latlng =
            map.containerPointToLatLng(
              point
            );


          /*
            Android 등 지원 기기에서
            아주 짧은 햅틱 피드백
          */

          try{

            if(
              navigator.vibrate
            ){

              navigator.vibrate(
                25
              );

            }

          }

          catch(e){}


          openSafeWalkLongPressPopup(
            latlng
          );


          timer =
            null;

        },

        SW_LONG_PRESS_MS

      );

  }


  /* ========================================================
     pointermove

     길게 누른 상태에서 지도를 움직이면
     일반 지도 드래그로 판단하고 Long Press 취소
     ======================================================== */

  function onPointerMove(event){

    if(
      !state ||
      state.pointerId !==
        event.pointerId ||
      state.fired
    ){
      return;
    }


    const dx =
      event.clientX -
      state.x;


    const dy =
      event.clientY -
      state.y;


    const distance =
      Math.sqrt(

        dx*dx +
        dy*dy

      );


    if(
      distance >
      SW_LONG_PRESS_MOVE_LIMIT
    ){

      resetLongPressState();

    }

  }


  /* ========================================================
     pointerup
     ======================================================== */

  function onPointerUp(event){

    if(
      !state ||
      state.pointerId !==
        event.pointerId
    ){
      return;
    }


    /*
      Long Press가 이미 실행되었더라도
      지도 자체의 pointerup 처리는 막지 않는다.

      Leaflet의 drag 상태가 정상적으로 종료되도록 하기 위함.
    */

    resetLongPressState();

  }


  /* ========================================================
     pointercancel
     ======================================================== */

  function onPointerCancel(event){

    if(
      !state
    ){
      return;
    }


    if(
      state.pointerId !==
      event.pointerId
    ){
      return;
    }


    resetLongPressState();

  }


  /* ========================================================
     iOS / Android 기본 Long Press 메뉴 차단
     ======================================================== */

  function onContextMenu(event){

    /*
      터치 기기에서 지도 길게 누르기 시
      브라우저 기본 컨텍스트 메뉴를 띄우지 않는다.
    */

    if(
      window.matchMedia(
        '(pointer:coarse)'
      ).matches
    ){

      event.preventDefault();

    }

  }


  /* ========================================================
     이벤트 등록
     ======================================================== */

  mapEl.addEventListener(

    'pointerdown',

    onPointerDown,

    {
      passive:true
    }

  );


  mapEl.addEventListener(

    'pointermove',

    onPointerMove,

    {
      passive:true
    }

  );


  mapEl.addEventListener(

    'pointerup',

    onPointerUp,

    {
      passive:true
    }

  );


  mapEl.addEventListener(

    'pointercancel',

    onPointerCancel,

    {
      passive:true
    }

  );


  mapEl.addEventListener(

    'contextmenu',

    onContextMenu

  );


  /* ========================================================
     기존 SafeWalk map cleanup 구조에 연결
     ======================================================== */

  if(
    typeof mapDomCleanups !==
    'undefined' &&
    Array.isArray(
      mapDomCleanups
    )
  ){

    mapDomCleanups.push(

      ()=>{

        resetLongPressState();


        mapEl.removeEventListener(
          'pointerdown',
          onPointerDown
        );


        mapEl.removeEventListener(
          'pointermove',
          onPointerMove
        );


        mapEl.removeEventListener(
          'pointerup',
          onPointerUp
        );


        mapEl.removeEventListener(
          'pointercancel',
          onPointerCancel
        );


        mapEl.removeEventListener(
          'contextmenu',
          onContextMenu
        );


        mapEl.classList.remove(
          'sw-longpress-enabled'
        );

      }

    );

  }

}


/* ============================================================
   initMap 확장

   기존 map.js는 수정하지 않는다.

   지도 생성이 끝난 직후
   Long Press 기능만 추가한다.
   ============================================================ */

if(
  typeof initMap ===
  'function'
){

  const safeWalkBaseInitMapLongPress =
    initMap;


  initMap =
    function(){

      /*
        기존 지도 생성
      */

      const result =
        safeWalkBaseInitMapLongPress
          .apply(
            this,
            arguments
          );


      /*
        initMap 내부에서 map 컨테이너가
        이미 만들어진 상태이므로 바로 바인딩 가능
      */

      bindSafeWalkLongPress();


      return result;

    };


  initMap._safeWalkLongPressV26 =
    true;

}


/* ============================================================
   시작
   ============================================================ */

injectSafeWalkLongPressStyles();


console.log(
  '[SafeWalk v2.6] 모바일 지도 Long Press 활성화'
);
