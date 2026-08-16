/* ============================================================
   SafeWalk v2.1 — audit.js
   시민 안전 감사 — SafetiPin의 "Safety Audit" 벤치마킹.

   사용자가 지도에서 지점을 찍고 3가지 지표(조명·주변 시야·체감
   안심)를 좋음/보통/부족으로 평가하면, 지도에 색깔 별점으로
   표시된다. 공공데이터(시설 개수)가 담지 못하는 "체감 안전"을
   시민이 직접 보완한다는 개념.

   저장 방식(config.js의 AUDIT_API_URL로 결정):
   - 로컬 모드(기본): 이 브라우저의 localStorage에만 저장
   - 공유 모드: v2/worker/의 Cloudflare Worker를 배포하고
     주소를 넣으면 모든 사용자가 평가를 공유
   ============================================================ */

let auditLayer=null;
let auditChipOn=true;
let auditPending=null;      /* 평가 대기 중인 좌표 */
let auditCache=[];          /* 마지막으로 불러온 평가 목록 */
let auditMoveTimer=null;

const AUDIT_LEVELS=[
  {value:2,label:'좋음'},
  {value:1,label:'보통'},
  {value:0,label:'부족'}
];

/* ── 저장/불러오기 ── */
function readLocalAudits(){
  try{
    const raw=localStorage.getItem(AUDIT_STORAGE_KEY);
    const arr=raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr:[];
  }catch(e){return [];}
}
function writeLocalAudits(arr){
  try{localStorage.setItem(AUDIT_STORAGE_KEY,JSON.stringify(arr.slice(-500)));}catch(e){}
}
async function loadAudits(){
  if(AUDIT_API_URL){
    try{
      const res=await fetch(AUDIT_API_URL,{method:'GET'});
      const data=await res.json();
      if(data&&Array.isArray(data.audits))return data.audits;
    }catch(e){console.warn('안전 감사 불러오기 실패(공유 모드):',e);}
    return [];
  }
  return readLocalAudits();
}
async function saveAudit(entry){
  if(AUDIT_API_URL){
    const res=await fetch(AUDIT_API_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(entry)
    });
    const data=await res.json();
    if(!res.ok||!data||data.ok!==true)throw new Error((data&&data.error)||'저장 실패');
    return;
  }
  const arr=readLocalAudits();
  arr.push(entry);
  writeLocalAudits(arr);
}

/* ── 마커 표시 ── */
function auditAvg(entry){
  const s=entry&&entry.scores?entry.scores:{};
  const vals=AUDIT_INDICATORS.map(ind=>Number(s[ind.key])||0);
  return vals.reduce((a,b)=>a+b,0)/Math.max(1,vals.length);
}
function auditColor(avg){
  if(avg>=1.5)return '#059669';
  if(avg>=0.8)return '#d97706';
  return '#dc2626';
}
function mkAuditMarker(entry){
  const avg=auditAvg(entry);
  const color=auditColor(avg);
  const icon=L.divIcon({
    html:'<div style="width:30px;height:30px;border-radius:50%;background:#fff;border:2.5px solid '+color+
      ';display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.2);">⭐</div>',
    className:'',iconSize:[30,30],iconAnchor:[15,15]
  });
  const rows=AUDIT_INDICATORS.map(ind=>{
    const v=Number(entry.scores&&entry.scores[ind.key])||0;
    const lv=AUDIT_LEVELS.find(l=>l.value===v);
    return '<div class="prow">'+esc(ind.label)+': <b style="color:'+auditColor(v)+'">'+esc(lv?lv.label:'-')+'</b></div>';
  }).join('');
  const when=entry.ts?new Date(entry.ts).toLocaleDateString('ko-KR'):'';
  return L.marker([entry.lat,entry.lng],{icon}).bindPopup(
    L.popup({className:'safepopup',closeButton:true,maxWidth:230}).setContent(
      '<div class="pbadge" style="background:'+color+'18;color:'+color+'">⭐ 시민 안전 평가</div>'+
      rows+
      (when?'<div class="prow" style="color:#94a3b8">평가일 '+esc(when)+'</div>':'')+
      '<div class="prow" style="color:#94a3b8">'+(AUDIT_API_URL?'사용자들이 공유한 평가입니다':'이 브라우저에 저장된 평가입니다')+'</div>'
    )
  );
}
async function refreshAuditMarkers(){
  if(!map||!auditLayer)return;
  auditCache=await loadAudits();
  if(!map||!auditLayer)return;
  auditLayer.clearLayers();
  if(map.getZoom()<AUDIT_MIN_ZOOM)return;
  const b=map.getBounds().pad(.3);
  auditCache.forEach(entry=>{
    if(!Number.isFinite(entry.lat)||!Number.isFinite(entry.lng))return;
    if(!b.contains([entry.lat,entry.lng]))return;
    auditLayer.addLayer(mkAuditMarker(entry));
  });
}
function setAuditLayerVisible(on){
  auditChipOn=Boolean(on);
  if(!map||!auditLayer)return;
  if(auditChipOn){
    if(!map.hasLayer(auditLayer))auditLayer.addTo(map);
    refreshAuditMarkers();
  }else{
    if(map.hasLayer(auditLayer))map.removeLayer(auditLayer);
  }
}
/* map.js의 onLocated()가 호출하는 초기화 훅 */
function initAuditLayer(){
  if(!map)return;
  auditLayer=L.layerGroup();
  if(auditChipOn)auditLayer.addTo(map);
  refreshAuditMarkers();
  map.on('moveend zoomend',()=>{
    if(!auditChipOn)return;
    clearTimeout(auditMoveTimer);
    auditMoveTimer=setTimeout(refreshAuditMarkers,600);
  });
}
function resetAuditFeature(){
  auditLayer=null;
  auditPending=null;
  auditPickMode=false;
  closeAuditPanel();
}

