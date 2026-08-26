/* ============================================================
   SafeWalk v2.6.2 — map-longpress-stable.js

   모바일 Long Press 안정화 패치

   기존:
   650ms 경과
   → 손가락을 누르고 있는 상태에서 팝업 표시
   → 손을 떼는 pointerup / click과 충돌 가능

   변경:
   650ms 경과
   → Long Press 성공 판정 + 짧은 진동
   → 팝업은 아직 표시하지 않음
   → 손가락을 뗀 뒤 80ms 후 팝업 표시

   효과:
   - 오래 누른 뒤 팝업이 떴다가 바로 사라지는 현상 방지
   - 1초 이상 누르고 있어도 안정적으로 동작
   - 지도 드래그와 Long Press 구분 유지
   - CPTED / 기존 지도 선택 기능 유지
   ============================================================ */


const SW_LONG_PRESS_POPUP_DELAY_MS = 80;

/*
  Long Press가 이미 성공한 뒤에는
  손가락의 미세한 흔들림을 조금 더 허용한다.

  성공 전: 기존 12px
  성공 후: 최대 20px
*/
const SW_LONG_PRESS_ARMED_MOVE_LIMIT = 20;


/* ============================================================
   기존 bindSafeWalkLongPress()를 안정화 버전으로 교체

   기존 map-longpress.js의 initMap wrapper가
   실제 지도 진입 시 이 최신 함수를 호출하게 된다.
   ============================================================ */

