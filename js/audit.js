/* ============================================================
   SafeWalk v2.2 — audit.js
   ------------------------------------------------------------
   기존 "시민 안전 평가" 모듈을 "즐겨찾는 장소" 기능으로 교체한다.

   호환성 원칙
   - 기존 map.js / layers.js / havens.js / main.js가 호출하는
     audit* 함수명과 auditPickMode 상태는 그대로 유지한다.
   - 따라서 다른 파일을 수정하지 않아도 즐겨찾기 기능으로 동작한다.

   함께 적용되는 UI 보완
   1) 메인 여성·청소년 이모지: 여성 위 / 청소년 아래
   2) 메인 SafeWalk 로고 이미지 삽입
   3) CPTED 현재 위치 마커: 건설 아이콘 대신 사람 아이콘
   4) 긴급 패널: 112 / 현재위치 문자 버튼을 반반 배치, 119 유지
   5) 안전비상벨: 생활안전지도 accident.svg 아이콘 사용
   6) 시민 안전 평가 → 즐겨찾는 장소(추가/삭제)
   ============================================================ */

/* ── 즐겨찾기 상태 ──
   이름은 기존 파일과의 호환 때문에 audit*을 유지한다. */
let auditLayer=null;
let auditChipOn=true;
let auditPending=null;
let auditCache=[];
let auditMoveTimer=null;
let favoriteReverseToken=0;

const FAVORITE_STORAGE_KEY='sw_favorite_places_v1';
const FAVORITE_MAX_ITEMS=100;

/* ── localStorage ── */
function readFavorites(){
  try{
    const raw=localStorage.getItem(FAVORITE_STORAGE_KEY);
    const arr=raw?JSON.parse(raw):[];
    return Array.isArray(arr)?arr:[];
  }catch(e){
    console.warn('즐겨찾기 불러오기 실패:',e);
    return [];
  }
}

function writeFavorites(arr){
  try{
    localStorage.setItem(
      FAVORITE_STORAGE_KEY,
      JSON.stringify((Array.isArray(arr)?arr:[]).slice(-FAVORITE_MAX_ITEMS))
    );
  }catch(e){
    console.warn('즐겨찾기 저장 실패:',e);
    throw e;
  }
}

/* 기존 이름 호환 */
function readLocalAudits(){return readFavorites();}
function writeLocalAudits(arr){writeFavorites(arr);}
async function loadAudits(){return readFavorites();}
async function saveAudit(entry){
  const arr=readFavorites();
  arr.push(entry);
  writeFavorites(arr);
}

/* ── 즐겨찾기 마커 ── */
function mkAuditMarker(entry){
  const color='#2563eb';

  const icon=L.divIcon({
    html:'<div class="sw-favorite-marker">⭐</div>',
    className:'',
    iconSize:[34,34],
    iconAnchor:[17,17]
  });

  const when=entry.ts
    ? new Date(entry.ts).toLocaleDateString('ko-KR')
    : '';

  const id=String(entry.id||'')
    .replace(/[^a-zA-Z0-9_-]/g,'');

  return L.marker([entry.lat,entry.lng],{icon}).bindPopup(
    L.popup({
      className:'safepopup',
      closeButton:true,
      maxWidth:260
    }).setContent(
      '<div class="pbadge" style="background:'+color+'18;color:'+color+'">⭐ 즐겨찾는 장소</div>'+
      '<div class="ptitle">'+esc(entry.name||'즐겨찾는 장소')+'</div>'+
      (entry.addr
        ? '<div class="prow">📍 '+esc(entry.addr)+'</div>'
        : '')+
      (when
        ? '<div class="prow" style="color:#94a3b8">저장일 '+esc(when)+'</div>'
        : '')+
      '<button type="button" class="favorite-delete-btn" '+
      'onclick="deleteFavorite(\''+id+'\')">🗑 즐겨찾기 삭제</button>'
    )
  );
}

async function refreshAuditMarkers(){
  if(!map||!auditLayer)return;

  auditCache=readFavorites();
  auditLayer.clearLayers();

  if(!auditChipOn)return;

  auditCache.forEach(entry=>{
    const lat=Number(entry.lat);
    const lng=Number(entry.lng);

    if(!Number.isFinite(lat)||!Number.isFinite(lng))return;

    auditLayer.addLayer(
      mkAuditMarker({...entry,lat,lng})
    );
  });
}

