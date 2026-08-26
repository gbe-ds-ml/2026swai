/* ============================================================
   SafeWalk v2.8.3 — route-back-guard.js

   모바일 뒤로가기 보호

   동작
   ------------------------------------------------------------
   길안내 패널이 열린 상태에서 모바일 뒤로가기:
   → 다른 페이지로 이동하지 않음
   → X 버튼과 동일하게 패널만 접음
   → 경로선 유지

   패널이 이미 접힌 상태에서 다시 뒤로가기:
   → 브라우저 기본 뒤로가기 허용

   [길찾기 취소]:
   → 기존 route-ux.js 동작 그대로
   → 경로 완전 삭제

   주의:
   route-ux.js / route-group-restore.js 다음에 로드
   ============================================================ */


/* ============================================================
   상태
   ============================================================ */

const SW_ROUTE_BACK_GUARD_STATE =
  'safeWalkRoutePanelGuard';


let swRouteBackGuardArmed =

  Boolean(
    history.state &&
    history.state[SW_ROUTE_BACK_GUARD_STATE]
  );


let swRouteBackGuardIgnorePop =
  false;


/* ============================================================
   모바일 / 터치 기기 판별
   ============================================================ */

function swIsMobileBackGuardDevice(){

  return Boolean(

    (
      window.matchMedia &&
      window.matchMedia(
        '(pointer:coarse)'
      ).matches
    )

    ||

    (
      navigator.maxTouchPoints &&
      navigator.maxTouchPoints > 0
    )

  );

}


/* ============================================================
   현재 경로 존재 여부
   ============================================================ */

function swBackGuardHasRoute(){

  if(
    typeof swHasActiveRoute ===
    'function'
  ){

    return swHasActiveRoute();

  }


  return Boolean(
    typeof routeOrigin !== 'undefined' &&
    typeof routeDest !== 'undefined' &&
    routeOrigin &&
    routeDest
  );

}


/* ============================================================
   경로 패널 표시 여부
   ============================================================ */

function swIsRoutePanelVisible(){

  const panel =
    document.getElementById(
      'routePanel'
    );


  return Boolean(
    panel &&
    panel.classList.contains(
      'show'
    )
  );

}


/* ============================================================
   현재 history entry가 Guard인지
   ============================================================ */

function swIsCurrentRouteGuardEntry(){

  return Boolean(

    history.state &&

    history.state[
      SW_ROUTE_BACK_GUARD_STATE
    ]

  );

}


/* ============================================================
   뒤로가기 보호 entry 생성

   현재 SafeWalk URL과 똑같은 history entry를
   하나 더 올려둔다.

   따라서 휴대폰 뒤로가기 1회는
   외부 페이지가 아니라 이 entry만 빠지게 된다.
   ============================================================ */

function swArmRouteBackGuard(){

  if(
    !swIsMobileBackGuardDevice()
  ){
    return;
  }


  if(
    !swBackGuardHasRoute()
  ){
    return;
  }


  if(
    !swIsRoutePanelVisible()
  ){
    return;
  }


  /*
    이미 Guard가 올라가 있으면
    중복 push 금지
  */

  if(
    swRouteBackGuardArmed ||
    swIsCurrentRouteGuardEntry()
  ){

    swRouteBackGuardArmed =
      true;

    return;

  }


  try{

    const oldState =

      (
        history.state &&
        typeof history.state ===
          'object'
      )

      ?history.state

      :{};


    history.pushState(

      {

        ...oldState,

        [SW_ROUTE_BACK_GUARD_STATE]:
          true

      },

      '',

      location.href

    );


    swRouteBackGuardArmed =
      true;


    console.log(
      '[SafeWalk] 모바일 뒤로가기 보호 활성화'
    );

  }

  catch(error){

    console.warn(
      '[SafeWalk] 뒤로가기 보호 설정 실패:',
      error
    );

  }

}


/* ============================================================
   Guard history entry 제거

   X / 길찾기 취소 / 메인화면 이동처럼
   사용자가 버튼으로 직접 상태를 변경했을 때 사용.

   history.back()을 한 번 실행하지만
   현재 URL과 동일한 SafeWalk history entry이므로
   화면 이동은 발생하지 않는다.
   ============================================================ */

