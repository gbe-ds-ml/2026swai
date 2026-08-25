/* SafeWalk v2.7.0 — route-mobile-ux.js */

let swRouteHistoryArmed=false;
let swIgnoreNextPop=false;
let swForceOriginOnNextOpen=false;
let swLongPressDraftState='none'; // none | origin | destination
let swRouteWakeLock=null;


/* ============================================================
   브라우저 History
   ============================================================ */

function swArmRouteHistory(){

  if(swRouteHistoryArmed)return;

  try{

    history.pushState(
      {
        ...(history.state||{}),
        safeWalkRoute:true
      },
      '',
      location.href
    );

    swRouteHistoryArmed=true;

  }catch(e){

    console.warn(
      '[SafeWalk] route history push 실패:',
      e
    );

  }

}


function swConsumeRouteHistoryEntry(){

  if(!swRouteHistoryArmed)return;

  swRouteHistoryArmed=false;
  swIgnoreNextPop=true;

  try{

    history.back();

  }catch(e){

    swIgnoreNextPop=false;

  }

}


/* ============================================================
   화면 Wake Lock

   길찾기 실행 중 화면이 자동으로 잠드는 것을
   지원 브라우저에서 최대한 방지한다.
   ============================================================ */

async function requestSafeWalkRouteWakeLock(){

  if(!('wakeLock' in navigator))return;

  if(
    document.visibilityState!=='visible'
  )return;

  if(swRouteWakeLock)return;


  try{

    swRouteWakeLock=
      await navigator.wakeLock.request(
        'screen'
      );


    swRouteWakeLock.addEventListener(

      'release',

      ()=>{

        swRouteWakeLock=null;

      }

    );

  }catch(e){

    console.debug(
      '[SafeWalk] Wake Lock 사용 불가:',
      e?.message||e
    );

  }

}


async function releaseSafeWalkRouteWakeLock(){

  const lock=
    swRouteWakeLock;


  swRouteWakeLock=null;


  if(!lock)return;


  try{

    await lock.release();

  }catch(e){}

}


/* ============================================================
   검색 입력 초기화
   ============================================================ */

function swClearRouteInputFields(){

  const results=
    document.getElementById(
      'spResults'
    );


  if(results){

    results.innerHTML='';

  }


  const input=
    document.getElementById(
      'spInput'
    );


  if(input){

    input.value='';

  }

}


function swRenderOriginNeedsInput(){

  const originVal=
    document.getElementById(
      'slotOriginVal'
    );


  if(
    originVal &&
    !routeOrigin
  ){

    originVal.textContent=
      '출발지를 지정하세요';


    originVal.classList.add(
      'empty'
    );

  }

}


function swResetRouteInputs(
  forceOriginNext=true
){

  routeOrigin=null;

  routeDest=null;

  activeSlot='origin';

  routeSnapNote='';

  swLongPressDraftState=
    'none';

  swForceOriginOnNextOpen=
    Boolean(
      forceOriginNext
    );


  updateSlotUI();


  if(forceOriginNext){

    swRenderOriginNeedsInput();

  }


  swClearRouteInputFields();

}


/* ============================================================
   현재 경로 그래픽 제거
   ============================================================ */

function swRemoveRouteVisualsKeepHistory(){

  clearRoute(
    true
  );


  if(map){

    map.closePopup();

  }

}


/* ============================================================
   길찾기 전 임시 출발/도착 마커

   출발지만 선택해도 지도에 바로 보이게 한다.
   ============================================================ */

function drawSafeWalkDraftMarker(
  point,
  type
){

  if(
    !map ||
    !point
  ){

    return null;

  }


  const isOrigin=
    type==='origin';


  const color=
    isOrigin
      ?'#059669'
      :'#ef4444';


  const emoji=
    isOrigin
      ?'🚩'
      :'🎯';


  const title=
    isOrigin
      ?'출발지'
      :'목적지';


  const marker=

    L.marker(

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


            className:'',

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
            point.label||
            '지도 선택 지점'
          )+
        '</div>'+

        (
          point.addr

            ?'<div class="prow">📍 '+
              esc(point.addr)+
              '</div>'

            :''
        )

      )

    )

    .addTo(
      map
    );


  return marker;

}


function swShowDraftMarkers(){

  if(!map)return;


  if(
    originMark &&
    map.hasLayer(
      originMark
    )
  ){

    map.removeLayer(
      originMark
    );

  }


  if(
    destinationMark &&
    map.hasLayer(
      destinationMark
    )
  ){

    map.removeLayer(
      destinationMark
    );

  }


  originMark=null;

  destinationMark=null;


  if(routeOrigin){

    originMark=
      drawSafeWalkDraftMarker(
        routeOrigin,
        'origin'
      );

  }


  if(routeDest){

    destinationMark=
      drawSafeWalkDraftMarker(
        routeDest,
        'dest'
      );

  }

}