function setAuditLayerVisible(on){
  auditChipOn=Boolean(on);

  if(!map||!auditLayer)return;

  if(auditChipOn){
    if(!map.hasLayer(auditLayer)){
      auditLayer.addTo(map);
    }

    refreshAuditMarkers();

  }else if(map.hasLayer(auditLayer)){
    map.removeLayer(auditLayer);
  }
}

/* map.js의 onLocated()가 호출하는 초기화 훅 */
function initAuditLayer(){
  if(!map)return;

  auditLayer=L.layerGroup();

  if(auditChipOn){
    auditLayer.addTo(map);
  }

  refreshAuditMarkers();
}

function resetAuditFeature(){
  auditLayer=null;
  auditPending=null;
  auditPickMode=false;

  favoriteReverseToken++;

  closeAuditPanel();
}

/* ── 즐겨찾기 추가 ── */
function startAuditPick(){

  if(!map){
    showRouteToast('지도가 아직 준비되지 않았습니다.');
    return;
  }

  closeLayerSheet();

  auditPickMode=true;

  document.body.classList.add('map-pick-mode');

  showRouteToast(
    '⭐ 즐겨찾기에 저장할 장소를 지도에서 한 번 터치하세요.'
  );
}

function handleAuditPick(latlng){

  auditPickMode=false;

  document.body.classList.remove('map-pick-mode');

  auditPending={
    lat:Number(latlng.lat),
    lng:Number(latlng.lng),
    name:'',
    addr:''
  };

  openAuditPanel();
}

/* ── 주소 확인 ── */
async function resolveFavoriteAddress(lat,lng,token){

  try{

    const url=
      'https://nominatim.openstreetmap.org/reverse'+
      '?lat='+encodeURIComponent(lat)+
      '&lon='+encodeURIComponent(lng)+
      '&format=json'+
      '&accept-language=ko'+
      '&zoom=18';

    const res=await fetch(url);

    if(!res.ok){
      throw new Error('HTTP '+res.status);
    }

    const data=await res.json();

    if(
      token!==favoriteReverseToken ||
      !auditPending
    ){
      return;
    }

    const a=data.address||{};

    const short=[
      a.road||
      a.pedestrian||
      a.neighbourhood||
      a.suburb||
      '',
      a.house_number||''
    ]
    .filter(Boolean)
    .join(' ');

    auditPending.addr=
      short||
      data.display_name||
      '';

    const text=
      document.getElementById(
        'favoriteLocationText'
      );

    if(text){

      text.textContent=
        auditPending.addr||
        (
          '위도 '+
          auditPending.lat.toFixed(6)+
          ' · 경도 '+
          auditPending.lng.toFixed(6)
        );
    }

  }catch(e){

    /* 주소 변환 실패는 저장 자체를 막지 않는다. */
    console.warn(
      '즐겨찾기 주소 확인 실패:',
      e.message
    );
  }
}

/* ── 즐겨찾기 패널 ── */
function openAuditPanel(){

  const el=
    document.getElementById('auditPanel');

  if(!el||!auditPending)return;

  const nameInput=
    document.getElementById(
      'favoriteNameInput'
    );

  const locationText=
    document.getElementById(
      'favoriteLocationText'
    );

  if(nameInput){
    nameInput.value='';
  }

  if(locationText){

    locationText.textContent=
      '위도 '+
      auditPending.lat.toFixed(6)+
      ' · 경도 '+
      auditPending.lng.toFixed(6);
  }

  el.classList.add('show');

  const token=++favoriteReverseToken;

  resolveFavoriteAddress(
    auditPending.lat,
    auditPending.lng,
    token
  );
}

function closeAuditPanel(){

  const el=
    document.getElementById('auditPanel');

  if(el){
    el.classList.remove('show');
  }

  auditPending=null;
  auditPickMode=false;

  favoriteReverseToken++;

  document.body.classList.remove(
    'map-pick-mode'
  );
}

function updateAuditSubmitState(){

  const btn=
    document.getElementById(
      'auditSubmitBtn'
    );

  if(btn){
    btn.classList.add('on');
  }
}

