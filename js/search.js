/* ============================================================
   SafeWalk v2.1 — search.js
   검색 패널(출발지·도착지 지정)과 VWorld 장소 검색.
   2026-09-21 추가:
   - 영문/로마자 검색어가 VWorld에서 직접 검색되지 않으면
     Cloudflare AI가 VWorld용 한국어 검색어 후보를 생성
   - AI 후보는 목적지로 확정하지 않고 반드시 VWorld 실제 검색으로 검증
   ============================================================ */

/* ── 검색·경로 슬롯 상태 ── */
let routeOrigin=null;
let routeDest=null;
let activeSlot='dest';
let searchBusy=false;
let routePickMode=false;

function openSearchPanel(){
  const el=document.getElementById('searchPanel');
  if(!el)return;

  closeChatPanel();
  document.body.classList.add('search-open');
  el.classList.add('show');

  if(!routeOrigin&&hasCurrentLocation())routeOrigin={lat:myLat,lng:myLng,label:'📍 현재 위치',src:'gps'};
  updateSlotUI();
  focusSlot(routeDest?'origin':'dest');
  requestAnimationFrame(syncViewportChrome);
}

function closeSearchPanel(){
  const el=document.getElementById('searchPanel');
  if(el)el.classList.remove('show');
  document.body.classList.remove('search-open');

  const input=document.getElementById('spInput');
  if(input&&document.activeElement===input)input.blur();

  requestAnimationFrame(syncViewportChrome);
}
function focusSlot(slot){
  activeSlot=slot;
  document.querySelectorAll('.sp-slot').forEach(b=>b.classList.toggle('active',b.dataset.slot===slot));
  const inp=document.getElementById('spInput');
  if(inp)inp.placeholder=(slot==='origin'?'출발지':'도착지')+' 장소 또는 주소 검색';
  setSearchMsg(slot==='origin'
    ?'출발지를 검색하거나 현재 위치·지도 선택을 사용하세요.'
    :'도착지를 검색하거나 지도에서 직접 선택하세요.');
}
function swapSlots(){
  const t=routeOrigin;routeOrigin=routeDest;routeDest=t;
  updateSlotUI();
  showRouteToast('출발지와 도착지를 바꾸었습니다.');
}
function setSlotValue(slot,obj){
  if(slot==='origin')routeOrigin=obj;
  else routeDest=obj;
  updateSlotUI();
}
function updateSlotUI(){
  const o=document.getElementById('slotOriginVal');
  const d=document.getElementById('slotDestVal');
  if(o){
    o.textContent=routeOrigin?routeOrigin.label:'현재 위치';
    o.classList.toggle('empty',!routeOrigin);
  }
  if(d){
    d.textContent=routeDest?routeDest.label:'도착지를 지정하세요';
    d.classList.toggle('empty',!routeDest);
  }
  const run=document.getElementById('spRun');
  if(run)run.classList.toggle('on',Boolean(routeOrigin&&routeDest));
}
function setSearchMsg(text){
  const el=document.getElementById('spMsg');
  if(el)el.textContent=text;
}
function useCurrentLocation(){
  if(!hasCurrentLocation()){showRouteToast('현재 위치를 아직 확인하지 못했습니다. 내 위치 버튼으로 다시 확인해 주세요.');return;}
  setSlotValue(activeSlot,{lat:myLat,lng:myLng,label:'📍 현재 위치',src:'gps'});
  setSearchMsg((activeSlot==='origin'?'출발지':'도착지')+'를 현재 위치로 지정했습니다.');
}
function startMapPick(){
  if(!map){showRouteToast('지도가 아직 준비되지 않았습니다.');return;}
  closeSearchPanel();
  cptedTapRequestToken++;
  clearCptedGuide(true);
  routePickMode=true;
  document.body.classList.add('map-pick-mode');
  showRouteToast('🗺 지도에서 '+(activeSlot==='origin'?'출발지':'도착지')+'를 한 번 터치하세요.');
}

