/* ============================================================
   SafeWalk bilingual UI v1.0 — 2026-09-21

   목적
   - 기본 언어는 한국어
   - 초기화면 우측 상단의 🌐 EN / 🌐 한국어 버튼으로 전환
   - 선택 언어는 이 브라우저의 localStorage에만 저장
   - 기존 지도 / GPS / SafeMap / 경로 / 점수 계산 로직은 변경하지 않음

   영어 목적지 검색은 search.js가 담당한다.
   Cloudflare AI는 영어 질문에 영어로 답하고,
   영문 장소명은 VWorld 검증 전 "검색어 후보"로만 사용한다.
   ============================================================ */

(function(){
  'use strict';

  const STORAGE_KEY='safewalk_lang';
  const ALLOWED=new Set(['ko','en']);

  function readLanguage(){
    try{
      const saved=localStorage.getItem(STORAGE_KEY);
      return ALLOWED.has(saved)?saved:'ko';
    }catch(error){
      return 'ko';
    }
  }

  let currentLanguage=readLanguage();

  window.getSafeWalkLanguage=function(){
    return currentLanguage;
  };

  window.safeWalkIsEnglish=function(){
    return currentLanguage==='en';
  };

  window.setSafeWalkLanguage=function(language){
    const next=ALLOWED.has(language)?language:'ko';
    try{localStorage.setItem(STORAGE_KEY,next);}catch(error){}
    currentLanguage=next;
    location.reload();
  };

  const EXACT=new Map(Object.entries({
    '불러오는 중...':'Loading...',
    '생활안전지도 기반':'Based on SafeMap public safety data',
    '내 주변 안전 인프라, 미리 확인하세요':'Check safety infrastructure around you',
    '나는 누구인가요?':'Who are you?',
    '어린이':'Child',
    '여성·청소년':'Women · Youth',
    '노인':'Senior',
    '만 13세':'Under 13',
    '만 65세':'Age 65+',
    '📍 내 주변 안전지도 보기':'📍 View safety map near me',
    '🧭 경로·점수 산정 기준':'🧭 Route & score criteria',
    '점수 계산 자세히 보기':'View score calculation',
    '범죄예방환경설계 지도':'Crime Prevention Environment Design Map',
    'CPTED 구역만 따로 확인하기':'View CPTED areas separately',

    '길찾기':'Directions',
    '내 위치':'My location',
    '긴급':'Emergency',
    '도착했어요':'I arrived',
    '🚨 긴급 도움':'🚨 Emergency help',
    '경찰':'Police',
    '소방·구급':'Fire · EMS',
    '💬 문자로 내 위치 보내기':'💬 Send my location by text',
    '📋 현재 위치 복사 (메신저 붙여넣기용)':'📋 Copy current location',
    '📢 사이렌 + 화면 점멸':'📢 Siren + screen flash',
    '보호자 전화번호 (이 기기에만 저장)':'Guardian phone number (stored only on this device)',
    '저장':'Save',
    '긴급 상황에서는 현재 화면에서 112·119로 직접 신고해 주세요.':'In an emergency, call 112 or 119 directly from this screen.',

    '⭐ 이 지점 안전 평가':'⭐ Safety feedback for this location',
    '공공데이터가 담지 못하는 체감 안전을 기록합니다. 세 항목을 모두 선택해 주세요.':'Record perceived safety factors that public data may not capture. Select all three items.',
    '평가 저장':'Save feedback',

    '🧭 안전 길찾기':'🧭 Walking directions',
    '출발':'From',
    '도착':'To',
    '현재 위치':'Current location',
    '📍 현재 위치':'📍 Current location',
    '출발지를 지정하세요':'Set a starting point',
    '도착지를 지정하세요':'Set a destination',
    '현재 위치 확인 중…':'Checking current location…',
    '⇅ 출발지·도착지 바꾸기':'⇅ Swap origin and destination',
    '검색':'Search',
    '📍 현재 위치로 지정':'📍 Use current location',
    '🗺 지도에서 직접 선택':'🗺 Select on map',
    '길찾기 시작':'Start directions',
    '지도 선택 지점':'Selected point on map',
    '검색 결과':'Search result',
    '검색 장소':'Search result',
    '주소 정보 없음':'No address information',

    '🔍 지도를 조금 더 확대하면 안전시설이 표시됩니다':'🔍 Zoom in a little more to display safety facilities',
    '레이어 설정':'Layers',
    '치안시설':'Police facility',
    '안전비상벨':'Emergency bell',
    '아동안전지킴이집':'Child Safety House',
    '어린이안전지킴이집':'Child Safety House',
    '범죄주의구간':'Crime caution area',
    '안전시설':'Safety facility',
    'CCTV':'CCTV',

    '🚶 보행 경로 · 시설 접근성 평가':'🚶 Walking route · Infrastructure accessibility',
    '목적지를 선택하면 보행 경로와 시설 접근성을 계산합니다.':'Select a destination to calculate a walking route and infrastructure accessibility.',
    '거리':'Distance',
    '예상 시간':'Estimated time',
    '시설 접근성':'Infrastructure access',
    '목적지를 선택하면 요약 정보가 표시됩니다.':'Select a destination to view route details.',
    '상세 점수 보기':'View score details',
    '상세 점수 접기':'Hide score details',
    '보행 경로를 우선 안내하고, 경로 주변 안전시설 접근성을 점수화합니다.':'SafeWalk first provides a walking route, then evaluates access to nearby safety infrastructure.',
    '시설 접근성 점수':'Infrastructure Accessibility Score',

    'AI 안내':'AI Guide',
    '가까운 안전시설':'Nearby safety facilities',
    'SafeWalk AI 안전 도우미':'SafeWalk AI Safety Guide',
    'Cloudflare Workers AI · 공공데이터 기반 안내':'Cloudflare Workers AI · Public-data-based guidance',
    '시설 접근성 점수':'Infrastructure Accessibility Score',
    '안전시설 설명':'Safety facilities',
    '길찾기 사용법':'How to use directions',
    '현재 경로 설명':'Explain current route',

    '직선거리':'Straight-line distance',
    '주소':'Address',
    '지도에서 보기':'View on map',
    '여기로 길찾기':'Directions here',
    '길찾기 취소':'Cancel directions',
    '다시 선택':'Choose again',
    '취소':'Cancel',
    '이 경로로 길찾기':'Use this route',
    '장소를 다시 선택할게요.':'Choose the place again.',
    '길찾기 요청을 취소했습니다.':'Directions request cancelled.',
    '확인된 장소를 기준으로 SafeWalk 안전 경로를 계산합니다.':'Calculating the SafeWalk route using the confirmed places.',
    '출발지는 현재 위치로 사용합니다. 목적지 후보를 확인해 주세요.':'Your current location will be used as the origin. Please confirm the destination.',
    '먼저 출발지를 확인한 뒤 목적지를 선택하겠습니다.':'Please confirm the origin first, then choose the destination.',
    '현재 위치 기준 가까운 안전시설을 종류별로 확인했습니다.':'Nearby safety facilities were checked by type from your current location.',
    '거리는 현재 GPS 좌표 기준 직선거리입니다. 실제 보행거리는 “여기로 길찾기”에서 확인해 주세요.':'Distances are straight-line distances from your current GPS position. Use “Directions here” to check walking distance.',
    '현재 위치 주변에서 요청한 안전시설을 찾지 못했습니다. 생활안전지도 데이터 제공 범위에 따라 일부 지역은 결과가 없을 수 있습니다.':'No requested safety facility was found near your current location. Results may be unavailable in some areas depending on public-data coverage.',
    '지도가 아직 준비되지 않았습니다.':'The map is not ready yet.',
    '현재 위치를 다시 확인한 뒤 길찾기를 시도해 주세요.':'Please refresh your current location and try directions again.',
    '현재 위치 신호를 확인하기 어렵습니다. 잠시 후 다시 시도해 주세요.':'Your location signal is currently unavailable. Please try again shortly.',
    '현재 위치 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.':'Location detection is taking longer than expected. Please try again shortly.',
    '현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.':'Could not determine your current location. Please try again shortly.',
    '현재 브라우저에서는 위치 기능을 사용할 수 없습니다.':'Location services are not available in this browser.',
    '위치 확인 중...':'Checking location...'
  }));

  const ATTR_EXACT=new Map(Object.entries({
    '장소 또는 주소 검색':'Search place or address',
    '출발지 장소 또는 주소 검색':'Search origin place or address',
    '도착지 장소 또는 주소 검색':'Search destination place or address',
    '예: 01012345678':'e.g. 01012345678',
    '예: 포항여고에서 영일대까지 / 여기서 포항역 가자':'e.g. Take me to Pohang Station / Where is the nearest CCTV?',
    '처음 화면으로 돌아가기':'Back to start',
    '안전 길찾기':'Walking directions',
    '내 위치로 이동':'Go to my location',
    '긴급 도움':'Emergency help',
    'AI 안전 도우미 질문 입력':'Ask the SafeWalk AI safety guide',
    'SafeWalk AI 안전 도우미 열기':'Open SafeWalk AI safety guide',
    'AI 안전 도우미 닫기':'Close SafeWalk AI safety guide'
  }));

  function dynamicTranslation(text){
    const raw=String(text||'');
    const trimmed=raw.trim();
    if(!trimmed)return raw;

    if(EXACT.has(trimmed)){
      return raw.replace(trimmed,EXACT.get(trimmed));
    }

    const extra=window.safeWalkExtraTranslation;
    if(typeof extra==='function'){
      const translated=extra(raw);
      if(translated!==raw)return translated;
    }

    let m;

    m=trimmed.match(/^(\d+)건을 찾았습니다\. 항목을 선택하세요\.$/);
    if(m)return raw.replace(trimmed,'Found '+m[1]+' result(s). Select a place.');

    m=trimmed.match(/^‘(.+)’ 출발지 검색 결과입니다\.$/);
    if(m)return raw.replace(trimmed,'Origin search results for “'+m[1]+'”.');

    m=trimmed.match(/^‘(.+)’ 도착지 검색 결과입니다\.$/);
    if(m)return raw.replace(trimmed,'Destination search results for “'+m[1]+'”.');

    m=trimmed.match(/^기준 지점에서 직선거리 약 (.+)$/);
    if(m)return raw.replace(trimmed,'Approx. '+m[1]+' straight-line distance from the reference point');

    m=trimmed.match(/^조회된 시설 중 현재 위치에서 가까운 (.+)입니다\.$/);
    if(m)return raw.replace(trimmed,'This is the nearest '+m[1]+' found from your current location.');

    m=trimmed.match(/^※ 현재 위치 정확도는 약 (\d+)m입니다\. 실제 시설 거리·순서는 차이가 있을 수 있습니다\.$/);
    if(m)return raw.replace(trimmed,'※ Current location accuracy is about '+m[1]+' m. Actual facility distance and order may differ.');

    m=trimmed.match(/^(.+)까지 SafeWalk 보행 경로를 계산합니다\.$/);
    if(m)return raw.replace(trimmed,'Calculating a SafeWalk walking route to '+m[1]+'.');

    m=trimmed.match(/^출발지와 도착지를 바꾸었습니다\.$/);
    if(m)return raw.replace(trimmed,'Origin and destination were swapped.');

    m=trimmed.match(/^(.+)(?:를|을) 현재 위치로 지정했습니다\.$/);
    if(m)return raw.replace(trimmed,'Set '+(m[1].includes('출발')?'the origin':'the destination')+' to your current location.');

    if(trimmed==='검색 중입니다...')return raw.replace(trimmed,'Searching...');
    if(trimmed==='두 글자 이상 입력해 주세요.')return raw.replace(trimmed,'Enter at least two characters.');
    if(trimmed==='검색 결과가 없습니다. 도로명주소나 정확한 시설명으로 다시 시도하거나, 지도에서 직접 선택하세요.')return raw.replace(trimmed,'No verified result was found. Try a more specific place/address or select the destination directly on the map.');
    if(trimmed==='검색 서버에 연결하지 못했습니다. VWorld 키와 서비스 URL을 확인해 주세요.')return raw.replace(trimmed,'Could not connect to the place-search service. Please try again later.');
    if(trimmed==='출발지·도착지가 모두 지정되었습니다. 길찾기를 시작하세요.')return raw.replace(trimmed,'Origin and destination are set. Start directions when ready.');
    if(trimmed==='도착지를 검색하거나 지도에서 직접 선택하세요.')return raw.replace(trimmed,'Search for a destination or select it directly on the map.');
    if(trimmed==='출발지를 검색하거나 현재 위치·지도 선택을 사용하세요.')return raw.replace(trimmed,'Search for an origin, use your current location, or select it on the map.');
    if(trimmed==='현재 위치를 확인하고 있습니다. 위치 권한 요청을 허용해 주세요.')return raw.replace(trimmed,'Checking your current location. Please allow location access.');
    if(trimmed==='현재 위치를 아직 확인하지 못했습니다. 내 위치 버튼으로 다시 확인해 주세요.')return raw.replace(trimmed,'Your current location is not available yet. Use “My location” and try again.');
    if(trimmed==='현재 위치를 확인하지 못했습니다. 다시 시도하거나 장소 검색·지도 선택으로 지정해 주세요.')return raw.replace(trimmed,'Could not get your current location. Try again, search for a place, or select a point on the map.');
    if(trimmed==='위치 권한이 차단되어 있습니다. 브라우저의 사이트 위치 권한을 허용해 주세요.')return raw.replace(trimmed,'Location access is blocked. Allow location permission for this site in your browser.');

    return raw;
  }

  window.safeWalkTranslate=function(text){
    return currentLanguage==='en'?dynamicTranslation(text):String(text??'');
  };
  window.refreshSafeWalkTranslations=function(){
    if(document.body)translateNode(document.body);
  };

  function translateAttribute(el,name){
    if(currentLanguage!=='en'||!el?.getAttribute)return;
    const value=el.getAttribute(name);
    if(!value)return;
    const mapped=ATTR_EXACT.get(value)||dynamicTranslation(value);
    if(mapped&&mapped!==value)el.setAttribute(name,mapped);
  }

  function translateNode(node){
    if(currentLanguage!=='en'||!node)return;

    if(node.nodeType===Node.TEXT_NODE){
      const parent=node.parentElement;
      if(!parent)return;
      if(parent.closest('script,style,textarea,input,.chat-row.user,[translate="no"],.sp-item .nm,.sp-item .ad,.chat-place-name,.chat-place-addr'))return;
      const translated=dynamicTranslation(node.nodeValue);
      if(translated!==node.nodeValue)node.nodeValue=translated;
      return;
    }

    if(node.nodeType!==Node.ELEMENT_NODE)return;

    translateAttribute(node,'placeholder');
    translateAttribute(node,'aria-label');
    translateAttribute(node,'title');

    node.childNodes.forEach(translateNode);
  }

  function setText(selector,text){
    const el=document.querySelector(selector);
    if(el)el.textContent=text;
  }

  function setHtml(selector,html){
    const el=document.querySelector(selector);
    if(el)el.innerHTML=html;
  }

  function setAttr(selector,name,value){
    const el=document.querySelector(selector);
    if(el)el.setAttribute(name,value);
  }

  function applyEnglishStatic(){
    document.documentElement.lang='en';

    setHtml('#intro .badge','<span class="badge-dot"></span>Based on SafeMap public safety data');
    setText('#serviceTitle','AI-Assisted Walking Directions');
    setText('#intro .app-sub','Walking directions using public safety infrastructure data');
    setText('#intro .section-lbl','Who are you?');

    setText('.age-card[data-group="child"] .age-name','Child');
    setHtml('.age-card[data-group="child"] .age-desc','Under<br>13');
    setText('.age-card[data-group="youth"] .age-name','Women · Youth');
    setText('.age-card[data-group="elder"] .age-name','Senior');
    setHtml('.age-card[data-group="elder"] .age-desc','Age 65<br>or older');

    setText('#startBtn','📍 View safety map near me');

    setText('#routeGuide .route-guide-title span','🧭 Route & score criteria');
    const guideRows=document.querySelectorAll('#routeGuide .route-guide-row > span:last-child');
    if(guideRows[0])guideRows[0].innerHTML='Shows a <strong>walking route</strong> and evaluates nearby safety infrastructure.';
    if(guideRows[1])guideRows[1].innerHTML='Reflects nearby <strong>police facilities, CCTV, emergency bells, and Child Safety Houses</strong> with configured weights.';
    if(guideRows[2])guideRows[2].textContent='Shows infrastructure accessibility as a 0–100 reference score.';

    setText('#routeGuide .route-guide-more','View score calculation');
    const guideDetail=document.querySelectorAll('#routeGuide .route-guide-detail > div');
    if(guideDetail[0])guideDetail[0].innerHTML='<strong>Proximity</strong>: within 30 m 100% · 60 m 75% · 100 m 40% · 150 m 15%';
    if(guideDetail[1])guideDetail[1].innerHTML='<strong>Maximum contribution</strong>: police 17 · CCTV 11 · emergency bell 11 · Child Safety House 6 (total 45)';
    if(guideDetail[2])guideDetail[2].innerHTML='<strong>Infrastructure Accessibility Score</strong>: raw facility score ÷ 45 × 100 (0 facilities = 0; lookup failure = unavailable)';
    if(guideDetail[3])guideDetail[3].textContent='The score uses all successfully retrieved facilities regardless of layer visibility. It is a public-data-based reference indicator and does not guarantee actual safety. Crime caution layers are not directly included in the score.';

    setText('.cpted-title','Crime Prevention Environment Design Map');
    setText('.cpted-desc','View CPTED areas separately');

    const topLabels=document.querySelectorAll('#topbar .btn-label');
    if(topLabels[0])topLabels[0].textContent='Directions';
    if(topLabels[1])topLabels[1].textContent='My location';
    if(topLabels[2])topLabels[2].textContent='Emergency';
    setAttr('#routeBtn','aria-label','Walking directions');
    setAttr('#routeBtn','title','Walking directions');

    setText('#safeTimerPill .safe-timer-done','I arrived');
    setText('#safeTimerAlert .safe-timer-alert-title','⏰ Arrival confirmation needed');
    if(!document.getElementById('safeTimerAlert')?.classList.contains('show'))setText('#safeTimerAlertSub','Your expected arrival time has passed.');
    const timerButtons=document.querySelectorAll('#safeTimerAlert .sta-btn');
    if(timerButtons[0])timerButtons[0].textContent='✅ I arrived safely';
    if(timerButtons[1])timerButtons[1].textContent='💬 Send my location to guardian';
    if(timerButtons[2])timerButtons[2].textContent='🚔 Call 112';
    if(timerButtons[3])timerButtons[3].textContent='📢 Siren on/off';
    setText('#safeTimerAlert .safe-timer-alert-note','Text messages and calls are sent only when you press a button. SafeWalk does not send them automatically.');

    setText('#emergencyPanel .sp-title','🚨 Emergency help');
    const calls=document.querySelectorAll('#emergencyPanel .em-call span');
    if(calls[0])calls[0].textContent='Police';
    if(calls[1])calls[1].textContent='Fire · EMS';
    setText('#guardianSmsBtn','💬 Send my location by text');
    setText('#copyLocationBtn','📋 Copy current location');
    setText('#sirenBtn',typeof sirenOn!=='undefined'&&sirenOn?'🔇 Turn siren off':'📢 Siren + screen flash');
    setText('#emergencyPanel .em-guardian label','Guardian phone number (stored only on this device)');
    const guardian=document.getElementById('guardianInput');
    if(guardian)guardian.placeholder='e.g. 01012345678';
    setText('#emergencyPanel .em-guardian .sp-go','Save');
    setText('#emergencyPanel .em-note','Call buttons open your device’s phone function. Text buttons open a message draft. Check the message and recipient, then send it yourself.');

    setText('#auditPanel .sp-title','⭐ Safety feedback for this location');
    setText('#auditPanel .audit-sub','Record perceived safety factors that public data may not capture. Select all three items.');
    setText('#auditSubmitBtn','Save feedback');

    setText('#searchPanel .sp-title','🧭 Walking directions');
    const slotTags=document.querySelectorAll('#searchPanel .sp-slot .tag');
    if(slotTags[0])slotTags[0].textContent='From';
    if(slotTags[1])slotTags[1].textContent='To';
    if(typeof updateSlotUI==='function')updateSlotUI();
    setText('#searchPanel .sp-swap','⇅ Swap origin and destination');

    const searchInput=document.getElementById('spInput');
    if(searchInput)searchInput.placeholder='Search place or address in English';
    setText('#spGo','Search');

    const quick=document.querySelectorAll('#searchPanel .sp-chip');
    if(quick[0])quick[0].textContent='📍 Use current location';
    if(quick[1])quick[1].textContent='🗺 Select on map';

    setText('#spMsg','Your current location is used as the default origin. Search for a destination in English or select it on the map.');
    setText('#spRun','Start directions');

    setText('#zoomNotice','🔍 Zoom in a little more to display safety facilities');
    setText('#sheetLabel','Layers');
    setHtml('#statsNote','Facilities retrieved within the current map view.<br>Areas hidden behind panels are also included.<span id="statsStatus" hidden></span>');

    setText('#routeTitle','🚶 Walking route · Infrastructure accessibility');
    setText('#routeSub','Select a destination to calculate a walking route and infrastructure accessibility.');
    const metricLabels=document.querySelectorAll('#routePanel .route-metric .k');
    if(metricLabels[0])metricLabels[0].textContent='Distance';
    if(metricLabels[1])metricLabels[1].textContent='Estimated time';
    if(metricLabels[2])metricLabels[2].textContent='Infrastructure access';
    setText('#routeMobileSummary','Select a destination to view route details.');
    setText('#routePanel .route-details-open-label','View score details');
    setText('#routePanel .route-details-close-label','Hide score details');
    setText('#routeReason','SafeWalk first provides a walking route, then evaluates access to nearby safety infrastructure.');

    setText('#chatFab .chat-fab-label','AI Guide');
    setAttr('#chatFab','aria-label','Open SafeWalk AI safety guide');

    setText('#chatPanel .chat-title','SafeWalk AI Safety Guide');
    setText('#chatPanel .chat-status','Cloudflare Workers AI · Public-data-based guidance');
    setText('#chatPanel .chat-privacy','Your question, recent conversation, and summarized area/route context are sent to the AI service. GPS coordinates and guardian phone numbers are not sent automatically.');

    const firstBubble=document.querySelector('#chatMessages .chat-row.bot .chat-bubble');
    if(firstBubble&&firstBubble.textContent.startsWith('안녕하세요. SafeWalk 이용 방법'))firstBubble.textContent='Hello. I can explain SafeWalk, find nearby safety facilities, and help with walking directions. You can type “Take me to Pohang Station” or search a destination in English. SafeWalk verifies places through VWorld before starting directions. In an emergency, call 112 or 119 instead of waiting for an AI response.';

    const quickBtns=document.querySelectorAll('#chatPanel .chat-quick-btn');
    if(quickBtns[0]){
      quickBtns[0].textContent='AI directions example';
      quickBtns[0].setAttribute('onclick',"askChatQuick('Take me from my current location to Pohang Station')");
    }
    if(quickBtns[1]){
      quickBtns[1].textContent='Accessibility score';
      quickBtns[1].setAttribute('onclick',"askChatQuick('How is the SafeWalk infrastructure accessibility score calculated?')");
    }
    if(quickBtns[2]){
      quickBtns[2].textContent='Safety facilities';
      quickBtns[2].setAttribute('onclick',"askChatQuick('What do CCTV and emergency bells on the map mean?')");
    }
    if(quickBtns[3]){
      quickBtns[3].textContent='How to use directions';
      quickBtns[3].setAttribute('onclick',"askChatQuick('How do I use directions in SafeWalk?')");
    }
    if(quickBtns[4]){
      quickBtns[4].textContent='Explain current route';
      quickBtns[4].setAttribute('onclick',"askChatQuick('Explain the infrastructure accessibility result for my current route.')");
    }

    const chatInput=document.getElementById('chatInput');
    if(chatInput){
      chatInput.placeholder='e.g. Take me to Pohang Station / Where is the nearest CCTV?';
      chatInput.setAttribute('aria-label','Ask the SafeWalk AI safety guide');
    }

    setText('#chatPanel .chat-note','AI does not create place coordinates. SafeWalk uses VWorld search results and starts directions only after a place is confirmed.');

    translateNode(document.body);
  }

  function injectLanguageToggle(){
    const intro=document.getElementById('intro');
    if(!intro||document.getElementById('safeLangToggle'))return;

    const style=document.createElement('style');
    style.textContent=`
      #intro{position:relative;}
      .safe-lang-toggle{
        position:absolute;
        top:calc(env(safe-area-inset-top, 0px) + 12px);
        right:14px;
        z-index:10020;
        border:1px solid rgba(15,23,42,.12);
        background:rgba(255,255,255,.94);
        color:#0f172a;
        border-radius:999px;
        min-height:36px;
        padding:7px 11px;
        font:800 12px/1 "Noto Sans KR",system-ui,sans-serif;
        box-shadow:0 5px 18px rgba(15,23,42,.12);
        backdrop-filter:blur(8px);
        -webkit-backdrop-filter:blur(8px);
        cursor:pointer;
      }
      .safe-lang-toggle:active{transform:scale(.97);}
    `;
    document.head.appendChild(style);

    const button=document.createElement('button');
    button.type='button';
    button.id='safeLangToggle';
    button.className='safe-lang-toggle';
    button.textContent=currentLanguage==='en'?'🌐 한국어':'🌐 EN';
    button.setAttribute('aria-label',currentLanguage==='en'?'Switch to Korean':'Switch to English');
    button.addEventListener('click',function(event){
      event.preventDefault();
      event.stopPropagation();
      window.setSafeWalkLanguage(currentLanguage==='en'?'ko':'en');
    });

    intro.appendChild(button);
  }

  function installObserver(){
    if(currentLanguage!=='en')return;

    const observer=new MutationObserver((mutations)=>{
      for(const mutation of mutations){
        if(mutation.type==='characterData'){
          translateNode(mutation.target);
          continue;
        }

        if(mutation.type==='attributes'){
          translateAttribute(mutation.target,mutation.attributeName);
          continue;
        }

        mutation.addedNodes.forEach(translateNode);
      }
    });

    observer.observe(document.body,{
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true,
      attributeFilter:['placeholder','aria-label','title']
    });
  }

  function boot(){
    injectLanguageToggle();

    if(currentLanguage==='en'){
      applyEnglishStatic();
      installObserver();
    }else{
      document.documentElement.lang='ko';
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();

