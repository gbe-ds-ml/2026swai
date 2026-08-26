/* ============================================================
   SafeWalk v2.6.3 — map-longpress-stable.js

   모바일 Long Press 안정화 + 시각적 피드백

   동작
   ------------------------------------------------------------
   1. 지도 터치
   2. 600ms 동안 크게 움직이지 않으면 Long Press 성공
   3. 손가락 근처에
      "📍 선택됨 · 손을 떼세요"
      표시
   4. 손가락을 떼면 표시 제거
   5. pointerup 후 70ms 뒤
      출발지 / 목적지 선택 팝업 표시

   장점
   ------------------------------------------------------------
   - 팝업이 손가락 아래에서 먼저 생성되지 않음
   - 손을 떼면서 팝업이 사라지는 현상 방지
   - Long Press 성공 여부를 눈으로 확인 가능
   - 진동 미지원 기기에서도 동일한 UX
   - 지도 드래그와 Long Press 구분 유지
   ============================================================ */


/* ============================================================
   설정
   ============================================================ */

/*
  기존 map-longpress.js는 650ms지만
  안정화 버전에서는 조금 더 빠르게 600ms 사용
*/
const SW_STABLE_LONG_PRESS_MS = 600;


/*
  손을 뗀 직후 발생하는 click/touch 계열 후속 이벤트가
  끝난 다음 팝업을 띄우기 위한 짧은 지연
*/
const SW_STABLE_POPUP_DELAY_MS = 70;


/*
  Long Press 성공 후에는
  손가락의 아주 작은 흔들림을 조금 더 허용
*/
const SW_STABLE_ARMED_MOVE_LIMIT = 20;


/* ============================================================
   시각적 피드백 CSS
   ============================================================ */

function injectSafeWalkLongPressStableStyles(){

  if(
    document.getElementById(
      'safeWalkLongPressStableStyles'
    )
  ){
    return;
  }


  const style =
    document.createElement(
      'style'
    );


  style.id =
    'safeWalkLongPressStableStyles';


  style.textContent = `

    /* ========================================================
       Long Press 성공 표시
       ======================================================== */

    .sw-longpress-feedback{

      position:absolute;

      z-index:10000;

      display:flex;

      align-items:center;

      gap:5px;

      padding:7px 10px;

      border:1px solid rgba(37,99,235,.18);

      border-radius:999px;

      background:rgba(255,255,255,.97);

      color:#1d4ed8;

      font-family:
        'Noto Sans KR',
        sans-serif;

      font-size:11px;

      font-weight:900;

      line-height:1;

      white-space:nowrap;

      pointer-events:none;

      user-select:none;

      -webkit-user-select:none;

      box-shadow:
        0 5px 18px rgba(15,23,42,.18);

      transform:
        translate(-50%, -100%)
        translateY(-14px)
        scale(.92);

      opacity:0;

      transition:
        opacity .12s ease,
        transform .12s ease;

    }


    .sw-longpress-feedback.show{

      opacity:1;

      transform:
        translate(-50%, -100%)
        translateY(-14px)
        scale(1);

    }


    .sw-longpress-feedback-pin{

      display:flex;

      align-items:center;

      justify-content:center;

      width:22px;

      height:22px;

      border-radius:50%;

      background:#eff6ff;

      font-size:14px;

      flex:0 0 auto;

    }


    .sw-longpress-feedback-text{

      display:block;

    }


    /*
      선택 지점을 보여주는 작은 점
    */

    .sw-longpress-feedback-dot{

      position:absolute;

      left:50%;

      top:calc(100% + 8px);

      width:9px;

      height:9px;

      border:2px solid #fff;

      border-radius:50%;

      background:#2563eb;

      box-shadow:
        0 1px 5px rgba(15,23,42,.25);

      transform:
        translateX(-50%);

    }


    /*
      Long Press 성공 시 작은 pulse
    */

    .sw-longpress-feedback-ring{

      position:absolute;

      left:50%;

      top:calc(100% + 12px);

      width:24px;

      height:24px;

      border:2px solid rgba(37,99,235,.45);

      border-radius:50%;

      transform:
        translate(-50%,-50%);

      animation:
        swLongPressPulse .75s ease-out infinite;

    }


    @keyframes swLongPressPulse{

      0%{

        opacity:.75;

        transform:
          translate(-50%,-50%)
          scale(.45);

      }


      100%{

        opacity:0;

        transform:
          translate(-50%,-50%)
          scale(1.35);

      }

    }


    @media (prefers-reduced-motion:reduce){

      .sw-longpress-feedback{

        transition:none;

      }


      .sw-longpress-feedback-ring{

        animation:none;

      }

    }

  `;


  document.head.appendChild(
    style
  );

}


