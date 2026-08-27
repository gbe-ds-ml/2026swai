/* ============================================================
   SafeWalk v2.2 — map.js

   Leaflet 지도
   - VWorld Base 2D 배경지도
   - GPS
   - 위치 기억
   - 생활안전지도 WMS
   - CPTED
   ============================================================ */


/* ============================================================
   지도 상태
   ============================================================ */

let map=null;

let myMark=null;

let myLat=null;

let myLng=null;


let watchId=null;

let mapDomCleanups=[];

let suppressMoveFetch=false;


let cptedGuideLine=null;

let cptedTargetMark=null;

let cptedTapMark=null;

let lastCptedDirectTapAt=0;

let cptedTapRequestToken=0;

let lastPopupCloseAt=0;


/* ============================================================
   생활안전지도 EPSG:4326 WMS
   ============================================================ */

let _SafemapWMS4326=null;


function getSafemapWMSClass(){

  if(
    !_SafemapWMS4326
  ){

    _SafemapWMS4326=
      L.TileLayer.extend({

        getTileUrl:function(coords){

          const b=
            this._tileCoordsToBounds(
              coords
            );


          const bbox=[

            b.getWest(),

            b.getSouth(),

            b.getEast(),

            b.getNorth()

          ].join(',');


          return (

            this._url+

            '?serviceKey='+
            encodeURIComponent(
              API_KEY
            )+

            '&srs=EPSG:4326'+

            '&bbox='+
            bbox+

            '&format=image/png'+

            '&width=256'+

            '&height=256'+

            '&transparent=TRUE'

          );

        }

      });

  }


  return _SafemapWMS4326;

}


/* ============================================================
   마지막 위치 기억
   ============================================================ */

let lastPosSavedAt=0;


function readLastPos(){

  try{

    const raw=
      localStorage.getItem(
        LAST_POS_STORAGE_KEY
      );


    if(
      !raw
    ){
      return null;
    }


    const p=
      JSON.parse(
        raw
      );


    if(
      !Number.isFinite(p.lat) ||
      !Number.isFinite(p.lng)
    ){

      return null;

    }


    return p;

  }

  catch(error){

    return null;

  }

}


function writeLastPos(
  lat,
  lng
){

  const now=
    Date.now();


  /*
    localStorage 쓰기 과다 방지
  */

  if(
    now-lastPosSavedAt <
    30000
  ){

    return;

  }


  lastPosSavedAt=
    now;


  try{

    localStorage.setItem(

      LAST_POS_STORAGE_KEY,

      JSON.stringify({

        lat,

        lng,

        ts:now

      })

    );

  }

  catch(error){}

}


/* ============================================================
   VWorld 타일 URL 생성

   공식 WMTS:
   Base/{z}/{y}/{x}.png
   ============================================================ */

function getVWorldTileUrl(
  z,
  x,
  y
){

  return (

    'https://api.vworld.kr/req/wmts/1.0.0/'+
    VWORLD_API_KEY+
    '/Base/'+
    z+'/'+
    y+'/'+
    x+
    '.png'

  );

}


/* ============================================================
   Web Mercator XYZ 타일 좌표 계산
   ============================================================ */

function tileXY(
  lat,
  lng,
  z
){

  const n=
    Math.pow(
      2,
      z
    );


  const x=
    Math.floor(

      (
        lng+
        180
      )
      /
      360
      *
      n

    );


  const latRad=
    lat*
    Math.PI/
    180;


  const y=
    Math.floor(

      (
        1-

        Math.log(

          Math.tan(
            latRad
          )
          +
          1/
          Math.cos(
            latRad
          )

        )
        /
        Math.PI

      )
      /
      2
      *
      n

    );


  return {
    x,
    y
  };

}


/* ============================================================
   VWorld 중심 타일 prefetch

   현재 위치 주변 3×3 타일을
   미리 브라우저 캐시에 요청한다.
   ============================================================ */

const prefetchedTiles=
  new Set();


function prefetchCenterTiles(
  lat,
  lng
){

  if(
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ){

    return;

  }


  const z=
    DEFAULT_ZOOM;


  const center=
    tileXY(
      lat,
      lng,
      z
    );


  for(
    let dx=-1;
    dx<=1;
    dx++
  ){

    for(
      let dy=-1;
      dy<=1;
      dy++
    ){

      const x=
        center.x+
        dx;


      const y=
        center.y+
        dy;


      const url=
        getVWorldTileUrl(
          z,
          x,
          y
        );


      if(
        prefetchedTiles.has(
          url
        )
      ){

        continue;

      }


      prefetchedTiles.add(
        url
      );


      const img=
        new Image();


      img.decoding=
        'async';


      img.src=
        url;

    }

  }

}