/* ── 평가 남기기 흐름 ── */
function startAuditPick(){
  if(!map){showRouteToast('지도가 아직 준비되지 않았습니다.');return;}
  if(map.getZoom()<AUDIT_MIN_ZOOM){
    showRouteToast('지도를 zoom '+AUDIT_MIN_ZOOM+' 이상으로 확대한 뒤 평가할 지점을 선택해 주세요.');
    return;
  }
  closeLayerSheet();
  auditPickMode=true;
  document.body.classList.add('map-pick-mode');
  showRouteToast('⭐ 평가할 지점을 지도에서 한 번 터치하세요.');
}
function handleAuditPick(latlng){
  auditPickMode=false;
  document.body.classList.remove('map-pick-mode');
  auditPending={lat:latlng.lat,lng:latlng.lng,scores:{}};
  openAuditPanel();
}
function openAuditPanel(){
  const el=document.getElementById('auditPanel');
  if(!el||!auditPending)return;
  /* 지표별 버튼 생성 */
  const box=document.getElementById('auditIndicators');
  box.innerHTML='';
  AUDIT_INDICATORS.forEach(ind=>{
    const row=document.createElement('div');
    row.className='audit-row';
    const head=document.createElement('div');
    head.className='audit-row-head';
    head.innerHTML='<span class="audit-lbl">'+esc(ind.label)+'</span><span class="audit-desc">'+esc(ind.desc)+'</span>';
    const btns=document.createElement('div');
    btns.className='audit-btns';
    AUDIT_LEVELS.forEach(lv=>{
      const b=document.createElement('button');
      b.type='button';
      b.className='audit-btn';
      b.textContent=lv.label;
      b.addEventListener('click',()=>{
        auditPending.scores[ind.key]=lv.value;
        btns.querySelectorAll('.audit-btn').forEach(x=>x.classList.remove('sel'));
        b.classList.add('sel');
        updateAuditSubmitState();
      });
      btns.appendChild(b);
    });
    row.append(head,btns);
    box.appendChild(row);
  });
  updateAuditSubmitState();
  el.classList.add('show');
}
function closeAuditPanel(){
  const el=document.getElementById('auditPanel');
  if(el)el.classList.remove('show');
  auditPending=null;
  document.body.classList.remove('map-pick-mode');
}
function updateAuditSubmitState(){
  const btn=document.getElementById('auditSubmitBtn');
  if(!btn)return;
  const done=auditPending&&AUDIT_INDICATORS.every(ind=>Number.isFinite(auditPending.scores[ind.key]));
  btn.classList.toggle('on',Boolean(done));
}
async function submitAudit(){
  if(!auditPending)return;
  const done=AUDIT_INDICATORS.every(ind=>Number.isFinite(auditPending.scores[ind.key]));
  if(!done){showRouteToast('세 항목을 모두 선택해 주세요.');return;}
  const entry={
    lat:Number(auditPending.lat.toFixed(6)),
    lng:Number(auditPending.lng.toFixed(6)),
    scores:auditPending.scores,
    ts:Date.now()
  };
  try{
    await saveAudit(entry);
    closeAuditPanel();
    showRouteToast('⭐ 안전 평가를 저장했습니다. 고맙습니다!');
    if(auditChipOn)refreshAuditMarkers();
  }catch(e){
    console.warn('안전 감사 저장 실패:',e);
    showRouteToast('평가 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
