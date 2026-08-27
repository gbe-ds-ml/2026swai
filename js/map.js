/* ============================================================
   SafeWalk v2.2.2 — map.js

   Leaflet 지도
   ------------------------------------------------------------
   - VWorld Base 2D 배경지도
   - GPS
   - 마지막 위치 기억
   - 생활안전지도 WMS
     · 여성밤길치안안전
     · 어린이대상범죄주의구간
     · 노인대상범죄주의구간
   - CPTED
   - 지도 터치 처리

   WMS 개선
   ------------------------------------------------------------
   생활안전지도 공식 WMS 예제에 맞춰
   EPSG:3857 + layers + styles 방식으로 요청한다.
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


/* ============================================================
   CPTED 상태
   ============================================================ */

let cptedGuideLine=null;

let cptedTargetMark=null;

let cptedTapMark=null;

let lastCptedDirectTapAt=0;

let cptedTapRequestToken=0;

let lastPopupCloseAt=0;


/* ============================================================
   생활안전지도 WMS 메타데이터

   config.js가 예전처럼 URL 문자열만 가지고 있어도
   map.js에서 정상적으로 동작하게 하기 위한 fallback.

   config.js에서 이미
   {url, layers, styles}
   구조로 변경했다면 그 설정을 우선 사용한다.
   ============================================================ */

const SAFEMAP_WMS_META={

  women:{
    url:
      'https://www.safemap.go.kr/openapi2/IF_0080_WMS',

    layers:
      'A2SM_CRMNLHSPOT_F1_TOT',

    /*
      현재 신규 OpenAPI 문서에서는 빈 style 예제가 제공됨.
    */
    styles:
      ''
  },


  children:{
    url:
      'https://www.safemap.go.kr/openapi2/IF_0081_WMS',

    layers:
      'A2SM_ODBLRCRMNLHSPOT_KID',

    styles:
      'A2SM_OdblrCrmnlHspot_Kid'
  },


  elder_c:{
    url:
      'https://www.safemap.go.kr/openapi2/IF_0082_WMS',

    layers:
      'A2SM_ODBLRCRMNLHSPOT_ODSN',

    styles:
      'A2SM_OdblrCrmnlHspot_Odsn'
  },


  cpted:{
    url:
      'https://www.safemap.go.kr/geoserver_pos/safemap/wms',

    layers:
      'A2SM_CPTED_G',

    styles:
      ''
  }

};


/* ============================================================
   WMS 설정 읽기

   config.js가 아래 두 형태 모두 가능:

   기존:
   women:'https://...'

   신규:
   women:{
     url:'https://...',
     layers:'...',
     styles:'...'
   }
   ============================================================ */

function getSafeMapWmsConfig(key){

  const fallback=
    SAFEMAP_WMS_META[key];


  if(
    !fallback
  ){

    return null;

  }


  if(
    typeof WMS_API ===
      'undefined'
  ){

    return fallback;

  }


  const raw=
    WMS_API[key];


  /*
    config.js가 기존 문자열 방식
  */

  if(
    typeof raw ===
      'string'
  ){

    return {

      ...fallback,

      url:
        raw

    };

  }


  /*
    config.js가 신규 object 방식
  */

  if(
    raw &&
    typeof raw ===
      'object'
  ){

    return {

      url:
        raw.url ||
        fallback.url,

      layers:
        raw.layers ||
        fallback.layers,

      styles:

        typeof raw.styles ===
          'string'

          ?raw.styles

          :fallback.styles

    };

  }


  return fallback;

}


/* ============================================================
   생활안전지도 WMS TileLayer

   중요:
   Leaflet 지도는 EPSG:3857 기반.

   생활안전지도 공식 WMS 예제 역시
   srs:"EPSG:3857"을 사용한다.
   ============================================================ */

let _SafemapWMS3857=null;