/* ── 저장 ── */
async function submitAudit(){

  if(!auditPending)return;

  const input=
    document.getElementById(
      'favoriteNameInput'
    );

  const typed=
    input
      ? input.value.trim()
      : '';

  const name=
    typed||
    '즐겨찾는 장소';

  const entry={

    id:
      'fav_'+
      Date.now().toString(36)+
      '_'+
      Math.random()
        .toString(36)
        .slice(2,8),

    name:name.slice(0,40),

    lat:Number(
      auditPending.lat.toFixed(6)
    ),

    lng:Number(
      auditPending.lng.toFixed(6)
    ),

    addr:String(
      auditPending.addr||''
    ).slice(0,160),

    ts:Date.now()
  };

  try{

    await saveAudit(entry);

    closeAuditPanel();

    auditChipOn=true;

    const chip=
      document.querySelector(
        '.chip-row[data-kind="audit"]'
      );

    if(chip){

      chip.classList.add('on');

      chip.setAttribute(
        'aria-checked',
        'true'
      );
    }

    if(
      auditLayer &&
      map &&
      !map.hasLayer(auditLayer)
    ){
      auditLayer.addTo(map);
    }

    await refreshAuditMarkers();

    showRouteToast(
      '⭐ 즐겨찾는 장소에 저장했습니다.'
    );

  }catch(e){

    console.warn(
      '즐겨찾기 저장 실패:',
      e
    );

    showRouteToast(
      '즐겨찾기 저장에 실패했습니다. 저장 공간을 확인해 주세요.'
    );
  }
}

/* ── 삭제 ── */
function deleteFavorite(id){

  const safeId=
    String(id||'');

  const current=
    readFavorites();

  const target=
    current.find(
      item=>String(item.id)===safeId
    );

  if(!target)return;

  if(
    !confirm(
      '“'+
      (target.name||'즐겨찾는 장소')+
      '”을(를) 즐겨찾기에서 삭제할까요?'
    )
  ){
    return;
  }

  writeFavorites(
    current.filter(
      item=>String(item.id)!==safeId
    )
  );

  if(map){
    map.closePopup();
  }

  refreshAuditMarkers();

  showRouteToast(
    '즐겨찾기에서 삭제했습니다.'
  );
}

window.deleteFavorite=deleteFavorite;

/* ============================================================
   화면 보완
   ============================================================ */

function injectV22Styles(){

  if(
    document.getElementById(
      'safeWalkV22Styles'
    )
  ){
    return;
  }

  const style=
    document.createElement('style');

  style.id=
    'safeWalkV22Styles';

  style.textContent=`

    #intro .version-tag{
      margin-bottom:8px;
    }

    .sw-main-logo-frame{
      width:min(82vw,320px);
      margin:0 auto 8px;
      overflow:hidden;
      border-radius:20px;
      background:#fff;
      box-shadow:
        0 8px 24px
        rgba(15,23,42,.08);
    }

    .sw-main-logo{
      display:block;
      width:100%;
      height:auto;
    }

    /* 여성 위 / 청소년 아래 */
    .age-icon.youth-stack{
      min-height:43px;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:0;
      line-height:1;
    }

    .age-icon.youth-stack .woman{
      font-size:23px;
      line-height:1;
    }

    .age-icon.youth-stack .teens{
      display:flex;
      align-items:center;
      justify-content:center;
      gap:0;
      margin-top:-1px;
      font-size:17px;
      line-height:1;
      letter-spacing:-3px;
    }

    /* 안전비상벨 공식 아이콘 */
    .sw-bell-icon{
      display:inline-block;
      width:20px;
      height:20px;
      object-fit:contain;
      vertical-align:-5px;
      pointer-events:none;
    }

    .chip-label .sw-bell-icon,
    .stat-emoji .sw-bell-icon{
      width:18px;
      height:18px;
    }

    .route-pill .sw-bell-icon{
      width:16px;
      height:16px;
      vertical-align:-4px;
    }

    .pbadge .sw-bell-icon{
      width:16px;
      height:16px;
      vertical-align:-4px;
    }

    /* 현재위치 문자 버튼 */
    .em-call.sms{
      border:0;
      background:#2563eb;
      color:#fff;
      font-family:'Noto Sans KR',sans-serif;
      cursor:pointer;
    }

    /* 119는 하단 보조 버튼으로 유지 */
    .em-action.em-fire-secondary{
      display:block;
      text-decoration:none;
      text-align:center;
      background:#fff7ed;
      border-color:#fed7aa;
      color:#c2410c;
      font-weight:900;
    }

    /* 즐겨찾기 */
    .favorite-field{
      display:grid;
      gap:6px;
      margin:10px 0;
    }

    .favorite-field label{
      font-size:11px;
      font-weight:800;
      color:var(--navy);
    }

    .favorite-location{
      padding:10px 11px;
      border-radius:11px;
      background:var(--bg);
      border:1px solid var(--gray2);
      color:var(--gray);
      font-size:10.5px;
      line-height:1.45;
      word-break:keep-all;
    }

    .favorite-delete-btn{
      width:100%;
      margin-top:10px;
      padding:9px 10px;
      border-radius:10px;
      border:1px solid #fecaca;
      background:#fff1f2;
      color:#be123c;
      font-family:'Noto Sans KR',sans-serif;
      font-size:11px;
      font-weight:800;
      cursor:pointer;
      touch-action:manipulation;
    }

    .favorite-delete-btn:active{
      background:#ffe4e6;
    }

    .sw-favorite-marker{
      width:34px;
      height:34px;
      border-radius:50%;
      background:#fff;
      border:2.5px solid #2563eb;
      display:flex;
      align-items:center;
      justify-content:center;
      font-size:16px;
      box-shadow:
        0 2px 9px
        rgba(37,99,235,.28);
    }
  `;

  document.head.appendChild(style);
}