/* ── VWorld JSONP 검색 ── */
function normalizeVworldItems(json){
  const r=(json&&json.response)?json.response:json;
  if(!r)return [];
  const st=r.status?String(r.status).toUpperCase():'';
  if(st&&st!=='OK')return [];
  const items=(r.result&&Array.isArray(r.result.items))?r.result.items:[];
  const out=[];
  items.forEach(it=>{
    const pt=it.point||{};
    const lng=parseFloat(pt.x!=null?pt.x:it.x);
    const lat=parseFloat(pt.y!=null?pt.y:it.y);
    if(!isFinite(lat)||!isFinite(lng))return;
    const ad=it.address||{};
    out.push({
      title:String(it.title||ad.road||ad.parcel||'검색 결과').trim(),
      addr:String(ad.road||ad.parcel||ad.bldnm||'').trim(),
      lat,lng
    });
  });
  return out;
}
function requestVworldJsonp(params){
  return new Promise((resolve,reject)=>{
    const callbackName='__safeWalkVworld_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const script=document.createElement('script');
    let finished=false;
    const cleanup=()=>{
      if(finished)return;
      finished=true;
      clearTimeout(timer);
      if(script.parentNode)script.parentNode.removeChild(script);
      try{delete window[callbackName];}catch(e){window[callbackName]=undefined;}
    };
    const timer=setTimeout(()=>{
      cleanup();
      reject(new Error('VWorld 검색 요청 시간이 초과되었습니다.'));
    },10000);
    window[callbackName]=json=>{
      cleanup();
      resolve(json);
    };
    script.onerror=()=>{
      cleanup();
      reject(new Error('VWorld 검색 서버에 연결하지 못했습니다.'));
    };
    params.set('callback',callbackName);
    script.src=VWORLD_SEARCH_URL+'?'+params.toString();
    document.head.appendChild(script);
  });
}
function validateVworldResponse(json){
  const response=json&&json.response;
  if(!response)throw new Error('VWorld에서 올바른 검색 응답을 받지 못했습니다.');
  const status=String(response.status||'').toUpperCase();
  if(status==='ERROR'){
    const error=response.error||{};
    throw new Error((error.code||'VWORLD_ERROR')+': '+(error.text||error.message||'VWorld 검색 요청에 실패했습니다.'));
  }
}
async function requestVworldSearchOnce(query,type,category){
  const params=new URLSearchParams({
    service:'search',
    request:'search',
    version:'2.0',
    crs:'EPSG:4326',
    format:'json',
    errorFormat:'json',
    size:String(SEARCH_PAGE_SIZE),
    page:'1',
    query:String(query||'').trim(),
    type:String(type||'PLACE').toUpperCase(),
    key:VWORLD_API_KEY,
    domain:VWORLD_SERVICE_DOMAIN
  });
  if(category)params.set('category',String(category).toUpperCase());
  const json=await requestVworldJsonp(params);
  validateVworldResponse(json);
  return normalizeVworldItems(json);
}

async function requestVworldSearchCore(query,type){
  const searchType=String(type||'PLACE').toUpperCase();
  if(searchType==='PLACE')return requestVworldSearchOnce(query,'PLACE','');
  if(searchType==='ADDRESS'){
    const roadItems=await requestVworldSearchOnce(query,'ADDRESS','ROAD');
    if(roadItems.length)return roadItems;
    return requestVworldSearchOnce(query,'ADDRESS','PARCEL');
  }
  throw new Error('지원하지 않는 VWorld 검색 유형입니다: '+searchType);
}

/* ── 영문 장소명 → 한국어 VWorld 검색어 후보 ── */
const SAFEWALK_PLACE_NORMALIZE_CACHE=new Map();

function safeWalkSearchLanguage(){
  try{
    if(typeof getSafeWalkLanguage==='function')return getSafeWalkLanguage();
  }catch(error){}
  return 'ko';
}