function swConsumeRouteBackGuard(){

  if(
    !swRouteBackGuardArmed &&
    !swIsCurrentRouteGuardEntry()
  ){

    return;

  }


  swRouteBackGuardArmed =
    false;


  swRouteBackGuardIgnorePop =
    true;


  try{

    history.back();

  }

  catch(error){

    swRouteBackGuardIgnorePop =
      false;

  }

}


/* ============================================================
   안내 멘트
   ============================================================ */

function swShowRouteKeepMessage(){

  if(
    typeof showRouteToast !==
    'function'
  ){
    return;
  }


  showRouteToast(

    '경로는 계속 유지됩니다.\n'+
    '종료하려면 \'길찾기 취소\'를 눌러주세요.',

    4500

  );

}


/* ============================================================
   기존 X 기능 확장

   X:
   → 패널 숨김
   → 경로 유지
   → Guard history 정리
   ============================================================ */

if(
  typeof swHideRoutePanel ===
  'function'
){

  const swBaseHideRoutePanelForBackGuard =
    swHideRoutePanel;


  swHideRoutePanel =
    function(){

      const result =

        swBaseHideRoutePanelForBackGuard
          .apply(
            this,
            arguments
          );


      /*
        X로 직접 닫은 경우에는
        뒤로가기 보호용 history entry도 제거.

        그래야 다음 실제 뒤로가기가
        한 번 헛도는 일이 없다.
      */

      swConsumeRouteBackGuard();


      /*
        기존 짧은 토스트를
        조금 더 명확한 안내로 덮어쓴다.
      */

      if(
        swBackGuardHasRoute()
      ){

        swShowRouteKeepMessage();

      }


      return result;

    };


  window.swHideRoutePanel =
    swHideRoutePanel;

}


/* ============================================================
   경로 패널 다시 열기

   X로 접었다가 상단 길찾기 버튼으로
   다시 열었을 때 Guard도 다시 생성
   ============================================================ */

if(
  typeof swShowRoutePanel ===
  'function'
){

  const swBaseShowRoutePanelForBackGuard =
    swShowRoutePanel;


  swShowRoutePanel =
    function(){

      const result =

        swBaseShowRoutePanelForBackGuard
          .apply(
            this,
            arguments
          );


      setTimeout(

        swArmRouteBackGuard,

        0

      );


      return result;

    };

}


/* ============================================================
   경로 계산 완료 후 Guard 생성

   route.js → route-ux.js까지 모두 실행된 뒤
   실제 패널이 나타난 상태에서 history 보호 추가
   ============================================================ */

if(
  typeof runSearchRoute ===
  'function'
){

  const swBaseRunSearchRouteForBackGuard =
    runSearchRoute;


  runSearchRoute =
    async function(){

      const result =

        await swBaseRunSearchRouteForBackGuard
          .apply(
            this,
            arguments
          );


      /*
        경로 계산/렌더링 후
        실제 패널 상태 확인
      */

      setTimeout(

        ()=>{

          if(
            swBackGuardHasRoute() &&
            swIsRoutePanelVisible()
          ){

            swArmRouteBackGuard();

          }

        },

        80

      );


      return result;

    };

}


/* ============================================================
   길찾기 취소

   진짜 취소이므로 기존 route-ux.js가
   경로와 sessionStorage를 삭제한다.

   여기서는 Guard history만 정리.
   ============================================================ */

if(
  typeof swCancelActiveRoute ===
  'function'
){

  const swBaseCancelRouteForBackGuard =
    swCancelActiveRoute;


  swCancelActiveRoute =
    function(){

      const hadGuard =

        swRouteBackGuardArmed ||
        swIsCurrentRouteGuardEntry();


      /*
        실제 경로 삭제
      */

      const result =

        swBaseCancelRouteForBackGuard
          .apply(
            this,
            arguments
          );


      /*
        history 보호 entry도 제거
      */

      if(hadGuard){

        swConsumeRouteBackGuard();

      }


      return result;

    };


  window.swCancelActiveRoute =
    swCancelActiveRoute;

}