/* ── 메인 화면 수정 ── */
function customizeIntro(){

  const youth=
    document.querySelector(
      '.age-card[data-group="youth"] .age-icon'
    );

  if(youth){

    youth.className=
      'age-icon youth-stack';

    youth.setAttribute(
      'aria-label',
      '여성과 남녀 청소년'
    );

    youth.innerHTML=
      '<span class="woman" aria-hidden="true">👩</span>'+
      '<span class="teens" aria-hidden="true">'+
        '<span>🧍‍♂️</span>'+
        '<span>🧍‍♀️</span>'+
      '</span>';
  }

  /* 메인 로고 */
  const version=
    document.getElementById(
      'versionTag'
    );

  if(
    version &&
    !document.querySelector(
      '.sw-main-logo-frame'
    )
  ){

    const frame=
      document.createElement('div');

    frame.className=
      'sw-main-logo-frame';

    const logo=
      document.createElement('img');

    logo.className=
      'sw-main-logo';

    logo.src=
      'assets/safewalk-logo.png';

    logo.alt=
      'SafeWalk · Guiding You Securely';

    logo.decoding=
      'async';

    frame.appendChild(logo);

    version.insertAdjacentElement(
      'afterend',
      frame
    );
  }

  /* 로고 안에 SAFE WALK 글자가 있으므로
     기존 큰 텍스트는 숨김 */
  const appName=
    document.querySelector(
      '.app-name'
    );

  if(appName){
    appName.style.display='none';
  }

  const appSub=
    document.querySelector(
      '.app-sub'
    );

  if(appSub){
    appSub.style.marginTop='2px';
  }
}

/* ── 긴급 패널 ── */
function customizeEmergencyPanel(){

  const row=
    document.querySelector(
      '#emergencyPanel .em-call-row'
    );

  if(row){

    row.innerHTML=
      '<a class="em-call police" href="tel:112">'+
        '🚔 112'+
        '<span>경찰 신고</span>'+
      '</a>'+
      '<button type="button" '+
        'class="em-call sms" '+
        'id="emergencyLocationSmsBtn" '+
        'onclick="openGuardianSms(\'[SafeWalk] 긴급 위치 공유\')">'+
        '💬 문자'+
        '<span>현재위치 보내기</span>'+
      '</button>';
  }

  /* 기존 문자 버튼 자리에 119 유지 */
  const oldSms=
    document.getElementById(
      'guardianSmsBtn'
    );

  if(oldSms){

    const fire=
      document.createElement('a');

    fire.className=
      'em-action em-fire-secondary';

    fire.href=
      'tel:119';

    fire.textContent=
      '🚒 119 소방·구급';

    oldSms.replaceWith(fire);
  }
}

/* ── 즐겨찾기 패널 ── */
function customizeFavoritePanel(){

  const panel=
    document.getElementById(
      'auditPanel'
    );

  if(!panel)return;

  panel.setAttribute(
    'aria-label',
    '즐겨찾는 장소 추가'
  );

  panel.innerHTML=`

    <div class="sp-head">

      <span class="sp-title">
        ⭐ 즐겨찾는 장소 추가
      </span>

      <button
        type="button"
        class="route-close"
        onclick="closeAuditPanel()"
        aria-label="즐겨찾기 패널 닫기">
        ×
      </button>

    </div>

    <div class="audit-sub">
      지도에서 선택한 장소를 이 기기에 저장합니다.
      저장한 장소는 지도에서 다시 확인하고 삭제할 수 있습니다.
    </div>

    <div class="favorite-field">

      <label for="favoriteNameInput">
        장소 이름
      </label>

      <input
        type="text"
        id="favoriteNameInput"
        class="sp-input"
        maxlength="40"
        placeholder="예: 집, 학교, 자주 가는 정류장"
        autocomplete="off"
        onkeydown="
          if(event.key==='Enter'){
            event.preventDefault();
            submitAudit();
          }
        "
      >

    </div>

    <div class="favorite-field">

      <label>
        선택한 위치
      </label>

      <div
        id="favoriteLocationText"
        class="favorite-location">
        위치를 확인하고 있습니다.
      </div>

    </div>

    <button
      type="button"
      class="sp-run audit-submit on"
      id="auditSubmitBtn"
      onclick="submitAudit()">

      ⭐ 즐겨찾기에 저장

    </button>
  `;
}