function safeWalkNeedsPlaceNormalization(query){
  return /[A-Za-z]/.test(String(query||''));
}

function safeWalkPlaceNormalizeUrl(){
  const base=String(typeof CHAT_API_URL==='string'?CHAT_API_URL:'').trim();
  if(!base)return '';
  const url=new URL(base,location.href);
  url.pathname=url.pathname.replace(/\/(?:chat|place-normalize)\/?$/i,'').replace(/\/$/,'')+'/place-normalize';
  url.search='';
  url.hash='';
  return url.href;
}

async function requestSafeWalkPlaceCandidates(query){
  const q=String(query||'').trim();
  if(!q||!safeWalkNeedsPlaceNormalization(q))return [];
  const currentArea=String(document.getElementById('locTxt')?.textContent||'').trim().slice(0,80);
  const cacheKey=safeWalkSearchLanguage()+'|'+currentArea+'|'+q.toLowerCase();
  const cached=SAFEWALK_PLACE_NORMALIZE_CACHE.get(cacheKey);
  if(cached&&Date.now()-cached.savedAt<5*60*1000)return cached.candidates.slice();

  const url=safeWalkPlaceNormalizeUrl();
  if(!url)throw new Error('PLACE_NORMALIZE_UNAVAILABLE');
  const controller=new AbortController();
  // Worker primary + fallback can take up to 22 seconds.
  const timer=setTimeout(()=>controller.abort(),25000);
  try{
    const response=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({query:q,language:safeWalkSearchLanguage(),currentArea}),
      signal:controller.signal
    });
    const raw=await response.text();
    let data=null;
    try{data=JSON.parse(raw);}catch(error){}
    if(!response.ok||!data||data.ok!==true||!Array.isArray(data.candidates)){
      const error=new Error(data?.code||'PLACE_NORMALIZE_UNAVAILABLE');
      error.code=data?.code||'PLACE_NORMALIZE_UNAVAILABLE';
      throw error;
    }
    const seen=new Set();
    const candidates=data.candidates
      .filter(value=>typeof value==='string')
      .map(value=>value.replace(/\s+/g,' ').trim())
      .filter(value=>{
        if(value.length<2||value.length>100||!/[가-힣]/.test(value))return false;
        const key=value.toLowerCase();
        if(seen.has(key))return false;
        seen.add(key);
        return true;
      }).slice(0,3);
    if(!candidates.length)throw new Error('PLACE_NORMALIZE_EMPTY');
    // Cache successful candidates only. Temporary errors must be retryable.
    if(SAFEWALK_PLACE_NORMALIZE_CACHE.size>=50)SAFEWALK_PLACE_NORMALIZE_CACHE.delete(SAFEWALK_PLACE_NORMALIZE_CACHE.keys().next().value);
    SAFEWALK_PLACE_NORMALIZE_CACHE.set(cacheKey,{savedAt:Date.now(),candidates});
    return candidates.slice();
  }finally{
    clearTimeout(timer);
  }
}

function safeWalkSearchNotice(ko,en){
  return safeWalkSearchLanguage()==='en'?en:ko;
}

