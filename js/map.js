/* ============================================================
   SafeWalk v2.0 — map.js
   Leaflet 지도 생성, GPS 위치 추적, WMS 타일, CPTED 안내.
   "지도가 안 뜬다 / 내 위치가 이상하다"는 이 파일을 보세요.

   [v2 개선]
   - drawMe(): GPS 갱신마다 마커를 새로 만들지 않고 위치만 이동
   - CPTED 팝업 문자열 esc() 적용(XSS 방지)
   - CPTED 조회 완료 시 요청 토큰을 확인하고 스피너를 정리
   ============================================================ */

/* ── 지도 상태 ── */
let map=null,myMark=null,myLat=null,myLng=null;
let watchId=null;
let mapDomCleanups=[];
let suppressMoveFetch=false;

let cptedGuideLine=null;
let cptedTargetMark=null;
let cptedTapMark=null;
let lastCptedDirectTapAt=0;
let cptedTapRequestToken=0;
let lastPopupCloseAt=0;

/* Leaflet 로드 후에만 만들 수 있는 클래스/아이콘은
   최상위가 아니라 함수 안에서 지연 생성한다.
   (CDN 로드 실패 시 스크립트 전체가 죽는 문제 방지) */
let _SafemapWMS4326=null;
function getSafemapWMSClass(){
  if(!_SafemapWMS4326){
    _SafemapWMS4326=L.TileLayer.extend({
      getTileUrl:function(coords){
        const b=this._tileCoordsToBounds(coords);
        const bbox=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(',');
        return this._url+'?serviceKey='+API_KEY+'&srs=EPSG:4326&bbox='+bbox+
          '&format=image/png&width=256&height=256&transparent=TRUE';
      }
    });
  }
  return _SafemapWMS4326;
}

/* ── 위치 기억: 다음 방문 때 전국 뷰를 거치지 않고
   바로 내 동네 타일부터 불러오기 위한 저장 ── */
let lastPosSavedAt=0;
function readLastPos(){
  try{
    const raw=localStorage.getItem(LAST_POS_STORAGE_KEY);
    if(!raw)return null;
    const p=JSON.parse(raw);
    if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng))return null;
    return p;
  }catch(e){return null;}
}
function writeLastPos(lat,lng){
  const now=Date.now();
  if(now-lastPosSavedAt<30000)return; /* 30초에 한 번만 저장 */
  lastPosSavedAt=now;
  try{localStorage.setItem(LAST_POS_STORAGE_KEY,JSON.stringify({lat,lng,ts:now}));}catch(e){}
}

/* ── 중심 타일 미리 받기 ──
   지도가 열리기 전에 내 좌표 주변 3×3 타일을 브라우저 캐시에
   넣어 두면, 지도가 열릴 때 중심이 즉시 그려지고 바깥쪽으로
   퍼져나가는 것처럼 보인다. URL 규칙(서브도메인·레티나)은
   Leaflet과 동일하게 맞춰야 캐시가 적중한다. */
const prefetchedTiles=new Set();
function tileXY(lat,lng,z){
  const n=Math.pow(2,z);
  const x=Math.floor((lng+180)/360*n);
  const latRad=lat*Math.PI/180;
  const y=Math.floor((1-Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI)/2*n);
  return {x,y};
}
function prefetchCenterTiles(lat,lng){
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  const z=DEFAULT_ZOOM;
  const c=tileXY(lat,lng,z);
  const r=(window.devicePixelRatio||1)>1?'@2x':'';
  const subs=['a','b','c','d'];
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
    const tx=c.x+dx,ty=c.y+dy;
    const s=subs[Math.abs(tx+ty)%subs.length];
    const url='https://'+s+'.basemaps.cartocdn.com/rastertiles/voyager/'+z+'/'+tx+'/'+ty+r+'.png';
    if(prefetchedTiles.has(url))continue;
    prefetchedTiles.add(url);
    new Image().src=url;
  }
}

/* 인트로에서 유형 카드를 고르는 순간 위치를 미리 요청해 둔다.
   저정밀(네트워크 기반)이라 빠르고, "시작"을 누를 때쯤이면
   좌표가 준비되어 지도가 곧바로 내 위치에서 열린다.
   지난 방문 좌표가 있으면 그 주변 타일부터 먼저 받아 둔다. */
let locationWarmupStarted=false;
function warmupLocation(){
  if(locationWarmupStarted)return;
  locationWarmupStarted=true;
  const saved=readLastPos();
  if(saved)prefetchCenterTiles(saved.lat,saved.lng);
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(
    p=>{
      myLat=p.coords.latitude;myLng=p.coords.longitude;
      writeLastPos(myLat,myLng);
      prefetchCenterTiles(myLat,myLng);
    },
    ()=>{},
    {timeout:5000,enableHighAccuracy:false,maximumAge:120000}
  );
}