/* ── 레이어 설정 칩 변경 ── */
function wrapExtraChipBuilder(){

  if(
    typeof appendExtraChips!=='function' ||
    appendExtraChips._favoriteWrapped
  ){
    return;
  }

  const base=
    appendExtraChips;

  const wrapped=function(container){

    base(container);

    const row=
      container.querySelector(
        '.chip-row[data-kind="audit"]'
      );

    if(row){

      row.setAttribute(
        'aria-label',
        '즐겨찾는 장소'
      );

      const dot=
        row.querySelector(
          '.chip-dot'
        );

      if(dot){
        dot.style.background='#2563eb';
      }

      const label=
        row.querySelector(
          '.chip-label'
        );

      if(label){
        label.textContent=
          '⭐ 즐겨찾는 장소';
      }
    }

    const addBtn=
      container.querySelector(
        '#auditAddBtn'
      );

    if(addBtn){

      addBtn.textContent=
        '⭐ 즐겨찾는 장소 추가하기';

      addBtn.setAttribute(
        'aria-label',
        '지도에서 즐겨찾는 장소 추가하기'
      );
    }
  };

  wrapped._favoriteWrapped=true;

  appendExtraChips=wrapped;
}

/* ── 비상벨 공식 아이콘 ── */
function applyOfficialBellIcon(){

  if(
    typeof LAYER==='undefined' ||
    !LAYER.bell
  ){
    return;
  }

  const bellHtml=
    '<img '+
    'src="assets/accident.svg" '+
    'class="sw-bell-icon" '+
    'alt="" '+
    'aria-hidden="true">';

  LAYER.bell.emoji=
    bellHtml;

  if(
    typeof FACILITY_ROUTE_LABEL!=='undefined'
  ){
    FACILITY_ROUTE_LABEL.bell=
      bellHtml+
      ' 안전비상벨 2순위';
  }
}

/* ── CPTED 현재 위치 사람 아이콘 ── */
function overrideCptedCurrentLocationIcon(){

  if(
    typeof drawMe!=='function' ||
    drawMe._cptedPersonWrapped
  ){
    return;
  }

  const baseDrawMe=
    drawMe;

  let cptedPersonIcon=null;

  const wrapped=function(){

    baseDrawMe();

    if(
      grp!=='cpted' ||
      !myMark ||
      typeof L==='undefined'
    ){
      return;
    }

    if(!cptedPersonIcon){

      const color=
        (
          typeof GROUP!=='undefined' &&
          GROUP.cpted
        )
        ? GROUP.cpted.color
        : '#b45309';

      cptedPersonIcon=
        L.divIcon({

          html:
            '<div style="'+
              'width:42px;'+
              'height:42px;'+
              'border-radius:50%;'+
              'background:'+color+';'+
              'border:3px solid #fff;'+
              'display:flex;'+
              'align-items:center;'+
              'justify-content:center;'+
              'font-size:20px;'+
              'box-shadow:0 3px 12px rgba(0,0,0,.25);'+
            '">'+
              '🧍'+
            '</div>',

          className:'',

          iconSize:[42,42],

          iconAnchor:[21,21]
        });
    }

    if(
      myMark.options.icon !==
      cptedPersonIcon
    ){
      myMark.setIcon(
        cptedPersonIcon
      );
    }
  };

  wrapped._cptedPersonWrapped=true;

  drawMe=wrapped;
}

/* ============================================================
   초기 적용
   ============================================================ */

applyOfficialBellIcon();

overrideCptedCurrentLocationIcon();

document.addEventListener(
  'DOMContentLoaded',
  ()=>{

    injectV22Styles();

    customizeIntro();

    customizeEmergencyPanel();

    customizeFavoritePanel();

    wrapExtraChipBuilder();

    /* main.js의 버전 표시 이후 최종 갱신 */
    setTimeout(()=>{

      const ver=
        document.getElementById(
          'versionTag'
        );

      if(ver){
        ver.textContent=
          'v.2.2.0';
      }

    },0);
  }
);