function getSafemapWMSClass(){

  if(
    !_SafemapWMS3857
  ){

    _SafemapWMS3857=
      L.TileLayer.extend({


        initialize:function(
          url,
          options={}
        ){

          this._wmsLayers=
            options.layers ||
            '';


          this._wmsStyles=

            typeof options.styles ===
              'string'

              ?options.styles

              :'';


          L.TileLayer.prototype
            .initialize.call(
              this,
              url,
              options
            );

        },


        getTileUrl:function(coords){

          /*
            현재 Leaflet tile의 위경도 bounds
          */

          const bounds=
            this._tileCoordsToBounds(
              coords
            );


          /*
            EPSG:3857 미터 좌표로 변환
          */

          const northWest=
            L.CRS.EPSG3857.project(
              bounds.getNorthWest()
            );


          const southEast=
            L.CRS.EPSG3857.project(
              bounds.getSouthEast()
            );


          /*
            WMS 1.1.1 BBOX:

            minX,minY,maxX,maxY
          */

          const bbox=[

            northWest.x,

            southEast.y,

            southEast.x,

            northWest.y

          ].join(',');


          /*
            생활안전지도 공식 예제는
            serviceKey만 camelCase를 유지하고
            나머지 WMS 파라미터는 소문자 사용.
          */

          const params=
            new URLSearchParams();


          params.set(
            'serviceKey',
            API_KEY
          );


          params.set(
            'service',
            'WMS'
          );


          params.set(
            'request',
            'GetMap'
          );


          params.set(
            'version',
            '1.1.1'
          );


          params.set(
            'layers',
            this._wmsLayers
          );


          params.set(
            'styles',
            this._wmsStyles
          );


          params.set(
            'format',
            'image/png'
          );


          params.set(
            'srs',
            'EPSG:3857'
          );


          params.set(
            'transparent',
            'TRUE'
          );


          params.set(
            'bbox',
            bbox
          );


          params.set(
            'width',
            '256'
          );


          params.set(
            'height',
            '256'
          );


          return (
            this._url+
            '?'+
            params.toString()
          );

        }

      });

  }


  return _SafemapWMS3857;

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


    const point=
      JSON.parse(
        raw
      );


    if(
      !Number.isFinite(point.lat) ||
      !Number.isFinite(point.lng)
    ){

      return null;

    }


    return point;

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
    30초에 한 번만 저장
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

        ts:
          now

      })

    );

  }

  catch(error){}

}


/* ============================================================
   VWorld Base 타일 URL 생성

   VWorld WMTS:
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
   Web Mercator XYZ 타일 좌표
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
   VWorld 타일 Prefetch

   현재 위치 주변 3×3 타일 미리 요청.
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


  const zoom=
    DEFAULT_ZOOM;


  const center=
    tileXY(
      lat,
      lng,
      zoom
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
          zoom,
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


      const image=
        new Image();


      image.decoding=
        'async';


      image.src=
        url;

    }

  }

}


/* ============================================================
   GPS 워밍업

   이용자 유형을 선택하는 순간
   미리 위치를 받아 지도 진입 속도를 높인다.
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
    이전 위치 주변 VWorld 타일 prefetch
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
    초기 지도 중심 우선순위

    1. 워밍업 GPS
    2. 마지막 위치
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
     Leaflet 생성
     ======================================================== */

  map=
    L.map(

      'map',

      {

        zoomControl:
          false,

        /*
          현재 UI를 유지하기 위해 기본 attribution UI는
          기존처럼 끈다.
        */
        attributionControl:
          false,

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
     VWorld 2D 일반 배경지도
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
          false

      }

    );


  /*
    VWorld 오류 확인용
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
   CPTED 안내 삭제
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
   CPTED 지도 터치
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


  /*
    일반 연령 지도에서는 CPTED 터치 조회 안 함
  */

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
      '[SafeWalk] CPTED 정보 조회 실패:',
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
    warmupLocation에서 이미 위치를 받았다면
    바로 지도 초기화
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
    이후 고정밀 위치 보정
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
   GPS 실패 fallback

   기존 포항 기본 좌표 유지.
   ============================================================ */

