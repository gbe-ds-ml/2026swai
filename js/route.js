/* ============================================================
   SafeWalk v2.0 — route.js
   보행 경로 요청(Worker 프록시→OSRM→Valhalla 폴백), 경로 그리기,
   경로 주변 시설 조회(회랑), 안전도 점수 계산, 경로 패널 표시.

   [v2 개선]
   1) 재진입 가드: 경로 계산 중 새 길찾기를 시작하면 이전 계산 결과를
      버린다(routeRunToken). 뒤로가기로 지도가 사라져도 안전.
   2) 정직한 점수: 시설 조회가 전부 실패하면 가짜 점수 대신
      "측정 불가"를 표시하고, 일부 실패 시 경고 문구를 붙인다.
   3) 회랑 버퍼를 미터 단위로 계산해 경도 방향에서도 판정 반경(150m)
      이상을 보장한다(기존에는 동서 방향 ~141m로 누락 발생).
   4) km 단위 응답 감지를 예상 시간 계산보다 먼저 수행.
   5) 안전도 평가 전에 경로 상자 밖 시설을 걸러내고, 경로 점이
      너무 많으면 간격을 띄워 계산량을 줄인다(UI 멈춤 방지).
   ============================================================ */

/* ── 경로 상태 ── */
let destinationMark=null;
let originMark=null;
let apiRouteLayer=null;
let fallbackRouteLine=null;
let snapLines=[];
let routeSnapNote='';
let routeRunToken=0;

