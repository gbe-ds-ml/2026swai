/* ============================================================
   SafeWalk v2.9.1 — route-navigation.js

   경로 미리보기 / 안내 시작 / 안내 종료
   + 현재 위치와 설정 출발지가 멀 때 현재 위치 기준 재탐색

   동작
   ------------------------------------------------------------
   1. 경로 계산 직후
      [상세 점수 보기] [🚶 안내 시작]
               [길찾기 취소]

   2. 안내 시작 클릭
      - 현재 위치와 설정 출발지 100m 이내
        → 기존 경로 그대로 안내 시작

      - 100m 초과
        → 현재 위치와 출발지가 다르다는 안내 팝업
        → [기존 경로 보기]
        → [📍 현재 위치에서 안내]

   3. 현재 위치에서 안내
      - 출발지를 현재 GPS 위치로 변경
      - 기존 목적지는 유지
      - runSearchRoute()로 경로 재계산
      - 주변 안전시설 / 안전도 재계산
      - 새 경로로 안내 시작

   4. 안내 중
      [상세 점수 보기] [■ 안내 종료]

   5. 안내 종료
      - 안내 종료
      - 경로 완전 삭제
      - 출발지 / 목적지 삭제
      - 저장 경로 삭제

   6. X / 모바일 뒤로가기
      - 패널만 숨김
      - 안내와 경로 유지
   ============================================================ */