/* ── 지도 초기화 ── */
function initMap(){
  /* 시작 화면 좌표 우선순위:
     ① 워밍업으로 이미 받은 좌표 → ② 지난 방문 저장 좌표 → ③ 전국 뷰 */
  let seed={lat:36.5,lng:127.8,zoom:7};
  if(Number.isFinite(myLat)&&Number.isFinite(myLng)){
    seed={lat:myLat,lng:myLng,zoom:DEFAULT_ZOOM};
  }else{
    const saved=readLastPos();
    if(saved)seed={lat:saved.lat,lng:saved.lng,zoom:DEFAULT_ZOOM};
  }
  map=L.map('map',{zoomControl:false,attributionControl:false,tap:false,tapTolerance:15}).setView([seed.lat,seed.lng],seed.zoom);
  bindPopupCloseGuard();
  L.tileLayer(
  VWORLD_BASE_TILE_URL,
  {
    maxZoom:19,
    keepBuffer:3,

    attribution:
      '&copy; 공간정보 오픈플랫폼 VWorld'
  }
).addTo(map);
  buildChips();
  initSheet();
  syncViewportChrome();
  getGPS();
}

/* ── 팝업 닫기 버튼 터치 보호 ── */
function markPopupCloseTouch(e){
  lastPopupCloseAt=Date.now();
  if(e){
    e.stopPropagation();
    if(e.stopImmediatePropagation)e.stopImmediatePropagation();
  }
}
function bindPopupCloseGuard(){
  if(!map||map._popupCloseGuardBound)return;
  map._popupCloseGuardBound=true;
  map.on('popupopen',e=>{
    const popupEl=e.popup&&e.popup.getElement?e.popup.getElement():null;
    if(!popupEl)return;
    const closeBtn=popupEl.querySelector('.leaflet-popup-close-button');
    if(!closeBtn||closeBtn._safeWalkCloseGuard)return;
    closeBtn._safeWalkCloseGuard=true;
    ['pointerdown','touchstart','mousedown'].forEach(type=>{
      closeBtn.addEventListener(type,markPopupCloseTouch,{capture:true,passive:true});
    });
    closeBtn.addEventListener('click',ev=>{
      ev.preventDefault();
      markPopupCloseTouch(ev);
      if(map)map.closePopup();
    },{capture:true});
  });
}

/* ── CPTED 직선 안내 ── */
function clearCptedGuide(closePopup=true){
  if(cptedGuideLine&&map)map.removeLayer(cptedGuideLine);
  if(cptedTargetMark&&map)map.removeLayer(cptedTargetMark);
  if(cptedTapMark&&map)map.removeLayer(cptedTapMark);
  cptedGuideLine=null;cptedTargetMark=null;cptedTapMark=null;
  if(closePopup&&map)map.closePopup();
}
function drawCptedGuide(fromLatLng,toLatLng){
  if(!map)return;

  cptedGuideLine=L.polyline(
    [[fromLatLng.lat,fromLatLng.lng],[toLatLng.lat,toLatLng.lng]],
    {color:'#b45309',weight:4,opacity:.9,dashArray:'6,8',lineCap:'round',lineJoin:'round'}
  ).addTo(map);

  cptedTapMark=L.circleMarker([fromLatLng.lat,fromLatLng.lng],{
    radius:6,color:'#b45309',weight:3,fillColor:'#fff7ed',fillOpacity:1,interactive:false
  }).addTo(map);

  const icon=L.divIcon({
    html:'<div class="cpted-target-label">🏗 가장 가까운 CPTED</div>',
    className:'',
    iconSize:null,
    iconAnchor:[20,18]
  });

  cptedTargetMark=L.marker([toLatLng.lat,toLatLng.lng],{
    icon,
    zIndexOffset:920,
    interactive:false
  }).addTo(map);
}