/* ── 경로 계산 실행 ── */
async function runSearchRoute(){
  if(!map)return;
  if(!routeOrigin||!routeDest){showRouteToast('출발지와 도착지를 모두 지정해 주세요.');return;}
  closeSearchPanel();
  clearRoute(false);
  /* clearRoute가 token을 올리므로, 그 뒤에 이번 실행의 token을 발급한다 */
  const token=++routeRunToken;
  const origin=routeOrigin,dest=routeDest;
  routeSnapNote='';
  drawEndpointMarkers();
  const spinner=document.getElementById('map-spinner');
  if(spinner)spinner.classList.add('show');
  showRoutePanelLoading();
  suppressMoveFetch=true;
  const locations=[
    {lat:origin.lat,lon:origin.lng,radius:120},
    {lat:dest.lat,lon:dest.lng,radius:120}
  ];
  try{
    const routeData=await requestWalkingRoute(locations);
    if(token!==routeRunToken||!map)return;
    const routeLatLngs=drawApiRoute(routeData);
    applySnapFeedback(routeData,routeLatLngs,origin,dest);
    const corridor=await fetchCorridorFacilities(routeLatLngs);
    if(token!==routeRunToken||!map)return;
    const summary=getRouteSummary(routeData,routeLatLngs);
    const allFailed=corridor.total>0&&corridor.failed>=corridor.total;
    const safety=allFailed?null:evaluateRouteSafety(routeLatLngs,corridor.facilities);
    updateRoutePanel(summary,safety,false,corridor);
    if(allFailed){
      showRouteToast('⚠️ 경로는 표시했지만 안전시설 조회에 실패해 안전도를 계산하지 못했습니다.');
    }else{
      showRouteToast('✅ 경로 계산 완료 · 경로 주변 시설 '+corridor.facilities.length+'건을 반영했습니다.');
    }
  }catch(err){
    if(token!==routeRunToken||!map)return;
    console.warn('경로 API 실패:',err);
    const pts=[[origin.lat,origin.lng],[dest.lat,dest.lng]];
    fallbackRouteLine=L.polyline(pts,{
      color:ROUTE_COLOR,weight:5,opacity:.85,dashArray:'8,8',lineCap:'round',lineJoin:'round'
    }).addTo(map);
    map.fitBounds(fallbackRouteLine.getBounds(),{padding:[50,50]});
    const ll=pts.map(p=>({lat:p[0],lng:p[1]}));
    const corridor=await fetchCorridorFacilities(ll);
    if(token!==routeRunToken||!map)return;
    const dist=pathDistanceMeters(ll);
    const allFailed=corridor.total>0&&corridor.failed>=corridor.total;
    const safety=allFailed?null:evaluateRouteSafety(ll,corridor.facilities);
    updateRoutePanel({distanceM:dist,durationSec:dist/1.1},safety,true,corridor);
    showRouteToast('⚠️ 경로 API 호출에 실패해 직선 안내를 임시로 표시했습니다.');
  }finally{
    if(token===routeRunToken){
      if(spinner)spinner.classList.remove('show');
      setTimeout(()=>{suppressMoveFetch=false;},MARKER_MOVE_DEBOUNCE_MS+200);
    }
  }
}
function drawEndpointMarkers(){
  const mk=(pt,color,emoji,title)=>L.marker([pt.lat,pt.lng],{
    zIndexOffset:900,
    icon:L.divIcon({
      html:'<div style="width:34px;height:34px;border-radius:50%;background:'+color+
        ';border:3px solid #fff;display:flex;align-items:center;justify-content:center;'+
        'font-size:15px;box-shadow:0 3px 10px rgba(0,0,0,.25);">'+emoji+'</div>',
      className:'',iconSize:[34,34],iconAnchor:[17,17]
    })
  }).bindPopup(L.popup({className:'safepopup',closeButton:true,maxWidth:250}).setContent(
    '<div class="pbadge" style="background:'+color+'18;color:'+color+'">'+title+'</div>'+
    '<div class="ptitle">'+esc(pt.label)+'</div>'+
    (pt.addr?'<div class="prow">📍 '+esc(pt.addr)+'</div>':'')
  )).addTo(map);
  originMark=mk(routeOrigin,'#059669','🚩','출발지');
  destinationMark=mk(routeDest,'#ef4444','🎯','도착지');
}
function applySnapFeedback(data,routeLatLngs,origin,dest){
  clearSnapLines();
  if(!routeLatLngs||routeLatLngs.length<2)return;
  const wps=(data&&Array.isArray(data.waypoints))?data.waypoints:null;
  const snapOf=(i,fallbackPt)=>{
    if(wps&&wps[i]&&Array.isArray(wps[i].location)){
      return {lat:wps[i].location[1],lng:wps[i].location[0]};
    }
    return fallbackPt;
  };
  const pairs=[
    {input:origin,snap:snapOf(0,routeLatLngs[0]),color:'#059669'},
    {input:dest,snap:snapOf(1,routeLatLngs[routeLatLngs.length-1]),color:'#ef4444'}
  ];
  const notes=[];
  pairs.forEach(pr=>{
    if(!pr.input||!pr.snap)return;
    const d=distM(pr.input.lat,pr.input.lng,pr.snap.lat,pr.snap.lng);
    if(d<=SNAP_WARN_M)return;
    notes.push(esc(pr.input.label)+' 약 '+Math.round(d)+'m');
    snapLines.push(L.polyline(
      [[pr.input.lat,pr.input.lng],[pr.snap.lat,pr.snap.lng]],
      {color:pr.color,weight:3,opacity:.85,dashArray:'4,7',lineCap:'round'}
    ).addTo(map));
  });
  routeSnapNote=notes.length
    ?'⚠️ 검색 지점과 실제 보행로 진입점이 떨어져 있습니다 — '+notes.join(' · ')+' (OpenStreetMap에 보행로가 없는 구간일 수 있습니다)'
    :'';
}
function clearSnapLines(){
  snapLines.forEach(l=>{if(map&&map.hasLayer(l))map.removeLayer(l);});
  snapLines=[];
}

/* ── 경로 회랑 기반 안전시설 조회 ──
   경로를 최대 6개 구간으로 나누고 각 구간의 사각형 영역에서
   시설을 조회한다. 버퍼는 미터 기준으로 위도·경도를 각각 환산해
   어느 방향으로든 판정 반경 150m 이상을 보장한다. */
