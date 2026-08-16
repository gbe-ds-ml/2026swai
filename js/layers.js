/* ============================================================
   SafeWalk v2.0 — layers.js
   안전시설 마커 레이어: 조회(fetch)·캐시·표시·줌 게이트·통계바.
   "마커가 안 보인다 / 레이어 토글이 이상하다"는 이 파일을 보세요.

   [v2 개선]
   - requestSafemapMarkers(): 시설 조회 요청을 공통 함수로 통합
     (기존에는 fetchLayer와 fetchCorridorLayer에 중복으로 있었음)
   - mkMarker() 팝업의 API 문자열에 esc() 적용(XSS 방지)
   - setXml/WmsLayerVisible()에 map 존재 확인 추가(뒤로가기 경합 방지)
   ============================================================ */

/* ── 레이어 상태 ── */
let layers={},wmsTiles={},chipOn={},counts={};
let chipToggleEventsBound=false;
let fetchRunToken=0;
let zoomBlocked=false;
let layerMinZoom={};

let markerCache={};
let markerFetchBounds={};
let markerFetchZoom={};
let markerFetchTruncated={};

let safeFacilityPoints=[];
let safeFacilitySeen=new Set();

/* CCTV 아이콘(Leaflet 로드 후 지연 생성) */
let _cctvMarkerIcon=null;
function getCctvMarkerIcon(){
  if(!_cctvMarkerIcon){
    _cctvMarkerIcon=L.icon({
      iconUrl:CCTV_ICON_URL,
      iconRetinaUrl:CCTV_ICON_URL,
      iconSize:[27,38],
      iconAnchor:[14,38],
      popupAnchor:[0,-36]
    });
  }
  return _cctvMarkerIcon;
}

/* ── 공통: 생활안전지도 시설 조회 ──
   bounds(위경도 영역) 안의 시설 목록을 가져온다.
   실패하면 예외를 던지므로 호출하는 쪽에서 try/catch 할 것. */
async function requestSafemapMarkers(key,bounds){
  const cfg=LAYER_API[key];
  if(!cfg)throw new Error('알 수 없는 레이어: '+key);
  const area4326=[bounds.getNorth(),bounds.getSouth(),bounds.getWest(),bounds.getEast()].join(',');
  const nw=L.CRS.EPSG3857.project(bounds.getNorthWest());
  const se=L.CRS.EPSG3857.project(bounds.getSouthEast());
  const area3857=[nw.y,se.y,nw.x,se.x].join(',');
  const params=new URLSearchParams({
    layerName:cfg.layer,style:cfg.style,area4326,area3857,
    currentPage:'1',perPage:String(MARKER_PAGE_SIZE)
  });
  const ctrl=new AbortController();
  const abortTimer=setTimeout(()=>ctrl.abort(),10000);
  try{
    const res=await fetch(MARKER_API,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:params,
      signal:ctrl.signal
    });
    const data=await res.json();
    return data.resultList||[];
  }finally{
    clearTimeout(abortTimer);
  }
}

