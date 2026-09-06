/* ============================================================
   SafeWalk v2.4 — chat-facility.js

   현재 위치 기준 "가장 가까운 안전시설" 기능

   v2.4 핵심
   ------------------------------------------------------------
   1. 지도에서 이미 확보한 최근 GPS가 있으면 즉시 재사용
   2. GPS accuracy가 낮아도 시설 조회를 막지 않음
      - 200m 초과면 결과에 주의 문구만 표시
   3. 최근 GPS가 없을 때만 Geolocation을 1회 요청
   4. "가까운 안전시설" 빠른 버튼은 AI Worker를 거치지 않고
      SafeMap 공공데이터를 바로 조회
   5. 자연어 시설 요청은 기존 AI Agent 흐름과 호환
   6. 사용자 표기는 "아동안전지킴이집"으로 통일
   ============================================================ */


/* ============================================================
   상태 / 설정
   ============================================================ */

let swFacilityRequestToken = 0;
let swFacilityPreviewMarker = null;

const SW_FACILITY_POSITION_MAX_AGE_MS = 120000;
const SW_FACILITY_GPS_TIMEOUT_MS = 8000;
const SW_FACILITY_ACCURACY_WARN_M = 200;

const SW_CHAT_FACILITY_META = {
  police:{
    label:'치안시설',
    icon:'🚔',
    radii:[400,1000,2500,6000,15000,30000]
  },

  bell:{
    label:'안전비상벨',
    icon:'🆘',
    radii:[150,350,800,1800,4500,10000]
  },

  child_house:{
    label:'아동안전지킴이집',
    icon:'🏠',
    radii:[250,600,1500,3500,8000,15000]
  },

  cctv:{
    label:'CCTV',
    icon:'📷',
    radii:[80,180,400,800,1600,3000]
  }
};

const SW_CHAT_FACILITY_ALL_KEYS = [
  'police',
  'bell',
  'child_house',
  'cctv'
];


/* ============================================================
   자연어 안전시설 요청 판별
   - chat-agent.js가 최종 sendChatMessage를 담당하더라도
     레거시/직접 호출 호환을 위해 유지
   ============================================================ */