function corridorBufferDeg(lat){
  const latDeg=CORRIDOR_BUFFER_M/111320;
  const lngDeg=CORRIDOR_BUFFER_M/(111320*Math.max(.2,Math.cos(lat*Math.PI/180)));
  return {latDeg,lngDeg};
}
function buildCorridorCells(path){
  if(!path||!path.length)return [];
  const total=pathDistanceMeters(path);
  const cellCount=Math.max(1,Math.min(MAX_CORRIDOR_CELLS,Math.ceil(total/CORRIDOR_CELL_TARGET_M)));
  const step=total/cellCount;
  const cells=[];
  let acc=0,startIdx=0;
  for(let i=1;i<path.length;i++){
    acc+=distM(path[i-1].lat,path[i-1].lng,path[i].lat,path[i].lng);
    const last=i===path.length-1;
    if(acc>=step||last){
      const seg=path.slice(startIdx,i+1);
      if(seg.length){
        const lats=seg.map(p=>p.lat),lngs=seg.map(p=>p.lng);
        const midLat=(Math.min(...lats)+Math.max(...lats))/2;
        const buf=corridorBufferDeg(midLat);
        cells.push(L.latLngBounds(
          [Math.min(...lats)-buf.latDeg,Math.min(...lngs)-buf.lngDeg],
          [Math.max(...lats)+buf.latDeg,Math.max(...lngs)+buf.lngDeg]
        ));
      }
      startIdx=i;acc=0;
      if(cells.length>=MAX_CORRIDOR_CELLS)break;
    }
  }
  if(!cells.length){
    const p=path[0];
    const buf=corridorBufferDeg(p.lat);
    cells.push(L.latLngBounds(
      [p.lat-buf.latDeg,p.lng-buf.lngDeg],
      [p.lat+buf.latDeg,p.lng+buf.lngDeg]
    ));
  }
  return cells;
}
async function fetchCorridorLayer(key,bounds){
  try{
    const items=await requestSafemapMarkers(key,bounds);
    const out=[];
    items.forEach(it=>{
      const pt=parseLayerPoint(it);
      if(!pt)return;
      const info=getFacilityInfo(key,it);
      out.push({
        id:key+':'+pt.lat.toFixed(6)+','+pt.lng.toFixed(6),
        key,lat:pt.lat,lng:pt.lng,
        name:info.name||(LAYER[key]?LAYER[key].label:key),
        addr:info.addr||''
      });
    });
    return {ok:true,items:out};
  }catch(e){
    console.warn('[corridor:'+key+'] 실패:',e.message);
    return {ok:false,items:[]};
  }
}
/* 반환값: {facilities, failed, total}
   failed가 total과 같으면 "조회 전멸" — 점수를 내면 안 되는 상태 */
async function fetchCorridorFacilities(routeLatLngs){
  const cells=buildCorridorCells(routeLatLngs);
  const keys=Object.keys(FACILITY_SCORE_CONFIG);
  const seen=new Set(),facilities=[];
  let failed=0,total=0;
  for(let i=0;i<cells.length;i++){
    const results=await Promise.allSettled(keys.map(k=>fetchCorridorLayer(k,cells[i])));
    results.forEach(r=>{
      total++;
      if(r.status!=='fulfilled'||!r.value.ok){failed++;return;}
      r.value.items.forEach(f=>{
        if(!seen.has(f.id)){seen.add(f.id);facilities.push(f);}
      });
    });
  }
  return {facilities,failed,total};
}

