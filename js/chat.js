/* ============================================================
   SafeWalk v2.0 — chat.js
   AI 안전 도우미(Cloudflare Workers AI) + 자연어 길찾기.

   자연어 길찾기 원칙: AI가 좌표를 만들지 않는다.
   1) 브라우저에서 길찾기 문장을 판별(정규식)
   2) 놓친 표현은 Workers AI function calling으로 한 번 더 판별
   3) VWorld에서 실제 장소 후보 검색
   4) 사용자가 후보와 최종 경로를 직접 확인한 뒤에만 실행

   [v2 개선]
   - "지금까지 ~" 같은 시간 표현이 길찾기로 오인되지 않도록 차단어 보강
   - "장미마을"처럼 '을'로 끝나는 지명이 조사 제거로 깨졌을 때
     원래 이름으로 한 번 더 검색(대체 검색어)
   ============================================================ */

let chatBusy=false;
let chatTypingRow=null;
let chatRouteFlow=null;
let chatRouteRequestToken=0;

/* ── 패널 열고 닫기 ── */
function toggleChatPanel(){
  const panel=document.getElementById('chatPanel');
  if(!panel)return;
  if(panel.classList.contains('show'))closeChatPanel();
  else openChatPanel();
}

function openChatPanel(){
  const panel=document.getElementById('chatPanel');
  const fab=document.getElementById('chatFab');
  if(!panel)return;

  closeSearchPanel();
  document.body.classList.add('chat-open');
  panel.classList.add('show');

  if(fab){
    fab.classList.add('open');
    fab.setAttribute('aria-expanded','true');
  }

  /* 패널을 여는 것만으로 모바일 키보드를 강제로 띄우지 않는다. */
  setTimeout(()=>{
    scrollChatToBottom();
    syncViewportChrome();
  },80);
}

function closeChatPanel(){
  const panel=document.getElementById('chatPanel');
  const fab=document.getElementById('chatFab');
  const input=document.getElementById('chatInput');

  if(panel)panel.classList.remove('show');
  document.body.classList.remove('chat-open');

  if(input&&document.activeElement===input)input.blur();

  if(fab){
    fab.classList.remove('open');
    fab.setAttribute('aria-expanded','false');
  }

  requestAnimationFrame(syncViewportChrome);
}

function scrollChatToBottom(){
  const box=document.getElementById('chatMessages');
  if(box)box.scrollTop=box.scrollHeight;
}

function appendChatMessage(role,text,isError=false){
  const box=document.getElementById('chatMessages');
  if(!box)return null;

  const row=document.createElement('div');
  row.className='chat-row '+(role==='user'?'user':'bot');

  const bubble=document.createElement('div');
  bubble.className='chat-bubble'+(isError?' error':'');
  bubble.textContent=String(text||'');

  row.appendChild(bubble);
  box.appendChild(row);
  scrollChatToBottom();
  return row;
}

function showChatTyping(){
  const box=document.getElementById('chatMessages');
  if(!box)return;
  hideChatTyping();

  const row=document.createElement('div');
  row.className='chat-row bot';

  const bubble=document.createElement('div');
  bubble.className='chat-bubble';

  const typing=document.createElement('span');
  typing.className='chat-typing';
  typing.setAttribute('aria-label','AI가 답변을 작성하고 있습니다');
  typing.innerHTML='<span></span><span></span><span></span>';

  bubble.appendChild(typing);
  row.appendChild(bubble);
  box.appendChild(row);
  chatTypingRow=row;
  scrollChatToBottom();
}

function hideChatTyping(){
  if(chatTypingRow&&chatTypingRow.parentNode){
    chatTypingRow.parentNode.removeChild(chatTypingRow);
  }
  chatTypingRow=null;
}

function getSafeWalkChatContext(){
  const context={
    service:'SafeWalk',
    selectedGroup:grp&&GROUP[grp]?GROUP[grp].label:null,
    currentArea:(document.getElementById('locTxt')?.textContent||'').trim()||null
  };

  const routePanel=document.getElementById('routePanel');
  const routeVisible=Boolean(routePanel&&routePanel.classList.contains('show'));

  if(routeVisible){
    context.route={
      origin:routeOrigin?routeOrigin.label:null,
      destination:routeDest?routeDest.label:null,
      distance:(document.getElementById('routeDistance')?.textContent||'').trim()||null,
      duration:(document.getElementById('routeDuration')?.textContent||'').trim()||null,
      safetyScore:(document.getElementById('routeScore')?.textContent||'').trim()||null,
      summary:(document.getElementById('routeMobileSummary')?.textContent||'').trim()||null
    };
  }else{
    context.route=null;
  }

  return context;
}