function swParseNearbyFacilityCommand(message){
  const text = String(message || '')
    .replace(/[\r\n\t]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  if(!text) return null;

  const compact = text.replace(/\s+/g,'');

  const explanationOnly =
    /(?:뭐야|무엇이야|무엇인가|뜻이야|정의|설명해|차이가뭐|어떤기능|의미가뭐)/
      .test(compact);

  const proximityIntent =
    /(?:가장가까|제일가까|가까운|가까이|근처|주변|내주변|내근처|현재위치|내위치|여기|이곳|어디|찾아줘|찾아주세요|보여줘|보여주세요|알려줘|알려주세요|있어|있나요|있는곳|위치)/
      .test(compact);

  const keys = [];

  if(/(?:치안시설|경찰서|파출소|지구대|경찰시설|경찰관서)/.test(compact)){
    keys.push('police');
  }

  if(/(?:안전비상벨|비상벨|긴급비상벨)/.test(compact)){
    keys.push('bell');
  }

  if(/(?:어린이안전지킴이집|아동안전지킴이집|안전지킴이집|지킴이집)/.test(compact)){
    keys.push('child_house');
  }

  if(/(?:CCTV|씨씨티비|방범카메라|방범CCTV)/i.test(compact)){
    keys.push('cctv');
  }

  const genericSafety =
    /(?:안전시설|안전인프라|안전시설물|주변안전|근처안전시설)/
      .test(compact);

  if(!keys.length && !genericSafety) return null;
  if(explanationOnly && !proximityIntent) return null;
  if(!proximityIntent && !genericSafety) return null;

  let policeSubtype = null;

  if(keys.includes('police')){
    if(/파출소/.test(compact)) policeSubtype = '파출소';
    else if(/지구대/.test(compact)) policeSubtype = '지구대';
    else if(/경찰서/.test(compact)) policeSubtype = '경찰서';
  }

  return {
    keys:[...new Set(keys.length ? keys : SW_CHAT_FACILITY_ALL_KEYS)],
    generic:genericSafety && keys.length === 0,
    policeSubtype,
    originalMessage:text
  };
}


/* ============================================================
   실제 현재 위치 확인
   ============================================================ */

function swFacilityCurrentAccuracy(){
  try{
    return Number.isFinite(myPositionAccuracy)
      ? Number(myPositionAccuracy)
      : null;
  }catch(error){
    return null;
  }
}

function swHasRecentRealPosition(){
  try{
    return (
      typeof hasCurrentLocation === 'function' &&
      hasCurrentLocation(SW_FACILITY_POSITION_MAX_AGE_MS) &&
      Number.isFinite(myLat) &&
      Number.isFinite(myLng)
    );
  }catch(error){
    return false;
  }
}

function swMakeLocationError(reason,message,originalError){
  const error = new Error(message || '현재 위치를 확인하지 못했습니다.');
  error.swLocationReason = reason;

  if(originalError && Number.isFinite(Number(originalError.code))){
    error.code = Number(originalError.code);
  }

  return error;
}

function swLocationErrorMessage(error){
  const reason = error?.swLocationReason;
  const code = Number(error?.code);

  if(code === 1 || reason === 'permission'){
    return '현재 위치 권한이 차단되어 있습니다. 브라우저의 사이트 위치 권한을 허용한 뒤 다시 시도해 주세요.';
  }

  if(code === 2 || reason === 'unavailable'){
    return '현재 위치 신호를 확인하기 어렵습니다. 잠시 후 다시 시도해 주세요.';
  }

  if(code === 3 || reason === 'timeout'){
    return '현재 위치 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.';
  }

  if(reason === 'unsupported'){
    return '현재 브라우저에서는 위치 기능을 사용할 수 없습니다.';
  }

  return '현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}


/*
  핵심:
  - 최근 실제 GPS가 있으면 accuracy가 200m보다 커도 바로 사용한다.
  - accuracy는 "조회 차단 기준"이 아니라 "결과 주의 문구 기준"이다.
  - 최근 GPS가 없을 때만 getCurrentPosition()을 호출한다.
*/
function swResolveFacilityOrigin(){
  if(swHasRecentRealPosition()){
    return Promise.resolve({
      lat:Number(myLat),
      lng:Number(myLng),
      accuracy:swFacilityCurrentAccuracy()
    });
  }

  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){
      reject(
        swMakeLocationError(
          'unsupported',
          '현재 위치 기능을 지원하지 않는 브라우저입니다.'
        )
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position=>{
        const lat = Number(position?.coords?.latitude);
        const lng = Number(position?.coords?.longitude);

        if(!Number.isFinite(lat) || !Number.isFinite(lng)){
          reject(
            swMakeLocationError(
              'invalid',
              '현재 위치 좌표가 올바르지 않습니다.'
            )
          );
          return;
        }

        try{
          if(
            typeof acceptGPSPosition === 'function' &&
            !acceptGPSPosition(position)
          ){
            reject(
              swMakeLocationError(
                'invalid',
                '현재 위치를 확인하지 못했습니다.'
              )
            );
            return;
          }
        }catch(error){
          reject(
            swMakeLocationError(
              'invalid',
              '현재 위치를 확인하지 못했습니다.',
              error
            )
          );
          return;
        }

        try{
          if(typeof drawMe === 'function' && map){
            drawMe();
          }
        }catch(error){}

        resolve({
          lat:Number.isFinite(myLat) ? Number(myLat) : lat,
          lng:Number.isFinite(myLng) ? Number(myLng) : lng,
          accuracy:Number.isFinite(position?.coords?.accuracy)
            ? Number(position.coords.accuracy)
            : swFacilityCurrentAccuracy()
        });
      },

      error=>{
        let reason = 'unknown';

        if(Number(error?.code) === 1) reason = 'permission';
        else if(Number(error?.code) === 2) reason = 'unavailable';
        else if(Number(error?.code) === 3) reason = 'timeout';

        reject(
          swMakeLocationError(
            reason,
            error?.message || '현재 위치를 확인하지 못했습니다.',
            error
          )
        );
      },

      {
        timeout:SW_FACILITY_GPS_TIMEOUT_MS,
        enableHighAccuracy:false,
        maximumAge:SW_FACILITY_POSITION_MAX_AGE_MS
      }
    );
  });
}


