/* ============================================================
   SafeWalk v2.8.2 — route-group-restore.js

   메인화면 왕복 시 경로 유지

   규칙
   ------------------------------------------------------------
   1. 지도 → 메인
      → 활성 경로를 sessionStorage에 저장
      → 지도 자체는 정상적으로 종료

   2. 메인 → 동일 이용자 유형
      → 기존 경로 자동 복원

   3. 메인 → 다른 이용자 유형
      → 기존 경로 표시하지 않음
      → 저장 경로 자체는 삭제하지 않음

   4. 다시 기존 이용자 유형으로 진입
      → 저장 경로 복원

   5. "길찾기 취소"
      → route-ux.js의 기존 기능대로
         저장된 경로까지 완전히 삭제
   ============================================================ */


let swGroupRouteRestoreToken = 0;

let swGroupRouteRestoring = false;


/* ============================================================
   현재 Route Panel이 접혀 있는지
   ============================================================ */

function swIsCurrentRoutePanelHidden(){

  const panel =
    document.getElementById(
      'routePanel'
    );


  if(!panel){
    return true;
  }


  return !panel.classList.contains(
    'show'
  );

}


/* ============================================================
   메인화면으로 돌아가기 전
   현재 활성 경로 저장

   중요:
   실제 goBack()은 이후 지도와 routeOrigin/routeDest를
   초기화해도 괜찮다.

   sessionStorage에는 경로가 이미 남아 있기 때문이다.
   ============================================================ */

function swSaveRouteBeforeMain(){

  if(
    typeof swHasActiveRoute !==
      'function'

    ||

    !swHasActiveRoute()
  ){
    return;
  }


  /*
    CPTED는 일반 경로 복원 대상이 아님
  */

  if(
    typeof grp !==
      'undefined'

    &&

    grp === 'cpted'
  ){
    return;
  }


  if(
    typeof swSaveRouteState ===
      'function'
  ){

    swSaveRouteState(
      swIsCurrentRoutePanelHidden()
    );

  }

}


/* ============================================================
   저장된 경로가 현재 선택한 이용자 유형의 것인지 확인
   ============================================================ */

function swGetRouteForGroup(group){

  if(
    !group

    ||

    typeof swReadRouteState !==
      'function'
  ){
    return null;
  }


  const state =
    swReadRouteState();


  if(!state){
    return null;
  }


  /*
    핵심

    저장 당시 이용자 유형과
    지금 선택한 이용자 유형이 다르면

    → 복원 X
    → 삭제도 X
  */

  if(
    state.group !==
    group
  ){

    return null;

  }


  return state;

}


/* ============================================================
   현재 선택된 이용자 유형으로 경로 복원
   ============================================================ */

async function swRestoreRouteForGroup(
  group,
  state
){

  if(
    !group ||
    !state
  ){
    return;
  }


  /*
    사용자가 빠르게 다른 화면으로 이동하는 상황 방어
  */

  const token =
    ++swGroupRouteRestoreToken;


  swGroupRouteRestoring =
    true;


  try{

    /*
      start()가 먼저 실행되어
      해당 그룹의 지도가 만들어진 상태여야 한다.
    */

    if(!map){

      return;

    }


    /*
      사용자가 복원 직전에 다른 그룹으로 바꿨다면 중단
    */

    if(
      grp !== group
    ){

      return;

    }


    routeOrigin = {

      ...state.origin

    };


    routeDest = {

      ...state.destination

    };


    activeSlot =
      'dest';


    routeSnapNote =
      '';


    if(
      typeof updateSlotUI ===
      'function'
    ){

      updateSlotUI();

    }


    /*
      지도와 각종 초기 UI가 만들어질 시간을 조금 준다.
    */

    await new Promise(
      resolve=>
        setTimeout(
          resolve,
          140
        )
    );


    /*
      기다리는 사이 사용자가 메인으로 나갔거나
      다른 그룹으로 바꾼 경우 중단
    */

    if(
      token !==
        swGroupRouteRestoreToken

      ||

      !map

      ||

      grp !== group
    ){

      return;

    }


    if(
      typeof runSearchRoute !==
        'function'
    ){

      return;

    }


    /*
      route-ux.js에 복원 플래그가 존재하면
      복원 과정에서 저장 상태를 불필요하게 덮어쓰지 않도록 사용
    */

    if(
      typeof swRouteRestoring !==
        'undefined'
    ){

      swRouteRestoring =
        true;

    }


    await runSearchRoute();


    /*
      runSearchRoute 도중
      다른 화면으로 나간 경우
    */

    if(
      token !==
        swGroupRouteRestoreToken

      ||

      !map

      ||

      grp !== group
    ){

      return;

    }


    /*
      과거에 경로 패널을 X로 접은 상태였다면
      경로는 복원하되 패널은 다시 접는다.
    */

    if(
      state.panelHidden
    ){

      if(
        typeof swHideRoutePanel ===
        'function'
      ){

        swHideRoutePanel();

      }

    }

    else{

      if(
        typeof swShowRoutePanel ===
        'function'
      ){

        swShowRoutePanel();

      }


      if(
        typeof swSaveRouteState ===
          'function'
      ){

        swSaveRouteState(
          false
        );

      }

    }


    console.log(
      '[SafeWalk] 동일 이용자 유형 경로 복원:',
      group
    );

  }

  catch(error){

    console.warn(
      '[SafeWalk] 이용자 유형별 경로 복원 실패:',
      error
    );

  }

  finally{

    swGroupRouteRestoring =
      false;


    if(
      typeof swRouteRestoring !==
        'undefined'
    ){

      swRouteRestoring =
        false;

    }

  }

}