/* ── 경로 응답 파싱 ── */
function extractRouteGeometry(data){
  if(!data)return null;
  if(data.routes&&data.routes[0]&&data.routes[0].geometry){
    const g=data.routes[0].geometry;
    if(typeof g==='string'){
      const coords=decodePolyline(g,5);
      return coords.length>1?{type:'LineString',coordinates:coords}:null;
    }
    if(g.coordinates&&g.coordinates.length>1)return g;
  }
  if(data.trip&&Array.isArray(data.trip.legs)){
    const coords=[];
    data.trip.legs.forEach(leg=>{
      if(!leg||!leg.shape)return;
      if(typeof leg.shape==='string')coords.push(...decodePolyline(leg.shape,6));
      else if(Array.isArray(leg.shape.coordinates))coords.push(...leg.shape.coordinates);
    });
    return coords.length>1?{type:'LineString',coordinates:coords}:null;
  }
  return null;
}
function hasRouteGeometry(data){
  const g=extractRouteGeometry(data);
  return Boolean(g&&g.coordinates&&g.coordinates.length>1);
}
async function requestWalkingRoute(locations){
  let lastErr=null;

  if(ROUTE_PROXY_URL){
    try{
      const res=await fetch(ROUTE_PROXY_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          locations,
          costing:'pedestrian',
          format:'osrm',
          shape_format:'geojson',
          directions_options:{units:'kilometers',language:'ko-KR'}
        })
      });
      const text=await res.text();
      const data=JSON.parse(text);
      if(!res.ok)throw new Error((data&&(data.error||data.message))||('HTTP '+res.status));
      if(!hasRouteGeometry(data))throw new Error('프록시 응답에 경로 geometry 없음');
      data._routeProvider='Proxy';
      return data;
    }catch(e){
      lastErr=e;
      console.warn('프록시 경로 실패:',e);
    }
  }

  for(const baseUrl of OSRM_FOOT_ROUTE_URLS){
    try{
      const coords=locations.map(p=>p.lon+','+p.lat).join(';');
      const params=new URLSearchParams({
        overview:'full',geometries:'geojson',steps:'true',alternatives:'false'
      });
      const res=await fetch(baseUrl+'/'+coords+'?'+params.toString());
      const data=await res.json();
      if(!res.ok||data.code!=='Ok')throw new Error(data.message||data.code||('HTTP '+res.status));
      if(!hasRouteGeometry(data))throw new Error('OSRM 응답에 경로 geometry 없음');
      data._routeProvider='OSRM-foot';
      return data;
    }catch(e){
      lastErr=e;
    }
  }

  const body={
    locations,
    costing:'pedestrian',
    directions_options:{units:'kilometers',language:'ko-KR'},
    format:'osrm',
    shape_format:'geojson'
  };

  for(const url of VALHALLA_ROUTE_URLS){
    try{
      const res=await fetch(url,{
        method:'POST',
        headers:{'Content-Type':'application/json','X-Client-Id':'safewalk-pohang-school-project'},
        body:JSON.stringify(body)
      });
      const data=await res.json();
      if(!res.ok)throw new Error(data.message||data.error||('HTTP '+res.status));
      if(!hasRouteGeometry(data))throw new Error('Valhalla 응답에 경로 geometry 없음');
      data._routeProvider='Valhalla';
      return data;
    }catch(e){
      lastErr=e;
    }
  }

  throw lastErr||new Error('실제 도로망 경로 요청 실패');
}
function drawApiRoute(data){
  if(apiRouteLayer&&map)map.removeLayer(apiRouteLayer);
  const geometry=extractRouteGeometry(data);
  if(!geometry)throw new Error('경로 geometry 없음');
  const halo=L.geoJSON(geometry,{style:{color:ROUTE_HALO_COLOR,weight:10,opacity:.9,lineCap:'round',lineJoin:'round'}});
  const redLine=L.geoJSON(geometry,{style:{color:ROUTE_COLOR,weight:6,opacity:.96,lineCap:'round',lineJoin:'round'}});
  apiRouteLayer=L.featureGroup([halo,redLine]).addTo(map);
  map.fitBounds(apiRouteLayer.getBounds(),{padding:[56,56]});
  return geometry.coordinates.map(c=>({lat:c[1],lng:c[0]}));
}
/* km 단위 응답 감지를 시간 계산보다 먼저 수행한다.
   실제 선 길이(geoDistance)의 1% 미만이면 km로 판단해 m로 환산. */
function getRouteSummary(data,latLngs){
  const r=data.routes&&data.routes[0]?data.routes[0]:null;
  const geoDistance=pathDistanceMeters(latLngs);
  let distanceM=r&&Number.isFinite(r.distance)?r.distance:geoDistance;
  if(distanceM>0&&geoDistance>0&&distanceM<geoDistance/100)distanceM*=1000;
  let durationSec=r&&Number.isFinite(r.duration)?r.duration:distanceM/1.1;
  if(!Number.isFinite(durationSec)||durationSec<=0)durationSec=distanceM/1.1;
  return {distanceM,durationSec,provider:data._routeProvider||'routing'};
}

/* ── 안전도 점수 ── */
function facilityProximityRate(distanceM){
  if(distanceM<=30)return 1;
  if(distanceM<=60)return .75;
  if(distanceM<=100)return .4;
  if(distanceM<=ROUTE_FACILITY_RADIUS_M)return .15;
  return 0;
}
function shortRouteBonus(distanceM){
  if(distanceM<=300)return 15;
  if(distanceM>=1200)return 0;
  return Math.round(15*(1200-distanceM)/900);
}
/* 안전도 평가용으로 경로 점을 최대 800개까지만 사용한다.
   (수천 점짜리 경로에서도 UI가 멈추지 않도록. 간격은 수 m 수준이라
   점수 정확도에 미치는 영향은 무시할 수 있다) */