async function requestVworldSearch(query,type){
  const q=String(query||'').trim();
  if(!safeWalkNeedsPlaceNormalization(q))return requestVworldSearchCore(q,type);

  let directError=null;
  let normalizationError=null;
  let lookupError=null;
  let verifiedLookupCompleted=false;
  const englishFirst=safeWalkSearchLanguage()==='en';
  if(!englishFirst){
    try{
      const direct=await requestVworldSearchCore(q,type);
      if(direct.length)return direct;
    }catch(error){directError=error;}
  }

  let candidates=[];
  try{
    setSearchMsg(safeWalkSearchNotice('영문 장소명을 변환하고 실제 장소를 확인하고 있습니다.','Translating the place name and checking verified places...'));
    candidates=await requestSafeWalkPlaceCandidates(q);
  }catch(error){normalizationError=error;}

  for(const candidate of candidates){
    try{
      const items=await requestVworldSearchCore(candidate,type);
      verifiedLookupCompleted=true;
      if(items.length)return items.map(item=>({...item,originalQuery:q,verifiedQuery:candidate,verifiedBy:'vworld'}));
    }catch(error){lookupError=error;}
  }
  // A valid direct result is usable even when translation is unavailable.
  if(englishFirst){
    try{
      const direct=await requestVworldSearchCore(q,type);
      if(direct.length)return direct;
    }catch(error){directError=error;}
  }
  if(normalizationError){
    const error=new Error(safeWalkSearchNotice(
      '영문 장소명을 변환하지 못했습니다. 잠시 후 다시 시도하거나 한국어 장소명·지도 직접 선택을 이용해 주세요.',
      'Place-name translation is temporarily unavailable. Try again, enter a Korean place name, or select a point on the map.'
    ));
    error.code='PLACE_NORMALIZE_UNAVAILABLE';
    throw error;
  }
  if(lookupError&&!verifiedLookupCompleted)throw lookupError;
  if(directError&&!verifiedLookupCompleted)throw directError;
  return [];
}

async function runPlaceSearch(){
  const inp=document.getElementById('spInput');
  const q=(inp?inp.value:'').trim();
  if(q.length<2){setSearchMsg('두 글자 이상 입력해 주세요.');return;}
  if(searchBusy)return;

  dismissMobileKeyboard();
  searchBusy=true;
  setSearchMsg('검색 중입니다...');
  renderSearchResults([]);
  try{
    let items=await requestVworldSearch(q,'PLACE');
    if(!items.length)items=await requestVworldSearch(q,'ADDRESS');
    if(!items.length){
      setSearchMsg('검색 결과가 없습니다. 도로명주소나 정확한 시설명으로 다시 시도하거나, 지도에서 직접 선택하세요.');
      return;
    }
    renderSearchResults(items);
    setSearchMsg(items.length+'건을 찾았습니다. 항목을 선택하세요.');
  }catch(err){
    console.warn('검색 실패:',err);
    setSearchMsg(err.code==='PLACE_NORMALIZE_UNAVAILABLE'?err.message:safeWalkSearchNotice('장소 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.','Could not connect to the place-search service. Please try again shortly.'));
  }finally{
    searchBusy=false;
  }
}
function renderSearchResults(items){
  const box=document.getElementById('spResults');
  if(!box)return;
  if(!items.length){box.innerHTML='';return;}
  box.innerHTML=items.map((it,i)=>
    '<button type="button" class="sp-item" data-idx="'+i+'">'+
      '<div class="nm">'+esc(it.title)+'</div>'+
      (it.addr?'<div class="ad">'+esc(it.addr)+'</div>':'')+
    '</button>').join('');
  box._items=items;
  Array.prototype.forEach.call(box.querySelectorAll('.sp-item'),btn=>{
    btn.addEventListener('click',()=>{
      const it=box._items[parseInt(btn.dataset.idx,10)];
      if(!it)return;
      setSlotValue(activeSlot,{lat:it.lat,lng:it.lng,label:it.title,src:'search',addr:it.addr});
      box.innerHTML='';
      const inp=document.getElementById('spInput');
      if(inp){
        inp.value='';
        if(document.activeElement===inp)inp.blur();
      }
      if(routeOrigin&&routeDest)setSearchMsg('출발지·도착지가 모두 지정되었습니다. 길찾기를 시작하세요.');
      else focusSlot(activeSlot==='origin'?'dest':'origin');
    });
  });
}
function startRoutePick(){
  if(grp==='cpted'){
    showRouteToast('CPTED 화면에서는 지도에서 지점을 찍으면 가장 가까운 CPTED 구역까지 직선으로 안내합니다.');
    return;
  }
  if(!map){showRouteToast('지도가 아직 준비되지 않았습니다.');return;}
  cptedTapRequestToken++;
  clearCptedGuide(true);
  openSearchPanel();
}
function setDestinationAndRoute(latlng){
  setSlotValue(activeSlot,{lat:latlng.lat,lng:latlng.lng,label:'지도 선택 지점',src:'map'});
  if(routeOrigin&&routeDest){
    runSearchRoute();
  }else{
    activeSlot=activeSlot==='origin'?'dest':'origin';
    openSearchPanel();
    showRouteToast((activeSlot==='origin'?'출발지':'도착지')+'를 마저 지정해 주세요.');
  }
}

