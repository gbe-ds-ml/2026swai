/* ============================================================
   SafeWalk v2.6.1 — map-longpress.js

   모바일 지도 Long Press 경로 지점 설정

   동작
   ------------------------------------------------------------
   지도 약 650ms 길게 누르기

   [🚩 출발지로 설정] [🏁 목적지로 설정]

   출발지 선택
   → 지도에 즉시 초록색 출발지 마커 표시

   목적지 선택
   → 지도에 즉시 빨간색 목적지 마커 표시
   → 출발지가 없으면 현재 GPS 위치를 자동 출발지로 사용

   출발지 + 목적지가 모두 존재
   → 자동으로 SafeWalk 길찾기 실행

   제외
   ------------------------------------------------------------
   - PC 마우스
   - CPTED 화면
   - 기존 지도 직접 선택 모드
   - 즐겨찾기 위치 선택 모드
   - 마커 / 팝업 / 지도 컨트롤
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

    .sw-longpress-enabled{
      -webkit-touch-callout:none;
      -webkit-user-select:none;
      user-select:none;
    }


    .sw-longpress-popup{
      min-width:220px;
    }


    .sw-longpress-badge{

      display:inline-flex;

      align-items:center;

      gap:4px;

      margin-bottom:6px;

      padding:4px 8px;

      border-radius:999px;

      background:#eff6ff;

      color:#1d4ed8;

      font-size:10px;

      font-weight:800;

    }


    .sw-longpress-title{

      margin-bottom:4px;

      padding-right:8px;

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

      min-height:48px;

      padding:8px 5px;

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

      border:
        1px solid #86efac;

      background:
        #f0fdf4;

      color:
        #047857;

    }


    .sw-longpress-btn.dest{

      border:
        1px solid #fda4af;

      background:
        #fff1f2;

      color:
        #be123c;

    }


    .sw-longpress-btn:active{

      transform:
        scale(.97);

    }


    .sw-longpress-btn:focus-visible{

      outline:
        3px solid rgba(37,99,235,.25);

      outline-offset:
        2px;

    }

  `;


  document.head.appendChild(
    style
  );

}


/* ============================================================
   사용 가능 여부
   ============================================================ */

function canUseSafeWalkLongPress(){

  if(
    typeof map === 'undefined' ||
    !map
  ){
    return false;
  }


  /*
    CPTED는 기존 터치 기능 유지
  */

  if(
    typeof grp !== 'undefined' &&
    grp === 'cpted'
  ){
    return false;
  }


  /*
    기존 지도 직접 선택 모드
  */

  if(
    typeof routePickMode !== 'undefined' &&
    routePickMode
  ){
    return false;
  }


  /*
    즐겨찾기 선택 모드
  */

  if(
    typeof auditPickMode !== 'undefined' &&
    auditPickMode
  ){
    return false;
  }


  /*
    다른 UI가 지도 위를 점유하는 경우
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
   Long Press 허용 대상
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
   현재 위치 취득

   myLat / myLng가 있으면 즉시 사용
   없으면 브라우저 GPS를 한 번 더 요청한다.
   ============================================================ */

function getSafeWalkCurrentOrigin(){

  if(
    Number.isFinite(myLat) &&
    Number.isFinite(myLng)
  ){

    return Promise.resolve({

      lat:myLat,

      lng:myLng,

      label:'📍 현재 위치',

      src:'gps'

    });

  }


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
            '현재 위치 기능을 지원하지 않습니다.'
          )
        );

        return;

      }


      navigator.geolocation.getCurrentPosition(

        position=>{

          const lat =
            Number(
              position.coords.latitude
            );


          const lng =
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
            SafeWalk 전역 현재 위치도 갱신
          */

          myLat =
            lat;

          myLng =
            lng;


          /*
            지도 현재 위치 마커도 갱신
          */

          if(
            typeof drawMe ===
            'function'
          ){

            try{

              drawMe();

            }catch(e){}

          }


          if(
            typeof writeLastPos ===
            'function'
          ){

            try{

              writeLastPos(
                lat,
                lng
              );

            }catch(e){}

          }


          resolve({

            lat,

            lng,

            label:
              '📍 현재 위치',

            src:
              'gps'

          });

        },


        error=>{

          reject(

            error ||

            new Error(
              '현재 위치를 확인하지 못했습니다.'
            )

          );

        },


        {

          enableHighAccuracy:
            true,

          timeout:
            8000,

          maximumAge:
            30000

        }

      );

    }
  );

}


/* ============================================================
   임시 출발지 / 목적지 마커
   ============================================================ */