function getScoringPath(routeLatLngs){
  const MAX_POINTS=800;
  if(!routeLatLngs||routeLatLngs.length<=MAX_POINTS)return routeLatLngs;
  const stride=Math.ceil(routeLatLngs.length/MAX_POINTS);
  const out=[];
  for(let i=0;i<routeLatLngs.length;i+=stride)out.push(routeLatLngs[i]);
  if(out[out.length-1]!==routeLatLngs[routeLatLngs.length-1])out.push(routeLatLngs[routeLatLngs.length-1]);
  return out;
}
function evaluateRouteSafety(routeLatLngs,facilityList){
  const src=Array.isArray(facilityList)?facilityList:safeFacilityPoints;
  const path=getScoringPath(routeLatLngs);

  /* 경로 전체 사각형(+판정 반경 여유) 밖의 시설은
     비싼 선분 거리 계산 없이 먼저 걸러낸다. */
  let minLat=Infinity,maxLat=-Infinity,minLng=Infinity,maxLng=-Infinity;
  for(const p of path){
    if(p.lat<minLat)minLat=p.lat;
    if(p.lat>maxLat)maxLat=p.lat;
    if(p.lng<minLng)minLng=p.lng;
    if(p.lng>maxLng)maxLng=p.lng;
  }
  const latPad=(ROUTE_FACILITY_RADIUS_M+20)/111320;
  const midLat=(minLat+maxLat)/2;
  const lngPad=latPad/Math.max(.2,Math.cos(midLat*Math.PI/180));
  const candidates=src.filter(p=>
    p.lat>=minLat-latPad&&p.lat<=maxLat+latPad&&
    p.lng>=minLng-lngPad&&p.lng<=maxLng+lngPad
  );

  const countsByKey={police:0,cctv:0,bell:0,child_house:0};
  const rawByKey={police:0,cctv:0,bell:0,child_house:0};
  const seen=new Set();

  for(const p of candidates){
    const cfg=FACILITY_SCORE_CONFIG[p.key];
    if(!cfg||seen.has(p.id))continue;
    const distance=minDistanceToPathMeters(p,path);
    const rate=facilityProximityRate(distance);
    if(rate<=0)continue;
    seen.add(p.id);
    countsByKey[p.key]++;
    rawByKey[p.key]+=rate*cfg.unit;
  }

  const scoreByKey={};
  let facilityScore=0;
  FACILITY_SCORE_ORDER.forEach(key=>{
    const cfg=FACILITY_SCORE_CONFIG[key];
    scoreByKey[key]=Math.min(cfg.cap,rawByKey[key]||0);
    facilityScore+=scoreByKey[key];
  });

  facilityScore=Math.round(facilityScore);
  const routeDistance=pathDistanceMeters(routeLatLngs);
  const shortBonus=shortRouteBonus(routeDistance);
  const score=Math.max(0,Math.min(100,Math.round(SCORE_BASE+facilityScore+shortBonus)));

  return {countsByKey,scoreByKey,facilityScore,shortBonus,score,total:seen.size,radiusM:ROUTE_FACILITY_RADIUS_M};
}

