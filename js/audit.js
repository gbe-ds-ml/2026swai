/* ============================================================
   SafeWalk v2.2.1 — audit.js
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
   4) 긴급 패널: 112·119 전화 유지 + 112 문자·보호자 문자 2분할
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
    ?new Date(entry.ts).toLocaleDateString('ko-KR')
    :'';

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
        ?'<div class="prow">📍 '+esc(entry.addr)+'</div>'
        :'')+
      (when
        ?'<div class="prow" style="color:#94a3b8">저장일 '+esc(when)+'</div>'
        :'')+
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

  document.body.classList.add(
    'map-pick-mode'
  );

  showRouteToast(
    '⭐ 즐겨찾기에 저장할 장소를 지도에서 한 번 터치하세요.'
  );
}

function handleAuditPick(latlng){
  auditPickMode=false;

  document.body.classList.remove(
    'map-pick-mode'
  );

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
    console.warn(
      '즐겨찾기 주소 확인 실패:',
      e.message
    );
  }
}

/* ── 즐겨찾기 패널 ── */
function openAuditPanel(){
  const el=
    document.getElementById(
      'auditPanel'
    );

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
    document.getElementById(
      'auditPanel'
    );

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
      ?input.value.trim()
      :'';

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

    /* 여성 · 청소년 카드: 글씨 기준으로 위/아래 분리 */
.age-card[data-group="youth"]{
  justify-content:center;
  gap:6px;
  padding-top:16px;
  padding-bottom:16px;
}

.age-card[data-group="youth"] .woman-top{
  font-size:24px;
  line-height:1;
  display:block;
  margin-bottom:1px;
}

.age-card[data-group="youth"] .youth-bottom{
  font-size:22px;
  line-height:1;
  display:block;
  letter-spacing:-2px;
  margin-top:1px;
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

    /* 긴급 패널 2행: 전화 2분할 + 문자 2분할 */
    .em-sms-row{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:8px;
      margin-top:8px;
      margin-bottom:4px;
    }

    .em-sms-btn{
      min-width:0;
      min-height:72px;
      padding:9px 8px;
      border-radius:14px;
      border:1px solid;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:2px;
      font-family:'Noto Sans KR',sans-serif;
      cursor:pointer;
      touch-action:manipulation;
      -webkit-appearance:none;
      appearance:none;
      transition:
        transform .12s ease,
        background .12s ease;
    }

    .em-sms-btn:active{
      transform:scale(.98);
    }

    .em-sms-btn.police-sms{
      background:#fff1f2;
      border-color:#fecaca;
      color:#b91c1c;
    }

    .em-sms-btn.guardian-sms{
      background:#eff6ff;
      border-color:#bfdbfe;
      color:#1d4ed8;
    }

    .em-sms-btn.guardian-sms.needs-phone{
      background:#f8fafc;
      border-color:#cbd5e1;
      color:#64748b;
    }

    .em-sms-icon{
      font-size:18px;
      line-height:1;
      margin-bottom:3px;
    }

    .em-sms-main{
      font-size:12px;
      font-weight:900;
      line-height:1.2;
      white-space:nowrap;
    }

    .em-sms-sub{
      font-size:9.5px;
      font-weight:700;
      line-height:1.25;
      opacity:.78;
      text-align:center;
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
  const youthCard=
  document.querySelector(
    '.age-card[data-group="youth"]'
  );

if(youthCard){
  youthCard.setAttribute(
    'aria-label',
    '여성 및 청소년'
  );

  youthCard.innerHTML=
    '<span class="age-icon woman-top" aria-hidden="true">👩</span>'+
    '<span class="age-name">여성 · 청소년</span>'+
    '<span class="age-icon youth-bottom" aria-hidden="true">🧍‍♂️ 🧍‍♀️</span>';
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

/* ============================================================
   긴급 문자
   ============================================================ */

/* 문자 앱 열기 */
function openSafeWalkSms(phone,message){
  const number=
    String(phone||'').trim();

  const body=
    encodeURIComponent(
      message||''
    );

  const isIOS=
    /iPad|iPhone|iPod/.test(
      navigator.userAgent
    )||
    (
      navigator.platform==='MacIntel' &&
      navigator.maxTouchPoints>1
    );

  location.href=
    'sms:'+
    number+
    (isIOS?'&':'?')+
    'body='+
    body;
}

/* 112 문자 신고 */
function open112Sms(){
  const message=
    buildLocationMessage(
`[SafeWalk 112 문자신고]
현재 위치에서 긴급 도움이 필요합니다.
상황을 추가로 입력한 뒤 전송해 주세요.`
    );

  openSafeWalkSms(
    '112',
    message
  );
}

window.open112Sms=
  open112Sms;

/* 보호자 위치 문자 */
function openGuardianLocationSms(){
  const phone=
    typeof getGuardianPhone==='function'
      ?getGuardianPhone()
      :'';

  if(!phone){
    showRouteToast(
      '보호자 전화번호를 먼저 입력하고 저장해 주세요.'
    );

    const input=
      document.getElementById(
        'guardianInput'
      );

    if(input){
      input.focus();

      input.scrollIntoView({
        behavior:'smooth',
        block:'nearest'
      });
    }

    return;
  }

  const message=
    buildLocationMessage(
      '[SafeWalk] 보호자에게 긴급 위치를 공유합니다.'
    );

  openSafeWalkSms(
    phone,
    message
  );
}

window.openGuardianLocationSms=
  openGuardianLocationSms;

/* 보호자 번호 상태 표시 */
function updateCustomEmergencySmsButtons(){
  const guardianBtn=
    document.getElementById(
      'guardianLocationSmsBtn'
    );

  if(!guardianBtn)return;

  const phone=
    typeof getGuardianPhone==='function'
      ?getGuardianPhone()
      :'';

  guardianBtn.classList.toggle(
    'needs-phone',
    !phone
  );

  const sub=
    guardianBtn.querySelector(
      '.em-sms-sub'
    );

  if(sub){
    sub.textContent=
      phone
        ?'현재위치 보내기'
        :'번호 입력 필요';
  }
}

/* ── 긴급 패널 ── */
function customizeEmergencyPanel(){
  const panel=
    document.getElementById(
      'emergencyPanel'
    );

  if(!panel)return;

  /* 1행: 전화 */
  const callRow=
    panel.querySelector(
      '.em-call-row'
    );

  if(callRow){
    callRow.innerHTML=
      '<a class="em-call police" href="tel:112">'+
        '🚔 112'+
        '<span>경찰 신고</span>'+
      '</a>'+
      '<a class="em-call fire" href="tel:119">'+
        '🚒 119'+
        '<span>소방·구급</span>'+
      '</a>';
  }

  /* 기존 보호자 단일 문자 버튼 */
  const oldGuardianSms=
    document.getElementById(
      'guardianSmsBtn'
    );

  /* 2행: 문자 */
  let smsRow=
    panel.querySelector(
      '.em-sms-row'
    );

  if(!smsRow){
    smsRow=
      document.createElement(
        'div'
      );

    smsRow.className=
      'em-sms-row';

    smsRow.innerHTML=
      '<button type="button" '+
        'class="em-sms-btn police-sms" '+
        'onclick="open112Sms()">'+

        '<span class="em-sms-icon">💬</span>'+
        '<span class="em-sms-main">112 문자 신고</span>'+
        '<span class="em-sms-sub">현재위치 보내기</span>'+

      '</button>'+

      '<button type="button" '+
        'class="em-sms-btn guardian-sms" '+
        'id="guardianLocationSmsBtn" '+
        'onclick="openGuardianLocationSms()">'+

        '<span class="em-sms-icon">👨‍👩‍👧</span>'+
        '<span class="em-sms-main">보호자 문자</span>'+
        '<span class="em-sms-sub">현재위치 보내기</span>'+

      '</button>';

    if(oldGuardianSms){
      oldGuardianSms.insertAdjacentElement(
        'beforebegin',
        smsRow
      );

      oldGuardianSms.remove();

    }else if(callRow){
      callRow.insertAdjacentElement(
        'afterend',
        smsRow
      );
    }

  }else if(oldGuardianSms){
    oldGuardianSms.remove();
  }

  updateCustomEmergencySmsButtons();

  /* emergency.js 상태 갱신과 연결 */
  if(
    typeof updateEmergencyPanelState==='function' &&
    !updateEmergencyPanelState._safeWalk221Wrapped
  ){
    const baseUpdateEmergencyPanelState=
      updateEmergencyPanelState;

    updateEmergencyPanelState=
      function(){

        baseUpdateEmergencyPanelState();

        updateCustomEmergencySmsButtons();
      };

    updateEmergencyPanelState
      ._safeWalk221Wrapped=true;
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
/* ── 레이어 설정 추가 기능 변경 ── */
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

    /*
      기존 havens.js가
      - 안심 편의점(OSM)
      - 시민 안전 평가

      두 항목을 만든 뒤,
      여기서 OSM 항목은 완전히 제거하고
      시민 안전 평가만 즐겨찾기로 변경한다.
    */
    base(container);


    /* ========================================================
       OSM 안심 편의점 레이어 제거
       ======================================================== */

    const havenRow=
      container.querySelector(
        '.chip-row[data-kind="haven"]'
      );

    if(havenRow){
      havenRow.remove();
    }


    /*
      혹시 과거 상태에서 OSM 레이어가 켜져 있었다면
      강제로 비활성화한다.
    */
    if(
      typeof havenChipOn!=='undefined'
    ){
      havenChipOn=false;
    }


    if(
      typeof havenLayer!=='undefined' &&
      havenLayer &&
      typeof map!=='undefined' &&
      map
    ){
      try{

        if(
          map.hasLayer(
            havenLayer
          )
        ){
          map.removeLayer(
            havenLayer
          );
        }

      }catch(e){}
    }


    /* ========================================================
       시민 안전 평가 → 즐겨찾는 장소
       ======================================================== */

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
        dot.style.background=
          '#2563eb';
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


    /* ========================================================
       즐겨찾는 장소 추가 버튼
       ======================================================== */

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


  wrapped._favoriteWrapped=
    true;


  appendExtraChips=
    wrapped;
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
        ?GROUP.cpted.color
        :'#b45309';

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

  wrapped._cptedPersonWrapped=
    true;

  drawMe=
    wrapped;
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

    setTimeout(()=>{

      const ver=
        document.getElementById(
          'versionTag'
        );

      if(ver){
        ver.textContent=
          'v.2.2.1';
      }

    },0);
  }
);