function makeSafeWalkEndpointMarker(
  point,
  type
){

  if(
    !map ||
    !point
  ){
    return null;
  }


  const isOrigin =
    type === 'origin';


  const color =
    isOrigin

      ?'#059669'

      :'#ef4444';


  const emoji =
    isOrigin

      ?'🚩'

      :'🎯';


  const title =
    isOrigin

      ?'출발지'

      :'목적지';


  return L.marker(

    [
      point.lat,
      point.lng
    ],

    {

      zIndexOffset:
        900,

      icon:
        L.divIcon({

          html:

            '<div style="'+

              'width:34px;'+
              'height:34px;'+
              'border-radius:50%;'+
              'background:'+color+';'+
              'border:3px solid #fff;'+
              'display:flex;'+
              'align-items:center;'+
              'justify-content:center;'+
              'font-size:15px;'+
              'box-shadow:0 3px 10px rgba(0,0,0,.25);'+

            '">'+

              emoji+

            '</div>',


          className:
            '',


          iconSize:[
            34,
            34
          ],


          iconAnchor:[
            17,
            17
          ]

        })

    }

  )

  .bindPopup(

    L.popup({

      className:
        'safepopup',

      closeButton:
        true,

      maxWidth:
        250

    })

    .setContent(

      '<div class="pbadge" style="'+
        'background:'+color+'18;'+
        'color:'+color+
      '">'+

        title+

      '</div>'+

      '<div class="ptitle">'+

        esc(
          point.label ||
          '지도 선택 지점'
        )+

      '</div>'

    )

  )

  .addTo(
    map
  );

}


/* ============================================================
   출발지·목적지 마커 새로 표시
   ============================================================ */

function refreshSafeWalkEndpointPreviewMarkers(){

  if(!map){
    return;
  }


  /*
    기존 마커 제거
  */

  if(
    typeof originMark !== 'undefined' &&
    originMark
  ){

    try{

      if(
        map.hasLayer(
          originMark
        )
      ){

        map.removeLayer(
          originMark
        );

      }

    }catch(e){}


    originMark =
      null;

  }


  if(
    typeof destinationMark !== 'undefined' &&
    destinationMark
  ){

    try{

      if(
        map.hasLayer(
          destinationMark
        )
      ){

        map.removeLayer(
          destinationMark
        );

      }

    }catch(e){}


    destinationMark =
      null;

  }


  /*
    새 마커
  */

  if(
    routeOrigin
  ){

    originMark =
      makeSafeWalkEndpointMarker(

        routeOrigin,

        'origin'

      );

  }


  if(
    routeDest
  ){

    destinationMark =
      makeSafeWalkEndpointMarker(

        routeDest,

        'dest'

      );

  }

}


/* ============================================================
   기존 경로 그림 제거

   새 지점을 선택했는데 옛 경로선이 남는 것을 방지한다.
   routeOrigin / routeDest 값 자체는 clearRoute()가 지우지 않는다.
   ============================================================ */

function prepareSafeWalkForNewEndpoint(){

  if(
    typeof clearRoute ===
    'function'
  ){

    clearRoute(
      false
    );

  }

}


/* ============================================================
   출발지 설정
   ============================================================ */

async function setSafeWalkLongPressOrigin(
  latlng
){

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


  prepareSafeWalkForNewEndpoint();


  activeSlot =
    'origin';


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
    요청 사항:
    출발지만 설정했어도 지도에 바로 표시
  */

  refreshSafeWalkEndpointPreviewMarkers();


  /*
    목적지가 이미 있다면 바로 재계산
  */

  if(
    routeOrigin &&
    routeDest
  ){

    showRouteToast(
      '🚩 출발지를 설정했습니다. 경로를 계산합니다.'
    );


    setTimeout(
      runSearchRoute,
      100
    );


    return;

  }


  activeSlot =
    'dest';


  updateSlotUI();


  showRouteToast(
    '🚩 출발지를 설정했습니다. 목적지를 지도에서 길게 눌러 지정하세요.'
  );

}


/* ============================================================
   목적지 설정

   핵심:
   출발지가 비어 있으면 현재 위치를 자동 출발지로 만든다.
   ============================================================ */

async function setSafeWalkLongPressDestination(
  latlng
){

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


  prepareSafeWalkForNewEndpoint();


  activeSlot =
    'dest';


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
    우선 목적지부터 바로 지도에 보여준다.
  */

  refreshSafeWalkEndpointPreviewMarkers();


  /* ========================================================
     출발지가 없으면 현재 위치 자동 사용
     ======================================================== */

  if(
    !routeOrigin
  ){

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


      refreshSafeWalkEndpointPreviewMarkers();

    }

    catch(error){

      console.warn(
        '현재 위치 자동 출발지 설정 실패:',
        error
      );


      /*
        목적지는 그대로 유지한다.
        사용자가 직접 출발지를 선택할 수 있게 함.
      */

      activeSlot =
        'origin';


      updateSlotUI();


      showRouteToast(
        '현재 위치를 확인하지 못했습니다. 위치 권한을 허용하거나 출발지를 직접 지정해 주세요.'
      );


      return;

    }

  }


  /* ========================================================
     이제 둘 다 있으므로 자동 길찾기
     ======================================================== */

  if(
    routeOrigin &&
    routeDest
  ){

    showRouteToast(
      '🏁 목적지를 설정했습니다. 현재 위치에서 경로를 계산합니다.'
    );


    setTimeout(
      runSearchRoute,
      120
    );


    return;

  }


  activeSlot =
    'origin';


  updateSlotUI();


  showRouteToast(
    '🏁 목적지를 설정했습니다. 출발지를 지정해 주세요.'
  );

}