/* ============================================================
   goBack() 확장

   기존 goBack()을 실행하기 전에
   경로만 sessionStorage에 보존한다.

   이후 기존 main.js는 지도 객체를 정상적으로 제거한다.
   ============================================================ */

if(
  typeof goBack ===
  'function'
){

  const swBaseGoBackForRouteRestore =
    goBack;


  goBack =
    function(){

      /*
        메인으로 나가기 전
        마지막 경로 저장
      */

      swSaveRouteBeforeMain();


      /*
        진행 중 복원 작업 취소
      */

      swGroupRouteRestoreToken++;


      /*
        기존 main.js의 정리 작업 수행
      */

      return swBaseGoBackForRouteRestore.apply(
        this,
        arguments
      );

    };

}


/* ============================================================
   start() 확장

   메인화면에서 선택한 grp 기준으로만 복원한다.
   ============================================================ */

if(
  typeof start ===
  'function'
){

  const swBaseStartForRouteRestore =
    start;


  start =
    function(){

      /*
        사용자가 메인화면에서 실제로 선택한 그룹.

        start() 실행 후 grp가 바뀌는 상황에 대비해서
        먼저 별도 변수로 보존한다.
      */

      const selectedGroup =
        grp;


      /*
        저장 경로 확인.

        여기서 그룹이 다르면 null 반환.
        저장 데이터 자체는 삭제하지 않는다.
      */

      const savedRoute =
        swGetRouteForGroup(
          selectedGroup
        );


      /*
        기존 SafeWalk 지도 진입
      */

      const result =
        swBaseStartForRouteRestore.apply(
          this,
          arguments
        );


      /*
        같은 이용자 유형에서 만든 경로가 없다면
        그냥 새 지도 그대로 사용.
      */

      if(
        !savedRoute
      ){

        console.log(
          '[SafeWalk] 현재 이용자 유형에 복원할 경로 없음:',
          selectedGroup
        );


        return result;

      }


      /*
        같은 이용자 유형이면
        지도 생성 직후 경로 복원
      */

      setTimeout(

        ()=>{

          swRestoreRouteForGroup(
            selectedGroup,
            savedRoute
          );

        },

        30

      );


      return result;

    };

}


/* ============================================================
   CPTED

   CPTED로 들어갈 때는 저장된 일반 길찾기를 보여주지 않는다.

   하지만 기존 일반 경로 데이터 자체는 삭제하지 않는다.
   ============================================================ */

if(
  typeof startCpted ===
  'function'
){

  const swBaseStartCptedForRouteRestore =
    startCpted;


  startCpted =
    function(){

      swGroupRouteRestoreToken++;


      return swBaseStartCptedForRouteRestore.apply(
        this,
        arguments
      );

    };

}


/* ============================================================
   진짜 길찾기 취소와 연계

   route-ux.js의 swCancelActiveRoute()가
   이미 sessionStorage까지 삭제하므로
   별도 삭제 로직은 필요 없다.

   다만 진행 중인 복원 작업이 있다면 중단한다.
   ============================================================ */

if(
  typeof swCancelActiveRoute ===
  'function'
){

  const swBaseCancelActiveRoute =
    swCancelActiveRoute;


  swCancelActiveRoute =
    function(){

      swGroupRouteRestoreToken++;


      return swBaseCancelActiveRoute.apply(
        this,
        arguments
      );

    };


  /*
    기존 HTML이나 route-ux.js에서
    window 함수를 직접 참조하는 경우도 갱신
  */

  window.swCancelActiveRoute =
    swCancelActiveRoute;

}


console.log(
  '[SafeWalk v2.8.2] 이용자 유형별 경로 복원 활성화'
);