/* ============================================================
   검색용 Bounds
   ============================================================ */

function swMakeFacilityBounds(lat,lng,radiusM){
  const latDelta = radiusM / 111320;

  const cosLat = Math.max(
    .2,
    Math.cos(lat * Math.PI / 180)
  );

  const lngDelta =
    radiusM /
    (111320 * cosLat);

  return L.latLngBounds(
    [lat-latDelta,lng-lngDelta],
    [lat+latDelta,lng+lngDelta]
  );
}


/* ============================================================
   시설 결과 처리
   ============================================================ */

function swGetPoliceSearchText(item){
  const info = getFacilityInfo('police',item);

  return [
    info.name,
    xv(item,'fclty_ty'),
    xv(item,'fclty_nm')
  ]
    .filter(Boolean)
    .join(' ');
}

function swNormalizeFacilityResult(
  key,
  item,
  point,
  distanceM,
  radiusM
){
  const info = getFacilityInfo(key,item);

  return {
    key,
    name:
      info.name ||
      SW_CHAT_FACILITY_META[key]?.label ||
      '안전시설',
    addr:info.addr || '',
    lat:point.lat,
    lng:point.lng,
    distanceM,
    radiusM,
    raw:item
  };
}

async function swFindNearestFacility(
  key,
  origin,
  options={}
){
  const meta = SW_CHAT_FACILITY_META[key];

  if(!meta){
    throw new Error('지원하지 않는 안전시설 종류입니다.');
  }

  const subtype =
    key === 'police'
      ? String(options.policeSubtype || '').trim()
      : '';

  const radii = meta.radii || [500,1500,5000];

  for(const radiusM of radii){
    const bounds = swMakeFacilityBounds(
      origin.lat,
      origin.lng,
      radiusM
    );

    const items = await requestSafemapMarkers(
      key,
      bounds
    );

    const candidates = [];

    items.forEach(item=>{
      const point = parseLayerPoint(item);
      if(!point) return;

      const distanceM = distM(
        origin.lat,
        origin.lng,
        point.lat,
        point.lng
      );

      // API 요청영역은 사각형이므로 실제 반경 밖 시설 제외
      if(distanceM > radiusM * 1.03) return;

      if(subtype){
        const searchText = swGetPoliceSearchText(item);
        if(!searchText.includes(subtype)) return;
      }

      candidates.push(
        swNormalizeFacilityResult(
          key,
          item,
          point,
          distanceM,
          radiusM
        )
      );
    });

    if(candidates.length){
      candidates.sort(
        (a,b)=>a.distanceM-b.distanceM
      );

      candidates[0].dataIncomplete =
        Boolean(items.truncated);

      return candidates[0];
    }

    if(items.truncated){
      throw new Error(
        '시설 자료가 일부만 조회되어 결과를 확인할 수 없습니다.'
      );
    }
  }

  return null;
}


/* ============================================================
   표시 유틸
   ============================================================ */

function swFormatFacilityDistance(distanceM){
  if(!Number.isFinite(distanceM)) return '-';

  if(distanceM < 1000){
    return Math.max(1,Math.round(distanceM)) + 'm';
  }

  return (
    distanceM / 1000
  ).toFixed(
    distanceM >= 10000 ? 0 : 1
  ) + 'km';
}

function swGetFacilityTypeLabel(result){
  const meta = SW_CHAT_FACILITY_META[result.key];

  return meta
    ? meta.icon + ' ' + meta.label
    : '📍 안전시설';
}


/* ============================================================
   채팅 결과 출력
   ============================================================ */