/* ── 줌 게이트 ── */
function getLayerBaseMinZoom(key){
  const v=LAYER_BASE_MIN_ZOOM[key];
  return Number.isFinite(v)?v:MIN_DATA_ZOOM;
}
function getLayerMinZoom(key){
  const base=getLayerBaseMinZoom(key);
  const v=layerMinZoom[key];
  return Math.max(base,Number.isFinite(v)?v:base);
}
function getLayerZoomReason(key){
  return getLayerMinZoom(key)>getLayerBaseMinZoom(key)?'density':'base';
}
function updateLayerMinZoom(key,truncated,zoom){
  const base=getLayerBaseMinZoom(key);
  const before=getLayerMinZoom(key);
  let next=before;
  if(truncated)next=Math.min(MAX_ADAPTIVE_ZOOM,Math.max(before,zoom+1));
  else next=Math.max(base,Math.min(before,zoom));
  layerMinZoom[key]=next;
}
function isLayerDensitySuppressed(key){
  if(!map||!LAYER_API[key])return false;
  return map.getZoom()<getLayerMinZoom(key);
}
function getDensitySuppressedKeys(){
  if(!map||!grp||zoomBlocked)return [];
  return GROUP[grp].xml.filter(k=>chipOn[k]&&isLayerDensitySuppressed(k));
}
function applyDensitySuppression(){
  if(!map||!grp)return;
  GROUP[grp].xml.forEach(key=>{
    if(isLayerDensitySuppressed(key)&&layers[key]&&map.hasLayer(layers[key])){
      map.removeLayer(layers[key]);
      counts[key]=0;
    }else if(!isLayerDensitySuppressed(key)&&chipOn[key]&&!zoomBlocked&&layers[key]&&!map.hasLayer(layers[key])){
      layers[key].addTo(map);
    }
  });
  updateChipDensityHints();
}
function updateChipDensityHints(){
  if(!grp)return;
  GROUP[grp].xml.forEach(key=>{
    const el=document.querySelector('.chip-hint[data-key="'+key+'"]');
    if(!el)return;
    const need=getLayerMinZoom(key);
    if(!zoomBlocked&&isLayerDensitySuppressed(key)){
      el.textContent=(getLayerZoomReason(key)==='density'?'이 지역 시설 밀집 · ':'')+'zoom '+need+'↑ 확대 필요';
      el.style.display='block';
    }else{
      el.textContent='';
      el.style.display='none';
    }
  });
}
function updateZoomNotice(blocked){
  const el=document.getElementById('zoomNotice');
  const screen=document.getElementById('map-screen');
  if(!el)return;
  const onMap=Boolean(screen&&screen.classList.contains('show'));
  if(!onMap){el.classList.remove('show');return;}
  if(blocked){
    el.textContent='🔍 지도를 조금 더 확대하면 안전시설이 표시됩니다 (현재 축소 상태)';
    el.classList.add('show');
    return;
  }
  const sup=getDensitySuppressedKeys();
  if(sup.length){
    const parts=sup.map(k=>{
      const label=LAYER[k]?LAYER[k].label:k;
      const need=getLayerMinZoom(k);
      const why=getLayerZoomReason(k)==='density'?' (이 지역 시설 밀집)':'';
      return label+' zoom '+need+'↑'+why;
    });
    el.textContent='🔍 확대 필요 — '+parts.join(' · ');
    el.classList.add('show');
    return;
  }
  el.classList.remove('show');
}
function hideAllOverlays(){
  if(!map)return;
  Object.keys(layers).forEach(k=>{if(layers[k]&&map.hasLayer(layers[k]))map.removeLayer(layers[k]);});
  Object.keys(wmsTiles).forEach(k=>{if(wmsTiles[k]&&map.hasLayer(wmsTiles[k]))map.removeLayer(wmsTiles[k]);});
  cptedTapRequestToken++;
  clearCptedGuide(true);
  Object.keys(counts).forEach(k=>{counts[k]=0;});
  safeFacilityPoints=[];
  safeFacilitySeen=new Set();
  updateStats();
}
function restoreOverlays(){
  if(!map)return;
  Object.keys(layers).forEach(k=>{if(chipOn[k]&&layers[k]&&!map.hasLayer(layers[k]))layers[k].addTo(map);});
  Object.keys(wmsTiles).forEach(k=>{if(chipOn['w_'+k]&&wmsTiles[k]&&!map.hasLayer(wmsTiles[k]))wmsTiles[k].addTo(map);});
}
function applyZoomGate(){
  if(!map||!grp){updateZoomNotice(false);return false;}
  const blocked=map.getZoom()<MIN_DATA_ZOOM;
  if(blocked!==zoomBlocked){
    zoomBlocked=blocked;
    if(blocked)hideAllOverlays();
    else restoreOverlays();
  }
  if(!blocked)applyDensitySuppression();
  else updateChipDensityHints();
  updateZoomNotice(blocked);
  return blocked;
}

