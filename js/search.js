/* ============================================================
   SafeWalk v2.0 — search.js
   검색 패널(출발지·도착지 지정)과 VWorld 장소 검색.
   "검색이 안 된다 / 슬롯이 이상하다"는 이 파일을 보세요.
   VWorld는 JSONP 방식으로 브라우저에서 직접 호출합니다.
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
async function requestVworldSearch(query,type){
  const searchType=String(type||'PLACE').toUpperCase();
  if(searchType==='PLACE')return requestVworldSearchOnce(query,'PLACE','');
  if(searchType==='ADDRESS'){
    const roadItems=await requestVworldSearchOnce(query,'ADDRESS','ROAD');
    if(roadItems.length)return roadItems;
    return requestVworldSearchOnce(query,'ADDRESS','PARCEL');
  }
  throw new Error('지원하지 않는 VWorld 검색 유형입니다: '+searchType);
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
    setSearchMsg('검색 서버에 연결하지 못했습니다. VWorld 키와 서비스 URL을 확인해 주세요.');
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