function swAppendFacilityResults(results,command){
  hideChatTyping();

  if(!Array.isArray(results) || !results.length){
    appendChatMessage(
      'bot',
      '현재 위치 주변에서 요청한 안전시설을 찾지 못했습니다. 생활안전지도 데이터 제공 범위에 따라 일부 지역은 결과가 없을 수 있습니다.',
      true
    );
    return;
  }

  const bubble = appendChatRouteBubble();

  if(!bubble) return;

  const lead = document.createElement('div');
  lead.className = 'chat-route-lead';

  if(results.length === 1){
    lead.textContent =
      '조회된 시설 중 현재 위치에서 가까운 ' +
      SW_CHAT_FACILITY_META[results[0].key].label +
      '입니다.';
  }else{
    lead.textContent =
      '현재 위치 기준 가까운 안전시설을 종류별로 확인했습니다.';
  }

  bubble.appendChild(lead);

  const sub = document.createElement('div');
  sub.className = 'chat-route-sub';
  sub.textContent =
    '거리는 현재 GPS 좌표 기준 직선거리입니다. 실제 보행거리는 “여기로 길찾기”에서 확인해 주세요.';
  bubble.appendChild(sub);

  const accuracy = Number(command?._originAccuracy);

  if(
    Number.isFinite(accuracy) &&
    accuracy > SW_FACILITY_ACCURACY_WARN_M
  ){
    const note = document.createElement('div');
    note.className = 'chat-route-sub';
    note.style.marginTop = '5px';
    note.textContent =
      '※ 현재 위치 정확도는 약 ' +
      Math.round(accuracy) +
      'm입니다. 실제 시설 거리·순서는 차이가 있을 수 있습니다.';
    bubble.appendChild(note);
  }

  results.forEach((result,index)=>{
    const card = document.createElement('div');
    card.className = 'chat-route-summary';
    card.style.marginTop = index === 0 ? '10px' : '12px';

    const typeLabel = document.createElement('div');
    typeLabel.className = 'label';
    typeLabel.textContent = swGetFacilityTypeLabel(result);

    const name = document.createElement('div');
    name.className = 'value';
    name.textContent = result.name;

    const distanceLabel = document.createElement('div');
    distanceLabel.className = 'label';
    distanceLabel.textContent = '직선거리';

    const distance = document.createElement('div');
    distance.className = 'value';
    distance.textContent =
      swFormatFacilityDistance(result.distanceM);

    card.append(
      typeLabel,
      name,
      distanceLabel,
      distance
    );

    if(result.addr){
      const addrLabel = document.createElement('div');
      addrLabel.className = 'label';
      addrLabel.textContent = '주소';

      const addr = document.createElement('div');
      addr.className = 'value';
      addr.textContent = result.addr;

      card.append(addrLabel,addr);
    }

    bubble.appendChild(card);

    const actions = document.createElement('div');
    actions.className = 'chat-route-actions';
    actions.style.marginTop = '7px';

    const mapBtn = document.createElement('button');
    mapBtn.type = 'button';
    mapBtn.className = 'chat-route-btn secondary';
    mapBtn.textContent = '지도에서 보기';
    mapBtn.addEventListener(
      'click',
      ()=>swShowFacilityOnMap(result)
    );

    const routeBtn = document.createElement('button');
    routeBtn.type = 'button';
    routeBtn.className = 'chat-route-btn primary';
    routeBtn.textContent = '여기로 길찾기';
    routeBtn.addEventListener(
      'click',
      ()=>swRouteToFacility(result)
    );

    actions.append(mapBtn,routeBtn);
    bubble.appendChild(actions);
  });

  scrollChatToBottom();
}


/* ============================================================
   지도에서 보기
   ============================================================ */

function swClearFacilityPreview(){
  if(swFacilityPreviewMarker && map){
    try{
      if(map.hasLayer(swFacilityPreviewMarker)){
        map.removeLayer(swFacilityPreviewMarker);
      }
    }catch(error){}
  }

  swFacilityPreviewMarker = null;
}

function swShowFacilityOnMap(result){
  if(!map){
    appendChatMessage(
      'bot',
      '지도가 아직 준비되지 않았습니다.',
      true
    );
    return;
  }

  swClearFacilityPreview();

  try{
    swFacilityPreviewMarker =
      mkMarker(
        result.key,
        result.lat,
        result.lng,
        result.raw
      )
      .addTo(map);
  }catch(error){
    console.warn(
      '안전시설 미리보기 마커 생성 실패:',
      error
    );

    swFacilityPreviewMarker =
      L.marker([result.lat,result.lng])
        .addTo(map);
  }

  const zoom = Math.max(
    map.getZoom(),
    result.key === 'cctv' ? 17 : 16
  );

  closeChatPanel();

  map.flyTo(
    [result.lat,result.lng],
    zoom,
    {duration:.8}
  );

  setTimeout(()=>{
    if(
      swFacilityPreviewMarker &&
      map &&
      map.hasLayer(swFacilityPreviewMarker)
    ){
      try{
        swFacilityPreviewMarker.openPopup();
      }catch(error){}
    }
  },850);
}