/* ── 레이어 토글 UI(칩) ── */
function buildChips(){
  const g=GROUP[grp];
  const c=document.getElementById('chips');
  c.innerHTML='';
  g.xml.forEach(key=>{
    const m=LAYER[key];
    chipOn[key]=true;
    const row=document.createElement('div');
    row.className='chip-row on';
    row.dataset.kind='xml';
    row.dataset.key=key;
    row.setAttribute('role','switch');
    row.setAttribute('aria-checked','true');
    row.setAttribute('aria-label',m.label);
    row.setAttribute('tabindex','0');
    row.innerHTML=
      '<div class="chip-left">'+
        '<span class="chip-dot" style="background:'+m.color+'"></span>'+
        '<div><div class="chip-label">'+m.emoji+' '+m.label+'</div>'+
        '<div class="chip-hint" data-key="'+key+'"></div></div>'+
      '</div>'+
      '<span class="sw-vis"><span class="toggle-thumb"><span class="mini-spin"></span></span></span>';
    c.appendChild(row);
  });
  g.wms.forEach(key=>{
    const m=WMS_LAYER[key];
    const defaultOn=key==='cpted'?grp==='cpted':true;
    chipOn['w_'+key]=defaultOn;
    const row=document.createElement('div');
    row.className='chip-row'+(defaultOn?' on':'');
    row.dataset.kind='wms';
    row.dataset.key=key;
    row.setAttribute('role','switch');
    row.setAttribute('aria-checked',defaultOn?'true':'false');
    row.setAttribute('aria-label',m.label);
    row.setAttribute('tabindex','0');
    row.innerHTML=
      '<div class="chip-left"><span class="chip-dot" style="background:'+m.color+'"></span>'+
      '<div><div class="chip-label">🗺 '+m.label+'</div></div></div>'+
      '<span class="sw-vis"><span class="toggle-thumb"><span class="mini-spin"></span></span></span>';
    c.appendChild(row);
  });
  /* v2.1 추가 레이어(안심 편의점·시민 안전 평가) 칩 — havens.js */
  if(typeof appendExtraChips==='function')appendExtraChips(c);
  const t=document.getElementById('gTag');
  t.textContent=g.emoji+' '+g.label;
  t.className='group-tag '+grp;
  bindChipToggleEvents();
}
function bindChipToggleEvents(){
  const c=document.getElementById('chips');
  if(!c||chipToggleEventsBound)return;
  chipToggleEventsBound=true;
  let touchStart=null;
  let suppressClickUntil=0;
  function flipRow(row){
    if(!row)return;
    const kind=row.dataset.kind;
    const key=row.dataset.key;
    const on=!row.classList.contains('on');
    row.classList.toggle('on',on);
    row.setAttribute('aria-checked',on?'true':'false');
    requestAnimationFrame(()=>{
      if(kind==='xml')setXmlLayerVisible(key,on);
      else if(kind==='wms')setWmsLayerVisible(key,on);
      else if(kind==='haven')setHavenLayerVisible(on);
      else if(kind==='audit')setAuditLayerVisible(on);
    });
  }
  c.addEventListener('pointerdown',e=>{
    const row=e.target.closest('.chip-row');
    if(!row||!c.contains(row)||e.pointerType==='mouse')return;
    touchStart={row,x:e.clientX,y:e.clientY,t:Date.now()};
  },{passive:true});
  c.addEventListener('pointerup',e=>{
    if(e.pointerType==='mouse'||!touchStart)return;
    const {row,x,y,t}=touchStart;
    touchStart=null;
    if(!row.isConnected)return;
    const moved=Math.hypot(e.clientX-x,e.clientY-y);
    const elapsed=Date.now()-t;
    if(moved>14||elapsed>900)return;
    suppressClickUntil=Date.now()+450;
    flipRow(row);
  },{passive:true});
  c.addEventListener('pointercancel',()=>{touchStart=null;},{passive:true});
  c.addEventListener('click',e=>{
    if(Date.now()<suppressClickUntil){e.preventDefault();return;}
    const row=e.target.closest('.chip-row');
    if(row&&c.contains(row))flipRow(row);
  });
  c.addEventListener('keydown',e=>{
    if(e.key!==' '&&e.key!=='Enter')return;
    const row=e.target.closest('.chip-row');
    if(!row||!c.contains(row))return;
    e.preventDefault();
    flipRow(row);
  });
}
function setRowLoading(key,loading){
  const row=document.querySelector('.chip-row[data-kind="xml"][data-key="'+key+'"]');
  if(row)row.classList.toggle('loading',loading);
}
function setXmlLayerVisible(key,on){
  if(!map)return;
  chipOn[key]=on;
  ensureMarkerLayer(key);
  if(zoomBlocked){
    if(layers[key]&&map&&map.hasLayer(layers[key]))map.removeLayer(layers[key]);
    updateStats();
    if(on)showRouteToast('지도를 확대하면 선택한 레이어가 표시됩니다.');
    return;
  }
  if(on&&isLayerDensitySuppressed(key)){
    if(layers[key]&&map&&map.hasLayer(layers[key]))map.removeLayer(layers[key]);
    counts[key]=0;
    updateChipDensityHints();
    updateZoomNotice(false);
    updateStats();
    showRouteToast((LAYER[key]?LAYER[key].label:key)+'은(는) '+(getLayerZoomReason(key)==='density'?'이 지역 시설 밀집으로 ':'')+'zoom '+getLayerMinZoom(key)+' 이상에서 표시됩니다.');
    return;
  }
  if(on){
    if(map&&layers[key]&&!map.hasLayer(layers[key]))layers[key].addTo(map);
    if(!isMarkerLayerCacheFresh(key,map.getBounds())){
      setRowLoading(key,true);
      fetchLayer(key,null,true).then(()=>{
        if(!chipOn[key]){
          if(layers[key]&&map&&map.hasLayer(layers[key]))map.removeLayer(layers[key]);
          return;
        }
        refreshCachedFacilityState();
        updateStats();
      }).finally(()=>setRowLoading(key,false));
    }
  }else{
    setRowLoading(key,false);
    if(layers[key]&&map&&map.hasLayer(layers[key]))map.removeLayer(layers[key]);
  }
  refreshCachedFacilityState();
  updateChipDensityHints();
  updateZoomNotice(zoomBlocked);
  updateStats();
}
function setWmsLayerVisible(key,on){
  if(!map)return;
  chipOn['w_'+key]=on;
  const layer=wmsTiles[key];
  if(!layer)return;
  if(zoomBlocked){
    if(map.hasLayer(layer))map.removeLayer(layer);
    if(on)showRouteToast('지도를 확대하면 선택한 레이어가 표시됩니다.');
    return;
  }
  if(on){
    layer.setOpacity(.5);
    if(!map.hasLayer(layer))layer.addTo(map);
  }else{
    if(map.hasLayer(layer))map.removeLayer(layer);
    if(key==='cpted'){cptedTapRequestToken++;clearCptedGuide(true);}
  }
}