async function handleCptedTap(latlng){
  const now=Date.now();
  if(now-lastPopupCloseAt<520||now-lastCptedDirectTapAt<320)return;
  lastCptedDirectTapAt=now;
  clearCptedGuide(true);
  if(zoomBlocked||!chipOn['w_cpted']||!wmsTiles.cpted)return;

  const spinner=document.getElementById('map-spinner');
  if(spinner)spinner.classList.add('show');
  const requestToken=++cptedTapRequestToken;
  const b=map.getBounds().pad(.35);
  const nw=L.CRS.EPSG3857.project(b.getNorthWest());
  const se=L.CRS.EPSG3857.project(b.getSouthEast());
  const params=new URLSearchParams({
    top:nw.y,bottom:se.y,left:nw.x,right:se.x,
    layer:'A2SM_CPTED_G',style:'A2SM_CPTED_G',
    currentPage:'1',perPage:'300'
  });

  try{
    const res=await fetch(CPTED_LIST_API,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:params
    });
    const data=await res.json();
    if(requestToken!==cptedTapRequestToken)return;
    const items=(data.layerList||[]).filter(it=>it.x&&it.y);

    if(!items.length){
      L.popup({className:'safepopup',closeButton:true,maxWidth:260,closeOnClick:true})
        .setLatLng(latlng)
        .setContent('<div class="pbadge" style="background:#b4530918;color:#b45309">🏗 범죄예방환경설계</div>'+
                    '<div class="ptitle">조회 가능한 CPTED 정보 없음</div>'+
                    '<div class="prow">현재 화면 주변에서 CPTED 상세 정보를 찾지 못했습니다.</div>')
        .openOn(map);
      return;
    }

    let closest=null,closestLatLng=null,minDist=Infinity;
    items.forEach(it=>{
      const x=parseFloat(it.x),y=parseFloat(it.y);
      if(isNaN(x)||isNaN(y))return;
      const p=L.CRS.EPSG3857.unproject(L.point(x,y));
      const d=distM(latlng.lat,latlng.lng,p.lat,p.lng);
      if(d<minDist){minDist=d;closest=it;closestLatLng=p;}
    });

    if(!closest||!closestLatLng)return;

    drawCptedGuide(latlng,closestLatLng);
    const addr=closest.adres||closest.roadnm_add||closest.jibun_addr||'';
    const district=closest.jurisd_inst_nm||closest.jp_nm||'';
    const distText=minDist<1000?Math.round(minDist)+'m':(minDist/1000).toFixed(1)+'km';

    L.popup({className:'safepopup',closeButton:true,maxWidth:285,closeOnClick:true})
      .setLatLng(latlng)
      .setContent(
        '<div class="pbadge" style="background:#b4530918;color:#b45309">🏗 범죄예방환경설계</div>'+
        '<div class="ptitle">가장 가까운 CPTED 구역</div>'+
        (addr?'<div class="prow">📍 '+esc(addr)+'</div>':'')+
        (district?'<div class="prow">🏢 '+esc(district)+'</div>':'')+
        '<div class="prow" style="color:#b45309">선택 지점에서 직선거리 약 '+distText+'</div>'+
        '<div class="prow">지도에 점선으로 선택 지점과 CPTED 대표 좌표를 연결했습니다.</div>'
      ).openOn(map);
  }catch(err){
    console.warn('CPTED 정보 조회 실패',err);
  }finally{
    if(requestToken===cptedTapRequestToken&&spinner)spinner.classList.remove('show');
  }
}

/* ── GPS ──
   1차 위치는 저정밀+캐시 허용으로 "빨리" 받고(지도 중심 잡기용),
   정밀 보정은 watchPosition(고정밀)이 이어서 담당한다. */
function getGPS(){
  if(!navigator.geolocation){useDefault();return;}
  if(Number.isFinite(myLat)&&Number.isFinite(myLng)){
    /* 인트로 워밍업으로 이미 좌표가 있으면 기다리지 않는다 */
    onLocated();
  }else{
    navigator.geolocation.getCurrentPosition(
      p=>{myLat=p.coords.latitude;myLng=p.coords.longitude;writeLastPos(myLat,myLng);onLocated();},
      ()=>useDefault(),
      {timeout:7000,enableHighAccuracy:false,maximumAge:120000}
    );
  }
  watchId=navigator.geolocation.watchPosition(
    p=>{myLat=p.coords.latitude;myLng=p.coords.longitude;writeLastPos(myLat,myLng);drawMe();},
    ()=>{},
    {enableHighAccuracy:true,maximumAge:3000}
  );
}
function useDefault(){myLat=36.0190;myLng=129.3435;onLocated();}

