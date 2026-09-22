/* ============================================================
   SafeWalk English hotfix v1.2 — 2026-09-22

   목적
   1) 영어 모드에서 경로 결과/타이머/안내/토스트 등
      실행 중 동적으로 생성되는 한글 UI까지 영어로 변환
   2) 영어 목적지 검색 시
      AI 한국어 검색어 후보 -> VWorld 실제 검증 순서를 우선 적용
   3) AI 채팅 요청에 현재 UI 언어(ko/en)를 명시적으로 전달
   4) 여성·청소년 카드의 표시 구조를 안정적으로 통일

   중요
   - AI가 만든 장소명 후보를 목적지로 확정하지 않음
   - 최종 장소명/주소/좌표는 VWorld 실제 검색 결과만 사용
   - 기존 한국어 모드의 지도/GPS/경로/점수 로직은 변경하지 않음
   ============================================================ */

(function(){
  'use strict';

  function isEnglish(){
    try{
      return typeof getSafeWalkLanguage==='function'
        ? getSafeWalkLanguage()==='en'
        : localStorage.getItem('safewalk_lang')==='en';
    }catch(error){
      return false;
    }
  }

  const EXACT_EN = new Map(Object.entries({
    /* 사용자 유형 / 상단 */
    '👴 노인':'👴 Senior',
    '노인':'Senior',
    '어린이':'Child',
    '여성·청소년':'Women · Youth',
    '포항시':'Pohang',
    '포항시 북구':'Buk-gu, Pohang',
    '포항시 남구':'Nam-gu, Pohang',

    /* 지도 확대 안내 */
    '🔍 지도를 조금 더 확대하면 안전시설이 표시됩니다':'🔍 Zoom in a little more to display safety facilities',

    /* 경로 패널 */
    '🚶 보행 경로 · 시설 접근성':'🚶 Walking route · Infrastructure accessibility',
    '🚶 보행 경로 · 시설 접근성 평가':'🚶 Walking route · Infrastructure accessibility',
    '보행 경로를 조회한 뒤 경로 주변의 안전시설 접근성을 계산합니다.':'After finding the walking route, SafeWalk evaluates access to nearby safety infrastructure.',
    '목적지를 선택하면 보행 경로와 시설 접근성을 계산합니다.':'Select a destination to calculate a walking route and infrastructure accessibility.',
    '보행 경로를 우선 안내하고, 경로 주변 안전시설 접근성을 점수화합니다.':'SafeWalk first provides a walking route, then evaluates access to nearby safety infrastructure.',
    '직선거리 참고 · 보행 안내 및 점수 산출 불가':'Straight-line reference only · Walking guidance and score unavailable',
    '안전시설 조회 실패 · 시설 접근성 측정 불가':'Safety-facility lookup failed · Infrastructure accessibility unavailable',
    '도로망 경로를 확인하지 못해 거리에는 두 지점 사이의 직선거리만 표시합니다. 네트워크 상태를 확인하고 길찾기를 다시 실행해 주세요.':'The walking-road route could not be confirmed, so only the straight-line distance is shown. Check your network and try directions again.',
    '⚠️ 생활안전지도 시설 조회에 모두 실패해 시설 접근성을 계산할 수 없습니다.':'⚠️ SafeMap facility lookups failed, so infrastructure accessibility cannot be calculated.',
    '네트워크 상태를 확인한 뒤 길찾기를 다시 실행해 주세요.':'Check your network connection and try directions again.',
    '점수가 없는 것은 "주변에 시설이 없다"는 뜻이 아니라 "확인하지 못했다"는 뜻입니다.':'No score means the facilities could not be verified; it does not mean that no facilities exist nearby.',
    '기본점수와 거리 보정은 더하지 않습니다. 정상 조회 결과 시설이 0건이면 0점입니다.':'No base score or short-distance bonus is added. If a successful lookup finds no facilities, the score is 0.',
    '우선순위별 상한: 치안시설 17점(1순위) · CCTV 11점 / 안전비상벨 11점(2순위) · 어린이안전지킴이집 6점(3순위)':'Maximum contribution: police facilities 17 pts (Priority 1) · CCTV 11 pts / emergency bells 11 pts (Priority 2) · Child Safety Houses 6 pts (Priority 3)',
    '시설은 경로에서 30m·60m·100m·150m 이내에 따라 100%·75%·40%·15%로 차등 반영합니다.':'Facilities contribute 100% / 75% / 40% / 15% when they are within 30 m / 60 m / 100 m / 150 m of the route.',
    '점수는 레이어 표시 여부와 무관하게 조회된 시설 전체를 기준으로 계산합니다.':'The score uses all retrieved facilities regardless of whether their map layers are visible.',
    '⚠️ 일부 시설 조회에 실패해 실제보다 낮게 계산되었을 수 있습니다.':'⚠️ Some facility lookups failed, so the score may be lower than it would be with complete data.',
    '⚠️ 조회 건수 제한으로 일부 시설만 반영되었습니다.':'⚠️ Only some facilities were included because of the lookup-result limit.',
    '모든 이용자 유형에 같은 시설 가중치를 적용합니다. 범죄주의구간·즐겨찾기는 점수에 포함되지 않습니다. 공공데이터 기반 참고값이며 실제 안전이나 범죄 위험을 예측하지 않습니다.':'The same facility weights are used for all user types. Crime-caution areas and favorites are not included in the score. This is a public-data-based reference indicator and does not predict actual safety or crime risk.',
    '🧭 경로 계산 중':'🧭 Calculating route',
    '보행 경로를 한 번 호출한 뒤 경로 주변 안전시설을 분석합니다.':'SafeWalk is calculating the walking route and then checking nearby safety infrastructure.',
    '계산 중':'Calculating...',
    '안전시설을 강제 경유하지 않으며, 완성된 보행 경로 주변 시설만 점수화합니다.':'SafeWalk does not force detours through facilities; it scores facilities near the completed walking route.',
    '보행 경로와 안전시설을 분석하고 있습니다.':'Analyzing the walking route and nearby safety infrastructure.',

    /* 상세 / 안내 */
    '상세 점수 보기':'View score details',
    '상세 점수 접기':'Hide score details',
    '🚶 안내 시작':'🚶 Start guidance',
    '보행 안내 시작':'Start walking guidance',
    '■ 안내 종료':'■ End guidance',
    '안내 종료':'End guidance',
    '경로 재계산 중...':'Recalculating route...',
    '현재 위치 기준 경로 재계산 중':'Recalculating from current location',
    '🚶 안전 경로 안내 중':'🚶 Walking guidance active',
    '현재 위치를 따라가며 남은 거리와 예상 시간을 안내합니다.':'Guidance follows your current location and shows remaining distance and estimated time.',
    '길찾기 취소':'Cancel directions',
    '현재 길찾기 종료':'End current directions',
    '경로 정보 접기':'Hide route details',
    '경로는 지도에 그대로 유지됩니다.':'The route remains on the map.',
    '길찾기를 종료했습니다.':'Directions ended.',

    /* 타이머 */
    '도착했어요':'I arrived',
    '✅ 무사 도착을 확인했습니다. 안심 타이머를 종료합니다.':'✅ Arrival confirmed. The safety timer has ended.',

    /* 검색 */
    '검색 중입니다...':'Searching...',
    '두 글자 이상 입력해 주세요.':'Enter at least two characters.',
    '출발지·도착지가 모두 지정되었습니다. 길찾기를 시작하세요.':'Origin and destination are set. Start directions when ready.',
    '검색 결과가 없습니다. 도로명주소나 정확한 시설명으로 다시 시도하거나, 지도에서 직접 선택하세요.':'No verified result was found. Try a more specific place/address or select the destination on the map.',
    '검색 서버에 연결하지 못했습니다. VWorld 키와 서비스 URL을 확인해 주세요.':'Could not connect to the place-search service. Please try again later.',

    /* 시설 */
    '치안시설':'Police facility',
    '안전비상벨':'Emergency bell',
    '아동안전지킴이집':'Child Safety House',
    '어린이안전지킴이집':'Child Safety House',
    '직선거리':'Straight-line distance',
    '주소':'Address',
    '지도에서 보기':'View on map',
    '여기로 길찾기':'Directions here'
  }));

  const FACILITY_EN={
    '치안시설':'Police facility',
    'CCTV':'CCTV',
    '안전비상벨':'Emergency bell',
    '아동안전지킴이집':'Child Safety House',
    '어린이안전지킴이집':'Child Safety House'
  };

  function translateDynamic(rawValue){
    const raw=String(rawValue||'');
    const text=raw.trim();
    if(!text)return raw;

    if(EXACT_EN.has(text)){
      return raw.replace(text,EXACT_EN.get(text));
    }

    let m;

    /* 상단 사용자 유형 */
    m=text.match(/^([👴🧒👩🧍‍♂️🧍‍♀️]?\s*)(어린이|여성·청소년|노인)$/);
    if(m){
      return raw.replace(text,m[1]+({
        '어린이':'Child',
        '여성·청소년':'Women · Youth',
        '노인':'Senior'
      }[m[2]]||m[2]));
    }

    /* CCTV 확대 문구 */
    m=text.match(/^🔍?\s*확대 필요\s*[—-]\s*(.+)$/);
    if(m){
      let tail=m[1]
        .replace(/이 지역 시설 밀집/g,'dense facility area')
        .replace(/이 지역 시설이 많음/g,'many facilities in this area');
      return raw.replace(text,'🔍 Zoom in — '+tail);
    }

    /* 시간 */
    m=text.match(/^약\s*(\d+)\s*분$/);
    if(m)return raw.replace(text,'Approx. '+m[1]+' min');

    m=text.match(/^약\s*(\d+)\s*시간\s*(\d+)\s*분$/);
    if(m)return raw.replace(text,'Approx. '+m[1]+' hr '+m[2]+' min');

    m=text.match(/^약\s*(\d+)\s*시간$/);
    if(m)return raw.replace(text,'Approx. '+m[1]+' hr');

    /* 점수 */
    m=text.match(/^(\d+(?:\.\d+)?)점$/);
    if(m)return raw.replace(text,m[1]+' pts');

    m=text.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)점$/);
    if(m)return raw.replace(text,m[1]+'/'+m[2]+' pts');

    /* 경로 모바일 요약 */
    m=text.match(/^시설\s*(\d+)건\s*·\s*접근성\s*(\d+(?:\.\d+)?)\/100점(.*)$/);
    if(m){
      const suffix=m[3].includes('일부 자료만 반영')
        ?' · partial data'
        :'';
      return raw.replace(
        text,
        'Facilities '+m[1]+' · Accessibility '+m[2]+'/100'+suffix
      );
    }

    /* 상세 시설 pill */
    m=text.match(/^(.+?)\s+(\d)순위\s*·\s*(\d+)개\s*·\s*(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)점$/);
    if(m){
      let label=m[1];
      let icon='';
      const iconMatch=label.match(/^([^\p{L}\p{N}]+)\s*(.+)$/u);
      if(iconMatch){
        icon=iconMatch[1].trim();
        label=iconMatch[2].trim();
      }
      const facility=FACILITY_EN[label]||label;
      return raw.replace(
        text,
        (icon?icon+' ':'')+
        facility+
        ' · Priority '+m[2]+
        ' · '+m[3]+' found'+
        ' · '+m[4]+'/'+m[5]+' pts'
      );
    }

    /* 상세 설명 */
    m=text.match(/^시설 접근성 원점수\s*(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)점을\s*100점 만점으로 환산합니다\.$/);
    if(m){
      return raw.replace(
        text,
        'Raw infrastructure score '+m[1]+'/'+m[2]+' is converted to a 100-point scale.'
      );
    }

    /* 안심 타이머 */
    m=text.match(/^🕒\s*안심 타이머 시작\s*\((\d+)분 안에 도착 확인\)$/);
    if(m){
      return raw.replace(
        text,
        '🕒 Start safety timer (confirm arrival within '+m[1]+' min)'
      );
    }

    m=text.match(/^🕒\s*안심 타이머 시작\.\s*도착하면 상단의 "도착했어요"를 눌러 주세요\.$/);
    if(m){
      return raw.replace(
        text,
        '🕒 Safety timer started. Tap “I arrived” at the top when you reach your destination.'
      );
    }

    /* 경로/보행 경고 */
    m=text.match(/^⚠️?\s*검색 지점과 실제 보행로 진입점이 떨어져 있습니다\s*[—-]\s*(.+?)\s*\(OpenStreetMap에 보행로가 없는 구간일 수 있습니다\)$/);
    if(m){
      return raw.replace(
        text,
        '⚠️ The searched point is separated from the mapped walking-network entry point — '+
        m[1]+
        ' (OpenStreetMap may not contain a walkable segment here)'
      );
    }

    /* 완료 toast */
    m=text.match(/^✅ 경로 계산 완료 · 경로 주변 시설\s*(\d+)건을 반영했습니다\./);
    if(m){
      return raw
        .replace(/✅ 경로 계산 완료 · 경로 주변 시설\s*\d+건을 반영했습니다\./,
          '✅ Route calculation complete · '+m[1]+' nearby facilities included.')
        .replace(/뒤로가기·X를 눌러도 경로는 유지됩니다\. 메인 화면에서도 같은 이용자 유형으로 다시 들어오면 경로가 복원됩니다\./,
          'The route remains when you press Back or X and can be restored when you return to the same user type.')
        .replace(/종료하려면 '길찾기 취소'를 눌러주세요\./,
          'To end it, select “Cancel directions”.');
    }

    /* 안내 진행 */
    m=text.match(/^📍 현재 위치를 따라 안내 중 · 남은 거리\s*(.+)$/);
    if(m){
      return raw.replace(text,'📍 Following your location · Remaining distance '+m[1]);
    }

    m=text.match(/^⚠️ 현재 위치가 안내 경로에서 약\s*(\d+)m 벗어나 있습니다\.$/);
    if(m){
      return raw.replace(text,'⚠️ Your current position is about '+m[1]+' m off the guidance route.');
    }

    /* 출발지/목적지 메시지 */
    if(text==='출발지와 도착지를 모두 지정해 주세요.'){
      return raw.replace(text,'Set both an origin and a destination.');
    }
    if(text==='먼저 목적지를 설정해 경로를 계산해 주세요.'){
      return raw.replace(text,'Set a destination and calculate a route first.');
    }
    if(text==='현재 위치를 확인한 뒤 안내를 시작해 주세요.'){
      return raw.replace(text,'Confirm your current location before starting guidance.');
    }
    if(text==='경로 정보를 확인하지 못했습니다. 경로를 다시 계산해 주세요.'){
      return raw.replace(text,'Route information could not be confirmed. Please calculate the route again.');
    }

    return raw;
  }

  function translateNode(node){
    if(!isEnglish()||!node)return;

    if(node.nodeType===Node.TEXT_NODE){
      const parent=node.parentElement;
      if(!parent)return;
      if(parent.closest('script,style,textarea,input,option'))return;

      const next=translateDynamic(node.nodeValue);
      if(next!==node.nodeValue){
        node.nodeValue=next;
      }
      return;
    }

    if(node.nodeType!==Node.ELEMENT_NODE)return;

    node.childNodes.forEach(translateNode);
  }

  function translateWholePage(){
    if(!isEnglish()||!document.body)return;
    translateNode(document.body);
  }

  /* ----------------------------------------------------------
     여성·청소년 카드 구조를 현재 설계로 강제 통일
     ---------------------------------------------------------- */
  function normalizeYouthCard(){
    const card=document.querySelector('.age-card[data-group="youth"]');
    if(!card)return;

    card.innerHTML=
      '<span class="age-icon youth-mix" aria-label="'+
      (isEnglish()?'Women and youth':'여성과 남녀 청소년')+
      '">'+
        '<span aria-hidden="true">👩</span>'+
        '<span aria-hidden="true">🧍‍♂️</span>'+
        '<span aria-hidden="true">🧍‍♀️</span>'+
      '</span>'+
      '<span class="age-name">'+
      (isEnglish()?'Women · Youth':'여성·청소년')+
      '</span>'+
      '<span class="age-desc" aria-hidden="true">&nbsp;<br>&nbsp;</span>';
  }

  /* ----------------------------------------------------------
     영어 검색:
     영문 입력이면 AI 정규화를 먼저 시도한 뒤 VWorld로 검증.
     AI 후보 문자열 자체는 절대 결과로 사용하지 않는다.
     ---------------------------------------------------------- */
  function installEnglishSearchFix(){
    if(
      typeof requestVworldSearch!=='function' ||
      typeof requestVworldSearchCore!=='function'
    ){
      return;
    }

    requestVworldSearch=async function(query,type){
      const q=String(query||'').trim();
      const hasLatin=/[A-Za-z]/.test(q);

      /*
        영어 모드 + 영문/로마자:
        1) AI가 한국어 검색어 후보 생성
        2) 후보를 VWorld에서 실제 검색
        3) VWorld 결과가 있을 때만 반환
      */
      if(isEnglish()&&hasLatin){
        let candidates=[];

        try{
          if(typeof setSearchMsg==='function'){
            setSearchMsg('Translating and verifying the place...');
          }

          if(typeof requestSafeWalkPlaceCandidates==='function'){
            candidates=await requestSafeWalkPlaceCandidates(q);
          }

          console.info('[SafeWalk EN search] normalized candidates:',q,candidates);
        }catch(error){
          console.warn('[SafeWalk EN search] normalization failed:',error);
        }

        for(const candidate of candidates){
          if(!candidate)continue;

          try{
            const items=await requestVworldSearchCore(candidate,type);

            console.info(
              '[SafeWalk EN search] VWorld verification:',
              candidate,
              items.length
            );

            if(items.length){
              return items.map(item=>({
                ...item,
                originalQuery:q,
                verifiedQuery:candidate,
                verifiedBy:'vworld'
              }));
            }
          }catch(error){
            console.warn(
              '[SafeWalk EN search] VWorld candidate failed:',
              candidate,
              error
            );
          }
        }

        /*
          AI 서비스가 잠시 실패해도 검색 UI 전체가 죽지 않도록
          원문 VWorld 검색을 마지막 fallback으로 사용.
        */
        try{
          return await requestVworldSearchCore(q,type);
        }catch(error){
          console.warn('[SafeWalk EN search] direct fallback failed:',error);
          return [];
        }
      }

      /*
        한국어 모드 / 한국어 검색어:
        기존 VWorld 동작 유지.
        단, VWorld 오류가 UI 전체를 깨지 않도록 빈 결과로 처리.
      */
      try{
        return await requestVworldSearchCore(q,type);
      }catch(error){
        console.warn('[SafeWalk search] VWorld request failed:',error);
        return [];
      }
    };
  }

  /* ----------------------------------------------------------
     AI 채팅에 UI 언어를 명시적으로 전달.
     기존 chat-agent.js는 language 필드가 없어서
     영어 모드임에도 모델이 한국어를 선택할 수 있었음.
     ---------------------------------------------------------- */
  function installAgentLanguageFix(){
    if(
      typeof safeWalkAgentCallWorker!=='function' ||
      typeof safeWalkAgentGetHistory!=='function' ||
      typeof getSafeWalkChatContext!=='function'
    ){
      return;
    }

    safeWalkAgentCallWorker=async function(message,signal){
      const response=await fetch(
        CHAT_API_URL,
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            message,
            history:safeWalkAgentGetHistory(),
            context:getSafeWalkChatContext(),
            language:isEnglish()?'en':'ko'
          }),
          signal
        }
      );

      const raw=await response.text();
      let data;

      try{
        data=JSON.parse(raw);
      }catch(error){
        throw new Error(
          isEnglish()
            ?'The AI server returned an invalid response.'
            :'AI 서버가 올바른 JSON을 반환하지 않았습니다.'
        );
      }

      if(
        !response.ok ||
        !data ||
        data.ok!==true
      ){
        throw new Error(
          data?.error ||
          (
            (isEnglish()?'AI request failed: HTTP ':'AI 요청 실패: HTTP ')+
            response.status
          )
        );
      }

      if(typeof data.answer==='string'){
        data.answer=data.answer
          .replace(
            /<(think|analysis|reasoning)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,
            ''
          )
          .trim();
      }

      if(
        !data.action ||
        !['none','route','facility'].includes(data.action.type)
      ){
        throw new Error(
          isEnglish()
            ?'The AI returned an invalid action.'
            :'AI 명령 형식이 올바르지 않습니다.'
        );
      }

      if(
        data.action.type==='none' &&
        (
          typeof data.answer!=='string' ||
          !data.answer
        )
      ){
        throw new Error(
          isEnglish()
            ?'No AI response was returned.'
            :'AI 답변을 확인하지 못했습니다.'
        );
      }

      return data;
    };
  }

  /* ----------------------------------------------------------
     동적 UI 감시
     ---------------------------------------------------------- */
  function installTranslationObserver(){
    if(!isEnglish()||!document.body)return;

    const observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        if(mutation.type==='characterData'){
          translateNode(mutation.target);
          continue;
        }

        mutation.addedNodes.forEach(translateNode);
      }
    });

    observer.observe(document.body,{
      childList:true,
      subtree:true,
      characterData:true
    });
  }

  function boot(){
    normalizeYouthCard();
    installEnglishSearchFix();
    installAgentLanguageFix();

    if(isEnglish()){
      translateWholePage();
      installTranslationObserver();

      /* 다른 SafeWalk 초기화 함수가 직후 DOM을 다시 쓰는 경우 한 번 더 보정 */
      setTimeout(translateWholePage,100);
      setTimeout(translateWholePage,700);
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',boot,{once:true});
  }else{
    boot();
  }
})();