/* ── 마커 캐시 ── */
function ensureMarkerLayer(key){
  if(!markerCache[key]){
    const group=L.layerGroup();
    markerCache[key]={group,items:new Map()};
    layers[key]=group;
  }
  if(!layers[key])layers[key]=markerCache[key].group;
  if(map&&chipOn[key]&&!zoomBlocked&&!isLayerDensitySuppressed(key)&&!map.hasLayer(layers[key]))layers[key].addTo(map);
  return markerCache[key];
}
function isMarkerLayerCacheFresh(key,currentBounds){
  if(!map||!markerCache[key])return false;
  const b=markerFetchBounds[key];
  if(!b)return false;
  if(markerFetchTruncated[key]&&markerFetchZoom[key]!==map.getZoom())return false;
  if(markerFetchZoom[key]>map.getZoom())return false;
  return b.contains(currentBounds);
}
function parseLayerPoint(it){
  let lat=parseFloat(it.lat||0);
  let lng=parseFloat(it.lon||0);
  if(!lat||!lng){
    const px=parseFloat(it.x||0);
    const py=parseFloat(it.y||0);
    if(px&&py){
      const pt=L.CRS.EPSG3857.unproject(L.point(px,py));
      lat=pt.lat;lng=pt.lng;
    }
  }
  if(!lat||!lng||isNaN(lat)||isNaN(lng))return null;
  return {lat,lng};
}
function getMarkerStableId(key,lat,lng,it){
  const info=getFacilityInfo(key,it);
  const name=(info.name||'').replace(/\s+/g,' ').trim();
  const addr=(info.addr||'').replace(/\s+/g,' ').trim();
  return [key,lat.toFixed(6),lng.toFixed(6),name,addr].join('|');
}
function countVisibleMarkers(key){
  if(!map||!markerCache[key])return 0;
  const b=map.getBounds();
  let cnt=0;
  markerCache[key].items.forEach(rec=>{if(b.contains([rec.lat,rec.lng]))cnt++;});
  return cnt;
}
function refreshCachedFacilityState(){
  if(!map||!grp)return;
  const nearBounds=map.getBounds().pad(.45);
  safeFacilityPoints=[];
  safeFacilitySeen=new Set();
  GROUP[grp].xml.forEach(key=>{
    const cache=markerCache[key];
    counts[key]=(cache&&chipOn[key]&&!zoomBlocked&&!isLayerDensitySuppressed(key))?countVisibleMarkers(key):0;
    if(!cache)return;
    cache.items.forEach(rec=>{
      if(nearBounds.contains([rec.lat,rec.lng]))registerSafeFacility(rec.key,rec.lat,rec.lng,rec.raw);
    });
  });
}
function pruneMarkerCache(key,keepIds,requestBounds){
  const cache=markerCache[key];
  if(!cache)return;
  const pruneBounds=requestBounds.pad(MARKER_PRUNE_PADDING);
  cache.items.forEach((rec,id)=>{
    if(keepIds.has(id))return;
    if(!pruneBounds.contains([rec.lat,rec.lng])){
      cache.group.removeLayer(rec.marker);
      cache.items.delete(id);
    }
  });
}
function addMarkersProgressively(group,markers,chunk=40){
  let i=0;
  function step(){
    if(!group)return;
    const end=Math.min(i+chunk,markers.length);
    for(;i<end;i++)group.addLayer(markers[i]);
    if(i<markers.length)requestAnimationFrame(step);
  }
  step();
}