/* ============================================================
   위치 워밍업

   이용자 유형을 고른 뒤
   실제 지도 시작 전에 GPS를 미리 요청한다.
   ============================================================ */

let locationWarmupStarted=false;


function warmupLocation(){

  if(
    locationWarmupStarted
  ){

    return;

  }


  locationWarmupStarted=
    true;


  /*
    이전 위치가 있으면
    우선 해당 위치 VWorld 타일 prefetch
  */

  const saved=
    readLastPos();


  if(saved){

    prefetchCenterTiles(
      saved.lat,
      saved.lng
    );

  }


  if(
    !navigator.geolocation
  ){

    return;

  }


  navigator.geolocation
    .getCurrentPosition(

      position=>{

        myLat=
          position.coords.latitude;


        myLng=
          position.coords.longitude;


        writeLastPos(
          myLat,
          myLng
        );


        prefetchCenterTiles(
          myLat,
          myLng
        );

      },


      ()=>{},


      {

        timeout:
          5000,

        enableHighAccuracy:
          false,

        maximumAge:
          120000

      }

    );

}


/* ============================================================
   지도 초기화
   ============================================================ */

function initMap(){

  /*
    초기 위치 우선순위

    1. 워밍업 GPS
    2. 저장된 마지막 위치
    3. 대한민국 전국
  */

  let seed={

    lat:
      36.5,

    lng:
      127.8,

    zoom:
      7

  };


  if(
    Number.isFinite(myLat) &&
    Number.isFinite(myLng)
  ){

    seed={

      lat:
        myLat,

      lng:
        myLng,

      zoom:
        DEFAULT_ZOOM

    };

  }

  else{

    const saved=
      readLastPos();


    if(saved){

      seed={

        lat:
          saved.lat,

        lng:
          saved.lng,

        zoom:
          DEFAULT_ZOOM

      };

    }

  }


  /* ========================================================
     Leaflet
     ======================================================== */

  map=
    L.map(

      'map',

      {

        zoomControl:
          false,

        /*
          실제 서비스 확대를 고려하여
          지도 출처 표시를 활성화
        */
        attributionControl:
          true,

        tap:
          false,

        tapTolerance:
          15

      }

    )

    .setView(

      [
        seed.lat,
        seed.lng
      ],

      seed.zoom

    );


  bindPopupCloseGuard();


  /* ========================================================
     VWorld Base 2D 일반지도
     ======================================================== */

  const baseLayer=
    L.tileLayer(

      VWORLD_BASE_TILE_URL,

      {

        minZoom:
          6,

        maxZoom:
          19,

        tileSize:
          256,

        keepBuffer:
          3,

        updateWhenIdle:
          false,

        attribution:
          '&copy; 공간정보 오픈플랫폼 VWorld'

      }

    );


  /*
    VWorld 타일 로딩 오류 확인용

    개발자도구 콘솔에서:
    [SafeWalk] VWorld 타일 로딩 실패
    가 반복된다면 VWorld API 설정/키 문제.
  */

  baseLayer.on(

    'tileerror',

    event=>{

      console.warn(

        '[SafeWalk] VWorld 타일 로딩 실패:',

        event?.tile?.src ||
        ''

      );

    }

  );


  baseLayer.addTo(
    map
  );


  buildChips();

  initSheet();

  syncViewportChrome();

  getGPS();

}


/* ============================================================
   Leaflet 팝업 X 터치 보호
   ============================================================ */

function markPopupCloseTouch(
  event
){

  lastPopupCloseAt=
    Date.now();


  if(event){

    event.stopPropagation();


    if(
      event.stopImmediatePropagation
    ){

      event.stopImmediatePropagation();

    }

  }

}