(function(){
  'use strict';

  let navigationMode = false;
  let rerouting = false;

  let routeLatLngs = [];
  let walkingSpeedMps = 1.25;

  let lastPanAt = 0;
  let lastPosition = null;
  let lastRouteSignature = '';

  window.swNavigationMode = false;

  /* ==========================================================
     설정
     ========================================================== */

  const UPDATE_MS = 1000;

  const PAN_INTERVAL_MS = 1200;
  const PAN_MOVE_M = 4;

  const ARRIVAL_M = 25;

  const OFF_ROUTE_WARN_M = 50;
  const OFF_ROUTE_STRONG_M = 80;

  /*
    현재 위치와 사용자가 설정한 출발지가
    이 거리보다 멀면 바로 안내하지 않고 선택창을 표시
  */
  const START_DISTANCE_THRESHOLD_M = 100;


  /* ==========================================================
     안내 모드 상태
     ========================================================== */

  function setMode(v){

    navigationMode = !!v;

    window.swNavigationMode = navigationMode;

    document.body.classList.toggle(
      'sw-navigation-active',
      navigationMode
    );

  }


  /* ==========================================================
     현재 GPS 위치
     ========================================================== */

  function currentPosition(){
    if(!hasCurrentLocation())return null;

    try{

      if(
        typeof myLat !== 'undefined' &&
        typeof myLng !== 'undefined' &&
        Number.isFinite(myLat) &&
        Number.isFinite(myLng)
      ){

        return {
          lat: Number(myLat),
          lng: Number(myLng)
        };

      }

    }catch(e){}

    return null;
  }


  /* ==========================================================
     현재 설정된 출발지
     ========================================================== */

  function getConfiguredOrigin(){

    try{

      if(
        typeof routeOrigin !== 'undefined' &&
        routeOrigin &&
        Number.isFinite(Number(routeOrigin.lat)) &&
        Number.isFinite(Number(routeOrigin.lng))
      ){

        return {
          lat: Number(routeOrigin.lat),
          lng: Number(routeOrigin.lng)
        };

      }

    }catch(e){}

    return null;
  }


  /* ==========================================================
     현재 설정된 목적지
     ========================================================== */

  function getConfiguredDestination(){

    try{

      if(
        typeof routeDest !== 'undefined' &&
        routeDest &&
        Number.isFinite(Number(routeDest.lat)) &&
        Number.isFinite(Number(routeDest.lng))
      ){

        return routeDest;

      }

    }catch(e){}

    return null;
  }


  /* ==========================================================
     두 좌표 거리
     ========================================================== */

  function distanceM(a,b){

    if(!a || !b){
      return Infinity;
    }

    try{

      if(
        typeof map !== 'undefined' &&
        map &&
        typeof map.distance === 'function'
      ){

        return map.distance(
          [a.lat,a.lng],
          [b.lat,b.lng]
        );

      }

    }catch(e){}

    const R = 6371000;

    const p1 =
      a.lat *
      Math.PI /
      180;

    const p2 =
      b.lat *
      Math.PI /
      180;

    const dp =
      (b.lat-a.lat) *
      Math.PI /
      180;

    const dl =
      (b.lng-a.lng) *
      Math.PI /
      180;

    const h =
      Math.sin(dp/2) ** 2 +
      Math.cos(p1) *
      Math.cos(p2) *
      Math.sin(dl/2) ** 2;

    return (
      2 *
      R *
      Math.atan2(
        Math.sqrt(h),
        Math.sqrt(1-h)
      )
    );
  }


  /* ==========================================================
     Leaflet LatLng 배열 평탄화
     ========================================================== */

  function flattenLatLngs(
    input,
    out=[]
  ){

    if(!Array.isArray(input)){
      return out;
    }

    input.forEach(item=>{

      if(Array.isArray(item)){

        flattenLatLngs(
          item,
          out
        );

        return;
      }

      if(
        item &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng)
      ){

        out.push({
          lat:Number(item.lat),
          lng:Number(item.lng)
        });

      }

    });

    return out;
  }


  /* ==========================================================
     경로 색상
     ========================================================== */

  function routeColor(){

    try{

      if(
        typeof ROUTE_COLOR !== 'undefined' &&
        ROUTE_COLOR
      ){

        return String(
          ROUTE_COLOR
        ).toLowerCase();

      }

    }catch(e){}

    return '#ef4444';
  }


  /* ==========================================================
     현재 지도에서 실제 경로 Polyline 찾기
     ========================================================== */

  function findRoutePolyline(){

    try{

      if(
        typeof map === 'undefined' ||
        !map ||
        typeof L === 'undefined'
      ){

        return null;
      }

      let best = null;
      let bestCount = 0;

      map.eachLayer(layer=>{

        if(
          !(layer instanceof L.Polyline)
        ){
          return;
        }

        if(
          typeof L.Polygon !== 'undefined' &&
          layer instanceof L.Polygon
        ){
          return;
        }

        if(
          typeof layer.getLatLngs !== 'function'
        ){
          return;
        }

        // 실제 도로망 응답으로 생성된 선만 안내 대상으로 삼는다.
        if(layer.options?.safeWalkRoute!==true)return;

        const pts =
          flattenLatLngs(
            layer.getLatLngs()
          );

        if(
          pts.length >
          bestCount
        ){

          best = layer;
          bestCount = pts.length;

        }

      });

      return best;

    }catch(e){

      return null;

    }
  }


  /* ==========================================================
     실제 경로 좌표
     ========================================================== */

  function getRouteLatLngs(){

    const line =
      findRoutePolyline();

    if(!line){
      return [];
    }

    try{

      return flattenLatLngs(
        line.getLatLngs()
      );

    }catch(e){

      return [];

    }
  }


  /* ==========================================================
     활성 경로 존재 확인
     ========================================================== */

  function hasActiveRoute(){

    if(
      findRoutePolyline()
    ){
      return true;
    }

    try{

      if(
        typeof swGetSavedRoute === 'function'
      ){

        const saved =
          swGetSavedRoute();

        if(
          saved &&
          saved.active &&
          saved.origin &&
          saved.destination
        ){

          return true;

        }

      }

    }catch(e){}

    try{

      if(
        typeof routeDest !== 'undefined' &&
        routeDest
      ){

        return true;

      }

    }catch(e){}

    return false;
  }


  /* ==========================================================
     경로 변경 감지용 signature
     ========================================================== */

  function routeSignature(){

    const pts =
      getRouteLatLngs();

    if(
      pts.length < 2
    ){
      return '';
    }

    const a =
      pts[0];

    const b =
      pts[
        pts.length-1
      ];

    return (
      pts.length +
      '|' +
      a.lat.toFixed(5) +
      '|' +
      a.lng.toFixed(5) +
      '|' +
      b.lat.toFixed(5) +
      '|' +
      b.lng.toFixed(5)
    );
  }


  /* ==========================================================
     거리 문자열 → m
     ========================================================== */

  function parseDistance(text){

    const s =
      String(
        text || ''
      )
      .replace(
        /,/g,
        ''
      )
      .trim();

    let m =
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*km/i
      );

    if(m){

      return (
        Number(m[1]) *
        1000
      );

    }

    m =
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*m/i
      );

    return m
      ? Number(m[1])
      : null;
  }


  /* ==========================================================
     시간 문자열 → 초
     ========================================================== */

  function parseDuration(text){

    const s =
      String(
        text || ''
      ).trim();

    let sec = 0;
    let found = false;

    const h =
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*(?:시간|hour|hr|h)/i
      );

    const m =
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*(?:분|min|minute)/i
      );

    const ss =
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*(?:초|sec|second)/i
      );

    if(h){

      sec +=
        Number(h[1]) *
        3600;

      found = true;
    }

    if(m){

      sec +=
        Number(m[1]) *
        60;

      found = true;
    }

    if(ss){

      sec +=
        Number(ss[1]);

      found = true;
    }

    return found
      ? sec
      : null;
  }


  /* ==========================================================
     거리 표시
     ========================================================== */

  function formatDistance(m){

    if(
      !Number.isFinite(m)
    ){
      return '-';
    }

    if(
      m < 1000
    ){

      return (
        Math.max(
          0,
          Math.round(m)
        ) +
        'm'
      );

    }

    const km =
      m /
      1000;

    return (
      (
        km < 10
          ? km.toFixed(1)
          : km.toFixed(0)
      ) +
      'km'
    );
  }


  /* ==========================================================
     시간 표시
     ========================================================== */

  function formatDuration(sec){

    if(
      !Number.isFinite(sec)
    ){
      return '-';
    }

    const min =
      Math.max(
        1,
        Math.round(
          sec /
          60
        )
      );

    if(
      min < 60
    ){

      return (
        '약 ' +
        min +
        '분'
      );

    }

    const h =
      Math.floor(
        min /
        60
      );

    const r =
      min %
      60;

    return r
      ? `약 ${h}시간 ${r}분`
      : `약 ${h}시간`;
  }


  /* ==========================================================
     현재 GPS가 경로의 어느 구간에 있는지 계산

     현재 위치
        ↓
     가장 가까운 경로 구간
        ↓
     해당 위치부터 목적지까지 남은 거리
     ========================================================== */

  function progressOnRoute(
    current,
    pts
  ){

    if(
      !current ||
      pts.length < 2
    ){

      return null;
    }

    const lat0 =
      current.lat *
      Math.PI /
      180;

    const meterPerLat =
      111132;

    const meterPerLng =
      111320 *
      Math.cos(
        lat0
      );

    const segLen = [];

    const suffix =
      new Array(
        pts.length
      ).fill(0);

    for(
      let i=0;
      i<pts.length-1;
      i++
    ){

      segLen[i] =
        distanceM(
          pts[i],
          pts[i+1]
        );

    }

    for(
      let i=pts.length-2;
      i>=0;
      i--
    ){

      suffix[i] =
        suffix[i+1] +
        segLen[i];

    }

    let bestDist2 =
      Infinity;

    let bestRemaining =
      Infinity;

    for(
      let i=0;
      i<pts.length-1;
      i++
    ){

      const a =
        pts[i];

      const b =
        pts[i+1];

      const ax =
        (
          a.lng -
          current.lng
        ) *
        meterPerLng;

      const ay =
        (
          a.lat -
          current.lat
        ) *
        meterPerLat;

      const bx =
        (
          b.lng -
          current.lng
        ) *
        meterPerLng;

      const by =
        (
          b.lat -
          current.lat
        ) *
        meterPerLat;

      const vx =
        bx -
        ax;

      const vy =
        by -
        ay;

      const vv =
        vx*vx +
        vy*vy;

      let t =
        vv > 0
          ? -(ax*vx+ay*vy)/vv
          : 0;

      t =
        Math.max(
          0,
          Math.min(
            1,
            t
          )
        );

      const px =
        ax +
        t*vx;

      const py =
        ay +
        t*vy;

      const d2 =
        px*px +
        py*py;

      if(
        d2 <
        bestDist2
      ){

        bestDist2 =
          d2;

        bestRemaining =
          segLen[i] *
          (1-t) +
          suffix[i+1];

      }

    }

    return {

      remainingM:
        bestRemaining,

      offRouteM:
        Math.sqrt(
          bestDist2
        )

    };
  }


  /* ==========================================================
     CSS
     ========================================================== */

  function injectStyles(){

    if(
      document.getElementById(
        'swRouteNavigationStyle'
      )
    ){
      return;
    }

    const style =
      document.createElement(
        'style'
      );

    style.id =
      'swRouteNavigationStyle';

    style.textContent = `

      #routeDetailsBox .sw-nav-primary-row{
        display:grid;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr);
        gap:8px;
        width:100%;
        margin-top:8px;
      }

      #routeDetailsBox .sw-nav-primary-row #routeDetailsToggle,
      #routeDetailsBox .sw-nav-primary-row #swNavMainBtn{
        width:100%;
        min-width:0;
        min-height:44px;
        margin:0;
      }

      #swNavMainBtn,
      #swNavCancelBtn{
        border-radius:12px;
        font-family:inherit;
        font-weight:900;
        cursor:pointer;
        -webkit-tap-highlight-color:transparent;
      }

      #swNavMainBtn{
        border:0;
        padding:11px 10px;
        background:#111827;
        color:#fff;
        font-size:14px;
      }

      #swNavMainBtn:disabled{
        opacity:.55;
        cursor:wait;
      }

      body.sw-navigation-active #swNavMainBtn{
        background:#dc2626;
      }

      #swNavCancelBtn{
        display:block;
        width:100%;
        min-height:42px;
        margin-top:8px;
        padding:10px 12px;

        background:#fff;
        color:#dc2626;

        border:
          1px solid
          rgba(220,38,38,.28);

        font-size:13px;
      }

      body.sw-navigation-active #swNavCancelBtn{
        display:none!important;
      }

      .sw-nav-status{
        display:none;

        margin-top:8px;
        padding:9px 11px;

        border-radius:11px;

        background:
          rgba(17,24,39,.06);

        color:#374151;

        font-size:12px;
        font-weight:700;
        line-height:1.45;
      }

      body.sw-navigation-active .sw-nav-status{
        display:block;
      }

      .sw-nav-status.warn{
        background:#fff7ed;
        color:#c2410c;
      }

      .sw-nav-status.danger{
        background:#fef2f2;
        color:#b91c1c;
      }


      /* ============================================
         현재 위치 / 설정 출발지 차이 안내창
         ============================================ */

      #swOriginMismatchBackdrop{

        position:fixed;
        inset:0;

        z-index:5000;

        display:none;

        align-items:center;
        justify-content:center;

        padding:18px;

        background:
          rgba(15,23,42,.48);

        backdrop-filter:
          blur(2px);

        -webkit-backdrop-filter:
          blur(2px);
      }

      #swOriginMismatchBackdrop.show{
        display:flex;
      }

      #swOriginMismatchDialog{

        width:
          min(
            430px,
            100%
          );

        background:#fff;

        border-radius:18px;

        padding:20px;

        box-shadow:
          0 18px 55px
          rgba(15,23,42,.28);

        font-family:inherit;
      }

      .sw-origin-title{

        font-size:17px;
        font-weight:900;

        color:#111827;

        line-height:1.4;
      }

      .sw-origin-desc{

        margin-top:9px;

        font-size:13px;
        font-weight:700;

        color:#475569;

        line-height:1.65;

        word-break:keep-all;
      }

      .sw-origin-distance{

        margin-top:12px;

        padding:
          11px 12px;

        border-radius:12px;

        background:#f8fafc;

        color:#0f172a;

        font-size:13px;
        font-weight:900;

        text-align:center;
      }

      .sw-origin-actions{

        display:grid;

        grid-template-columns:
          1fr 1fr;

        gap:8px;

        margin-top:15px;
      }

      .sw-origin-actions button{

        min-height:46px;

        border-radius:12px;

        font-family:inherit;

        font-size:13px;
        font-weight:900;

        cursor:pointer;
      }

      #swKeepPreviewBtn{

        background:#fff;

        color:#334155;

        border:
          1px solid
          #cbd5e1;
      }

      #swRerouteCurrentBtn{

        background:#111827;

        color:#fff;

        border:
          1px solid
          #111827;
      }

      #swRerouteCurrentBtn:disabled{

        opacity:.55;

        cursor:wait;
      }

      .sw-origin-note{

        margin-top:10px;

        color:#64748b;

        font-size:11px;

        line-height:1.5;

        text-align:center;

        word-break:keep-all;
      }


      @media (max-width:640px){

        #routeDetailsBox .sw-nav-primary-row{
          gap:7px;
        }

        #swNavMainBtn{
          font-size:13px;

          padding-left:6px;
          padding-right:6px;
        }

        #swOriginMismatchDialog{
          padding:
            18px 16px;
        }

        .sw-origin-actions{
          grid-template-columns:1fr;
        }

      }

    `;

    document.head.appendChild(
      style
    );
  }


  /* ==========================================================
     현재 위치와 출발지가 다를 때 표시할 Dialog 생성
     ========================================================== */

  function ensureOriginMismatchDialog(){

    let backdrop =
      document.getElementById(
        'swOriginMismatchBackdrop'
      );

    if(backdrop){
      return backdrop;
    }

    backdrop =
      document.createElement(
        'div'
      );

    backdrop.id =
      'swOriginMismatchBackdrop';

    backdrop.setAttribute(
      'aria-hidden',
      'true'
    );

    backdrop.innerHTML = `

      <div
        id="swOriginMismatchDialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="swOriginMismatchTitle"
      >

        <div
          class="sw-origin-title"
          id="swOriginMismatchTitle"
        >
          📍 현재 위치와 출발지가 다릅니다
        </div>

        <div class="sw-origin-desc">

          설정한 출발지에서 바로 안내를 시작하기에는
          현재 위치가 멀리 떨어져 있습니다.

          <br>

          경로는 그대로 미리보기 할 수 있고,
          실제 안내를 시작하려면 현재 위치를 출발지로
          다시 계산할 수 있습니다.

        </div>

        <div
          class="sw-origin-distance"
          id="swOriginMismatchDistance"
        >
          현재 위치와 출발지 거리 확인 중...
        </div>

        <div class="sw-origin-actions">

          <button
            type="button"
            id="swKeepPreviewBtn"
          >
            기존 경로 보기
          </button>

          <button
            type="button"
            id="swRerouteCurrentBtn"
          >
            📍 현재 위치에서 안내
          </button>

        </div>

        <div class="sw-origin-note">

          현재 위치에서 안내를 선택하면
          경로와 주변 안전시설,
          안전도 점수를 다시 계산합니다.

        </div>

      </div>

    `;

    document.body.appendChild(
      backdrop
    );


    /* 배경 누르면 닫기 */

    backdrop.addEventListener(
      'click',
      e=>{

        if(
          e.target === backdrop
        ){

          closeOriginMismatchDialog();

        }

      }
    );


    /* 기존 경로 미리보기 */

    document
      .getElementById(
        'swKeepPreviewBtn'
      )
      ?.addEventListener(
        'click',
        ()=>{

          closeOriginMismatchDialog();

          if(
            typeof showRouteToast ===
            'function'
          ){

            showRouteToast(
              '기존 경로 미리보기를 유지합니다.',
              2800
            );

          }

        }
      );


    /* 현재 위치에서 새로 안내 */

    document
      .getElementById(
        'swRerouteCurrentBtn'
      )
      ?.addEventListener(
        'click',
        rerouteFromCurrentAndStart
      );


    return backdrop;
  }


  /* ==========================================================
     출발지 차이 Dialog 열기
     ========================================================== */

  function showOriginMismatchDialog(
    distance
  ){

    const backdrop =
      ensureOriginMismatchDialog();

    const distEl =
      document.getElementById(
        'swOriginMismatchDistance'
      );

    if(distEl){

      distEl.textContent =
        '현재 위치 ↔ 설정 출발지 · 약 ' +
        formatDistance(
          distance
        );

    }

    backdrop.classList.add(
      'show'
    );

    backdrop.setAttribute(
      'aria-hidden',
      'false'
    );

    setTimeout(
      ()=>{

        document
          .getElementById(
            'swRerouteCurrentBtn'
          )
          ?.focus();

      },
      30
    );
  }


  /* ==========================================================
     출발지 차이 Dialog 닫기
     ========================================================== */

  function closeOriginMismatchDialog(){

    const backdrop =
      document.getElementById(
        'swOriginMismatchBackdrop'
      );

    if(!backdrop){
      return;
    }

    backdrop.classList.remove(
      'show'
    );

    backdrop.setAttribute(
      'aria-hidden',
      'true'
    );
  }


  /* ==========================================================
     기존 route-ux 길찾기 취소 버튼 숨기기
     ========================================================== */

  function hideOldCancelButtons(box){

    Array
      .from(
        box.querySelectorAll(
          'button'
        )
      )
      .forEach(btn=>{

        if(
          btn.id ===
          'swNavCancelBtn' ||
          btn.id ===
          'swNavMainBtn'
        ){
          return;
        }

        if(
          !/길찾기\s*취소/.test(
            String(
              btn.textContent ||
              ''
            )
          )
        ){
          return;
        }

        btn.style.display =
          'none';

        btn.setAttribute(
          'aria-hidden',
          'true'
        );

        btn.tabIndex =
          -1;

      });
  }


  /* ==========================================================
     안내 UI 생성
     ========================================================== */

  function buildUI(){

    const box =
      document.getElementById(
        'routeDetailsBox'
      );

    const detailsToggle =
      document.getElementById(
        'routeDetailsToggle'
      );

    const details =
      document.getElementById(
        'routeDetails'
      );

    if(
      !box ||
      !detailsToggle ||
      !details
    ){
      return false;
    }

    injectStyles();

    ensureOriginMismatchDialog();

    hideOldCancelButtons(
      box
    );


    /* ========================================
       메인 버튼 행
       ======================================== */

    let row =
      document.getElementById(
        'swNavPrimaryRow'
      );

    if(!row){

      row =
        document.createElement(
          'div'
        );

      row.id =
        'swNavPrimaryRow';

      row.className =
        'sw-nav-primary-row';
    }


    if(
      detailsToggle.parentElement !==
      row
    ){

      row.appendChild(
        detailsToggle
      );
    }


    /* ========================================
       안내 시작 / 종료 버튼
       ======================================== */

    let navBtn =
      document.getElementById(
        'swNavMainBtn'
      );

    if(!navBtn){

      navBtn =
        document.createElement(
          'button'
        );

      navBtn.type =
        'button';

      navBtn.id =
        'swNavMainBtn';

      navBtn.addEventListener(
        'click',
        ()=>{

          if(rerouting){
            return;
          }

          if(navigationMode){

            requestStopAndDelete();

          }else{

            startNavigation();

          }

        }
      );

    }


    if(
      navBtn.parentElement !==
      row
    ){

      row.appendChild(
        navBtn
      );

    }


    if(
      row.parentElement !== box ||
      row.nextElementSibling !== details
    ){

      box.insertBefore(
        row,
        details
      );

    }


    /* ========================================
       안내 상태 메시지
       ======================================== */

    let status =
      document.getElementById(
        'swNavStatus'
      );

    if(!status){

      status =
        document.createElement(
          'div'
        );

      status.id =
        'swNavStatus';

      status.className =
        'sw-nav-status';

      box.insertBefore(
        status,
        details
      );

    }


    /* ========================================
       길찾기 취소
       ======================================== */

    let cancelBtn =
      document.getElementById(
        'swNavCancelBtn'
      );

    if(!cancelBtn){

      cancelBtn =
        document.createElement(
          'button'
        );

      cancelBtn.type =
        'button';

      cancelBtn.id =
        'swNavCancelBtn';

      cancelBtn.textContent =
        '길찾기 취소';

      cancelBtn.addEventListener(
        'click',
        deleteRoute
      );

      box.appendChild(
        cancelBtn
      );

    }


    renderButtons();

    return true;
  }


  /* ==========================================================
     버튼 상태 렌더링
     ========================================================== */

  function renderButtons(){

    const btn =
      document.getElementById(
        'swNavMainBtn'
      );

    if(btn){

      btn.disabled =
        rerouting || (!navigationMode&&!findRoutePolyline());

      const text =
        rerouting
          ? '경로 재계산 중...'
          : (
              navigationMode
                ? '■ 안내 종료'
                : '🚶 안내 시작'
            );

      const label =
        rerouting
          ? '현재 위치 기준 경로 재계산 중'
          : (
              navigationMode
                ? '안내 종료'
                : '보행 안내 시작'
            );

      if(
        btn.textContent !== text
      ){

        btn.textContent =
          text;

      }

      if(
        btn.getAttribute(
          'aria-label'
        ) !== label
      ){

        btn.setAttribute(
          'aria-label',
          label
        );

      }

    }


    /* ========================================
       안내 중 제목 변경
       ======================================== */

    if(navigationMode){

      const title =
        document.getElementById(
          'routeTitle'
        );

      const sub =
        document.getElementById(
          'routeSub'
        );

      const titleText =
        '🚶 안전 경로 안내 중';

      const subText =
        '현재 위치를 따라가며 남은 거리와 예상 시간을 안내합니다.';

      if(
        title &&
        title.textContent !== titleText
      ){

        title.textContent =
          titleText;

      }

      if(
        sub &&
        sub.textContent !== subText
      ){

        sub.textContent =
          subText;

      }

    }

  }


  /* ==========================================================
     안내 상태 메시지
     ========================================================== */

  function setStatus(
    text,
    level=''
  ){

    const el =
      document.getElementById(
        'swNavStatus'
      );

    if(!el){
      return;
    }

    if(
      el.textContent !== text
    ){

      el.textContent =
        text;

    }

    el.classList.remove(
      'warn',
      'danger'
    );

    if(level){

      el.classList.add(
        level
      );

    }
  }


  /* ==========================================================
     안내용 거리 / 시간 기준값 설정
     ========================================================== */

  function prepareNavigationMetrics(
    current,
    pts
  ){

    routeLatLngs =
      pts;

    lastPosition =
      current;


    const originalM =
      parseDistance(
        document.getElementById(
          'routeDistance'
        )?.textContent
      );


    const originalSec =
      parseDuration(
        document.getElementById(
          'routeDuration'
        )?.textContent
      );


    walkingSpeedMps =
      1.25;


    /*
      기존 경로 API에서 계산된
      거리 / 예상시간 비율이 정상 범위면 사용
    */

    if(
      Number.isFinite(
        originalM
      ) &&
      Number.isFinite(
        originalSec
      ) &&
      originalSec > 0
    ){

      const speed =
        originalM /
        originalSec;

      if(
        speed >= 0.6 &&
        speed <= 2.2
      ){

        walkingSpeedMps =
          speed;

      }

    }
  }


  /* ==========================================================
     실제 안내 시작
     ========================================================== */

  function beginNavigationNow(
    current,
    pts,
    toastText
  ){

    if(
      !current ||
      !Array.isArray(pts) ||
      pts.length < 2
    ){

      return false;
    }


    prepareNavigationMetrics(
      current,
      pts
    );


    setMode(
      true
    );


    buildUI();


    updateNavigation(
      true
    );


    /* ========================================
       현재 위치 중심으로 지도 이동
       ======================================== */

    try{

      if(
        typeof map !== 'undefined' &&
        map
      ){

        map.setView(

          [
            current.lat,
            current.lng
          ],

          Math.max(
            map.getZoom(),
            17
          ),

          {
            animate:true
          }

        );

      }

    }catch(e){}


    /* ========================================
       안내 시작 Toast
       ======================================== */

    if(
      typeof showRouteToast ===
      'function'
    ){

      showRouteToast(

        toastText ||

        '🚶 안내를 시작합니다.\n' +
        '현재 위치를 따라가며 남은 거리와 시간을 안내합니다.',

        4200
      );

    }


    return true;
  }


  /* ==========================================================
     안내 시작 버튼 클릭
     ========================================================== */

  async function startNavigation(){

    if(rerouting){
      return;
    }


    /* ========================================
       경로 존재 여부
       ======================================== */

    if(
      !hasActiveRoute()
    ){

      if(
        typeof showRouteToast ===
        'function'
      ){

        showRouteToast(
          '먼저 목적지를 설정해 경로를 계산해 주세요.',
          3500
        );

      }else{

        alert(
          '먼저 목적지를 설정해 경로를 계산해 주세요.'
        );

      }

      return false;
    }


    /* ========================================
       현재 GPS 확인
       ======================================== */

    const current =
      currentPosition();


    if(!current){

      if(
        typeof showRouteToast ===
        'function'
      ){

        showRouteToast(
          '현재 위치를 확인한 뒤 안내를 시작해 주세요.',
          3500
        );

      }else{

        alert(
          '현재 위치를 확인한 뒤 안내를 시작해 주세요.'
        );

      }

      return false;
    }


    /* ========================================
       경로 polyline 확인
       ======================================== */

    const pts =
      getRouteLatLngs();


    if(
      pts.length < 2
    ){

      if(
        typeof showRouteToast ===
        'function'
      ){

        showRouteToast(
          '경로 정보를 확인하지 못했습니다. 경로를 다시 계산해 주세요.',
          4000
        );

      }

      return false;
    }


    /* ========================================
       현재 위치 ↔ 설정 출발지 거리 확인

       설정 출발지를 읽을 수 없는 경우
       경로 첫 번째 좌표를 사용
       ======================================== */

    const configuredOrigin =
      getConfiguredOrigin() ||
      pts[0];


    const startGap =
      distanceM(
        current,
        configuredOrigin
      );


    /* ========================================
       100m 초과

       안내를 바로 시작하지 않고
       사용자에게 선택권 제공
       ======================================== */

    if(
      Number.isFinite(
        startGap
      ) &&
      startGap >
      START_DISTANCE_THRESHOLD_M
    ){

      showOriginMismatchDialog(
        startGap
      );

      return false;
    }


    /* ========================================
       출발지와 현재 위치가 충분히 가까움

       기존 경로 그대로 안내 시작
       ======================================== */

    return beginNavigationNow(
      current,
      pts
    );
  }


  window.swStartNavigation =
    startNavigation;


  /* ==========================================================
     새로운 경로가 지도에 그려질 때까지 기다리기
     ========================================================== */

  async function waitForRoutePolyline(
    timeoutMs=4000
  ){

    const started =
      Date.now();

    while(
      Date.now() -
      started <
      timeoutMs
    ){

      const pts =
        getRouteLatLngs();

      if(
        pts.length >= 2
      ){

        return pts;

      }

      await new Promise(
        resolve=>
          setTimeout(
            resolve,
            120
          )
      );

    }

    return [];
  }


  /* ==========================================================
     현재 GPS를 routeOrigin 형식으로 변환
     ========================================================== */

  function makeCurrentOrigin(
    current
  ){

    const locText =
      (
        document
          .getElementById(
            'locTxt'
          )
          ?.textContent ||
        ''
      ).trim();


    return {

      lat:
        current.lat,

      lng:
        current.lng,

      label:
        '📍 현재 위치',

      addr:
        (
          locText &&
          locText !==
          '위치 확인 중...'
        )
          ? locText
          : '',

      src:
        'gps'

    };
  }


  /* ==========================================================
     현재 위치 → 기존 목적지로 재탐색 후 안내 시작
     ========================================================== */

  async function rerouteFromCurrentAndStart(){

    if(rerouting){
      return;
    }


    const current =
      currentPosition();


    const destination =
      getConfiguredDestination();


    /* ========================================
       GPS가 없음
       ======================================== */

    if(!current){

      closeOriginMismatchDialog();

      if(
        typeof showRouteToast ===
        'function'
      ){

        showRouteToast(
          '현재 위치를 확인하지 못했습니다.',
          3500
        );

      }

      return;
    }


    /* ========================================
       목적지가 없음
       ======================================== */

    if(!destination){

      closeOriginMismatchDialog();

      if(
        typeof showRouteToast ===
        'function'
      ){

        showRouteToast(
          '목적지 정보를 확인하지 못했습니다. 다시 길찾기해 주세요.',
          3800
        );

      }

      return;
    }


    /* ========================================
       기존 길찾기 함수 확인
       ======================================== */

    if(
      typeof runSearchRoute !==
      'function'
    ){

      closeOriginMismatchDialog();

      if(
        typeof showRouteToast ===
        'function'
      ){

        showRouteToast(
          '경로 재계산 기능을 불러오지 못했습니다.',
          3800
        );

      }

      return;
    }


    /* ========================================
       실패 시 복구하기 위해 기존 출발지 저장
       ======================================== */

    let previousOrigin =
      null;


    try{

      if(
        typeof routeOrigin !==
        'undefined' &&
        routeOrigin
      ){

        previousOrigin = {
          ...routeOrigin
        };

      }

    }catch(e){}


    rerouting =
      true;


    closeOriginMismatchDialog();


    renderButtons();


    const rerouteBtn =
      document.getElementById(
        'swRerouteCurrentBtn'
      );


    if(rerouteBtn){

      rerouteBtn.disabled =
        true;

    }


    try{

      /* ======================================
         현재 GPS를 새로운 출발지로 설정
         ====================================== */

      const newOrigin =
        makeCurrentOrigin(
          current
        );


      if(
        typeof setSlotValue ===
        'function'
      ){

        setSlotValue(
          'origin',
          newOrigin
        );

      }else{

        try{

          routeOrigin =
            newOrigin;

        }catch(e){

          throw new Error(
            '출발지 정보를 갱신할 수 없습니다.'
          );

        }

      }


      /* ======================================
         사용자 안내
         ====================================== */

      if(
        typeof showRouteToast ===
        'function'
      ){

        showRouteToast(
          '📍 현재 위치를 기준으로 경로와 안전도를 다시 계산합니다.',
          3200
        );

      }


      /* ======================================
         기존 SafeWalk 경로 계산 그대로 재사용

         현재 위치
             ↓
         기존 목적지

         + 안전시설
         + 안전도
         모두 다시 계산
         ====================================== */

      await runSearchRoute();


      /* ======================================
         새 경로 Polyline 확보
         ====================================== */

      const pts =
        await waitForRoutePolyline(
          4500
        );


      if(
        pts.length < 2
      ){

        throw new Error(
          '재계산된 경로를 찾지 못했습니다.'
        );

      }


      /*
        경로 계산 중 GPS가 약간 이동했을 수 있으므로
        가장 최신 GPS를 다시 읽음
      */

      const latestCurrent =
        currentPosition() ||
        current;


      /* ======================================
         새 경로 안내 시작
         ====================================== */

      beginNavigationNow(

        latestCurrent,

        pts,

        '🚶 현재 위치에서 목적지까지 새 경로로 안내를 시작합니다.\n' +
        '안전시설과 안전도도 새 경로 기준으로 다시 반영했습니다.'

      );


    }catch(err){

      console.warn(
        '[SafeWalk] 현재 위치 기준 안내 시작 실패',
        err
      );


      /* ======================================
         재탐색 자체가 실패한 경우
         기존 출발지 복원
         ====================================== */

      if(previousOrigin){

        try{

          if(
            typeof setSlotValue ===
            'function'
          ){

            setSlotValue(
              'origin',
              previousOrigin
            );

          }else{

            routeOrigin =
              previousOrigin;

          }

        }catch(e){}

      }


      if(
        typeof showRouteToast ===
        'function'
      ){

        showRouteToast(
          '현재 위치 기준 경로 재계산에 실패했습니다. 기존 경로를 유지합니다.',
          4200
        );

      }

    }finally{

      rerouting =
        false;


      if(rerouteBtn){

        rerouteBtn.disabled =
          false;

      }


      renderButtons();

    }
  }


  /* ==========================================================
     안내 상태만 초기화
     ========================================================== */

  function resetNavigationState(){

    setMode(
      false
    );


    closeOriginMismatchDialog();


    routeLatLngs =
      [];


    walkingSpeedMps =
      1.25;


    lastPanAt =
      0;


    lastPosition =
      null;


    const status =
      document.getElementById(
        'swNavStatus'
      );


    if(status){

      status.textContent =
        '';

      status.classList.remove(
        'warn',
        'danger'
      );

    }


    renderButtons();
  }


  /* ==========================================================
     경로 완전 삭제

     기존 route-ux의
     swCancelActiveRoute() 재사용
     ========================================================== */

  function deleteRoute(){

    resetNavigationState();


    try{

      if(
        typeof swCancelActiveRoute ===
        'function'
      ){

        swCancelActiveRoute();

        return;
      }

    }catch(e){

      console.warn(
        '[SafeWalk] swCancelActiveRoute 실패',
        e
      );

    }


    /*
      예외적으로 swCancelActiveRoute가 없는 경우
      기존 clearRoute fallback
    */

    try{

      if(
        typeof clearRoute ===
        'function'
      ){

        clearRoute(
          true
        );

      }

    }catch(e){

      console.warn(
        '[SafeWalk] clearRoute 실패',
        e
      );

    }


    try{

      if(
        typeof routeOrigin !==
        'undefined'
      ){

        routeOrigin =
          null;

      }


      if(
        typeof routeDest !==
        'undefined'
      ){

        routeDest =
          null;

      }

    }catch(e){}
  }


  /* ==========================================================
     안내 종료
     ========================================================== */

  function requestStopAndDelete(){

    const ok =
      window.confirm(

        '안내를 종료할까요?\n' +
        '현재 경로도 함께 삭제됩니다.'

      );


    if(!ok){
      return;
    }


    deleteRoute();


    if(
      typeof showRouteToast ===
      'function'
    ){

      showRouteToast(
        '안내를 종료하고 경로를 삭제했습니다.',
        3200
      );

    }
  }


  /* ==========================================================
     외부에서 사용할 수 있는 안내 종료 함수
     ========================================================== */

  window.swStopNavigation =
    function(
      deleteRouteToo=true
    ){

      if(
        deleteRouteToo
      ){

        deleteRoute();

      }else{

        resetNavigationState();

      }

    };


  /* ==========================================================
     실시간 안내 갱신
     ========================================================== */

  function updateNavigation(
    forcePan=false
  ){

    if(
      !navigationMode
    ){
      return;
    }


    const current =
      currentPosition();


    if(!current){
      setStatus('현재 위치를 다시 확인하고 있습니다. 위치 수신 상태를 확인해 주세요.','warn');
      return;
    }


    if(
      routeLatLngs.length < 2
    ){

      routeLatLngs =
        getRouteLatLngs();

    }


    if(
      routeLatLngs.length < 2
    ){
      return;
    }


    const progress =
      progressOnRoute(
        current,
        routeLatLngs
      );


    if(!progress){
      return;
    }


    const remaining =
      Math.max(
        0,
        progress.remainingM
      );


    const remainSec =
      remaining /
      Math.max(
        0.6,
        walkingSpeedMps
      );


    /* ========================================
       거리 / 시간 갱신
       ======================================== */

    const distEl =
      document.getElementById(
        'routeDistance'
      );


    const durEl =
      document.getElementById(
        'routeDuration'
      );


    if(distEl){

      distEl.textContent =
        formatDistance(
          remaining
        );

    }


    if(durEl){

      durEl.textContent =
        formatDuration(
          remainSec
        );

    }


    /* ========================================
       안내 상태
       ======================================== */

    const destination=getConfiguredDestination()||routeLatLngs[routeLatLngs.length-1];
    const destinationDistance=distanceM(current,destination);
    const accurate=Number.isFinite(myPositionAccuracy)&&myPositionAccuracy<=50;

    if(!accurate){
      setStatus('GPS 정확도가 낮아 도착 여부를 확인할 수 없습니다. 주변 지형과 목적지를 직접 확인해 주세요.','warn');
    }
    else if(remaining<=ARRIVAL_M&&destinationDistance<=ARRIVAL_M&&progress.offRouteM<OFF_ROUTE_WARN_M){
      setStatus('🏁 목적지에 거의 도착했습니다. 도착 후 안내 종료를 눌러 주세요.');
    }

    else if(
      progress.offRouteM >=
      OFF_ROUTE_STRONG_M
    ){

      setStatus(

        `⚠️ 현재 위치가 안내 경로에서 약 ${Math.round(progress.offRouteM)}m 벗어나 있습니다.`,

        'danger'

      );

    }

    else if(
      progress.offRouteM >=
      OFF_ROUTE_WARN_M
    ){

      setStatus(

        '⚠️ 안내 경로에서 조금 벗어나 있습니다. 지도의 경로를 확인해 주세요.',

        'warn'

      );

    }

    else{

      setStatus(

        '📍 현재 위치를 따라 안내 중 · 남은 거리 ' +
        formatDistance(
          remaining
        )

      );

    }


    /* ========================================
       지도 자동 따라가기
       ======================================== */

    const moved =
      lastPosition

        ? distanceM(
            lastPosition,
            current
          )

        : Infinity;


    const now =
      Date.now();


    if(

      forcePan ||

      (
        moved >=
        PAN_MOVE_M &&

        now -
        lastPanAt >=
        PAN_INTERVAL_MS
      )

    ){

      try{

        if(
          typeof map !==
          'undefined' &&
          map
        ){

          map.panTo(

            [
              current.lat,
              current.lng
            ],

            {
              animate:true,
              duration:.45
            }

          );


          lastPanAt =
            now;

        }

      }catch(e){}

    }


    lastPosition =
      current;
  }


  /* ==========================================================
     경로 상태 감시
     ========================================================== */

  function watchRoute(){

    const active =
      hasActiveRoute();


    const sig =
      active
        ? routeSignature()
        : '';


    if(active){

      buildUI();


      if(
        sig &&
        sig !==
        lastRouteSignature
      ){

        lastRouteSignature =
          sig;


        routeLatLngs =
          getRouteLatLngs();

      }

    }else{

      lastRouteSignature =
        '';


      if(navigationMode){

        resetNavigationState();

      }

    }
  }


  /* ==========================================================
     기존 함수 wrapper
     ========================================================== */

  function installWrappers(){

    /* ========================================
       기존 길찾기 취소
       ======================================== */

    if(
      typeof swCancelActiveRoute ===
      'function' &&
      !swCancelActiveRoute._swNavWrapped
    ){

      const prev =
        swCancelActiveRoute;


      const wrapped =
        function(...args){

          resetNavigationState();

          return prev.apply(
            this,
            args
          );

        };


      wrapped._swNavWrapped =
        true;


      window.swCancelActiveRoute =
        wrapped;
    }


    /* ========================================
       메인 화면 ←

       안내만 종료하고
       기존 경로 저장/복원 로직은 그대로 유지
       ======================================== */

    if(
      typeof goBack ===
      'function' &&
      !goBack._swNavWrapped
    ){

      const prev =
        goBack;


      const wrapped =
        function(...args){

          closeOriginMismatchDialog();


          if(navigationMode){

            resetNavigationState();

          }


          return prev.apply(
            this,
            args
          );

        };


      wrapped._swNavWrapped =
        true;


      window.goBack =
        wrapped;
    }
  }


  /* ==========================================================
     초기화
     ========================================================== */

  function init(){

    injectStyles();


    ensureOriginMismatchDialog();


    installWrappers();


    buildUI();


    watchRoute();


    /*
      다른 SafeWalk JS 초기화 순서에 대비
    */

    setTimeout(
      installWrappers,
      500
    );


    setTimeout(
      installWrappers,
      1500
    );


    /* ========================================
       1초마다

       - 경로 상태 확인
       - 안내 중이면 GPS 진행도 갱신
       ======================================== */

    setInterval(

      ()=>{

        watchRoute();


        if(navigationMode){

          updateNavigation(
            false
          );

        }

      },

      UPDATE_MS

    );


    /* ========================================
       route-ux가 DOM을 다시 구성하더라도
       안내 UI 복구
       ======================================== */

    const panel =
      document.getElementById(
        'routePanel'
      );


    if(
      panel &&
      typeof MutationObserver !==
      'undefined'
    ){

      let timer =
        null;


      const observer =
        new MutationObserver(
          ()=>{

            clearTimeout(
              timer
            );


            timer =
              setTimeout(
                ()=>{

                  buildUI();

                  renderButtons();

                },
                60
              );

          }
        );


      observer.observe(

        panel,

        {
          childList:true,
          subtree:true
        }

      );

    }
  }


  /* ==========================================================
     DOM 준비 후 시작
     ========================================================== */

  if(
    document.readyState ===
    'loading'
  ){

    document.addEventListener(

      'DOMContentLoaded',

      init,

      {
        once:true
      }

    );

  }else{

    init();

  }

})();