/* ── 시설 조회 실행 ── */
async function fetchAll(silent=false,force=false,bypassZoomGate=false){
  if(!map||!grp)return;
  const blocked=applyZoomGate();
  if(blocked&&!bypassZoomGate){updateStats();return;}
  const allKeys=GROUP[grp].xml;
  if(!allKeys.length){updateStats();return;}
  allKeys.forEach(ensureMarkerLayer);
  const keys=bypassZoomGate?allKeys:allKeys.filter(k=>!isLayerDensitySuppressed(k));
  applyDensitySuppression();
  if(!keys.length){
    refreshCachedFacilityState();
    updateStats();
    updateZoomNotice(false);
    return;
  }
  const token=++fetchRunToken;
  if(!force&&keys.every(k=>isMarkerLayerCacheFresh(k,map.getBounds()))){
    refreshCachedFacilityState();
    updateStats();
    return;
  }
  const spinner=document.getElementById('map-spinner');
  if(spinner&&!silent)spinner.classList.add('show');
  try{
    await Promise.allSettled(keys.map(k=>fetchLayer(k,token,force)));
    if(token===fetchRunToken){
      applyDensitySuppression();
      refreshCachedFacilityState();
      updateStats();
      updateZoomNotice(zoomBlocked);
    }
  }finally{
    if(spinner)spinner.classList.remove('show');
  }
}
async function fetchLayer(key,token=null,force=false){
  const cfg=LAYER_API[key];
  if(!cfg||!map)return;
  ensureMarkerLayer(key);
  const currentBounds=map.getBounds();
  if(!force&&isMarkerLayerCacheFresh(key,currentBounds)){
    counts[key]=(chipOn[key]&&!zoomBlocked&&!isLayerDensitySuppressed(key))?countVisibleMarkers(key):0;
    return;
  }
  const requestBounds=currentBounds.pad(MARKER_FETCH_PADDING);
  try{
    const items=await requestSafemapMarkers(key,requestBounds);
    if(token!==null&&token!==fetchRunToken)return;
    if(!map)return;

    const cache=ensureMarkerLayer(key);
    const keepIds=new Set();
    const toAdd=[];
    items.forEach(it=>{
      const p=parseLayerPoint(it);
      if(!p)return;
      const id=getMarkerStableId(key,p.lat,p.lng,it);
      keepIds.add(id);
      if(!cache.items.has(id)){
        const marker=mkMarker(key,p.lat,p.lng,it);
        cache.items.set(id,{id,key,lat:p.lat,lng:p.lng,raw:it,marker});
        toAdd.push(marker);
      }else{
        cache.items.get(id).raw=it;
      }
    });

    if(toAdd.length){
      if(key==='cctv'&&toAdd.length>60)addMarkersProgressively(cache.group,toAdd);
      else toAdd.forEach(m=>cache.group.addLayer(m));
    }

    pruneMarkerCache(key,keepIds,requestBounds);
    markerFetchBounds[key]=requestBounds;
    markerFetchZoom[key]=map.getZoom();
    markerFetchTruncated[key]=items.length>=MARKER_PAGE_SIZE;
    updateLayerMinZoom(key,markerFetchTruncated[key],map.getZoom());
    counts[key]=(chipOn[key]&&!zoomBlocked&&!isLayerDensitySuppressed(key))?countVisibleMarkers(key):0;
    if(chipOn[key]&&!zoomBlocked&&!isLayerDensitySuppressed(key)&&map&&layers[key]&&!map.hasLayer(layers[key]))layers[key].addTo(map);
  }catch(e){
    console.warn('['+key+'] 실패:',e.message);
  }
}