function onLocated(){
  if(!map)return;
  map.setView([myLat,myLng],DEFAULT_ZOOM);
  drawMe();
  revGeo();
  addWMS();
  applyZoomGate();
  fetchAll();

  let moveTimer=null;
  map.on('zoomend',()=>applyZoomGate());
  map.on('moveend',()=>{
    if(suppressMoveFetch)return;
    clearTimeout(moveTimer);
    moveTimer=setTimeout(()=>fetchAll(true),MARKER_MOVE_DEBOUNCE_MS);
  });

  /* v2.1 추가 레이어 초기화 — audit.js, havens.js */
  if(typeof initAuditLayer==='function')initAuditLayer();
  if(typeof initHavenLayer==='function')initHavenLayer();

  map.on('click',e=>{
    if(routePickMode){
      clearCptedGuide(true);
      routePickMode=false;
      document.body.classList.remove('map-pick-mode');
      setDestinationAndRoute(e.latlng);
      return;
    }
    if(auditPickMode){handleAuditPick(e.latlng);return;}
    handleCptedTap(e.latlng);
  });

  const mapEl=map.getContainer();
  let pointerStart=null;
  const onPointerDown=e=>{
    if(e.pointerType==='mouse')return;
    pointerStart={x:e.clientX,y:e.clientY,t:Date.now()};
  };
  const onPointerUp=e=>{
    if(e.pointerType==='mouse'||!pointerStart)return;
    const dx=e.clientX-pointerStart.x;
    const dy=e.clientY-pointerStart.y;
    const dt=Date.now()-pointerStart.t;
    pointerStart=null;
    if(Math.sqrt(dx*dx+dy*dy)>12||dt>900)return;
    const rect=mapEl.getBoundingClientRect();
    const pt=L.point(e.clientX-rect.left,e.clientY-rect.top);
    const tappedLatLng=map.containerPointToLatLng(pt);
    if(routePickMode){
      clearCptedGuide(true);
      routePickMode=false;
      document.body.classList.remove('map-pick-mode');
      setDestinationAndRoute(tappedLatLng);
      return;
    }
    if(auditPickMode){handleAuditPick(tappedLatLng);return;}
    handleCptedTap(tappedLatLng);
  };
  mapEl.addEventListener('pointerdown',onPointerDown,{passive:true});
  mapEl.addEventListener('pointerup',onPointerUp,{passive:true});
  mapDomCleanups.push(()=>{
    mapEl.removeEventListener('pointerdown',onPointerDown);
    mapEl.removeEventListener('pointerup',onPointerUp);
  });
}

/* 내 위치 마커 — 이미 있으면 위치만 이동(GPS 갱신마다 재생성 방지) */
function drawMe(){
  if(!map||!myLat||!myLng)return;
  if(myMark){
    myMark.setLatLng([myLat,myLng]);
    return;
  }
  const g=GROUP[grp];
  const icon=L.divIcon({
    html:'<div style="width:42px;height:42px;border-radius:50%;background:'+g.color+';border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:19px;box-shadow:0 3px 12px rgba(0,0,0,.25);">'+g.emoji+'</div>',
    className:'',iconSize:[42,42],iconAnchor:[21,21]
  });
  myMark=L.marker([myLat,myLng],{icon,zIndexOffset:1000}).addTo(map);
  myMark.bindPopup('<div class="ptitle">📍 현재 내 위치</div><div class="prow">현재 지도 화면 범위의 안전시설을 표시합니다</div>');
}
function flyHome(){
  if(myLat&&myLng&&map){
    const z=Math.max(map.getZoom(),MIN_DATA_ZOOM);
    map.flyTo([myLat,myLng],z,{duration:1});
  }
}
function revGeo(){
  fetch('https://nominatim.openstreetmap.org/reverse?lat='+myLat+'&lon='+myLng+'&format=json&accept-language=ko')
    .then(r=>r.json())
    .then(d=>{
      const a=d.address||{};
      document.getElementById('locTxt').textContent=a.city_district||a.suburb||a.neighbourhood||a.county||'위치 확인됨';
    })
    .catch(()=>{document.getElementById('locTxt').textContent='위치 확인됨';});
}

/* ── WMS 타일(범죄주의구간·CPTED 면 데이터) ── */
function addWMS(){
  GROUP[grp].wms.forEach(key=>{
    try{
      const url=WMS_API[key];
      if(!url)return;
      let t;
      if(key==='cpted'){
        t=L.tileLayer.wms(url,{
          layers:'A2SM_CPTED_G',format:'image/png',transparent:true,
          version:'1.3.0',tiled:true,opacity:.5,tileSize:256
        });
      }else{
        const WMSClass=getSafemapWMSClass();
        t=new WMSClass(url,{opacity:.5,tileSize:256});
      }
      wmsTiles[key]=t;
      if(chipOn['w_'+key]&&!zoomBlocked)t.addTo(map);
    }catch(e){console.warn('WMS 오류',key,e);}
  });
}
