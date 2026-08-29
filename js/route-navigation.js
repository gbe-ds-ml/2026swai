/* ============================================================
   SafeWalk v2.9.0 — route-navigation.js
   경로 미리보기 / 안내 시작 / 안내 종료 기능

   - 경로 계산 직후: [상세 점수 보기] [🚶 안내 시작] + [길찾기 취소]
   - 안내 시작 후:   [상세 점수 보기] [■ 안내 종료]
   - 안내 중 GPS 현재 위치를 따라 지도 중심 이동
   - 남은 거리 / 예상 시간 실시간 갱신
   - 안내 종료 시 경로까지 완전 삭제
   - X / 모바일 뒤로가기는 기존처럼 경로와 안내를 유지
   - 메인 화면으로 나갈 때는 안내 모드만 종료하고 저장 경로는 유지
   ============================================================ */

(function(){
  'use strict';

  let navigationMode=false;
  let routeLatLngs=[];
  let walkingSpeedMps=1.25;
  let lastPanAt=0;
  let lastPosition=null;
  let lastRouteSignature='';

  window.swNavigationMode=false;

  const UPDATE_MS=1000;
  const PAN_INTERVAL_MS=1200;
  const PAN_MOVE_M=4;
  const ARRIVAL_M=25;
  const OFF_ROUTE_WARN_M=50;
  const OFF_ROUTE_STRONG_M=80;

  function setMode(v){
    navigationMode=!!v;
    window.swNavigationMode=navigationMode;
    document.body.classList.toggle('sw-navigation-active',navigationMode);
  }

  function currentPosition(){
    try{
      if(
        typeof myLat!=='undefined' &&
        typeof myLng!=='undefined' &&
        Number.isFinite(myLat) &&
        Number.isFinite(myLng)
      ){
        return {
          lat:myLat,
          lng:myLng
        };
      }
    }catch(e){}

    return null;
  }

  function distanceM(a,b){
    if(!a || !b)return Infinity;

    try{
      if(
        typeof map!=='undefined' &&
        map &&
        typeof map.distance==='function'
      ){
        return map.distance(
          [a.lat,a.lng],
          [b.lat,b.lng]
        );
      }
    }catch(e){}

    const R=6371000;

    const p1=
      a.lat*
      Math.PI/
      180;

    const p2=
      b.lat*
      Math.PI/
      180;

    const dp=
      (b.lat-a.lat)*
      Math.PI/
      180;

    const dl=
      (b.lng-a.lng)*
      Math.PI/
      180;

    const h=
      Math.sin(dp/2)**2+
      Math.cos(p1)*
      Math.cos(p2)*
      Math.sin(dl/2)**2;

    return (
      2*
      R*
      Math.atan2(
        Math.sqrt(h),
        Math.sqrt(1-h)
      )
    );
  }

  function flattenLatLngs(
    input,
    out=[]
  ){
    if(!Array.isArray(input)){
      return out;
    }

    input.forEach(item=>{

      if(Array.isArray(item)){
        return flattenLatLngs(
          item,
          out
        );
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

  function routeColor(){

    try{

      if(
        typeof ROUTE_COLOR!=='undefined' &&
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
     route.js 내부 변수명에 의존하지 않고
     Leaflet 레이어에서 실제 경로 polyline 찾기
     ========================================================== */

  function findRoutePolyline(){

    try{

      if(
        typeof map==='undefined' ||
        !map ||
        typeof L==='undefined'
      ){
        return null;
      }

      const target=
        routeColor();

      let best=null;
      let bestCount=0;

      map.eachLayer(layer=>{

        if(
          !(layer instanceof L.Polyline)
        ){
          return;
        }

        if(
          typeof L.Polygon!=='undefined' &&
          layer instanceof L.Polygon
        ){
          return;
        }

        if(
          typeof layer.getLatLngs!=='function'
        ){
          return;
        }

        const color=
          String(
            layer.options?.color ||
            ''
          ).toLowerCase();

        if(
          color!==target &&
          color!=='#ef4444'
        ){
          return;
        }

        const pts=
          flattenLatLngs(
            layer.getLatLngs()
          );

        if(
          pts.length>
          bestCount
        ){
          best=layer;
          bestCount=pts.length;
        }

      });

      return best;

    }catch(e){

      return null;

    }
  }

  function getRouteLatLngs(){

    const line=
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

  function hasActiveRoute(){

    if(
      findRoutePolyline()
    ){
      return true;
    }

    try{

      if(
        typeof swGetSavedRoute==='function'
      ){

        const saved=
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
        typeof routeDest!=='undefined' &&
        routeDest
      ){
        return true;
      }

    }catch(e){}

    return false;
  }

  function routeSignature(){

    const pts=
      getRouteLatLngs();

    if(
      pts.length<2
    ){
      return '';
    }

    const a=
      pts[0];

    const b=
      pts[
        pts.length-1
      ];

    return (
      pts.length+
      '|'+
      a.lat.toFixed(5)+
      '|'+
      a.lng.toFixed(5)+
      '|'+
      b.lat.toFixed(5)+
      '|'+
      b.lng.toFixed(5)
    );
  }

  function parseDistance(text){

    const s=
      String(
        text || ''
      )
      .replace(
        /,/g,
        ''
      )
      .trim();

    let m=
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*km/i
      );

    if(m){
      return Number(
        m[1]
      )*1000;
    }

    m=
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*m/i
      );

    return m
      ?Number(m[1])
      :null;
  }

  function parseDuration(text){

    const s=
      String(
        text || ''
      ).trim();

    let sec=0;
    let found=false;

    const h=
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*(?:시간|hour|hr|h)/i
      );

    const m=
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*(?:분|min|minute)/i
      );

    const ss=
      s.match(
        /([0-9]+(?:\.[0-9]+)?)\s*(?:초|sec|second)/i
      );

    if(h){
      sec+=
        Number(
          h[1]
        )*
        3600;

      found=true;
    }

    if(m){
      sec+=
        Number(
          m[1]
        )*
        60;

      found=true;
    }

    if(ss){
      sec+=
        Number(
          ss[1]
        );

      found=true;
    }

    return found
      ?sec
      :null;
  }

  function formatDistance(m){

    if(
      !Number.isFinite(m)
    ){
      return '-';
    }

    if(
      m<1000
    ){
      return (
        Math.max(
          0,
          Math.round(m)
        )+
        'm'
      );
    }

    const km=
      m/1000;

    return (
      (
        km<10
          ?km.toFixed(1)
          :km.toFixed(0)
      )+
      'km'
    );
  }

  function formatDuration(sec){

    if(
      !Number.isFinite(sec)
    ){
      return '-';
    }

    const min=
      Math.max(
        1,
        Math.round(
          sec/60
        )
      );

    if(
      min<60
    ){
      return (
        '약 '+
        min+
        '분'
      );
    }

    const h=
      Math.floor(
        min/60
      );

    const r=
      min%60;

    return r
      ?`약 ${h}시간 ${r}분`
      :`약 ${h}시간`;
  }

  /* ==========================================================
     현재 GPS가 경로의 어느 구간에 있는지 투영하여
     남은 경로 거리 계산
     ========================================================== */

  function progressOnRoute(
    current,
    pts
  ){

    if(
      !current ||
      pts.length<2
    ){
      return null;
    }

    const lat0=
      current.lat*
      Math.PI/
      180;

    const meterPerLat=
      111132;

    const meterPerLng=
      111320*
      Math.cos(
        lat0
      );

    const segLen=[];

    const suffix=
      new Array(
        pts.length
      ).fill(0);

    for(
      let i=0;
      i<pts.length-1;
      i++
    ){
      segLen[i]=
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
      suffix[i]=
        suffix[i+1]+
        segLen[i];
    }

    let bestDist2=
      Infinity;

    let bestRemaining=
      Infinity;

    for(
      let i=0;
      i<pts.length-1;
      i++
    ){

      const a=
        pts[i];

      const b=
        pts[i+1];

      const ax=
        (
          a.lng-
          current.lng
        )*
        meterPerLng;

      const ay=
        (
          a.lat-
          current.lat
        )*
        meterPerLat;

      const bx=
        (
          b.lng-
          current.lng
        )*
        meterPerLng;

      const by=
        (
          b.lat-
          current.lat
        )*
        meterPerLat;

      const vx=
        bx-ax;

      const vy=
        by-ay;

      const vv=
        vx*vx+
        vy*vy;

      let t=
        vv>0
          ?-(ax*vx+ay*vy)/vv
          :0;

      t=
        Math.max(
          0,
          Math.min(
            1,
            t
          )
        );

      const px=
        ax+
        t*vx;

      const py=
        ay+
        t*vy;

      const d2=
        px*px+
        py*py;

      if(
        d2<
        bestDist2
      ){

        bestDist2=
          d2;

        bestRemaining=
          segLen[i]*
          (1-t)
          +
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
     스타일 삽입
     ========================================================== */

  function injectStyles(){

    if(
      document.getElementById(
        'swRouteNavigationStyle'
      )
    ){
      return;
    }

    const style=
      document.createElement(
        'style'
      );

    style.id=
      'swRouteNavigationStyle';

    style.textContent=`

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
        border:1px solid rgba(220,38,38,.28);
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
        background:rgba(17,24,39,.06);
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

      @media (max-width:640px){

        #routeDetailsBox .sw-nav-primary-row{
          gap:7px;
        }

        #swNavMainBtn{
          font-size:13px;
          padding-left:6px;
          padding-right:6px;
        }

      }

    `;

    document.head.appendChild(
      style
    );
  }

  /* ==========================================================
     기존 route-ux.js 길찾기 취소 버튼 숨기기
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
          btn.id==='swNavCancelBtn' ||
          btn.id==='swNavMainBtn'
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

        btn.style.display=
          'none';

        btn.setAttribute(
          'aria-hidden',
          'true'
        );

        btn.tabIndex=
          -1;

      });

  }

  /* ==========================================================
     안내 UI 생성
     ========================================================== */

  function buildUI(){

    const box=
      document.getElementById(
        'routeDetailsBox'
      );

    const detailsToggle=
      document.getElementById(
        'routeDetailsToggle'
      );

    const details=
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

    hideOldCancelButtons(
      box
    );

    let row=
      document.getElementById(
        'swNavPrimaryRow'
      );

    if(!row){

      row=
        document.createElement(
          'div'
        );

      row.id=
        'swNavPrimaryRow';

      row.className=
        'sw-nav-primary-row';

    }

    if(
      detailsToggle.parentElement!==
      row
    ){

      const oldParent=
        detailsToggle.parentElement;

      row.appendChild(
        detailsToggle
      );

      if(
        oldParent &&
        oldParent!==box &&
        oldParent!==row &&
        Array
          .from(
            oldParent.children
          )
          .every(
            el=>
              el.style.display==='none'
          )
      ){
        oldParent.style.display=
          'none';
      }

    }

    let navBtn=
      document.getElementById(
        'swNavMainBtn'
      );

    if(!navBtn){

      navBtn=
        document.createElement(
          'button'
        );

      navBtn.type=
        'button';

      navBtn.id=
        'swNavMainBtn';

      navBtn.addEventListener(
        'click',
        ()=>{
          navigationMode
            ?requestStopAndDelete()
            :startNavigation();
        }
      );

    }

    if(
      navBtn.parentElement!==
      row
    ){
      row.appendChild(
        navBtn
      );
    }

    if(
      row.parentElement!==box ||
      row.nextElementSibling!==details
    ){

      box.insertBefore(
        row,
        details
      );

    }

    let status=
      document.getElementById(
        'swNavStatus'
      );

    if(!status){

      status=
        document.createElement(
          'div'
        );

      status.id=
        'swNavStatus';

      status.className=
        'sw-nav-status';

      box.insertBefore(
        status,
        details
      );

    }

    let cancelBtn=
      document.getElementById(
        'swNavCancelBtn'
      );

    if(!cancelBtn){

      cancelBtn=
        document.createElement(
          'button'
        );

      cancelBtn.type=
        'button';

      cancelBtn.id=
        'swNavCancelBtn';

      cancelBtn.textContent=
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

  function renderButtons(){

    const btn=
      document.getElementById(
        'swNavMainBtn'
      );

    if(btn){

      const text=
        navigationMode
          ?'■ 안내 종료'
          :'🚶 안내 시작';

      const label=
        navigationMode
          ?'안내 종료'
          :'보행 안내 시작';

      if(
        btn.textContent!==
        text
      ){
        btn.textContent=
          text;
      }

      if(
        btn.getAttribute(
          'aria-label'
        )!==label
      ){
        btn.setAttribute(
          'aria-label',
          label
        );
      }

    }

    if(navigationMode){

      const title=
        document.getElementById(
          'routeTitle'
        );

      const sub=
        document.getElementById(
          'routeSub'
        );

      const titleText=
        '🚶 안전 경로 안내 중';

      const subText=
        '현재 위치를 따라가며 남은 거리와 예상 시간을 안내합니다.';

      if(
        title &&
        title.textContent!==titleText
      ){
        title.textContent=
          titleText;
      }

      if(
        sub &&
        sub.textContent!==subText
      ){
        sub.textContent=
          subText;
      }

    }

  }

  function setStatus(
    text,
    level=''
  ){

    const el=
      document.getElementById(
        'swNavStatus'
      );

    if(!el){
      return;
    }

    if(
      el.textContent!==
      text
    ){
      el.textContent=
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
     안내 시작
     ========================================================== */

  function startNavigation(){

    if(
      !hasActiveRoute()
    ){

      return typeof showRouteToast==='function'

        ?showRouteToast(
            '먼저 목적지를 설정해 경로를 계산해 주세요.',
            3500
          )

        :alert(
            '먼저 목적지를 설정해 경로를 계산해 주세요.'
          );

    }

    const current=
      currentPosition();

    if(!current){

      return typeof showRouteToast==='function'

        ?showRouteToast(
            '현재 위치를 확인한 뒤 안내를 시작해 주세요.',
            3500
          )

        :alert(
            '현재 위치를 확인한 뒤 안내를 시작해 주세요.'
          );

    }

    const pts=
      getRouteLatLngs();

    if(
      pts.length<2
    ){

      if(
        typeof showRouteToast==='function'
      ){

        showRouteToast(
          '경로 정보를 확인하지 못했습니다. 경로를 다시 계산해 주세요.',
          4000
        );

      }

      return false;
    }

    routeLatLngs=
      pts;

    lastPosition=
      current;

    const originalM=
      parseDistance(
        document.getElementById(
          'routeDistance'
        )?.textContent
      );

    const originalSec=
      parseDuration(
        document.getElementById(
          'routeDuration'
        )?.textContent
      );

    walkingSpeedMps=
      1.25;

    if(
      Number.isFinite(
        originalM
      ) &&
      Number.isFinite(
        originalSec
      ) &&
      originalSec>0
    ){

      const speed=
        originalM/
        originalSec;

      if(
        speed>=0.6 &&
        speed<=2.2
      ){
        walkingSpeedMps=
          speed;
      }

    }

    setMode(
      true
    );

    buildUI();

    updateNavigation(
      true
    );

    try{

      if(
        typeof map!=='undefined' &&
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

    if(
      typeof showRouteToast==='function'
    ){

      showRouteToast(
        '🚶 안내를 시작합니다.\n현재 위치를 따라가며 남은 거리와 시간을 안내합니다.',
        4200
      );

    }

    return true;
  }

  window.swStartNavigation=
    startNavigation;

  /* ==========================================================
     안내 상태 초기화
     ========================================================== */

  function resetNavigationState(){

    setMode(
      false
    );

    routeLatLngs=[];

    walkingSpeedMps=
      1.25;

    lastPanAt=
      0;

    lastPosition=
      null;

    const status=
      document.getElementById(
        'swNavStatus'
      );

    if(status){

      status.textContent=
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

     기존 route-ux.js의 swCancelActiveRoute 재사용
     ========================================================== */

  function deleteRoute(){

    resetNavigationState();

    try{

      if(
        typeof swCancelActiveRoute===
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

    try{

      if(
        typeof clearRoute===
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
        typeof routeOrigin!==
        'undefined'
      ){
        routeOrigin=
          null;
      }

      if(
        typeof routeDest!==
        'undefined'
      ){
        routeDest=
          null;
      }

    }catch(e){}

  }

  /* ==========================================================
     안내 종료 확인
     ========================================================== */

  function requestStopAndDelete(){

    const ok=
      window.confirm(
        '안내를 종료할까요?\n현재 경로도 함께 삭제됩니다.'
      );

    if(!ok){
      return;
    }

    deleteRoute();

    if(
      typeof showRouteToast===
      'function'
    ){

      showRouteToast(
        '안내를 종료하고 경로를 삭제했습니다.',
        3200
      );

    }

  }

  window.swStopNavigation=
    function(
      deleteRouteToo=true
    ){

      if(
        deleteRouteToo
      ){
        deleteRoute();
      }

      else{
        resetNavigationState();
      }

    };

  /* ==========================================================
     실시간 안내 갱신

     GPS 현재 위치
     → 경로상 가장 가까운 지점
     → 남은 거리
     → 남은 예상 시간
     ========================================================== */

  function updateNavigation(
    forcePan=false
  ){

    if(
      !navigationMode
    ){
      return;
    }

    const current=
      currentPosition();

    if(!current){
      return;
    }

    if(
      routeLatLngs.length<2
    ){
      routeLatLngs=
        getRouteLatLngs();
    }

    if(
      routeLatLngs.length<2
    ){
      return;
    }

    const progress=
      progressOnRoute(
        current,
        routeLatLngs
      );

    if(!progress){
      return;
    }

    const remaining=
      Math.max(
        0,
        progress.remainingM
      );

    const remainSec=
      remaining/
      Math.max(
        0.6,
        walkingSpeedMps
      );

    const distEl=
      document.getElementById(
        'routeDistance'
      );

    const durEl=
      document.getElementById(
        'routeDuration'
      );

    if(distEl){
      distEl.textContent=
        formatDistance(
          remaining
        );
    }

    if(durEl){
      durEl.textContent=
        formatDuration(
          remainSec
        );
    }

    /* ========================================================
       상태 메시지
       ======================================================== */

    if(
      remaining<=ARRIVAL_M
    ){

      setStatus(
        '🏁 목적지에 거의 도착했습니다. 도착 후 안내 종료를 눌러 주세요.'
      );

    }

    else if(
      progress.offRouteM>=
      OFF_ROUTE_STRONG_M
    ){

      setStatus(
        `⚠️ 현재 위치가 안내 경로에서 약 ${Math.round(progress.offRouteM)}m 벗어나 있습니다.`,
        'danger'
      );

    }

    else if(
      progress.offRouteM>=
      OFF_ROUTE_WARN_M
    ){

      setStatus(
        '⚠️ 안내 경로에서 조금 벗어나 있습니다. 지도의 경로를 확인해 주세요.',
        'warn'
      );

    }

    else{

      setStatus(
        '📍 현재 위치를 따라 안내 중 · 남은 거리 '+
        formatDistance(
          remaining
        )
      );

    }

    /* ========================================================
       지도 자동 추적
       ======================================================== */

    const moved=
      lastPosition
        ?distanceM(
            lastPosition,
            current
          )
        :Infinity;

    const now=
      Date.now();

    if(
      forcePan ||
      (
        moved>=PAN_MOVE_M &&
        now-lastPanAt>=
        PAN_INTERVAL_MS
      )
    ){

      try{

        if(
          typeof map!=='undefined' &&
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

          lastPanAt=
            now;

        }

      }catch(e){}

    }

    lastPosition=
      current;
  }

  /* ==========================================================
     경로 존재 여부 감시
     ========================================================== */

  function watchRoute(){

    const active=
      hasActiveRoute();

    const sig=
      active
        ?routeSignature()
        :'';

    if(active){

      buildUI();

      if(
        sig &&
        sig!==lastRouteSignature
      ){

        lastRouteSignature=
          sig;

        routeLatLngs=
          getRouteLatLngs();

      }

    }

    else{

      lastRouteSignature=
        '';

      if(
        navigationMode
      ){
        resetNavigationState();
      }

    }

  }

  /* ==========================================================
     기존 함수 wrapper

     - 기존 길찾기 취소 시 안내 상태도 정리
     - 메인 화면으로 나갈 때 안내 모드만 종료
     ========================================================== */

  function installWrappers(){

    /* --------------------------------------------------------
       기존 명시적 경로 삭제 시
       안내 상태도 정리
       -------------------------------------------------------- */

    if(
      typeof swCancelActiveRoute==='function' &&
      !swCancelActiveRoute._swNavWrapped
    ){

      const prev=
        swCancelActiveRoute;

      const wrapped=
        function(...args){

          resetNavigationState();

          return prev.apply(
            this,
            args
          );

        };

      wrapped._swNavWrapped=
        true;

      window.swCancelActiveRoute=
        wrapped;

    }

    /* --------------------------------------------------------
       메인 화면으로 나갈 때
       안내는 끝내되 저장 경로는 기존 로직에 맡김
       -------------------------------------------------------- */

    if(
      typeof goBack==='function' &&
      !goBack._swNavWrapped
    ){

      const prev=
        goBack;

      const wrapped=
        function(...args){

          if(
            navigationMode
          ){
            resetNavigationState();
          }

          return prev.apply(
            this,
            args
          );

        };

      wrapped._swNavWrapped=
        true;

      window.goBack=
        wrapped;

    }

  }

  /* ==========================================================
     초기화
     ========================================================== */

  function init(){

    injectStyles();

    installWrappers();

    buildUI();

    watchRoute();

    /*
      route-ux / main 등 다른 JS 초기화 순서에 대비해
      wrapper 재설치 시도
    */

    setTimeout(
      installWrappers,
      500
    );

    setTimeout(
      installWrappers,
      1500
    );

    /* ========================================================
       1초마다

       - 경로 상태 확인
       - 안내 중이면 GPS 진행도 계산
       ======================================================== */

    setInterval(
      ()=>{

        watchRoute();

        if(
          navigationMode
        ){
          updateNavigation(
            false
          );
        }

      },
      UPDATE_MS
    );

    /* ========================================================
       route-ux가 버튼 DOM을 다시 구성해도
       안내 UI 자동 복구
       ======================================================== */

    const panel=
      document.getElementById(
        'routePanel'
      );

    if(
      panel &&
      typeof MutationObserver!==
      'undefined'
    ){

      let timer=null;

      const observer=
        new MutationObserver(
          ()=>{

            clearTimeout(
              timer
            );

            timer=
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

  if(
    document.readyState===
    'loading'
  ){

    document.addEventListener(
      'DOMContentLoaded',
      init,
      {
        once:true
      }
    );

  }

  else{

    init();

  }

})();