/* ============================================================
   기존 함수명 호환
   ============================================================ */

function setSafeWalkLongPressPoint(
  slot,
  latlng
){

  if(
    slot ===
    'origin'
  ){

    return setSafeWalkLongPressOrigin(
      latlng
    );

  }


  return setSafeWalkLongPressDestination(
    latlng
  );

}


/* ============================================================
   Long Press 팝업
   ============================================================ */

function openSafeWalkLongPressPopup(
  latlng
){

  if(
    !map ||
    !latlng
  ){
    return;
  }


  map.closePopup();


  const box =
    document.createElement(
      'div'
    );


  box.className =
    'sw-longpress-popup';


  const badge =
    document.createElement(
      'div'
    );


  badge.className =
    'sw-longpress-badge';


  badge.textContent =
    '📍 지도에서 선택';


  const title =
    document.createElement(
      'div'
    );


  title.className =
    'sw-longpress-title';


  title.textContent =
    '이 위치를 경로에 사용할까요?';


  const desc =
    document.createElement(
      'div'
    );


  desc.className =
    'sw-longpress-desc';


  desc.textContent =
    '목적지만 설정하면 현재 위치가 자동으로 출발지가 됩니다.';


  const actions =
    document.createElement(
      'div'
    );


  actions.className =
    'sw-longpress-actions';


  /* 출발지 */

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


      setSafeWalkLongPressOrigin(
        latlng
      );

    }

  );


  /* 목적지 */

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


      setSafeWalkLongPressDestination(
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
    팝업 안 터치가 지도에 전달되지 않도록
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
      300

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
   Long Press 바인딩
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


  let state =
    null;


  let timer =
    null;


  function clearTimer(){

    if(timer){

      clearTimeout(
        timer
      );


      timer =
        null;

    }

  }


  function reset(){

    clearTimer();

    state =
      null;

  }


  /* ========================================================
     pointerdown
     ======================================================== */

  function onPointerDown(event){

    /*
      PC 마우스에서는 사용하지 않음
    */

    if(
      event.pointerType ===
      'mouse'
    ){
      return;
    }


    if(
      event.isPrimary ===
      false
    ){

      reset();

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


    reset();


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

            reset();

            return;

          }


          state.fired =
            true;


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
            지원되는 Android 기기에서 짧은 햅틱
          */

          try{

            if(
              navigator.vibrate
            ){

              navigator.vibrate(
                25
              );

            }

          }catch(e){}


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

     지도 드래그를 시작하면 Long Press 취소
     ======================================================== */

  function onPointerMove(event){

    if(
      !state ||
      state.pointerId !== event.pointerId ||
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


    if(
      Math.hypot(
        dx,
        dy
      ) >
      SW_LONG_PRESS_MOVE_LIMIT
    ){

      reset();

    }

  }


  /* ========================================================
     종료
     ======================================================== */

  function onPointerUp(event){

    if(
      !state ||
      state.pointerId !==
        event.pointerId
    ){
      return;
    }


    reset();

  }


  function onPointerCancel(event){

    if(
      !state ||
      state.pointerId !==
        event.pointerId
    ){
      return;
    }


    reset();

  }


  /* ========================================================
     모바일 기본 컨텍스트 메뉴 방지
     ======================================================== */

  function onContextMenu(event){

    if(
      window.matchMedia(
        '(pointer:coarse)'
      ).matches
    ){

      event.preventDefault();

    }

  }


  mapEl.addEventListener(
    'pointerdown',
    onPointerDown,
    {passive:true}
  );


  mapEl.addEventListener(
    'pointermove',
    onPointerMove,
    {passive:true}
  );


  mapEl.addEventListener(
    'pointerup',
    onPointerUp,
    {passive:true}
  );


  mapEl.addEventListener(
    'pointercancel',
    onPointerCancel,
    {passive:true}
  );


  mapEl.addEventListener(
    'contextmenu',
    onContextMenu
  );


  /* ========================================================
     SafeWalk 지도 종료 시 listener 제거
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

        reset();


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
   기존 initMap 확장
   ============================================================ */

if(
  typeof initMap ===
  'function'
){

  const safeWalkBaseInitMapLongPress =
    initMap;


  initMap =
    function(){


      const result =
        safeWalkBaseInitMapLongPress.apply(
          this,
          arguments
        );


      bindSafeWalkLongPress();


      return result;

    };


  initMap._safeWalkLongPressV261 =
    true;

}


/* ============================================================
   시작
   ============================================================ */

injectSafeWalkLongPressStyles();


console.log(
  '[SafeWalk v2.6.1] 모바일 Long Press 경로 설정 활성화'
);