/* ── 자연어 길찾기: 문장 정리 ── */
function normalizeChatRouteText(value){
  return String(value||'')
    .replace(/[\r\n\t]+/g,' ')
    .replace(/\s+/g,' ')
    .replace(/[.!?。！？]+$/g,'')
    .trim();
}

/* keepObjectParticle=true면 끝의 '을/를'을 제거하지 않는다.
   ('장미마을'처럼 을로 끝나는 지명 보존용 대체 검색어를 만들 때 사용) */
function cleanChatPlaceQuery(value,keepObjectParticle=false){
  let text=normalizeChatRouteText(value);

  text=text
    /* 대화형 머리말과 슬롯 명칭 제거 */
    .replace(/^(?:혹시|저기|AI야|에이아이야|세이프워크야|SafeWalk야)\s*[,，]?\s*/i,'')
    .replace(/^(?:출발지는?|출발지|출발|도착지는?|도착지|목적지는?|목적지)\s*[:：은는]?\s*/,'')

    /* 문장 뒤에 붙은 길찾기 표현 제거 */
    .replace(/\s*(?:까지)?\s*(?:가는\s*길(?:을)?|가는\s*법|가려는\s*길|보행\s*경로|도보\s*경로|안전\s*경로|길\s*찾기|길찾기|길\s*안내|경로)\s*(?:좀\s*)?(?:알려\s*줘|알려주세요|보여\s*줘|보여주세요|안내해\s*줘|안내해 주세요|찾아\s*줘|찾아주세요)?$/,'')
    .replace(/\s*(?:안내해\s*(?:줘|주세요)|안내해줘|안내해주세요|길\s*찾기해\s*(?:줘|주세요)|길찾기해\s*(?:줘|주세요)|가\s*(?:줘|주세요)|가줘|가주세요|데려다\s*(?:줘|주세요)|데려다줘|데려다주세요|가고\s*싶(?:어|다|어요)|가자|갈래|어떻게\s*(?:가|가지|가요)|찾아\s*(?:줘|주세요)|보여\s*(?:줘|주세요)|찍어\s*(?:줘|주세요)|설정해\s*(?:줘|주세요)|부탁해|부탁합니다)$/,'')

    /* 검색어에 불필요한 도착 조사 제거 */
    .replace(/\s*까지$/,'');

  if(!keepObjectParticle){
    text=text.replace(/\s*(?:을|를)$/,'');
  }

  text=text
    .replace(/^['\"“”‘’]+|['\"“”‘’]+$/g,'')
    .trim();

  return text;
}

function isCurrentLocationPhrase(value){
  const text=normalizeChatRouteText(value)
    .replace(/^(?:출발지는?|출발지|출발)\s*[:：은는]?\s*/,'')
    .replace(/(?:에서|서|부터)$/,'')
    .replace(/\s+/g,'');

  return /^(?:현재위치|내위치|나의위치|여기|이곳|지금여기|지금위치|현위치|내가있는곳|지금있는곳|내자리|이자리)$/.test(text);
}

function isRouteHelpQuestion(text){
  const compact=normalizeChatRouteText(text);

  /* 기능 사용법 질문은 실제 장소 길찾기로 오인하지 않는다. */
  return /(?:길\s*찾기|길\s*안내|도보\s*경로|보행\s*경로).*(?:사용법|사용\s*방법|어떻게\s*사용|기능|설명|뭐야|무엇|알려\s*줘)/.test(compact)
    || /(?:사용법|사용\s*방법|기능).*(?:길\s*찾기|길\s*안내)/.test(compact);
}

function isInvalidChatPlaceQuery(value){
  const text=cleanChatPlaceQuery(value).replace(/\s+/g,'');
  if(text.length<2)return true;

  /* 시간·거리 질문을 장소명으로 오인하지 않는다.
     v2: '지금까지', '오늘까지' 같은 시간 표현 차단어 보강 */
  return /^(?:몇시|언제|어디|어디쯤|어느정도|얼마나|몇분|몇시간|몇킬로|몇키로|여기까지|거기까지|지금|방금|아까|오늘|어제|내일|이제|현재|여태|이때|그때)$/.test(text);
}

function isBareFromToRoutePhrase(originRaw,destinationRaw){
  const origin=cleanChatPlaceQuery(originRaw);
  const destination=cleanChatPlaceQuery(destinationRaw);

  if(isInvalidChatPlaceQuery(origin)||isInvalidChatPlaceQuery(destination)){
    return false;
  }

  /*
    "A에서 B"처럼 이동 동사가 생략된 짧은 표현을 길찾기로 처리한다.
    다만 "학교에서 수업 진행", "경찰서에서 회의 개최"처럼
    장소 뒤에 활동·서술 내용이 오는 문장은 길찾기로 오인하지 않는다.
  */
  const destinationCompact=destination.replace(/\s+/g,'');

  const nonRoutePredicate=
    /(?:개발|진행|운영|근무|재학|수업|공부|회의|행사|대회|발표|촬영|교육|연구|실험|조사|분석|생활|식사|약속|만남|사고|발생|개최|실시|참여|활동|작업|업무|공연|전시|축제|훈련|연습|했다|합니다|한다|하는중|중이다|있다|없다|열렸다|만들었다|배웠다|봤다|먹었다|일했다)$/;

  if(nonRoutePredicate.test(destinationCompact)){
    return false;
  }

  /*
    두 장소명이 지나치게 길면 일반 문장일 가능성이 높으므로
    AI 판별 단계로 넘긴다.
  */
  if(origin.length>45||destination.length>45){
    return false;
  }

  return true;
}

function makeParsedChatRoute(originRaw,destinationRaw,originalMessage){
  const originText=cleanChatPlaceQuery(originRaw);
  const destinationQuery=cleanChatPlaceQuery(destinationRaw);

  if(isInvalidChatPlaceQuery(destinationQuery))return null;

  const current=isCurrentLocationPhrase(originText);
  if(!current&&isInvalidChatPlaceQuery(originText))return null;

  return {
    originType:current?'current':'query',
    originQuery:current?'':originText,
    originQueryAlt:current?'':cleanChatPlaceQuery(originRaw,true),
    destinationQuery,
    destinationQueryAlt:cleanChatPlaceQuery(destinationRaw,true),
    originalMessage
  };
}

function makeCurrentOriginChatRoute(destinationRaw,originalMessage){
  const destinationQuery=cleanChatPlaceQuery(destinationRaw);
  if(isInvalidChatPlaceQuery(destinationQuery))return null;

  return {
    originType:'current',
    originQuery:'',
    originQueryAlt:'',
    destinationQuery,
    destinationQueryAlt:cleanChatPlaceQuery(destinationRaw,true),
    originalMessage
  };
}

function parseChatRouteCommand(message){
  let text=normalizeChatRouteText(message);
  if(!text)return null;

  text=text
    .replace(/^(?:혹시|저기|AI야|에이아이야|세이프워크야|SafeWalk야)\s*[,，]?\s*/i,'')
    .replace(/\s*(?:좀|한번|한\s*번|부탁해|부탁합니다)\s*$/,'')
    .trim();

  if(!text||isRouteHelpQuestion(text))return null;

  const routeIntent=/(?:까지|가는\s*길|가는\s*법|가려는\s*길|가려면|길\s*찾기|길찾기|길\s*안내|안내|데려다|도보\s*경로|보행\s*경로|안전\s*경로|어떻게\s*(?:가|가지)|가고\s*싶|가자|가보자|가볼래|갈래|가야\s*(?:해|돼)|갈\s*거(?:야|예요)|가려고|가려\s*(?:해|한다)|가면\s*(?:돼|되나요)|갈\s*수\s*(?:있어|있나요|있나)|가\s*(?:줘|주세요)|찾아\s*(?:줘|주세요)|경로\s*(?:보여|찾아)|목적지(?:로)?\s*(?:설정|찍어)|출발|도착|이동)/.test(text);

  let match;
  let command;

  /* 출발지: A / 목적지: B */
  match=text.match(/^(?:출발지는?|출발지|출발)\s*[:：은는]?\s*(.+?)\s*(?:,|\/|→|->|=>|그리고|에서)?\s*(?:도착지는?|도착지|목적지는?|목적지|도착)\s*[:：은는]?\s*(.+)$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* A 출발 / B 도착·목적지 */
  match=text.match(/^(.+?)\s*(?:에서\s*)?(?:출발|출발해서|출발하고)\s*[,，/]?\s*(.+?)\s*(?:도착|목적지)(?:\s*(?:으로|로))?(?:\s+.*)?$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* A를 출발해서 B로 간다 */
  match=text.match(/^(.+?)(?:을|를)?\s*출발(?:해서|하여|하고)?\s*(.+?)(?:으로|로)?\s*(?:가|간다|갈|가려|이동|도착)(?:\s+.*)?$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* A 찍고 B 가자 */
  match=text.match(/^(.+?)\s*(?:찍고|거쳐|경유해서)\s*(.+?)(?:으로|로)?\s*(?:가자|가보자|가볼래|가려고|가야\s*(?:해|돼)|가\s*(?:줘|주세요))$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* A 기준으로 B까지·B 가는 길 */
  match=text.match(/^(.+?)\s*(?:기준으로|기준)\s*(.+?)(?:까지|(?:으로|로)?\s*(?:가는\s*길|어떻게\s*가|가려면|가야\s*(?:해|돼)))$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* A → B / A -> B */
  match=text.match(/^(.+?)\s*(?:→|->|=>|⟶)\s*(.+)$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* 여기서/이곳에서/현재 위치에서 B: 일상적인 현재 위치 표현 */
  match=text.match(/^((?:현재\s*위치|내\s*위치|나의\s*위치|여기|이곳|지금\s*여기|지금\s*위치|현\s*위치|내가\s*있는\s*곳)(?:에서|서|부터))\s+(.+)$/);
  if(match&&routeIntent){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* A에서/부터 B까지: 뒤에 어떤 자연스러운 표현이 붙어도 처리 */
  match=text.match(/^(.+?)\s*(?:에서|부터)\s*(.+?)\s*까지(?:\s+.*)?$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* A에서/부터 B로: 방향만 말해도 두 장소 길찾기로 처리 */
  match=text.match(/^(.+?)\s*(?:에서|부터)\s*(.+?)(?:으로|로)$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* A에서/부터 B로 가자·어떻게 가·안내·길찾기 등 */
  match=text.match(/^(.+?)\s*(?:에서|부터)\s*(.+?)(?:으로|로)?\s*(?:가는\s*길|가는\s*법|가려면|어떻게\s*(?:가|가지|가요)|가고\s*싶(?:어|다|어요)|가자|가보자|가볼래|갈래|가야\s*(?:해|돼|합니다)|갈\s*거(?:야|예요)|가려고|가려\s*(?:해|한다)|가면\s*(?:돼|되나요)|갈\s*수\s*(?:있어|있나요|있나)|가\s*(?:줘|주세요)|길\s*찾기(?:해)?\s*(?:줘|주세요)?|길찾기(?:해)?\s*(?:줘|주세요)?|길\s*안내(?:해)?\s*(?:줘|주세요)?|안내해\s*(?:줘|주세요)|데려다\s*(?:줘|주세요)|도보\s*경로|보행\s*경로|안전\s*경로|경로\s*(?:보여\s*(?:줘|주세요)|찾아\s*(?:줘|주세요))|이동해\s*(?:줘|주세요)|찾아\s*(?:줘|주세요))$/);
  if(match){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /*
    A에서 B / A부터 B:
    이동 동사가 없어도 두 장소만 제시한 가장 일반적인 표현을 처리한다.
    예: "포항여고에서 포항장성고"
  */
  match=text.match(/^(.+?)\s*(?:에서|부터)\s*(.+)$/);
  if(
    match &&
    text.length<=100 &&
    (
      routeIntent ||
      isBareFromToRoutePhrase(match[1],match[2])
    )
  ){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* 현재 위치/여기서 B: '까지' 없이 말해도 처리 */
  match=text.match(/^((?:현재\s*위치|내\s*위치|나의\s*위치|여기|이곳|지금\s*여기|지금\s*위치|현\s*위치|내가\s*있는\s*곳)(?:에서|서|부터)?)\s+(.+)$/);
  if(match&&routeIntent){
    command=makeParsedChatRoute(match[1],match[2],text);
    if(command)return command;
  }

  /* B까지 / B까지만 입력해도 현재 위치 기준으로 처리 */
  match=text.match(/^(.+?)\s*까지(?:\s+.*)?$/);
  if(match){
    command=makeCurrentOriginChatRoute(match[1],text);
    if(command)return command;
  }

  /* B로 가자·B 가고 싶어·B 어떻게 가·B 가는 법 등 */
  match=text.match(/^(.+?)(?:으로|로)?\s*(?:가는\s*길|가는\s*법|가려면|어떻게\s*(?:가|가지|가요)|가고\s*싶(?:어|다|어요)|가자|가보자|가볼래|갈래|가야\s*(?:해|돼|합니다)|갈\s*거(?:야|예요)|가려고|가려\s*(?:해|한다)|가면\s*(?:돼|되나요)|갈\s*수\s*(?:있어|있나요|있나)|가\s*(?:줘|주세요)|길\s*찾기(?:해)?\s*(?:줘|주세요)?|길찾기(?:해)?\s*(?:줘|주세요)?|길\s*안내(?:해)?\s*(?:줘|주세요)?|안내해\s*(?:줘|주세요)|데려다\s*(?:줘|주세요)|도보\s*경로|보행\s*경로|안전\s*경로|경로\s*(?:보여\s*(?:줘|주세요)|찾아\s*(?:줘|주세요))|목적지(?:로)?\s*(?:설정|찍어)\s*(?:줘|주세요)|찾아\s*(?:줘|주세요))$/);
  if(match){
    command=makeCurrentOriginChatRoute(match[1],text);
    if(command)return command;
  }

  return null;
}

function normalizeWorkerRouteAction(action,originalMessage){
  if(!action||action.type!=='route')return null;

  const originType=
    action.originType==='current'
      ?'current'
      :'query';

  const originQuery=
    originType==='current'
      ?''
      :cleanChatPlaceQuery(action.originQuery);

  const destinationQuery=
    cleanChatPlaceQuery(action.destinationQuery);

  if(isInvalidChatPlaceQuery(destinationQuery))return null;
  if(
    originType==='query'&&
    isInvalidChatPlaceQuery(originQuery)
  )return null;

  return {
    originType,
    originQuery,
    originQueryAlt:originType==='current'?'':cleanChatPlaceQuery(action.originQuery,true),
    destinationQuery,
    destinationQueryAlt:cleanChatPlaceQuery(action.destinationQuery,true),
    originalMessage
  };
}

function disableOldChatRouteControls(){
  document.querySelectorAll('[data-chat-route-control="1"]').forEach(el=>{
    el.disabled=true;
  });
}

function makeChatRoutePlace(it){
  return {
    lat:Number(it.lat),
    lng:Number(it.lng),
    label:String(it.title||'검색 장소'),
    addr:String(it.addr||''),
    src:'ai-vworld-confirmed'
  };
}

function normalizeChatSearchValue(value){
  return String(value||'')
    .toLowerCase()
    .replace(/<[^>]*>/g,'')
    .replace(/[\s·ㆍ.,()\[\]{}'\"“”‘’\-_/]+/g,'')
    .trim();
}

function getChatCandidateRelevance(item,query){
  const q=normalizeChatSearchValue(query);
  const title=normalizeChatSearchValue(item&&item.title);
  const addr=normalizeChatSearchValue(item&&item.addr);
  if(!q)return 0;

  let score=0;
  if(title===q)score+=1200;
  else if(title.startsWith(q))score+=850;
  else if(title.includes(q))score+=650;
  else if(q.includes(title)&&title.length>=2)score+=420;

  if(addr.includes(q))score+=220;

  const words=String(query||'').trim().split(/\s+/).filter(word=>word.length>=2);
  words.forEach(word=>{
    const token=normalizeChatSearchValue(word);
    if(!token)return;
    if(title.includes(token))score+=100;
    if(addr.includes(token))score+=45;
  });

  return score;
}

async function searchChatRouteCandidates(query,referencePoint){
  const q=String(query||'').trim();
  if(q.length<2)return [];

  let placeItems=[];
  let addressItems=[];

  try{
    placeItems=await requestVworldSearch(q,'PLACE');
  }catch(error){
    console.warn('AI 길찾기 장소 검색 실패:',error);
  }

  /* 시설 검색 결과가 부족하면 주소 검색 결과도 합친다. */
  if(placeItems.length<CHAT_ROUTE_CANDIDATE_LIMIT){
    try{
      addressItems=await requestVworldSearch(q,'ADDRESS');
    }catch(error){
      console.warn('AI 길찾기 주소 검색 실패:',error);
    }
  }

  const seen=new Set();
  const items=[];

  [...placeItems,...addressItems].forEach(it=>{
    const key=[
      String(it.title||'').trim().toLowerCase(),
      String(it.addr||'').trim().toLowerCase(),
      Number(it.lat).toFixed(6),
      Number(it.lng).toFixed(6)
    ].join('|');
    if(seen.has(key))return;
    seen.add(key);

    const item={...it};
    item.relevanceScore=getChatCandidateRelevance(item,q);
    item.distanceM=(referencePoint&&Number.isFinite(referencePoint.lat)&&Number.isFinite(referencePoint.lng))
      ?distM(referencePoint.lat,referencePoint.lng,item.lat,item.lng)
      :null;
    items.push(item);
  });

  items.sort((a,b)=>{
    /* 장소명 일치도를 최우선으로 두고, 같은 수준일 때만 거리를 사용한다.
       사용자가 다른 지역에 있어도 정확히 입력한 출발지가 밀려나지 않는다. */
    const relevanceDiff=(b.relevanceScore||0)-(a.relevanceScore||0);
    if(relevanceDiff!==0)return relevanceDiff;

    const ad=Number.isFinite(a.distanceM)?a.distanceM:Number.POSITIVE_INFINITY;
    const bd=Number.isFinite(b.distanceM)?b.distanceM:Number.POSITIVE_INFINITY;
    return ad-bd;
  });

  return items.slice(0,CHAT_ROUTE_CANDIDATE_LIMIT);
}

function appendChatRouteBubble(){
  const box=document.getElementById('chatMessages');
  if(!box)return null;

  const row=document.createElement('div');
  row.className='chat-row bot';

  const bubble=document.createElement('div');
  bubble.className='chat-bubble chat-route-bubble';

  row.appendChild(bubble);
  box.appendChild(row);
  scrollChatToBottom();
  return bubble;
}

function appendChatRouteError(message){
  hideChatTyping();
  appendChatMessage('bot',message,true);
}

function appendChatPlaceCandidates(slot,query,items,referencePoint,token){
  const bubble=appendChatRouteBubble();
  if(!bubble)return;

  const lead=document.createElement('div');
  lead.className='chat-route-lead';
  lead.textContent='‘'+query+'’ '+(slot==='origin'?'출발지':'도착지')+' 검색 결과입니다.';
  bubble.appendChild(lead);

  const sub=document.createElement('div');
  sub.className='chat-route-sub';
  sub.textContent=referencePoint
    ?'주소와 기준 지점으로부터의 직선거리를 확인하고 정확한 장소를 선택해 주세요.'
    :'주소를 확인하고 정확한 장소를 선택해 주세요.';
  bubble.appendChild(sub);

  const list=document.createElement('div');
  list.className='chat-place-list';
  bubble.appendChild(list);

  items.forEach((it,index)=>{
    const card=document.createElement('button');
    card.type='button';
    card.className='chat-place-card';
    card.dataset.chatRouteControl='1';

    const idx=document.createElement('span');
    idx.className='chat-place-index';
    idx.textContent=String(index+1);

    const main=document.createElement('span');
    main.className='chat-place-main';

    const name=document.createElement('span');
    name.className='chat-place-name';
    name.textContent=String(it.title||'검색 장소');
    main.appendChild(name);

    const addr=document.createElement('span');
    addr.className='chat-place-addr';
    addr.textContent=String(it.addr||'주소 정보 없음');
    main.appendChild(addr);

    if(Number.isFinite(it.distanceM)){
      const distance=document.createElement('span');
      distance.className='chat-place-distance';
      distance.textContent='기준 지점에서 직선거리 약 '+formatDistance(it.distanceM);
      main.appendChild(distance);
    }

    const arrow=document.createElement('span');
    arrow.className='chat-place-arrow';
    arrow.textContent='›';

    card.append(idx,main,arrow);
    card.addEventListener('click',()=>selectChatRouteCandidate(slot,it,card,token));
    list.appendChild(card);
  });

  const hint=document.createElement('div');
  hint.className='chat-route-hint';
  hint.textContent='원하는 장소가 없다면 시·도 또는 구·군 이름을 포함해 다시 입력해 주세요.';
  bubble.appendChild(hint);

  const actions=document.createElement('div');
  actions.className='chat-route-actions';

  const cancel=document.createElement('button');
  cancel.type='button';
  cancel.className='chat-route-btn danger';
  cancel.dataset.chatRouteControl='1';
  cancel.textContent='길찾기 취소';
  cancel.addEventListener('click',()=>cancelChatRouteFlow(token));

  actions.appendChild(cancel);
  bubble.appendChild(actions);
  scrollChatToBottom();
}

/* 슬롯별 대체 검색어(조사 제거 전 원본) 가져오기 */
function getChatRouteAltQuery(slot){
  if(!chatRouteFlow||!chatRouteFlow.command)return '';
  return slot==='origin'
    ?String(chatRouteFlow.command.originQueryAlt||'')
    :String(chatRouteFlow.command.destinationQueryAlt||'');
}

async function loadChatRouteCandidates(slot,query,referencePoint,token){
  if(!chatRouteFlow||chatRouteFlow.token!==token)return;

  setChatBusy(true);
  showChatTyping();

  try{
    let usedQuery=query;
    let items=await searchChatRouteCandidates(query,referencePoint);
    if(!chatRouteFlow||chatRouteFlow.token!==token)return;

    /* 결과가 없으면 조사 제거 전 원본 이름으로 한 번 더 검색.
       예: '장미마' → 0건 → '장미마을'로 재시도 */
    if(!items.length){
      const alt=getChatRouteAltQuery(slot);
      if(alt&&alt!==query){
        items=await searchChatRouteCandidates(alt,referencePoint);
        if(!chatRouteFlow||chatRouteFlow.token!==token)return;
        if(items.length)usedQuery=alt;
      }
    }

    hideChatTyping();

    if(!items.length){
      appendChatRouteError(
        '‘'+query+'’의 장소 검색 결과를 찾지 못했습니다. 지역명과 시설명을 함께 입력해 주세요. 예: “현재 위치에서 포항시 포항역까지”'
      );
      chatRouteFlow=null;
      return;
    }

    appendChatPlaceCandidates(slot,usedQuery,items,referencePoint,token);
  }catch(error){
    console.error('AI 길찾기 후보 검색 오류:',error);
    if(chatRouteFlow&&chatRouteFlow.token===token){
      appendChatRouteError('장소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
      chatRouteFlow=null;
    }
  }finally{
    setChatBusy(false);
  }
}

async function selectChatRouteCandidate(slot,item,selectedCard,token){
  if(!chatRouteFlow||chatRouteFlow.token!==token)return;

  const controls=selectedCard.closest('.chat-route-bubble')?.querySelectorAll('[data-chat-route-control="1"]')||[];
  controls.forEach(el=>{el.disabled=true;});
  selectedCard.classList.add('selected');

  const place=makeChatRoutePlace(item);
  appendChatMessage(
    'user',
    (slot==='origin'?'출발지':'도착지')+' 선택: '+place.label+(place.addr?'\n'+place.addr:'')
  );

  if(slot==='origin'){
    chatRouteFlow.origin=place;
    await loadChatRouteCandidates(
      'destination',
      chatRouteFlow.command.destinationQuery,
      place,
      token
    );
    return;
  }

  chatRouteFlow.destination=place;
  appendChatRouteConfirmation(token);
}

function appendChatRouteConfirmation(token){
  if(!chatRouteFlow||chatRouteFlow.token!==token)return;
  const origin=chatRouteFlow.origin;
  const destination=chatRouteFlow.destination;
  if(!origin||!destination)return;

  const bubble=appendChatRouteBubble();
  if(!bubble)return;

  const lead=document.createElement('div');
  lead.className='chat-route-lead';
  lead.textContent='다음 출발지와 도착지가 맞습니까?';
  bubble.appendChild(lead);

  const summary=document.createElement('div');
  summary.className='chat-route-summary';

  const rows=[
    ['출발',origin.label+(origin.addr?' · '+origin.addr:'')],
    ['도착',destination.label+(destination.addr?' · '+destination.addr:'')]
  ];

  rows.forEach(([label,value])=>{
    const l=document.createElement('div');
    l.className='label';
    l.textContent=label;
    const v=document.createElement('div');
    v.className='value';
    v.textContent=value;
    summary.append(l,v);
  });
  bubble.appendChild(summary);

  const actions=document.createElement('div');
  actions.className='chat-route-actions';

  const start=document.createElement('button');
  start.type='button';
  start.className='chat-route-btn primary';
  start.dataset.chatRouteControl='1';
  start.textContent='이 경로로 길찾기';
  start.addEventListener('click',()=>confirmChatRoute(token));

  const retry=document.createElement('button');
  retry.type='button';
  retry.className='chat-route-btn secondary';
  retry.dataset.chatRouteControl='1';
  retry.textContent='다시 선택';
  retry.addEventListener('click',()=>restartChatRouteFlow(token));

  const cancel=document.createElement('button');
  cancel.type='button';
  cancel.className='chat-route-btn danger';
  cancel.dataset.chatRouteControl='1';
  cancel.textContent='취소';
  cancel.addEventListener('click',()=>cancelChatRouteFlow(token));

  actions.append(start,retry,cancel);
  bubble.appendChild(actions);
  scrollChatToBottom();
}

function restartChatRouteFlow(token){
  if(!chatRouteFlow||chatRouteFlow.token!==token)return;
  const command={...chatRouteFlow.command};
  disableOldChatRouteControls();
  appendChatMessage('user','장소를 다시 선택할게요.');
  beginChatRouteCommand(command);
}

function cancelChatRouteFlow(token){
  if(!chatRouteFlow||chatRouteFlow.token!==token)return;
  disableOldChatRouteControls();
  chatRouteRequestToken++;
  chatRouteFlow=null;
  setChatBusy(false);
  hideChatTyping();
  appendChatMessage('bot','길찾기 요청을 취소했습니다.');
}

async function confirmChatRoute(token){
  if(!chatRouteFlow||chatRouteFlow.token!==token)return;
  if(!map){
    appendChatRouteError('지도가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  if(grp==='cpted'){
    appendChatRouteError('CPTED 화면에서는 일반 보행 길찾기를 실행할 수 없습니다. 다른 이용자 유형의 안전지도로 이동한 뒤 다시 시도해 주세요.');
    return;
  }

  const origin={...chatRouteFlow.origin};
  const destination={...chatRouteFlow.destination};

  disableOldChatRouteControls();
  routeOrigin=origin;
  routeDest=destination;
  activeSlot='dest';
  updateSlotUI();

  chatRouteFlow=null;
  chatRouteRequestToken++;
  appendChatMessage('bot','확인된 장소를 기준으로 SafeWalk 안전 경로를 계산합니다.');
  closeChatPanel();

  /* 채팅창 닫힘 애니메이션 뒤 기존 길찾기 실행 */
  setTimeout(()=>runSearchRoute(),120);
}

async function beginChatRouteCommand(command){
  if(!command||!command.destinationQuery)return;

  disableOldChatRouteControls();
  const token=++chatRouteRequestToken;
  chatRouteFlow={
    token,
    command:{...command},
    origin:null,
    destination:null
  };

  if(grp==='cpted'){
    appendChatRouteError('CPTED 화면에서는 일반 보행 길찾기를 실행할 수 없습니다. 다른 이용자 유형의 안전지도로 이동한 뒤 다시 요청해 주세요.');
    chatRouteFlow=null;
    return;
  }

  if(command.originType==='current'){
    if(!Number.isFinite(myLat)||!Number.isFinite(myLng)){
      appendChatRouteError('현재 위치를 아직 확인하지 못했습니다. 위치 권한을 허용하고 잠시 후 다시 요청해 주세요.');
      chatRouteFlow=null;
      return;
    }

    chatRouteFlow.origin={
      lat:myLat,
      lng:myLng,
      label:'📍 현재 위치',
      addr:(document.getElementById('locTxt')?.textContent||'').trim(),
      src:'gps'
    };

    appendChatMessage('bot','출발지는 현재 위치로 사용합니다. 목적지 후보를 확인해 주세요.');
    await loadChatRouteCandidates(
      'destination',
      command.destinationQuery,
      chatRouteFlow.origin,
      token
    );
    return;
  }

  /* 출발지를 직접 입력한 경우 현재 GPS와의 거리는 후보 순위에 사용하지 않는다.
     예: 사용자가 경산에 있어도 '포항여고'의 정확한 명칭 일치 결과를 우선한다. */
  const reference=null;

  appendChatMessage('bot','먼저 출발지를 확인한 뒤 목적지를 선택하겠습니다.');
  await loadChatRouteCandidates(
    'origin',
    command.originQuery,
    reference,
    token
  );
}

function setChatBusy(busy){
  chatBusy=Boolean(busy);
  const sendBtn=document.getElementById('chatSendBtn');
  const input=document.getElementById('chatInput');
  if(sendBtn)sendBtn.disabled=chatBusy;
  if(input)input.disabled=chatBusy;
}

function askChatQuick(message){
  if(chatBusy)return;
  openChatPanel();
  const input=document.getElementById('chatInput');
  if(input)input.value=message;
  sendChatMessage();
}

async function sendChatMessage(){
  if(chatBusy)return;

  const input=document.getElementById('chatInput');
  const message=String(input?input.value:'').trim();

  if(!message){
    if(input)input.focus();
    return;
  }

  if(message.length>CHAT_MAX_LENGTH){
    appendChatMessage('bot','질문은 '+CHAT_MAX_LENGTH+'자 이하로 입력해 주세요.',true);
    return;
  }

  appendChatMessage('user',message);
  if(input){
    input.value='';
    input.style.height='44px';
  }

  dismissMobileKeyboard();

  /* 길찾기 문장은 Cloudflare AI의 추측에 맡기지 않고
     VWorld 실제 검색 결과와 사용자 확인 절차로 처리한다. */
  const routeCommand=parseChatRouteCommand(message);
  if(routeCommand){
    await beginChatRouteCommand(routeCommand);
    return;
  }

  setChatBusy(true);
  showChatTyping();

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),25000);

  try{
    const response=await fetch(CHAT_API_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        message,
        context:getSafeWalkChatContext()
      }),
      signal:controller.signal
    });

    const raw=await response.text();
    let data=null;

    try{
      data=JSON.parse(raw);
    }catch(e){
      throw new Error('AI 서버가 올바른 JSON을 반환하지 않았습니다.');
    }

    if(!response.ok||!data||data.ok!==true){
      throw new Error((data&&data.error)||('AI 요청 실패: HTTP '+response.status));
    }

    hideChatTyping();

    /* 정규식에서 놓친 자연스러운 길찾기 표현은
       Workers AI의 function calling 결과로 한 번 더 판별한다. */
    const aiRouteCommand=normalizeWorkerRouteAction(
      data.action,
      message
    );

    if(aiRouteCommand){
      await beginChatRouteCommand(aiRouteCommand);
      return;
    }

    appendChatMessage(
      'bot',
      data.answer||'답변을 생성하지 못했습니다.'
    );
  }catch(error){
    console.error('SafeWalk AI 연결 오류:',error);
    hideChatTyping();

    const isTimeout=error&&error.name==='AbortError';
    appendChatMessage(
      'bot',
      isTimeout
        ?'AI 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'
        :'현재 AI 안내 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      true
    );
  }finally{
    clearTimeout(timeout);
    setChatBusy(false);
    requestAnimationFrame(syncViewportChrome);
  }
}

function bindChatInput(){
  const input=document.getElementById('chatInput');
  if(!input||input.dataset.bound==='1')return;
  input.dataset.bound='1';

  input.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.shiftKey){
      event.preventDefault();
      sendChatMessage();
    }
  });

  input.addEventListener('input',()=>{
    input.style.height='44px';
    input.style.height=Math.min(input.scrollHeight,92)+'px';
  });
}