/* ============================================================
   기존 Long Press 바인딩 함수 교체
   ============================================================ */

bindSafeWalkLongPress =
  function(){


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


    /* ========================================================
       내부 상태
       ======================================================== */

    let state =
      null;


    let longPressTimer =
      null;


    let popupTimer =
      null;


    let feedbackEl =
      null;


    /* ========================================================
       Timer 정리
       ======================================================== */

    function clearLongPressTimer(){

      if(
        longPressTimer !==
        null
      ){

        clearTimeout(
          longPressTimer
        );


        longPressTimer =
          null;

      }

    }


    function clearPopupTimer(){

      if(
        popupTimer !==
        null
      ){

        clearTimeout(
          popupTimer
        );


        popupTimer =
          null;

      }

    }


    /* ========================================================
       시각적 피드백 제거
       ======================================================== */

    function removeFeedback(){

      if(
        !feedbackEl
      ){
        return;
      }


      const current =
        feedbackEl;


      feedbackEl =
        null;


      current.classList.remove(
        'show'
      );


      /*
        짧은 fade-out 후 DOM 제거
      */

      setTimeout(

        ()=>{

          try{

            current.remove();

          }
          catch(error){}

        },

        90

      );

    }


    /* ========================================================
       시각적 피드백 생성
       ======================================================== */

    function showFeedback(
      clientX,
      clientY
    ){

      removeFeedback();


      const rect =
        mapEl.getBoundingClientRect();


      /*
        지도 내부 좌표
      */

      let x =
        clientX -
        rect.left;


      let y =
        clientY -
        rect.top;


      /*
        좌우 가장자리에서는
        안내 박스가 화면 밖으로 나가는 것을 조금 방지
      */

      const horizontalMargin =
        95;


      x =
        Math.max(
          horizontalMargin,
          Math.min(
            mapEl.clientWidth -
            horizontalMargin,
            x
          )
        );


      /*
        지도 최상단에서는
        팝업이 위로 잘리지 않도록 아래쪽으로 조정
      */

      if(
        y <
        70
      ){

        y =
          70;

      }


      const el =
        document.createElement(
          'div'
        );


      el.className =
        'sw-longpress-feedback';


      el.innerHTML =

        '<span class="sw-longpress-feedback-pin">'+
          '📍'+
        '</span>'+

        '<span class="sw-longpress-feedback-text">'+
          '선택됨 · 손을 떼세요'+
        '</span>'+

        '<span class="sw-longpress-feedback-ring"></span>'+

        '<span class="sw-longpress-feedback-dot"></span>';


      el.style.left =
        x +
        'px';


      el.style.top =
        y +
        'px';


      mapEl.appendChild(
        el
      );


      feedbackEl =
        el;


      /*
        DOM 삽입 직후 별도 frame에서
        등장 애니메이션 실행
      */

      requestAnimationFrame(

        ()=>{

          if(
            feedbackEl ===
            el
          ){

            el.classList.add(
              'show'
            );

          }

        }

      );

    }


    /* ========================================================
       Gesture 전체 초기화
       ======================================================== */

    function resetGesture(){

      clearLongPressTimer();


      removeFeedback();


      state =
        null;

    }


    /* ========================================================
       현재 선택 좌표 계산
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
       손을 뗀 후 실제 팝업 예약
       ======================================================== */

    function schedulePopupAfterRelease(
      latlng
    ){

      if(
        !latlng
      ){
        return;
      }


      clearPopupTimer();


      popupTimer =
        setTimeout(

          ()=>{

            popupTimer =
              null;


            /*
              기다리는 동안
              지도 화면이 사라졌거나
              CPTED 등의 상태로 변경됐다면 취소
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

          SW_STABLE_POPUP_DELAY_MS

        );

    }


    /* ========================================================
       pointerdown
       ======================================================== */

    function onPointerDown(
      event
    ){

      /*
        PC 마우스 제외

        PC에서는 route-ux.js의
        우클릭 지점 선택 사용
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
        현재 화면에서
        Long Press 사용 불가능
      */

      if(
        !canUseSafeWalkLongPress()
      ){
        return;
      }


      /*
        마커 / 버튼 / 팝업 /
        Leaflet control 위 터치는 제외
      */

      if(
        !isSafeWalkLongPressTargetAllowed(
          event.target
        )
      ){
        return;
      }


      /*
        이전 제스처 정리
      */

      resetGesture();


      clearPopupTimer();


      /* ======================================================
         새 터치 기록
         ====================================================== */

      state = {

        pointerId:
          event.pointerId,


        x:
          event.clientX,


        y:
          event.clientY,


        armed:
          false,


        latlng:
          null

      };


      /*
        현재 pointerId를 별도 변수에 저장.

        setTimeout 안에서 event 객체 자체를
        오래 참조하는 것을 줄인다.
      */

      const pointerId =
        event.pointerId;


      /* ======================================================
         600ms Long Press 판정
         ====================================================== */

      longPressTimer =
        setTimeout(

          ()=>{

            if(
              !state ||
              state.pointerId !==
                pointerId
            ){
              return;
            }


            /*
              기다리는 동안 화면 상태가
              바뀐 경우 취소
            */

            if(
              !canUseSafeWalkLongPress()
            ){

              resetGesture();

              return;

            }


            const latlng =
              getLatLngFromState();


            if(
              !latlng
            ){

              resetGesture();

              return;

            }


            /* =================================================
               Long Press 성공

               중요:
               아직 실제 선택 팝업은 열지 않는다.
               ================================================= */

            state.armed =
              true;


            state.latlng =
              latlng;


            longPressTimer =
              null;


            /* =================================================
               사용자가 성공 여부를 눈으로 알 수 있도록
               즉시 표시
               ================================================= */

            showFeedback(

              state.x,

              state.y

            );


            /* =================================================
               가능한 기기에서만 보조 진동

               진동이 없어도 정상 동작
               ================================================= */

            try{

              if(
                typeof navigator.vibrate ===
                'function'
              ){

                navigator.vibrate(
                  20
                );

              }

            }
            catch(error){}

          },

          SW_STABLE_LONG_PRESS_MS

        );

    }


    /* ========================================================
       pointermove
       ======================================================== */

    function onPointerMove(
      event
    ){

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
        Long Press 성공 전:
        기존 map-longpress.js의 12px 기준

        성공 후:
        약간의 손떨림을 고려해 20px
      */

      const moveLimit =

        state.armed

          ?SW_STABLE_ARMED_MOVE_LIMIT

          :SW_LONG_PRESS_MOVE_LIMIT;


      if(
        distance >
        moveLimit
      ){

        /*
          지도 드래그로 판단
        */

        resetGesture();

      }

    }


    /* ========================================================
       pointerup

       핵심 구간
       ======================================================== */

    function onPointerUp(
      event
    ){

      if(
        !state ||
        state.pointerId !==
          event.pointerId
      ){
        return;
      }


      const success =
        Boolean(
          state.armed &&
          state.latlng
        );


      /*
        state 제거 전에
        좌표를 복사한다.
      */

      const latlng =

        success

          ?state.latlng

          :null;


      /*
        600ms 이전에 손을 뗀 경우
        Long Press 타이머 취소
      */

      clearLongPressTimer();


      /*
        "손을 떼세요" 표시 제거
      */

      removeFeedback();


      /*
        pointer 제스처 종료
      */

      state =
        null;


      /*
        그냥 짧게 터치했다면
        아무것도 하지 않는다.
      */

      if(
        !success ||
        !latlng
      ){
        return;
      }


      /*
        ======================================================
        실제 선택 팝업은 여기서 표시.

        pointerup 직후가 아니라
        70ms 후 만들어
        후속 click 이벤트와 분리한다.
        ======================================================
      */

      schedulePopupAfterRelease(
        latlng
      );

    }


    /* ========================================================
       pointercancel
       ======================================================== */

    function onPointerCancel(
      event
    ){

      if(
        !state ||
        state.pointerId !==
          event.pointerId
      ){
        return;
      }


      /*
        OS나 브라우저가 터치를 취소한 경우에는
        지점 선택 자체를 취소한다.
      */

      resetGesture();

    }


    /* ========================================================
       모바일 기본 Context Menu 차단
       ======================================================== */

    function onContextMenu(
      event
    ){

      if(
        window.matchMedia(
          '(pointer:coarse)'
        ).matches
      ){

        event.preventDefault();

      }

    }


    /* ========================================================
       Listener 등록
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
       지도 제거 시 Listener 정리
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
            Timer / feedback 정리
          */

          resetGesture();


          clearPopupTimer();


          /*
            Event Listener 제거
          */

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


/* ============================================================
   CSS 적용
   ============================================================ */

injectSafeWalkLongPressStableStyles();


console.log(
  '[SafeWalk v2.6.3] Long Press 시각 피드백 안정화 활성화'
);