function bindPopupCloseGuard(){

  if(
    !map ||
    map._popupCloseGuardBound
  ){

    return;

  }


  map._popupCloseGuardBound=
    true;


  map.on(

    'popupopen',

    event=>{

      const popupEl=

        event.popup &&
        event.popup.getElement

          ?event.popup.getElement()

          :null;


      if(
        !popupEl
      ){

        return;

      }


      const closeBtn=
        popupEl.querySelector(
          '.leaflet-popup-close-button'
        );


      if(
        !closeBtn ||
        closeBtn._safeWalkCloseGuard
      ){

        return;

      }


      closeBtn._safeWalkCloseGuard=
        true;


      [
        'pointerdown',
        'touchstart',
        'mousedown'
      ]

      .forEach(

        type=>{

          closeBtn.addEventListener(

            type,

            markPopupCloseTouch,

            {
              capture:true,
              passive:true
            }

          );

        }

      );


      closeBtn.addEventListener(

        'click',

        clickEvent=>{

          clickEvent.preventDefault();


          markPopupCloseTouch(
            clickEvent
          );


          if(map){

            map.closePopup();

          }

        },

        {
          capture:true
        }

      );

    }

  );

}


/* ============================================================
   CPTED 안내 제거
   ============================================================ */

function clearCptedGuide(
  closePopup=true
){

  if(
    cptedGuideLine &&
    map
  ){

    map.removeLayer(
      cptedGuideLine
    );

  }


  if(
    cptedTargetMark &&
    map
  ){

    map.removeLayer(
      cptedTargetMark
    );

  }


  if(
    cptedTapMark &&
    map
  ){

    map.removeLayer(
      cptedTapMark
    );

  }


  cptedGuideLine=null;

  cptedTargetMark=null;

  cptedTapMark=null;


  if(
    closePopup &&
    map
  ){

    map.closePopup();

  }

}


/* ============================================================
   CPTED 직선 안내
   ============================================================ */

function drawCptedGuide(
  fromLatLng,
  toLatLng
){

  if(
    !map
  ){

    return;

  }


  cptedGuideLine=
    L.polyline(

      [

        [
          fromLatLng.lat,
          fromLatLng.lng
        ],

        [
          toLatLng.lat,
          toLatLng.lng
        ]

      ],

      {

        color:
          '#b45309',

        weight:
          4,

        opacity:
          .9,

        dashArray:
          '6,8',

        lineCap:
          'round',

        lineJoin:
          'round'

      }

    )

    .addTo(
      map
    );


  cptedTapMark=
    L.circleMarker(

      [
        fromLatLng.lat,
        fromLatLng.lng
      ],

      {

        radius:
          6,

        color:
          '#b45309',

        weight:
          3,

        fillColor:
          '#fff7ed',

        fillOpacity:
          1,

        interactive:
          false

      }

    )

    .addTo(
      map
    );


  const icon=
    L.divIcon({

      html:
        '<div class="cpted-target-label">'+
          '🏗 가장 가까운 CPTED'+
        '</div>',

      className:
        '',

      iconSize:
        null,

      iconAnchor:[
        20,
        18
      ]

    });


  cptedTargetMark=
    L.marker(

      [
        toLatLng.lat,
        toLatLng.lng
      ],

      {

        icon,

        zIndexOffset:
          920,

        interactive:
          false

      }

    )

    .addTo(
      map
    );

}


/* ============================================================
   CPTED 터치
   ============================================================ */