/* ============================================================
   시설까지 길찾기
   ============================================================ */

function swRouteToFacility(result){
  if(!map){
    appendChatMessage(
      'bot',
      '지도가 아직 준비되지 않았습니다.',
      true
    );
    return;
  }

  if(grp === 'cpted'){
    appendChatMessage(
      'bot',
      'CPTED 화면에서는 일반 보행 길찾기를 실행할 수 없습니다. 어린이·여성·청소년·노인 안전지도로 이동한 뒤 다시 시도해 주세요.',
      true
    );
    return;
  }

  if(
    typeof hasCurrentLocation !== 'function' ||
    !hasCurrentLocation(SW_FACILITY_POSITION_MAX_AGE_MS)
  ){
    appendChatMessage(
      'bot',
      '현재 위치를 다시 확인한 뒤 길찾기를 시도해 주세요.',
      true
    );
    return;
  }

  swClearFacilityPreview();

  routeOrigin = {
    lat:Number(myLat),
    lng:Number(myLng),
    label:'📍 현재 위치',
    addr:(
      document
        .getElementById('locTxt')
        ?.textContent || ''
    ).trim(),
    src:'gps'
  };

  routeDest = {
    lat:result.lat,
    lng:result.lng,
    label:result.name,
    addr:result.addr || '',
    src:'safemap-nearest-facility'
  };

  activeSlot = 'dest';
  updateSlotUI();

  appendChatMessage(
    'bot',
    result.name +
    '까지 SafeWalk 보행 경로를 계산합니다.'
  );

  closeChatPanel();

  setTimeout(
    ()=>runSearchRoute(),
    120
  );
}


/* ============================================================
   안전시설 검색 실행
   ============================================================ */

async function swBeginFacilityCommand(command){
  if(!command?.keys?.length){
    return {status:'error'};
  }

  if(typeof requestSafemapMarkers !== 'function'){
    hideChatTyping();
    appendChatMessage(
      'bot',
      '시설 조회 기능을 사용할 수 없습니다. 페이지를 새로고침해 주세요.',
      true
    );
    return {status:'error'};
  }

  const token = ++swFacilityRequestToken;
  let origin;

  try{
    origin = await swResolveFacilityOrigin();
  }catch(error){
    if(token !== swFacilityRequestToken){
      return {status:'cancelled'};
    }

    hideChatTyping();

    appendChatMessage(
      'bot',
      swLocationErrorMessage(error),
      true
    );

    return {
      status:'location_error',
      reason:error?.swLocationReason || null,
      code:Number.isFinite(Number(error?.code))
        ? Number(error.code)
        : null
    };
  }

  if(token !== swFacilityRequestToken){
    return {status:'cancelled'};
  }

  // 조회는 막지 않고 결과 주의 문구에만 사용한다.
  command._originAccuracy =
    Number.isFinite(origin?.accuracy)
      ? Number(origin.accuracy)
      : null;

  try{
    const settled = await Promise.allSettled(
      command.keys.map(
        key=>
          swFindNearestFacility(
            key,
            origin,
            {
              policeSubtype:
                command.policeSubtype
            }
          )
      )
    );

    if(token !== swFacilityRequestToken){
      return {status:'cancelled'};
    }

    const failed =
      settled.filter(
        item=>item.status === 'rejected'
      ).length;

    if(failed === settled.length){
      throw new Error('모든 시설 조회 실패');
    }

    const results =
      settled
        .filter(
          item=>
            item.status === 'fulfilled' &&
            item.value
        )
        .map(item=>item.value)
        .sort(
          (a,b)=>a.distanceM-b.distanceM
        );

    const incomplete =
      results.some(
        item=>item.dataIncomplete
      );

    if(failed || incomplete){
      hideChatTyping();

      appendChatMessage(
        'bot',
        '일부 시설 자료를 확인하지 못했습니다. 조회된 결과를 안내하며, 더 가까운 시설이 있을 수 있습니다.',
        true
      );
    }

    swAppendFacilityResults(
      results,
      command
    );

    return {
      status:
        failed || incomplete
          ? 'partial'
          : 'ok',
      failed,
      incomplete,
      originAccuracy:command._originAccuracy
    };
  }catch(error){
    if(token !== swFacilityRequestToken){
      return {status:'cancelled'};
    }

    console.warn(
      '주변 안전시설 조회 실패:',
      error
    );

    hideChatTyping();

    appendChatMessage(
      'bot',
      '생활안전지도에서 주변 시설을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      true
    );

    return {status:'error'};
  }
}