/* ============================================================
   현재 GPS 위치

   목적지만 바로 선택했을 때 자동 출발지
   ============================================================ */

function getSafeWalkCurrentOriginForLongPress(){

  if(
    Number.isFinite(myLat) &&
    Number.isFinite(myLng)
  ){

    return Promise.resolve({

      lat:
        myLat,

      lng:
        myLng,

      label:
        '📍 현재 위치',

      src:
        'gps'

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
            '현재 위치 기능 미지원'
          )
        );

        return;

      }


      navigator.geolocation
        .getCurrentPosition(

          pos=>{

            const lat=
              Number(
                pos.coords.latitude
              );


            const lng=
              Number(
                pos.coords.longitude
              );


            if(
              !Number.isFinite(lat) ||
              !Number.isFinite(lng)
            ){

              reject(
                new Error(
                  '좌표 오류'
                )
              );

              return;

            }


            myLat=lat;
            myLng=lng;


            try{

              if(
                typeof writeLastPos===
                'function'
              ){

                writeLastPos(
                  lat,
                  lng
                );

              }

            }catch(e){}


            try{

              if(
                typeof drawMe===
                'function'
              ){

                drawMe();

              }

            }catch(e){}


            resolve({

              lat,

              lng,

              label:
                '📍 현재 위치',

              src:
                'gps'

            });

          },


          err=>{

            reject(

              err||

              new Error(
                '현재 위치 확인 실패'
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
   Long Press 출발지 / 목적지 설정

   기존 map-longpress.js 함수를 이 파일에서 최종 덮어쓴다.
   ============================================================ */

async function setSafeWalkLongPressPoint(
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


  if(map){

    map.closePopup();

  }


  /*
    길찾기 workflow를 브라우저 history에 하나 추가.

    이후 휴대폰 뒤로가기 시 페이지가 아니라
    이 history만 빠지면서 길찾기를 종료한다.
  */

  swArmRouteHistory();


  /* ========================================================
     새 출발지 선택
     ======================================================== */

  if(
    slot==='origin'
  ){

    /*
      직전에 목적지만 선택했는데
      GPS 취득에 실패해서 출발지를 기다리는 경우에는
      현재 목적지만 보존한다.
    */

    const pendingDest=

      (
        swLongPressDraftState===
          'destination'

        &&

        routeDest
      )

      ?{
          ...routeDest
        }

      :null;


    /*
      이전 길찾기 데이터 제거
    */

    swRemoveRouteVisualsKeepHistory();


    routeOrigin=null;

    routeDest=
      pendingDest;


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
      목적지가 이미 이번 draft에 존재한다면
      바로 경로 계산
    */

    if(routeDest){

      swLongPressDraftState=
        'none';


      swShowDraftMarkers();


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
      출발지만 표시하고
      새 목적지를 기다린다.
    */

    swLongPressDraftState=
      'origin';


    activeSlot=
      'dest';


    updateSlotUI();


    swShowDraftMarkers();


    showRouteToast(
      '🚩 출발지를 설정했습니다. 지도를 다시 길게 눌러 목적지를 지정하세요.'
    );


    return;

  }


  /* ========================================================
     새 목적지 선택
     ======================================================== */

  /*
    이번 세션에서 방금 선택한 출발지만 보존한다.

    예전에 계산했던 routeOrigin은 절대 가져오지 않는다.
  */

  const draftOrigin=

    (
      swLongPressDraftState===
        'origin'

      &&

      routeOrigin
    )

    ?{
        ...routeOrigin
      }

    :null;


  swRemoveRouteVisualsKeepHistory();


  routeOrigin=
    draftOrigin;


  routeDest=null;


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
    방금 선택한 출발지가 존재하는 경우
  */

  if(routeOrigin){

    swLongPressDraftState=
      'none';


    swShowDraftMarkers();


    showRouteToast(
      '🏁 목적지를 설정했습니다. 경로를 계산합니다.'
    );


    setTimeout(
      ()=>runSearchRoute(),
      100
    );


    return;

  }


  /* ========================================================
     목적지만 바로 선택한 경우

     이전 출발지가 아니라
     현재 GPS를 새 출발지로 설정
     ======================================================== */

  try{

    const current=

      await getSafeWalkCurrentOriginForLongPress();


    setSlotValue(
      'origin',
      current
    );


    swLongPressDraftState=
      'none';


    swShowDraftMarkers();


    showRouteToast(
      '🏁 목적지를 설정했습니다. 현재 위치에서 경로를 계산합니다.'
    );


    setTimeout(
      ()=>runSearchRoute(),
      100
    );

  }

  catch(e){

    console.warn(
      '[SafeWalk] 현재 위치 자동 출발지 실패:',
      e
    );


    /*
      GPS 실패 시 이번 목적지는 유지.

      사용자가 출발지를 직접 고르면
      그 둘로 경로를 계산한다.
    */

    swLongPressDraftState=
      'destination';


    activeSlot=
      'origin';


    updateSlotUI();


    swShowDraftMarkers();


    showRouteToast(
      '현재 위치를 확인하지 못했습니다. 출발지를 직접 지정해 주세요.'
    );

  }

}


/* ============================================================
   길찾기 설정창 X

   기존 값 모두 삭제.
   다음에는 무조건 출발지부터.
   ============================================================ */

function cancelRouteSetupUX(){

  closeSearchPanel();


  document.body
    .classList
    .remove(
      'route-panel-suppressed'
    );


  swRemoveRouteVisualsKeepHistory();


  swResetRouteInputs(
    true
  );


  releaseSafeWalkRouteWakeLock();


  swConsumeRouteHistoryEntry();


  showRouteToast(
    '길찾기 설정을 취소했습니다. 다음에는 출발지부터 다시 지정합니다.'
  );

}


/* ============================================================
   경로 결과 패널 X

   경로를 종료하지 않는다.
   정보 패널만 숨긴다.
   ============================================================ */

function hideRoutePanelKeepRoute(){

  const panel=
    document.getElementById(
      'routePanel'
    );


  if(!panel)return;


  if(
    swRouteHistoryArmed &&
    routeOrigin &&
    routeDest
  ){

    /*
      기존 CSS에 이미
      route-panel-suppressed 지원이 있다.
    */

    document.body
      .classList
      .add(
        'route-panel-suppressed'
      );


    panel.classList.remove(
      'show'
    );


    document.body.classList.remove(
      'route-visible'
    );


    if(
      typeof syncRoutePanelWithSheet===
      'function'
    ){

      syncRoutePanelWithSheet();

    }


    showRouteToast(
      '경로 안내는 계속 유지됩니다. 길찾기 버튼을 누르면 경로 정보를 다시 볼 수 있습니다.'
    );


    return;

  }


  cancelRouteSetupUX();

}


/* ============================================================
   숨긴 경로 패널 다시 열기
   ============================================================ */

function showActiveRoutePanelUX(){

  const panel=
    document.getElementById(
      'routePanel'
    );


  if(!panel){

    return false;

  }


  if(
    !(
      swRouteHistoryArmed &&
      routeOrigin &&
      routeDest
    )
  ){

    return false;

  }


  document.body
    .classList
    .remove(
      'route-panel-suppressed'
    );


  panel.classList.add(
    'show'
  );


  document.body.classList.add(
    'route-visible'
  );


  if(
    typeof syncRoutePanelWithSheet===
    'function'
  ){

    syncRoutePanelWithSheet();

  }


  return true;

}


/* ============================================================
   실제 길찾기 종료

   휴대폰 뒤로가기에서 호출
   ============================================================ */

function endActiveRouteUX({
  fromPopState=false,
  quiet=false
}={}){

  closeSearchPanel();


  document.body
    .classList
    .remove(
      'route-panel-suppressed'
    );


  swRemoveRouteVisualsKeepHistory();


  swResetRouteInputs(
    true
  );


  releaseSafeWalkRouteWakeLock();


  if(fromPopState){

    swRouteHistoryArmed=
      false;

  }

  else{

    swConsumeRouteHistoryEntry();

  }


  if(!quiet){

    showRouteToast(
      '길찾기를 종료했습니다. 지도는 계속 이용할 수 있습니다.'
    );

  }

}


/* ============================================================
   검색 패널 열기 수정

   명시적으로 X를 눌러 취소한 다음에는
   기존 openSearchPanel의 "현재 위치 자동출발"을 한 번 막고
   출발지부터 다시 입력받는다.
   ============================================================ */

if(
  typeof openSearchPanel===
  'function'
){

  const baseOpenSearchPanel=
    openSearchPanel;


  openSearchPanel=
    function(){

      const force=
        swForceOriginOnNextOpen;


      const result=

        baseOpenSearchPanel.apply(
          this,
          arguments
        );


      if(force){

        swForceOriginOnNextOpen=
          false;


        routeOrigin=null;

        routeDest=null;

        activeSlot='origin';


        updateSlotUI();

        swRenderOriginNeedsInput();

        focusSlot(
          'origin'
        );


        setSearchMsg(
          '출발지를 먼저 지정해 주세요. 현재 위치 또는 지도 선택을 사용할 수 있습니다.'
        );

      }


      return result;

    };

}


/* ============================================================
   상단 길찾기 버튼

   경로가 이미 실행 중이면 새 검색을 시작하지 않고
   숨긴 결과창을 다시 연다.
   ============================================================ */

if(
  typeof startRoutePick===
  'function'
){

  const baseStartRoutePick=
    startRoutePick;


  startRoutePick=
    function(){

      if(
        showActiveRoutePanelUX()
      ){

        return;

      }


      swArmRouteHistory();


      return baseStartRoutePick.apply(
        this,
        arguments
      );

    };

}


/* ============================================================
   실제 경로 실행 시 Wake Lock
   ============================================================ */

if(
  typeof runSearchRoute===
  'function'
){

  const baseRunSearchRoute=
    runSearchRoute;


  runSearchRoute=
    async function(){

      if(
        routeOrigin &&
        routeDest
      ){

        swArmRouteHistory();


        swLongPressDraftState=
          'none';


        requestSafeWalkRouteWakeLock();

      }


      return await baseRunSearchRoute.apply(
        this,
        arguments
      );

    };

}


/* ============================================================
   Long Press 안내 문구
   ============================================================ */

if(
  typeof openSafeWalkLongPressPopup===
  'function'
){

  const baseOpenLongPressPopup=
    openSafeWalkLongPressPopup;


  openSafeWalkLongPressPopup=
    function(latlng){

      const result=

        baseOpenLongPressPopup.apply(
          this,
          arguments
        );


      requestAnimationFrame(
        ()=>{

          const el=
            document.querySelector(
              '.sw-longpress-desc'
            );


          if(el){

            el.textContent=
              '목적지만 설정하면 현재 위치가 자동 출발지가 됩니다.';

          }

        }
      );


      return result;

    };

}


/* ============================================================
   상단 ← 버튼

   사용자가 진짜 메인화면으로 나갈 때
   route history가 뒤에 남지 않도록 정리
   ============================================================ */

if(
  typeof goBack===
  'function'
){

  const baseGoBack=
    goBack;


  goBack=
    function(){

      const hadHistory=
        swRouteHistoryArmed;


      swRouteHistoryArmed=
        false;


      swLongPressDraftState=
        'none';


      releaseSafeWalkRouteWakeLock();


      const result=

        baseGoBack.apply(
          this,
          arguments
        );


      if(hadHistory){

        swIgnoreNextPop=
          true;


        try{

          history.back();

        }

        catch(e){

          swIgnoreNextPop=
            false;

        }

      }


      return result;

    };

}


/* ============================================================
   Android 뒤로가기 / 모바일 브라우저 뒤로가기

   페이지를 나가지 않고 길찾기만 종료
   ============================================================ */

window.addEventListener(

  'popstate',

  ()=>{


    if(swIgnoreNextPop){

      swIgnoreNextPop=
        false;

      return;

    }


    if(swRouteHistoryArmed){

      swRouteHistoryArmed=
        false;


      endActiveRouteUX({

        fromPopState:
          true

      });

    }

  }

);


/* ============================================================
   화면을 다시 켰을 때 Wake Lock 재요청
   ============================================================ */

document.addEventListener(

  'visibilitychange',

  ()=>{


    if(
      document.visibilityState===
        'visible'

      &&

      swRouteHistoryArmed

      &&

      routeOrigin

      &&

      routeDest
    ){

      requestSafeWalkRouteWakeLock();

    }

  }

);


/* ============================================================
   기존 inline X 버튼 동작 교체
   ============================================================ */

function bindSafeWalkRouteUxButtons(){

  /*
    길찾기 검색 패널 X
    → 전체 취소
  */

  const searchClose=
    document.querySelector(
      '#searchPanel .route-close'
    );


  if(searchClose){

    searchClose.onclick=
      cancelRouteSetupUX;


    searchClose.setAttribute(
      'aria-label',
      '길찾기 설정 취소'
    );

  }


  /*
    결과 패널 X
    → 경로 유지 + 패널만 숨김
  */

  const routeClose=
    document.querySelector(
      '#routePanel .route-close'
    );


  if(routeClose){

    routeClose.onclick=
      hideRoutePanelKeepRoute;


    routeClose.setAttribute(
      'aria-label',
      '경로 정보 패널 닫기'
    );

  }

}


if(
  document.readyState===
  'loading'
){

  document.addEventListener(

    'DOMContentLoaded',

    bindSafeWalkRouteUxButtons,

    {
      once:true
    }

  );

}

else{

  bindSafeWalkRouteUxButtons();

}


window.cancelRouteSetupUX=
  cancelRouteSetupUX;


window.hideRoutePanelKeepRoute=
  hideRoutePanelKeepRoute;


window.endActiveRouteUX=
  endActiveRouteUX;


console.log(
  '[SafeWalk v2.7] 모바일 길찾기 UX 활성화'
);