function useDefault(){

  myLat=
    36.0190;


  myLng=
    129.3435;


  onLocated();

}


/* ============================================================
   위치 확보 후 지도 초기 처리
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
     지도 이동 / 줌 이벤트
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


  if(
    typeof initHavenLayer ===
      'function'
  ){

    initHavenLayer();

  }


  /* ========================================================
     Leaflet 기본 click
     ======================================================== */

  map.on(

    'click',

    event=>{

      /*
        길찾기 지도 직접 선택 모드
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
        즐겨찾기 지점 선택
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
        CPTED 지도에서만 실제 처리됨
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


      const elapsed=
        Date.now()-
        pointerStart.t;


      pointerStart=
        null;


      /*
        드래그 및 Long Press 제외
      */

      if(
        Math.hypot(
          dx,
          dy
        ) >
        12

        ||

        elapsed >
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
    기존 마커가 있으면 위치만 이동
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

   기존 Nominatim reverse geocoding 유지.
   VWorld 배경지도와 독립된 기능.
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


      if(
        !locText
      ){

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
   WMS 추가

   일반 이용자:
   ------------------------------------------------------------
   child  → 어린이대상범죄주의구간
   youth  → 여성밤길치안안전
   elder  → 노인대상범죄주의구간

   CPTED:
   ------------------------------------------------------------
   cpted → 범죄예방환경설계
   ============================================================ */

function addWMS(){

  const group=
    GROUP[grp];


  if(
    !group ||
    !Array.isArray(
      group.wms
    )
  ){

    return;

  }


  group.wms.forEach(

    key=>{

      try{

        const config=
          getSafeMapWmsConfig(
            key
          );


        if(
          !config ||
          !config.url ||
          !config.layers
        ){

          console.warn(

            '[SafeWalk] WMS 설정 없음:',

            key,

            config

          );


          return;

        }


        let tileLayer=null;


        /* ====================================================
           CPTED

           기존 GeoServer WMS 사용
           ==================================================== */

        if(
          key ===
          'cpted'
        ){

          tileLayer=
            L.tileLayer.wms(

              config.url,

              {

                layers:
                  config.layers,

                styles:
                  config.styles ||
                  '',

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


        /* ====================================================
           생활안전지도 OpenAPI WMS

           EPSG:3857 기반 custom layer
           ==================================================== */

        else{

          const WMSClass=
            getSafemapWMSClass();


          tileLayer=
            new WMSClass(

              config.url,

              {

                layers:
                  config.layers,

                styles:
                  config.styles ||
                  '',

                opacity:
                  .52,

                tileSize:
                  256,

                /*
                  WMS overlay가 타일 로딩 중
                  사용자 입력을 막지 않게 함.
                */
                updateWhenIdle:
                  false

              }

            );


          /*
            디버깅용 오류 로그
          */

          tileLayer.on(

            'tileerror',

            event=>{

              console.warn(

                '[SafeWalk] 생활안전지도 WMS 타일 실패:',

                key,

                event?.tile?.src ||
                ''

              );

            }

          );


          /*
            실제 WMS가 로드되면 확인 가능
          */

          tileLayer.on(

            'load',

            ()=>{

              console.log(

                '[SafeWalk] 생활안전지도 WMS 로딩 완료:',

                key

              );

            }

          );

        }


        /*
          layers.js의 공통 WMS registry
        */

        wmsTiles[key]=
          tileLayer;


        /*
          해당 chip이 ON이고
          줌 제한 상태가 아니면 지도에 추가
        */

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


        console.log(

          '[SafeWalk] WMS 등록:',

          {
            key,
            url:config.url,
            layers:config.layers,
            styles:config.styles
          }

        );

      }

      catch(error){

        console.warn(

          '[SafeWalk] WMS 생성 오류:',

          key,

          error

        );

      }

    }

  );

}