/* ── 시설 이름·주소 추출(마커 팝업과 안전도 평가가 공용) ── */
function getFacilityInfo(key,it){
  let name='',addr='';
  if(key==='bell'){
    name=xv(it,'ins_detail')||xv(it,'rn_adres')||'안전비상벨';
    addr=xv(it,'rn_adres')||xv(it,'adres')||'';
  }else if(key==='police'){
    name=xv(it,'fclty_nm')||'치안시설';
    addr=xv(it,'rn_adres')||xv(it,'adres')||'';
  }else if(key==='cctv'){
    name=xv(it,'TITLE')||xv(it,'title')||'CCTV';
    addr=xv(it,'lctn_rona_addr')||xv(it,'lctn_lotno_addr')||'';
  }else if(key==='child_house'){
    name=xv(it,'fclty_nm')||'어린이안전지킴이집';
    addr=xv(it,'rn_adres')||xv(it,'adres')||'';
  }
  return {name,addr};
}

/* ── 마커 생성 ── */
function mkMarker(key,lat,lng,it){
  const m=LAYER[key];
  const info=getFacilityInfo(key,it);
  const name=info.name,addr=info.addr;
  let extra='';

  if(key==='bell'){
    const pc=xv(it,'flag_pol_l')||'';
    extra=pc==='Y'
      ?'<span style="color:#059669">✓ 경찰 연계</span>'
      :'<span style="color:#dc2626">✗ 경찰 미연계</span>';
    const tel=xv(it,'mng_tel')||'';
    if(tel)extra+='<br><span style="color:#64748b">📞 '+esc(tel)+'</span>';
  }else if(key==='police'){
    const tp=xv(it,'fclty_ty')||'';
    const tel=xv(it,'telno')||'';
    extra=(tp?'<span style="color:#7c3aed">'+esc(tp)+'</span> ':'')+
          (tel?'<span style="color:#64748b">📞 '+esc(tel)+'</span>':'');
  }else if(key==='cctv'){
    const prps=xv(it,'instl_prps_se')||'';
    const cnt=xv(it,'cmr_cntom')||'';
    const tel=xv(it,'mng_inst_telno')||'';
    extra=(prps?'<span style="color:#2563eb">'+esc(prps)+'</span> ':'')+
          (cnt?'<span style="color:#64748b">📷 '+esc(cnt)+'대</span> ':'')+
          (tel?'<span style="color:#64748b">📞 '+esc(tel)+'</span>':'');
  }else if(key==='child_house'){
    const tel=xv(it,'telno')||'';
    extra='<span style="color:#059669">🏠 어린이 보호</span>'+
          (tel?' <span style="color:#64748b">📞 '+esc(tel)+'</span>':'');
  }

  /* CCTV만 생활안전지도 공식 SVG 아이콘 사용 */
  let icon;
  if(key==='cctv'){
    icon=getCctvMarkerIcon();
  }else{
    icon=L.divIcon({
      html:'<div style="width:36px;height:36px;border-radius:50%;background:#fff;border:2.5px solid '+
        m.color+';display:flex;align-items:center;justify-content:center;font-size:16px;'+
        'box-shadow:0 3px 10px rgba(0,0,0,.18);">'+m.emoji+'</div>',
      className:'',
      iconSize:[36,36],
      iconAnchor:[18,18]
    });
  }

  return L.marker([lat,lng],{icon}).bindPopup(
    L.popup({className:'safepopup',closeButton:true,maxWidth:240}).setContent(
      '<div class="pbadge" style="background:'+m.color+'18;color:'+m.color+'">'+m.emoji+' '+m.label+'</div>'+
      '<div class="ptitle">'+esc(name)+'</div>'+
      (addr?'<div class="prow">📍 '+esc(addr)+'</div>':'')+
      (extra?'<div class="prow">'+extra+'</div>':'')
    )
  );
}