/* ============================================================
   "가까운 안전시설" 빠른 버튼
   AI Worker를 거치지 않고 즉시 SafeMap 조회
   ============================================================ */

async function swRunNearbyFacilitiesQuick(){
  if(chatBusy) return;

  const userText =
    '내 주변 안전시설 알려줘';

  appendChatMessage(
    'user',
    userText
  );

  setChatBusy(true);
  showChatTyping();

  let outcome = null;

  try{
    outcome = await swBeginFacilityCommand({
      keys:[...SW_CHAT_FACILITY_ALL_KEYS],
      generic:true,
      policeSubtype:null,
      originalMessage:userText
    });

    /*
      chat-agent.js가 로드된 뒤라면
      후속 질문("그중 어디가 제일 가까워?")을 위해
      실제 조회 결과를 대화 기록에도 연결한다.
    */
    try{
      if(
        typeof safeWalkAgentRememberTurn === 'function' &&
        typeof safeWalkAgentBuildFacilityHistory === 'function'
      ){
        safeWalkAgentRememberTurn(
          userText,
          safeWalkAgentBuildFacilityHistory(outcome)
        );
      }
    }catch(error){}
  }finally{
    setChatBusy(false);

    if(typeof syncViewportChrome === 'function'){
      requestAnimationFrame(
        syncViewportChrome
      );
    }
  }

  return outcome;
}


/* ============================================================
   chat.js 레거시 호환
   chat-agent.js가 뒤에서 sendChatMessage를 다시 교체한다.
   ============================================================ */

const swBaseSendChatMessage =
  sendChatMessage;

sendChatMessage =
  async function(){
    if(chatBusy) return;

    const input =
      document.getElementById(
        'chatInput'
      );

    const message =
      String(
        input
          ? input.value
          : ''
      )
      .trim();

    if(
      !message ||
      message.length >
        CHAT_MAX_LENGTH
    ){
      return swBaseSendChatMessage();
    }

    const facilityCommand =
      swParseNearbyFacilityCommand(
        message
      );

    if(!facilityCommand){
      return swBaseSendChatMessage();
    }

    appendChatMessage(
      'user',
      message
    );

    if(input){
      input.value = '';
      input.style.height = '44px';
    }

    if(
      typeof dismissMobileKeyboard ===
      'function'
    ){
      dismissMobileKeyboard();
    }

    setChatBusy(true);
    showChatTyping();

    try{
      await swBeginFacilityCommand(
        facilityCommand
      );
    }finally{
      setChatBusy(false);

      if(
        typeof syncViewportChrome ===
        'function'
      ){
        requestAnimationFrame(
          syncViewportChrome
        );
      }
    }
  };


/* ============================================================
   빠른 질문 버튼 추가
   ============================================================ */

function swAddFacilityQuickButton(){
  const quick =
    document.querySelector(
      '#chatPanel .chat-quick'
    );

  if(!quick) return;

  let btn =
    quick.querySelector(
      '[data-sw-facility-quick="1"]'
    );

  if(!btn){
    btn =
      document.createElement(
        'button'
      );

    btn.type = 'button';
    btn.className = 'chat-quick-btn';
    btn.dataset.swFacilityQuick = '1';
    btn.textContent = '가까운 안전시설';

    quick.prepend(btn);
  }

  /*
    기존 askChatQuick 경유 handler가 있더라도
    이 버튼은 새로 만든 전용 버튼이므로
    직접 SafeMap 조회 함수에 연결한다.
  */
  btn.onclick = function(event){
    event?.preventDefault?.();
    swRunNearbyFacilitiesQuick();
  };
}

if(document.readyState === 'loading'){
  document.addEventListener(
    'DOMContentLoaded',
    swAddFacilityQuickButton,
    {once:true}
  );
}else{
  swAddFacilityQuickButton();
}
