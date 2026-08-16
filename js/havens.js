/* ============================================================
   SafeWalk v2.1 — havens.js
   안심 편의점 레이어 — WalkSafe의 "안전 공간(Safe Haven)" 벤치마킹.

   위급할 때 들어가 도움을 요청할 수 있는 "불이 켜진 대피처"로
   편의점을 지도에 표시한다. 데이터는 OpenStreetMap의 Overpass
   API(무료·키 불필요)에서 화면 범위만 조회한다.
   24시간 운영(opening_hours=24/7) 표시가 있는 곳은 초록 배지.

   주의: OSM은 시민 참여 지도라서 실제와 다를 수 있다.
   ============================================================ */

let havenLayer=null;
let havenChipOn=false;      /* 기본 꺼짐 — 외부 API 요청 절약 */
let havenItems=new Map();   /* OSM node id → marker */
let havenMoveTimer=null;
let havenFetchToken=0;

function buildOverpassQuery(b){
  const bbox=[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()]
    .map(v=>v.toFixed(5)).join(',');
  return '[out:json][timeout:10];node["shop"="convenience"]('+bbox+');out '+HAVEN_MAX_ITEMS+';';
}
async function requestHavens(bounds){
  const query=buildOverpassQuery(bounds);
  let lastErr=null;
  for(const url of OVERPASS_URLS){
    try{
      const ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(),12000);
      const res=await fetch(url,{
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body:'data='+encodeURIComponent(query),
        signal:ctrl.signal
      });
      clearTimeout(timer);
      if(!res.ok)throw new Error('HTTP '+res.status);
      const data=await res.json();
      return Array.isArray(data.elements)?data.elements:[];
    }catch(e){lastErr=e;}
  }
  throw lastErr||new Error('Overpass 요청 실패');
}
function mkHavenMarker(el){
  const tags=el.tags||{};
  const name=tags.name||tags.brand||'편의점';
  const is24=String(tags.opening_hours||'').replace(/\s/g,'')==='24/7';
  const color=is24?'#059669':'#0891b2';
  const icon=L.divIcon({
    html:'<div style="width:32px;height:32px;border-radius:10px;background:#fff;border:2.5px solid '+color+
      ';display:flex;align-items:center;justify-content:center;font-size:15px;box-shadow:0 2px 8px rgba(0,0,0,.2);">🏪</div>',
    className:'',iconSize:[32,32],iconAnchor:[16,16]
  });
  return L.marker([el.lat,el.lon],{icon}).bindPopup(
    L.popup({className:'safepopup',closeButton:true,maxWidth:230}).setContent(
      '<div class="pbadge" style="background:'+color+'18;color:'+color+'">🏪 안심 편의점</div>'+
      '<div class="ptitle">'+esc(name)+'</div>'+
      (is24
        ?'<div class="prow"><b style="color:#059669">🕐 24시간 운영</b></div>'
        :(tags.opening_hours?'<div class="prow">🕐 '+esc(tags.opening_hours)+'</div>':''))+
      '<div class="prow">불이 켜진 안심 대피처 — 위급할 때 들어가 도움을 요청하세요.</div>'+
      '<div class="prow" style="color:#94a3b8">출처: OpenStreetMap (실제와 다를 수 있음)</div>'
    )
  );
}
async function refreshHavens(){
  if(!map||!havenLayer||!havenChipOn)return;
  if(map.getZoom()<HAVEN_MIN_ZOOM){
    havenLayer.clearLayers();
    havenItems.clear();
    return;
  }
  const token=++havenFetchToken;
  const bounds=map.getBounds().pad(.2);
  try{
    const elements=await requestHavens(bounds);
    if(token!==havenFetchToken||!map||!havenLayer)return;
    elements.forEach(el=>{
      if(!Number.isFinite(el.lat)||!Number.isFinite(el.lon))return;
      if(havenItems.has(el.id))return;
      const marker=mkHavenMarker(el);
      havenItems.set(el.id,marker);
      havenLayer.addLayer(marker);
    });
  }catch(e){
    console.warn('안심 편의점 조회 실패:',e.message);
    if(token===havenFetchToken)showRouteToast('편의점 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
function setHavenLayerVisible(on){
  havenChipOn=Boolean(on);
  if(!map||!havenLayer)return;
  if(havenChipOn){
    if(map.getZoom()<HAVEN_MIN_ZOOM){
      showRouteToast('안심 편의점은 zoom '+HAVEN_MIN_ZOOM+' 이상에서 표시됩니다.');
    }
    if(!map.hasLayer(havenLayer))havenLayer.addTo(map);
    refreshHavens();
  }else{
    if(map.hasLayer(havenLayer))map.removeLayer(havenLayer);
  }
}
/* map.js의 onLocated()가 호출하는 초기화 훅 */
function initHavenLayer(){
  if(!map)return;
  havenLayer=L.layerGroup();
  havenItems=new Map();
  if(havenChipOn)havenLayer.addTo(map);
  map.on('moveend zoomend',()=>{
    if(!havenChipOn)return;
    clearTimeout(havenMoveTimer);
    havenMoveTimer=setTimeout(refreshHavens,900);
  });
}
function resetHavenFeature(){
  havenLayer=null;
  havenItems=new Map();
  havenChipOn=false;
}

/* ── 바텀시트에 칩 추가(layers.js buildChips 끝에서 호출) ── */
function appendExtraChips(container){
  /* 안심 편의점 칩 */
  const row=document.createElement('div');
  row.className='chip-row';
  row.dataset.kind='haven';
  row.dataset.key='haven';
  row.setAttribute('role','switch');
  row.setAttribute('aria-checked','false');
  row.setAttribute('aria-label','안심 편의점');
  row.setAttribute('tabindex','0');
  row.innerHTML=
    '<div class="chip-left"><span class="chip-dot" style="background:#0891b2"></span>'+
    '<div><div class="chip-label">🏪 안심 편의점 (OSM)</div></div></div>'+
    '<span class="sw-vis"><span class="toggle-thumb"><span class="mini-spin"></span></span></span>';
  container.appendChild(row);

  /* 시민 안전 평가 칩 + 평가 남기기 버튼 */
  const arow=document.createElement('div');
  arow.className='chip-row'+(auditChipOn?' on':'');
  arow.dataset.kind='audit';
  arow.dataset.key='audit';
  arow.setAttribute('role','switch');
  arow.setAttribute('aria-checked',auditChipOn?'true':'false');
  arow.setAttribute('aria-label','시민 안전 평가');
  arow.setAttribute('tabindex','0');
  arow.innerHTML=
    '<div class="chip-left"><span class="chip-dot" style="background:#d97706"></span>'+
    '<div><div class="chip-label">⭐ 시민 안전 평가</div></div></div>'+
    '<span class="sw-vis"><span class="toggle-thumb"><span class="mini-spin"></span></span></span>';
  container.appendChild(arow);

  const addBtn=document.createElement('button');
  addBtn.type='button';
  addBtn.id='auditAddBtn';
  addBtn.className='audit-add-btn';
  addBtn.textContent='⭐ 이 동네 안전 평가 남기기';
  addBtn.addEventListener('click',startAuditPick);
  container.appendChild(addBtn);
}