/* ============================================================
   SafeWalk 상단 ← 메인화면 이동

   메인화면 버튼은 사용자가 명시적으로 누른 것이므로
   route-group-restore.js가 경로를 저장한 뒤
   정상적으로 메인으로 이동.

   Guard history만 없애서
   뒤로가기 history가 한 단계 남는 현상을 방지.
   ============================================================ */

if(
  typeof goBack ===
  'function'
){

  const swBaseGoBackForBackGuard =
    goBack;


  goBack =
    function(){

      const hadGuard =

        swRouteBackGuardArmed ||
        swIsCurrentRouteGuardEntry();


      /*
        route-group-restore.js를 포함한
        기존 goBack 실행
      */

      const result =

        swBaseGoBackForBackGuard
          .apply(
            this,
            arguments
          );


      /*
        경로 자체는 삭제하지 않는다.
        history 보호 entry만 제거.
      */

      if(hadGuard){

        swConsumeRouteBackGuard();

      }


      return result;

    };

}


/* ============================================================
   핵심: 모바일 브라우저 뒤로가기

   Guard entry에서 뒤로가기 발생
       ↓
   외부 사이트로 이동하기 전에
   같은 SafeWalk history entry로 복귀
       ↓
   route panel만 닫기
       ↓
   경로 유지

   두 번째 뒤로가기는 Guard가 없으므로
   브라우저 원래 기능대로 동작.
   ============================================================ */

window.addEventListener(

  'popstate',

  ()=>{


    /*
      X / 취소 / 메인 버튼에서
      history 정리를 위해 호출한 history.back()
    */

    if(
      swRouteBackGuardIgnorePop
    ){

      swRouteBackGuardIgnorePop =
        false;

      return;

    }


    /*
      모바일 전용
    */

    if(
      !swIsMobileBackGuardDevice()
    ){
      return;
    }


    /*
      Guard가 없었다면
      브라우저의 정상 뒤로가기
    */

    if(
      !swRouteBackGuardArmed
    ){
      return;
    }


    /*
      Guard는 이번 뒤로가기로 소진됨
    */

    swRouteBackGuardArmed =
      false;


    /*
      경로와 패널이 실제로 존재하는 경우에만
      X와 동일한 동작.
    */

    if(
      swBackGuardHasRoute() &&
      swIsRoutePanelVisible()
    ){

      /*
        중요:
        wrapper가 아닌 기존 hide 함수를 직접 호출.

        여기서 다시 history.back()을 호출하면 안 됨.
      */

      if(
        typeof swBaseHideRoutePanelForBackGuard ===
          'function'
      ){

        swBaseHideRoutePanelForBackGuard();

      }


      swShowRouteKeepMessage();

    }

  }

);


/* ============================================================
   페이지 복귀 / bfcache

   외부 사이트 갔다 돌아왔는데
   경로 패널이 살아 있다면 Guard 상태 재확인.
   ============================================================ */

window.addEventListener(

  'pageshow',

  ()=>{

    /*
      현재 history state가 Guard이면
      그대로 인식
    */

    if(
      swIsCurrentRouteGuardEntry()
    ){

      swRouteBackGuardArmed =
        true;

      return;

    }


    /*
      복원 과정으로 route panel이 다시 생성된 경우
    */

    setTimeout(

      ()=>{

        if(
          swBackGuardHasRoute() &&
          swIsRoutePanelVisible()
        ){

          swArmRouteBackGuard();

        }

      },

      250

    );

  }

);


/* ============================================================
   최초 진입 시 안전망

   route-group-restore 등이 비동기로 경로를 복원하는
   경우까지 대응.
   ============================================================ */

setTimeout(

  ()=>{

    if(
      swBackGuardHasRoute() &&
      swIsRoutePanelVisible()
    ){

      swArmRouteBackGuard();

    }

  },

  700

);


console.log(
  '[SafeWalk v2.8.3] 모바일 뒤로가기 길안내 패널 보호 활성화'
);
