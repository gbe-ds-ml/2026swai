/* ============================================================
   SafeWalk v2.9.0 — mobile-ui-zoom-lock.js

   목적
   ------------------------------------------------------------
   모바일에서 브라우저 페이지 자체 확대/축소는 막고,
   Leaflet 지도 영역의 핀치 줌만 허용한다.

   허용:
   - #map 위 두 손가락 핀치 → Leaflet 지도 확대/축소
   - 지도 드래그
   - 버튼 탭
   - 패널 내부 일반 스크롤

   차단:
   - topbar 위 핀치 확대/축소
   - sheet / route / search / chat 등 UI 위 핀치
   - 브라우저 페이지 전체 pinch zoom
   - UI 위 double-tap zoom
   ============================================================ */

(function(){

  'use strict';


  /* ==========================================================
     모바일 여부
     ========================================================== */

  const isTouchDevice=

    window.matchMedia &&
    window.matchMedia(
      '(pointer: coarse)'
    ).matches;


  /*
    데스크톱에서는 아무것도 하지 않는다.
  */

  if(
    !isTouchDevice
  ){

    return;

  }


  /* ==========================================================
     지도 영역 판별

     Leaflet 지도 위에서 발생한 멀티터치는
     절대 preventDefault 하지 않는다.
     ========================================================== */

  function isInsideMap(target){

    if(
      !target ||
      !target.closest
    ){

      return false;

    }


    return !!target.closest(
      '#map'
    );

  }


  /* ==========================================================
     입력 요소 판별

     input/textarea/select 내부는
     키보드 동작을 최대한 건드리지 않는다.
     ========================================================== */

  function isFormControl(target){

    if(
      !target ||
      !target.closest
    ){

      return false;

    }


    return !!target.closest(
      'input, textarea, select'
    );

  }


  /* ==========================================================
     iOS Safari gesture 이벤트

     Safari는 pinch 시
     gesturestart / gesturechange / gestureend를 발생시킬 수 있음.

     지도 위에서는 허용.
     UI 위에서는 페이지 zoom 방지.
     ========================================================== */

  function preventGestureZoom(event){

    if(
      isInsideMap(
        event.target
      )
    ){

      return;

    }


    event.preventDefault();

  }


  document.addEventListener(

    'gesturestart',

    preventGestureZoom,

    {
      passive:false
    }

  );


  document.addEventListener(

    'gesturechange',

    preventGestureZoom,

    {
      passive:false
    }

  );


  document.addEventListener(

    'gestureend',

    preventGestureZoom,

    {
      passive:false
    }

  );


  /* ==========================================================
     일반 touch pinch 차단

     touches.length >= 2
     + 지도 밖
     → 브라우저 페이지 pinch zoom 차단

     지도 안
     → Leaflet에 그대로 전달
     ========================================================== */

  document.addEventListener(

    'touchmove',

    function(event){

      if(
        event.touches.length <
        2
      ){

        return;

      }


      if(
        isInsideMap(
          event.target
        )
      ){

        return;

      }


      event.preventDefault();

    },

    {
      passive:false,
      capture:true
    }

  );


  /* ==========================================================
     touchstart 멀티터치

     일부 모바일 브라우저는
     touchmove 전에 페이지 zoom을 시작할 수 있으므로
     UI에서 두 번째 손가락이 들어오는 순간부터 차단.
     ========================================================== */

  document.addEventListener(

    'touchstart',

    function(event){

      if(
        event.touches.length <
        2
      ){

        return;

      }


      if(
        isInsideMap(
          event.target
        )
      ){

        return;

      }


      event.preventDefault();

    },

    {
      passive:false,
      capture:true
    }

  );


  /* ==========================================================
     UI double-tap zoom 방지

     단:
     - 지도에서는 허용
     - 입력창에서는 방해하지 않음
     - 일반 버튼 탭은 정상 작동

     연속 두 번째 touchend가 300ms 이내면
     기본 브라우저 double-tap zoom만 막는다.
     ========================================================== */

  let lastTouchEndAt=0;


  document.addEventListener(

    'touchend',

    function(event){

      const target=
        event.target;


      if(
        isInsideMap(
          target
        )
      ){

        lastTouchEndAt=0;

        return;

      }


      if(
        isFormControl(
          target
        )
      ){

        lastTouchEndAt=0;

        return;

      }


      const now=
        Date.now();


      if(
        now-lastTouchEndAt <
        300
      ){

        event.preventDefault();

      }


      lastTouchEndAt=
        now;

    },

    {
      passive:false,
      capture:true
    }

  );


  /* ==========================================================
     Ctrl + wheel zoom

     일부 모바일/태블릿 브라우저,
     트랙패드가 연결된 환경에서
     브라우저 확대축소 방지.

     지도에서는 Leaflet wheel zoom을 허용.
     ========================================================== */

  document.addEventListener(

    'wheel',

    function(event){

      if(
        !event.ctrlKey
      ){

        return;

      }


      if(
        isInsideMap(
          event.target
        )
      ){

        return;

      }


      event.preventDefault();

    },

    {
      passive:false
    }

  );


  /* ==========================================================
     keyboard browser zoom

     태블릿 + 키보드 환경 보조.

     Ctrl/Cmd + + / - / 0
     UI 페이지 자체 확대 차단.
     ========================================================== */

  document.addEventListener(

    'keydown',

    function(event){

      const modifier=

        event.ctrlKey ||
        event.metaKey;


      if(
        !modifier
      ){

        return;

      }


      if(
        event.key === '+' ||
        event.key === '-' ||
        event.key === '=' ||
        event.key === '0'
      ){

        event.preventDefault();

      }

    }

  );


  /* ==========================================================
     UI용 touch-action 자동 적용

     manipulation:
     - 탭 허용
     - 일반 스크롤 허용
     - 불필요한 double-tap zoom 억제

     지도는 Leaflet이 touch-action을 관리하므로 제외.
     ========================================================== */

  function applyUiTouchPolicy(){

    const selectors=[

      '#topbar',

      '#sheet',

      '#routePanel',

      '#searchPanel',

      '#chatPanel',

      '#emergencyPanel',

      '#auditPanel',

      '#safeTimerPill',

      '#safeTimerAlert',

      '#chatFab',

      '#zoomNotice',

      '.panel-backdrop',

      '.route-toast'

    ];


    selectors.forEach(

      selector=>{

        document
          .querySelectorAll(
            selector
          )
          .forEach(

            element=>{

              element.style.touchAction=
                'manipulation';

            }

          );

      }

    );

  }


  /* ==========================================================
     viewport 메타 보강

     기존 index.html 설정이 이미 있어도
     SPA/브라우저 캐시 상황에서 확실하게 유지.
     ========================================================== */

  function reinforceViewportMeta(){

    let viewport=
      document.querySelector(
        'meta[name="viewport"]'
      );


    if(
      !viewport
    ){

      viewport=
        document.createElement(
          'meta'
        );


      viewport.name=
        'viewport';


      document.head.appendChild(
        viewport
      );

    }


    viewport.setAttribute(

      'content',

      [
        'width=device-width',
        'initial-scale=1.0',
        'maximum-scale=1.0',
        'minimum-scale=1.0',
        'user-scalable=no',
        'viewport-fit=cover'
      ].join(',')

    );

  }


  /* ==========================================================
     초기 실행
     ========================================================== */

  reinforceViewportMeta();


  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(

      'DOMContentLoaded',

      applyUiTouchPolicy,

      {
        once:true
      }

    );

  }

  else{

    applyUiTouchPolicy();

  }


  /* ==========================================================
     동적으로 생성되는 UI 대응

     route-ux.js 등에서 버튼 DOM을 바꾸는 경우가 있으므로
     DOM 변경 후 touch-action 재적용.
     ========================================================== */

  let observerTimer=null;


  const observer=
    new MutationObserver(

      ()=>{

        clearTimeout(
          observerTimer
        );


        observerTimer=
          setTimeout(

            applyUiTouchPolicy,

            80

          );

      }

    );


  function startObserver(){

    if(
      !document.body
    ){

      return;

    }


    observer.observe(

      document.body,

      {
        childList:true,
        subtree:true
      }

    );

  }


  if(
    document.body
  ){

    startObserver();

  }

  else{

    document.addEventListener(

      'DOMContentLoaded',

      startObserver,

      {
        once:true
      }

    );

  }


})();