async function handleCptedTap(
  latlng
){

  const now=
    Date.now();


  if(
    now-lastPopupCloseAt <
      520

    ||

    now-lastCptedDirectTapAt <
      320
  ){

    return;

  }


  lastCptedDirectTapAt=
    now;


  clearCptedGuide(
    true
  );


  if(
    zoomBlocked ||
    !chipOn['w_cpted'] ||
    !wmsTiles.cpted
  ){

    return;

  }


  const spinner=
    document.getElementById(
      'map-spinner'
    );


  if(spinner){

    spinner.classList.add(
      'show'
    );

  }


  const requestToken=
    ++cptedTapRequestToken;


  const bounds=
    map
      .getBounds()
      .pad(.35);


  const northWest=
    L.CRS.EPSG3857.project(
      bounds.getNorthWest()
    );


  const southEast=
    L.CRS.EPSG3857.project(
      bounds.getSouthEast()
    );


  const params=
    new URLSearchParams({

      top:
        northWest.y,

      bottom:
        southEast.y,

      left:
        northWest.x,

      right:
        southEast.x,

      layer:
        'A2SM_CPTED_G',

      style:
        'A2SM_CPTED_G',

      currentPage:
        '1',

      perPage:
        '300'

    });


  try{

    const response=
      await fetch(

        CPTED_LIST_API,

        {

          method:
            'POST',

          headers:{

            'Content-Type':
              'application/x-www-form-urlencoded'

          },

          body:
            params

        }

      );


    const data=
      await response.json();


    if(
      requestToken !==
      cptedTapRequestToken
    ){

      return;

    }


    const items=
      (
        data.layerList ||
        []
      )

      .filter(

        item=>
          item.x &&
          item.y

      );


    if(
      !items.length
    ){

      L.popup({

        className:
          'safepopup',

        closeButton:
          true,

        maxWidth:
          260,

        closeOnClick:
          true

      })

      .setLatLng(
        latlng
      )

      .setContent(

        '<div class="pbadge" '+
          'style="background:#b4530918;color:#b45309">'+
          '🏗 범죄예방환경설계'+
        '</div>'+

        '<div class="ptitle">'+
          '조회 가능한 CPTED 정보 없음'+
        '</div>'+

        '<div class="prow">'+
          '현재 화면 주변에서 CPTED 상세 정보를 찾지 못했습니다.'+
        '</div>'

      )

      .openOn(
        map
      );


      return;

    }


    let closest=null;

    let closestLatLng=null;

    let minDist=Infinity;


    items.forEach(

      item=>{

        const x=
          parseFloat(
            item.x
          );


        const y=
          parseFloat(
            item.y
          );


        if(
          Number.isNaN(x) ||
          Number.isNaN(y)
        ){

          return;

        }


        const point=
          L.CRS.EPSG3857.unproject(

            L.point(
              x,
              y
            )

          );


        const distance=
          distM(

            latlng.lat,
            latlng.lng,

            point.lat,
            point.lng

          );


        if(
          distance <
          minDist
        ){

          minDist=
            distance;

          closest=
            item;

          closestLatLng=
            point;

        }

      }

    );


    if(
      !closest ||
      !closestLatLng
    ){

      return;

    }


    drawCptedGuide(

      latlng,

      closestLatLng

    );


    const addr=

      closest.adres ||
      closest.roadnm_add ||
      closest.jibun_addr ||
      '';


    const district=

      closest.jurisd_inst_nm ||
      closest.jp_nm ||
      '';


    const distText=

      minDist <
      1000

        ?Math.round(
            minDist
          )+
          'm'

        :(
            minDist/
            1000
          )
          .toFixed(1)+
          'km';


    L.popup({

      className:
        'safepopup',

      closeButton:
        true,

      maxWidth:
        285,

      closeOnClick:
        true

    })

    .setLatLng(
      latlng
    )

    .setContent(

      '<div class="pbadge" '+
        'style="background:#b4530918;color:#b45309">'+
        '🏗 범죄예방환경설계'+
      '</div>'+

      '<div class="ptitle">'+
        '가장 가까운 CPTED 구역'+
      '</div>'+

      (
        addr

          ?'<div class="prow">'+
             '📍 '+
             esc(addr)+
           '</div>'

          :''
      )

      +

      (
        district

          ?'<div class="prow">'+
             '🏢 '+
             esc(district)+
           '</div>'

          :''
      )

      +

      '<div class="prow" style="color:#b45309">'+
        '선택 지점에서 직선거리 약 '+
        distText+
      '</div>'+

      '<div class="prow">'+
        '지도에 점선으로 선택 지점과 CPTED 대표 좌표를 연결했습니다.'+
      '</div>'

    )

    .openOn(
      map
    );

  }

  catch(error){

    console.warn(
      'CPTED 정보 조회 실패',
      error
    );

  }

  finally{

    if(
      requestToken ===
        cptedTapRequestToken

      &&

      spinner
    ){

      spinner.classList.remove(
        'show'
      );

    }

  }

}


/* ============================================================
   GPS
   ============================================================ */

function getGPS(){

  if(
    !navigator.geolocation
  ){

    useDefault();

    return;

  }


  /*
    이미 warmupLocation()에서
    위치를 확보했다면 바로 시작
  */

  if(
    Number.isFinite(myLat) &&
    Number.isFinite(myLng)
  ){

    onLocated();

  }

  else{

    navigator.geolocation
      .getCurrentPosition(

        position=>{

          myLat=
            position.coords.latitude;


          myLng=
            position.coords.longitude;


          writeLastPos(
            myLat,
            myLng
          );


          onLocated();

        },


        ()=>{

          useDefault();

        },


        {

          timeout:
            7000,

          enableHighAccuracy:
            false,

          maximumAge:
            120000

        }

      );

  }


  /*
    이후 고정밀 GPS 추적
  */

  watchId=
    navigator.geolocation
      .watchPosition(

        position=>{

          myLat=
            position.coords.latitude;


          myLng=
            position.coords.longitude;


          writeLastPos(
            myLat,
            myLng
          );


          drawMe();

        },


        ()=>{},


        {

          enableHighAccuracy:
            true,

          maximumAge:
            3000

        }

      );

}