bindSafeWalkLongPress = function(){

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

  let longPressTimer = null;

  let popupTimer = null;


  /* ========================================================
     Long Press 판정 타이머 제거
     ======================================================== */

  function clearLongPressTimer(){

    if(
      longPressTimer !== null
    ){

      clearTimeout(
        longPressTimer
      );


      longPressTimer = null;

    }

  }


  /* ========================================================
     아직 표시되지 않은 팝업 예약 제거
     ======================================================== */

  function clearPopupTimer(){

    if(
      popupTimer !== null
    ){

      clearTimeout(
        popupTimer
      );


      popupTimer = null;

    }

  }


  /* ========================================================
     현재 제스처 완전 초기화
     ======================================================== */

  function resetGesture(){

    clearLongPressTimer();

    clearPopupTimer();


    state = null;

  }


  /* ========================================================
     Long Press 성공 지점 계산
     ======================================================== */

  function getLatLngFromState(){

    if(
      !state ||
      !map
    ){
      return null;
    }


    const rect =
      mapEl.getBoundingClientRect();


    const point =
      L.point(

        state.x -
        rect.left,

        state.y -
        rect.top

      );


    return map.containerPointToLatLng(
      point
    );

  }


  /* ========================================================
     손을 뗀 후 팝업 표시

     핵심:
     pointerup 직후 생성되는 click/touch 후속 이벤트가
     모두 끝난 다음 팝업을 생성한다.
     ======================================================== */

  function schedulePopupAfterRelease(
    latlng
  ){

    if(!latlng){
      return;
    }


    clearPopupTimer();


    popupTimer =
      setTimeout(

        ()=>{

          popupTimer = null;


          /*
            80ms 사이에 화면 상태가 변경됐다면
            팝업을 만들지 않는다.
          */

          if(
            !map ||
            !canUseSafeWalkLongPress()
          ){
            return;
          }


          openSafeWalkLongPressPopup(
            latlng
          );

        },

        SW_LONG_PRESS_POPUP_DELAY_MS

      );

  }


  /* ========================================================
     pointerdown

     여기서는 Long Press 측정만 시작한다.
     ======================================================== */

  function onPointerDown(event){

    /*
      PC 마우스는 제외.
      PC에서는 route-ux.js의 우클릭 기능 사용.
    */

    if(
      event.pointerType ===
      'mouse'
    ){
      return;
    }


    /*
      멀티터치 제외
    */

    if(
      event.isPrimary ===
      false
    ){

      resetGesture();

      return;

    }


    /*
      현재 화면에서 Long Press 사용 가능 여부
    */

    if(
      !canUseSafeWalkLongPress()
    ){
      return;
    }


    /*
      버튼 / 마커 / 팝업 / 컨트롤 등은 제외
    */

    if(
      !isSafeWalkLongPressTargetAllowed(
        event.target
      )
    ){
      return;
    }


    /*
      직전 예약이 있다면 취소
    */

    resetGesture();


    /*
      최초 터치 좌표 보존
    */

    state = {

      pointerId:
        event.pointerId,

      x:
        event.clientX,

      y:
        event.clientY,

      /*
        650ms 성공 여부
      */
      armed:
        false,

      /*
        성공한 지도 좌표
      */
      latlng:
        null

    };


    /* ======================================================
       Long Press 시간 판정
       ====================================================== */

    longPressTimer =
      setTimeout(

        ()=>{

          /*
            이미 손을 떼었거나
            다른 pointer가 된 경우
          */

          if(
            !state ||
            state.pointerId !==
              event.pointerId
          ){

            return;

          }


          /*
            650ms 사이 화면 상태가 바뀐 경우
          */

          if(
            !canUseSafeWalkLongPress()
          ){

            resetGesture();

            return;

          }


          const latlng =
            getLatLngFromState();


          if(!latlng){

            resetGesture();

            return;

          }


          /*
            ==================================================
            핵심 변경점

            여기서 팝업을 띄우지 않는다.

            Long Press가 성공했다는 사실과
            좌표만 저장한다.
            ==================================================
          */

          state.armed =
            true;


          state.latlng =
            latlng;


          longPressTimer =
            null;


          /*
            성공 피드백

            Android 등 지원 기기에서는
            짧게 진동한다.
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
          catch(error){}

        },

        SW_LONG_PRESS_MS

      );

  }


  /* ========================================================
     pointermove

     지도 이동과 Long Press를 구분한다.
     ======================================================== */

  function onPointerMove(event){

    if(
      !state ||
      state.pointerId !==
        event.pointerId
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
      Math.hypot(
        dx,
        dy
      );


    /*
      성공 전에는 기존 12px 사용.

      Long Press가 이미 성공한 뒤에는
      진동 때문에 손가락이 조금 움직이는 것을 고려해
      20px까지 허용한다.
    */

    const moveLimit =

      state.armed

        ?SW_LONG_PRESS_ARMED_MOVE_LIMIT

        :SW_LONG_PRESS_MOVE_LIMIT;


    if(
      distance >
      moveLimit
    ){

      /*
        사용자가 지도를 드래그한 것으로 판단.
        Long Press 취소.
      */

      resetGesture();

    }

  }


  /* ========================================================
     pointerup

     Long Press가 성공한 경우에만
     여기서 팝업 표시를 예약한다.
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
      손을 떼기 전에 Long Press가 성공했는지 확인
    */

    const wasArmed =
      Boolean(
        state.armed &&
        state.latlng
      );


    /*
      state를 없애기 전에 좌표 복사
    */

    const latlng =

      wasArmed

        ?state.latlng

        :null;


    /*
      Long Press 판정 타이머는 종료
    */

    clearLongPressTimer();


    /*
      현재 pointer 제스처 종료
    */

    state = null;


    /*
      짧게 터치한 경우
      아무것도 하지 않는다.
    */

    if(
      !wasArmed ||
      !latlng
    ){
      return;
    }


    /*
      ======================================================
      핵심

      바로 팝업을 만들지 않는다.

      pointerup → click 등의 후속 이벤트가
      처리된 다음 80ms 후 팝업 표시.
      ======================================================
    */

    schedulePopupAfterRelease(
      latlng
    );

  }


  /* ========================================================
     pointercancel

     OS 제스처 / 브라우저 제스처 /
     예상하지 못한 터치 취소 상황에서는
     팝업을 만들지 않는다.
     ======================================================== */

  function onPointerCancel(event){

    if(
      !state ||
      state.pointerId !==
        event.pointerId
    ){
      return;
    }


    resetGesture();

  }


  /* ========================================================
     모바일 Long Press 기본 컨텍스트 메뉴 방지
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


  /* ========================================================
     Listener
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
     지도 종료 시 정리
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

        /*
          아직 남아 있는 Long Press / popup 예약 제거
        */

        resetGesture();


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


        delete mapEl.dataset
          .swLongPressBound;

      }

    );

  }

};


console.log(
  '[SafeWalk v2.6.2] 모바일 Long Press 안정화 활성화'
);