/* ── 경로 패널 ── */
function updateRoutePanel(summary,safety,isFallback,corridor){
  const panel=document.getElementById('routePanel');
  if(!panel)return;
  panel.classList.add('show');
  document.body.classList.add('route-visible');
  resetRouteDetails();
  syncRoutePanelWithSheet();

  const partialFail=Boolean(corridor&&corridor.failed>0&&corridor.failed<corridor.total);

  document.getElementById('routeTitle').textContent=isFallback?'⚠️ 임시 직선 안내':'🚶 최단 보행 경로 · 안전도 평가';
  document.getElementById('routeSub').textContent=isFallback
    ?'도로망 경로 호출 실패로 목적지까지 직선 안내를 표시했습니다.'
    :'안전시설을 강제 경유하지 않고 최단거리 우선 경로를 안내합니다.';
  document.getElementById('routeDistance').textContent=formatDistance(summary.distanceM);
  document.getElementById('routeDuration').textContent=formatDuration(summary.durationSec);

  /* v2.1: 안심 타이머 제안 — timer.js */
  if(typeof offerSafeTimer==='function')offerSafeTimer(summary,routeDest?routeDest.label:'');

  const scoreEl=document.getElementById('routeScore');
  scoreEl.classList.toggle('na',!safety);
  scoreEl.textContent=safety?safety.score+'점':'측정 불가';

  const mobileSummary=document.getElementById('routeMobileSummary');

  if(!safety){
    /* 시설 조회 전멸: 가짜 점수를 보여주지 않는다 */
    document.getElementById('routeSafeList').innerHTML='';
    if(mobileSummary)mobileSummary.textContent='안전시설 조회 실패 · 안전도 측정 불가';
    document.getElementById('routeReason').innerHTML=
      '⚠️ 생활안전지도 시설 조회에 모두 실패해 안전도를 계산할 수 없습니다.'+
      '<br>네트워크 상태를 확인한 뒤 길찾기를 다시 실행해 주세요.'+
      '<br><span style="color:#94a3b8">점수가 없는 것은 "주변에 시설이 없다"는 뜻이 아니라 "확인하지 못했다"는 뜻입니다.</span>';
    return;
  }

  const chips=[];
  FACILITY_SCORE_ORDER.forEach(key=>{
    const count=safety.countsByKey[key]||0;
    const itemScore=Math.round(safety.scoreByKey[key]||0);
    const cap=FACILITY_SCORE_CONFIG[key].cap;
    chips.push('<span class="route-pill">'+FACILITY_ROUTE_LABEL[key]+' · '+count+'개 · '+itemScore+'/'+cap+'점</span>');
  });
  chips.push('<span class="route-pill">📏 짧은 길 보정 +'+safety.shortBonus+'점</span>');
  document.getElementById('routeSafeList').innerHTML=chips.join('');

  if(mobileSummary){
    mobileSummary.textContent=isFallback
      ?'경로 API 실패 · 임시 직선 안내'
      :'시설 '+safety.total+'개 · 시설 +'+safety.facilityScore+'/'+FACILITY_TOTAL_CAP+'점 · 짧은 길 +'+safety.shortBonus+'점';
  }

  document.getElementById('routeReason').innerHTML=
    '기본 '+SCORE_BASE+'점 + 안전시설 접근성 '+safety.facilityScore+'점(최대 '+FACILITY_TOTAL_CAP+'점)'+
    ' + 짧은 길 보정 '+safety.shortBonus+'점(최대 15점)'+
    '<br>우선순위별 상한: 치안시설 17점(1순위) · CCTV 11점 / 안전비상벨 11점(2순위) · 어린이안전지킴이집 6점(3순위)'+
    '<br>시설은 경로에서 30m·60m·100m·150m 이내에 따라 100%·75%·40%·15%로 차등 반영합니다.'+
    '<br>점수는 레이어 표시 여부와 무관하게 조회된 시설 전체를 기준으로 계산합니다.'+
    (partialFail?'<br><span class="snap-note">⚠️ 일부 시설 조회에 실패해 실제보다 낮게 계산되었을 수 있습니다.</span>':'')+
    (routeSnapNote?'<br><span class="snap-note">'+routeSnapNote+'</span>':'')+
    '<br><span style="color:#94a3b8">공공데이터 기반 참고 점수이며 실제 안전을 보장하지 않습니다.</span>';
}
function showRoutePanelLoading(){
  const panel=document.getElementById('routePanel');
  if(!panel)return;
  panel.classList.add('show');
  document.body.classList.add('route-visible');
  resetRouteDetails();
  syncRoutePanelWithSheet();
  document.getElementById('routeTitle').textContent='🧭 경로 계산 중';
  document.getElementById('routeSub').textContent='최단 보행 경로를 한 번 호출한 뒤 경로 주변 안전시설을 분석합니다.';
  document.getElementById('routeDistance').textContent='계산 중';
  document.getElementById('routeDuration').textContent='계산 중';
  const scoreEl=document.getElementById('routeScore');
  scoreEl.classList.remove('na');
  scoreEl.textContent='-';
  document.getElementById('routeSafeList').innerHTML='';
  document.getElementById('routeReason').textContent='안전시설을 강제 경유하지 않으며, 완성된 최단 경로 주변 시설만 점수화합니다.';
  const mobileSummary=document.getElementById('routeMobileSummary');
  if(mobileSummary)mobileSummary.textContent='최단 경로와 안전시설을 분석하고 있습니다.';
  if(typeof clearSafeTimerOffer==='function')clearSafeTimerOffer();
}
function clearRoute(hidePanel=true){
  routeRunToken++; /* 진행 중이던 경로 계산 결과를 무효화 */
  routePickMode=false;
  document.body.classList.remove('map-pick-mode');
  if(destinationMark&&map)map.removeLayer(destinationMark);
  if(originMark&&map)map.removeLayer(originMark);
  if(apiRouteLayer&&map)map.removeLayer(apiRouteLayer);
  if(fallbackRouteLine&&map)map.removeLayer(fallbackRouteLine);
  clearSnapLines();
  destinationMark=null;originMark=null;apiRouteLayer=null;fallbackRouteLine=null;
  resetRouteDetails();
  if(typeof clearSafeTimerOffer==='function')clearSafeTimerOffer();
  const mobileSummary=document.getElementById('routeMobileSummary');
  if(mobileSummary)mobileSummary.textContent='목적지를 선택하면 요약 정보가 표시됩니다.';
  if(hidePanel){
    const panel=document.getElementById('routePanel');
    if(panel)panel.classList.remove('show');
    document.body.classList.remove('route-visible');
  }
  syncRoutePanelWithSheet();
}