/* ============================================================
   GPS 실패 시 포항 기본 위치

   전국 서비스에서도 GPS 실패 상황에서
   완전 빈 화면이 되는 것을 막기 위한 fallback.
   ============================================================ */

function useDefault(){

  myLat=
    36.0190;


  myLng=
    129.3435;


  onLocated();

}


/* ============================================================
   GPS 확보 후 초기 처리
   ============================================================ */

function onLocated(){

  if(
    !map
  ){

    return;

  }


  map.setView(

    [
      myLat,
      myLng
    ],

    DEFAULT_ZOOM

  );


  drawMe();

  revGeo();

  addWMS();

  applyZoomGate();

  fetchAll();


  /* ========================================================
     이동 / 확대
     ======================================================== */

  let moveTimer=null;


  map.on(

    'zoomend',

    ()=>{

      applyZoomGate();

    }

  );


  map.on(

    'moveend',

    ()=>{

      if(
        suppressMoveFetch
      ){

        return;

      }


      clearTimeout(
        moveTimer
      );


      moveTimer=
        setTimeout(

          ()=>{

            fetchAll(
              true
            );

          },

          MARKER_MOVE_DEBOUNCE_MS

        );

    }

  );


  /* ========================================================
     추가 레이어
     ======================================================== */

  if(
    typeof initAuditLayer ===
    'function'
  ){

    initAuditLayer();

  }


  /*
    현재 havens.js는 안심 편의점을 제거한 호환 버전이므로
    함수가 있어도 외부 Overpass 요청을 하지 않는다.
  */

  if(
    typeof initHavenLayer ===
    'function'
  ){

    initHavenLayer();

  }


  /* ========================================================
     지도 클릭
     ======================================================== */

  map.on(

    'click',

    event=>{

      /*
        길찾기 지도 직접 선택
      */

      if(
        routePickMode
      ){

        clearCptedGuide(
          true
        );


        routePickMode=
          false;


        document.body.classList.remove(
          'map-pick-mode'
        );


        setDestinationAndRoute(
          event.latlng
        );


        return;

      }


      /*
        즐겨찾기 위치 선택
      */

      if(
        auditPickMode
      ){

        handleAuditPick(
          event.latlng
        );


        return;

      }


      /*
        CPTED
      */

      handleCptedTap(
        event.latlng
      );

    }

  );


  /* ========================================================
     모바일 직접 터치 보조
     ======================================================== */

  const mapEl=
    map.getContainer();


  let pointerStart=null;


  const onPointerDown=
    event=>{

      if(
        event.pointerType ===
        'mouse'
      ){

        return;

      }


      pointerStart={

        x:
          event.clientX,

        y:
          event.clientY,

        t:
          Date.now()

      };

    };


  const onPointerUp=
    event=>{

      if(
        event.pointerType ===
          'mouse'

        ||

        !pointerStart
      ){

        return;

      }


      const dx=
        event.clientX-
        pointerStart.x;


      const dy=
        event.clientY-
        pointerStart.y;


      const dt=
        Date.now()-
        pointerStart.t;


      pointerStart=
        null;


      /*
        드래그 또는 Long Press는
        일반 터치로 취급하지 않는다.
      */

      if(
        Math.hypot(
          dx,
          dy
        ) >
        12

        ||

        dt >
        900
      ){

        return;

      }


      const rect=
        mapEl.getBoundingClientRect();


      const point=
        L.point(

          event.clientX-
          rect.left,

          event.clientY-
          rect.top

        );


      const tappedLatLng=
        map.containerPointToLatLng(
          point
        );


      if(
        routePickMode
      ){

        clearCptedGuide(
          true
        );


        routePickMode=
          false;


        document.body.classList.remove(
          'map-pick-mode'
        );


        setDestinationAndRoute(
          tappedLatLng
        );


        return;

      }


      if(
        auditPickMode
      ){

        handleAuditPick(
          tappedLatLng
        );


        return;

      }


      handleCptedTap(
        tappedLatLng
      );

    };


  mapEl.addEventListener(

    'pointerdown',

    onPointerDown,

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


  mapDomCleanups.push(

    ()=>{

      mapEl.removeEventListener(

        'pointerdown',

        onPointerDown

      );


      mapEl.removeEventListener(

        'pointerup',

        onPointerUp

      );

    }

  );

}


/* ============================================================
   내 위치 마커
   ============================================================ */

function drawMe(){

  if(
    !map ||
    !Number.isFinite(myLat) ||
    !Number.isFinite(myLng)
  ){

    return;

  }


  /*
    이미 있으면 위치만 이동
  */

  if(myMark){

    myMark.setLatLng(

      [
        myLat,
        myLng
      ]

    );


    return;

  }


  const group=
    GROUP[grp];


  /*
    안전망
  */

  if(
    !group
  ){

    return;

  }


  const icon=
    L.divIcon({

      html:

        '<div style="'+

          'width:42px;'+
          'height:42px;'+
          'border-radius:50%;'+
          'background:'+
            group.color+
            ';'+
          'border:3px solid #fff;'+
          'display:flex;'+
          'align-items:center;'+
          'justify-content:center;'+
          'font-size:19px;'+
          'box-shadow:0 3px 12px rgba(0,0,0,.25);'+

        '">'+

          group.emoji+

        '</div>',


      className:
        '',


      iconSize:[
        42,
        42
      ],


      iconAnchor:[
        21,
        21
      ]

    });


  myMark=
    L.marker(

      [
        myLat,
        myLng
      ],

      {

        icon,

        zIndexOffset:
          1000

      }

    )

    .addTo(
      map
    );


  myMark.bindPopup(

    '<div class="ptitle">'+
      '📍 현재 내 위치'+
    '</div>'+

    '<div class="prow">'+
      '현재 지도 화면 범위의 안전시설을 표시합니다'+
    '</div>'

  );

}


/* ============================================================
   현재 위치로 이동
   ============================================================ */

function flyHome(){

  if(
    Number.isFinite(myLat) &&
    Number.isFinite(myLng) &&
    map
  ){

    const zoom=
      Math.max(

        map.getZoom(),

        MIN_DATA_ZOOM

      );


    map.flyTo(

      [
        myLat,
        myLng
      ],

      zoom,

      {
        duration:1
      }

    );

  }

}


/* ============================================================
   현재 행정구역 표시

   현재는 Nominatim reverse geocoding 유지.
   VWorld 배경지도와는 별개 기능.
   ============================================================ */

function revGeo(){

  fetch(

    'https://nominatim.openstreetmap.org/reverse'+

    '?lat='+
    encodeURIComponent(
      myLat
    )+

    '&lon='+
    encodeURIComponent(
      myLng
    )+

    '&format=json'+

    '&accept-language=ko'

  )

  .then(

    response=>
      response.json()

  )

  .then(

    data=>{

      const address=
        data.address ||
        {};


      const locText=
        document.getElementById(
          'locTxt'
        );


      if(!locText){
        return;
      }


      locText.textContent=

        address.city_district ||

        address.suburb ||

        address.neighbourhood ||

        address.county ||

        address.city ||

        '위치 확인됨';

    }

  )

  .catch(

    ()=>{

      const locText=
        document.getElementById(
          'locTxt'
        );


      if(locText){

        locText.textContent=
          '위치 확인됨';

      }

    }

  );

}


/* ============================================================
   WMS

   범죄주의구간 / CPTED
   ============================================================ */

function addWMS(){

  const group=
    GROUP[grp];


  if(
    !group ||
    !Array.isArray(group.wms)
  ){

    return;

  }


  group.wms.forEach(

    key=>{

      try{

        const url=
          WMS_API[key];


        if(!url){

          return;

        }


        let tileLayer;


        /*
          CPTED
        */

        if(
          key ===
          'cpted'
        ){

          tileLayer=
            L.tileLayer.wms(

              url,

              {

                layers:
                  'A2SM_CPTED_G',

                format:
                  'image/png',

                transparent:
                  true,

                version:
                  '1.3.0',

                tiled:
                  true,

                opacity:
                  .5,

                tileSize:
                  256

              }

            );

        }

        /*
          생활안전지도 OpenAPI WMS
        */

        else{

          const WMSClass=
            getSafemapWMSClass();


          tileLayer=
            new WMSClass(

              url,

              {

                opacity:
                  .5,

                tileSize:
                  256

              }

            );

        }


        wmsTiles[key]=
          tileLayer;


        if(
          chipOn[
            'w_'+
            key
          ]

          &&

          !zoomBlocked
        ){

          tileLayer.addTo(
            map
          );

        }

      }

      catch(error){

        console.warn(

          'WMS 오류',

          key,

          error

        );

      }

    }

  );

}