function bindSearchInput(){
  const inp=document.getElementById('spInput');
  if(!inp||inp.dataset.bound==='1')return;
  inp.dataset.bound='1';
  inp.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();runPlaceSearch();}
  });
}
/* SafeWalk: 길찾기 출발지 GPS 재요청 및 상태 표시 수정 */
(function () {
  let pending = null;
  let requestId = 0;

  const previousOpen = openSearchPanel;
  const previousUpdate = updateSlotUI;

  updateSlotUI = function () {
    previousUpdate();

    const origin = document.getElementById('slotOriginVal');
    const dest = document.getElementById('slotDestVal');

    if (origin && !routeOrigin) {
      origin.textContent = pending === 'origin'
        ? '현재 위치 확인 중…'
        : '출발지를 지정하세요';
    }

    if (dest && !routeDest && pending === 'dest') {
      dest.textContent = '현재 위치 확인 중…';
    }
  };

  function requestLocation(slot) {
    const id = ++requestId;
    const originalValue =
      slot === 'origin' ? routeOrigin : routeDest;

    pending = slot;
    updateSlotUI();

    setSearchMsg(
      '현재 위치를 확인하고 있습니다. 위치 권한 요청을 허용해 주세요.'
    );

    function unchanged() {
      return (
        slot === 'origin' ? routeOrigin : routeDest
      ) === originalValue;
    }

    function fail(error) {
      if (id !== requestId) return;

      pending = null;
      updateSlotUI();

      if (!unchanged()) return;

      const reason = error && error.code === 1
        ? '위치 권한이 차단되어 있습니다. 브라우저의 사이트 위치 권한을 허용해 주세요.'
        : '현재 위치를 확인하지 못했습니다. 다시 시도하거나 장소 검색·지도 선택으로 지정해 주세요.';

      setSearchMsg(reason);
      showRouteToast(reason);
    }

    function finish() {
      if (id !== requestId) return;

      pending = null;

      // 위치를 기다리는 동안 직접 선택한 장소는 유지합니다.
      if (!unchanged()) {
        updateSlotUI();
        return;
      }

      setSlotValue(slot, {
        lat: myLat,
        lng: myLng,
        label: '📍 현재 위치',
        src: 'gps'
      });

      if (routeOrigin && routeDest) {
        setSearchMsg(
          '출발지·도착지가 모두 지정되었습니다. 길찾기를 시작하세요.'
        );
      } else {
        focusSlot(routeOrigin ? 'dest' : 'origin');
      }
    }

    if (hasCurrentLocation()) {
      finish();
      return;
    }

    if (!navigator.geolocation) {
      fail();
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        function (position) {
          if (id !== requestId) return;

          if (
            !acceptGPSPosition(position) &&
            !hasCurrentLocation()
          ) {
            fail();
            return;
          }

          finish();
        },
        fail,
        {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 0
        }
      );
    } catch (error) {
      fail(error);
    }
  }

  useCurrentLocation = function () {
    requestLocation(activeSlot);
  };

  openSearchPanel = function () {
    if (
      routeOrigin &&
      routeOrigin.src === 'gps' &&
      !hasCurrentLocation()
    ) {
      routeOrigin = null;
    }

    previousOpen();

    if (!routeOrigin && pending === null) {
      requestLocation('origin');
    }
  };
})();