/* ── 화면 주변 시설을 안전도 평가용 목록에 등록 ── */
function registerSafeFacility(key,lat,lng,it){
  if(!FACILITY_SCORE_CONFIG[key])return;
  const id=key+':'+lat.toFixed(6)+','+lng.toFixed(6);
  if(safeFacilitySeen.has(id))return;
  safeFacilitySeen.add(id);
  const info=getFacilityInfo(key,it);
  safeFacilityPoints.push({
    id,key,lat,lng,
    name:info.name||(LAYER[key]&&LAYER[key].label)||key,
    addr:info.addr||'',
    weight:FACILITY_SCORE_CONFIG[key].unit
  });
}

/* ── 통계바 ── */
function updateStats(){
  const bar=document.getElementById('statsBar');
  if(!bar||!grp)return;
  const g=GROUP[grp];
  const items=[];
  g.xml.forEach(key=>{
    const m=LAYER[key];
    if(!m)return;
    const on=Boolean(chipOn[key])&&!zoomBlocked&&!isLayerDensitySuppressed(key);
    const cnt=counts[key]||0;
    const suffix=(on&&markerFetchTruncated[key])?'+':'';
    items.push(
      '<div class="stat-item'+(on?'':' off')+'">'+
        '<span class="stat-emoji">'+m.emoji+'</span>'+
        '<div class="stat-info">'+
          '<span class="stat-num" style="color:'+m.color+'">'+(on?cnt+suffix:'–')+'</span>'+
          '<span class="stat-lbl">'+m.label+'</span>'+
        '</div>'+
      '</div>'
    );
  });
  bar.style.display=items.length?'flex':'none';
  bar.innerHTML=items.join('');
}
