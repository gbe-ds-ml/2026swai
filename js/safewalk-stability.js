/* ============================================================
   SafeWalk stabilization patch — 2026-09-06

   목적
   1. 챗봇 주변시설 검색 시 이미 확보한 실제 GPS를 우선 재사용
   2. stale GPS는 현재 위치로 취급하지 않음
   3. 위치 오류를 권한/신호/시간초과/정확도 문제로 구분
   4. 사용자 표기를 '아동안전지킴이집'으로 통일

   이 파일은 기존 기능을 새로 만들지 않고 현재 전역 함수의
   위치 처리만 안정화한다. index.html에서 모든 기존 SafeWalk
   스크립트 뒤에 로드되어야 한다.
   ============================================================ */

(function(){
  'use strict';

  const FACILITY_POS_MAX_AGE_MS = 120000;
  const FACILITY_POS_MAX_ACC_M = 200;
  const FACILITY_GPS_TIMEOUT_MS = 8000;

  function currentAccuracy(){
    try{
      return Number.isFinite(myPositionAccuracy)
        ? Number(myPositionAccuracy)
        : null;
    }catch(error){
      return null;
    }
  }

  function hasFreshMeasuredPosition(maxAgeMs=FACILITY_POS_MAX_AGE_MS){
    try{
      return (
        typeof hasCurrentLocation === 'function' &&
        hasCurrentLocation(maxAgeMs) &&
        Number.isFinite(myLat) &&
        Number.isFinite(myLng)
      );
    }catch(error){
      return false;
    }
  }

  function hasFacilityQualityPosition(){
    if(!hasFreshMeasuredPosition()){
      return false;
    }

    const accuracy = currentAccuracy();

    // 이전 브라우저/기존 상태에서 accuracy가 없으면 실제 GPS라는
    // freshness 판정을 우선 신뢰한다. 숫자가 있으면 200m 기준 적용.
    return accuracy === null || accuracy <= FACILITY_POS_MAX_ACC_M;
  }

  function currentOrigin(){
    return {
      lat:Number(myLat),
      lng:Number(myLng),
      accuracy:currentAccuracy()
    };
  }

  function makeLocationError(reason, message, originalError){
    const error = new Error(message || '현재 위치를 확인하지 못했습니다.');
    error.swLocationReason = reason;

    if(originalError && Number.isFinite(originalError.code)){
      error.code = originalError.code;
    }

    return error;
  }

  function locationMessage(error){
    const reason = error?.swLocationReason;
    const code = Number(error?.code);

    if(reason === 'accuracy'){
      return '현재 위치 정확도가 낮아 가장 가까운 시설을 정확히 판단하기 어렵습니다. 잠시 후 다시 시도해 주세요.';
    }

    if(reason === 'unsupported'){
      return '현재 브라우저에서는 위치 기능을 사용할 수 없습니다.';
    }

    if(code === 1 || reason === 'permission'){
      return '현재 위치 권한이 차단되어 있습니다. 브라우저의 사이트 위치 권한을 허용한 뒤 다시 시도해 주세요.';
    }

    if(code === 2 || reason === 'unavailable'){
      return '현재 위치 신호를 확인하기 어렵습니다. 잠시 후 다시 시도해 주세요.';
    }

    if(code === 3 || reason === 'timeout'){
      return '현재 위치 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.';
    }

    return '현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  /* ==========================================================
     챗봇 시설 검색 위치 확인

     기존 문제:
     지도에서 watchPosition으로 실제 위치를 이미 알고 있어도
     매 질문마다 getCurrentPosition()을 다시 호출하여 실내에서
     timeout이 나면 권한 오류처럼 보였다.

     변경:
     - 최근 120초 이내 실제 GPS + accuracy 200m 이내면 즉시 사용
     - 없거나 정확도가 낮을 때만 Geolocation API 재요청
     ========================================================== */

  if(typeof swResolveFacilityOrigin === 'function'){
    swResolveFacilityOrigin = function(){
      if(hasFacilityQualityPosition()){
        return Promise.resolve(currentOrigin());
      }

      return new Promise((resolve,reject)=>{
        if(!navigator.geolocation){
          reject(makeLocationError(
            'unsupported',
            '현재 위치 기능을 지원하지 않는 브라우저입니다.'
          ));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          position=>{
            try{
              const lat = Number(position?.coords?.latitude);
              const lng = Number(position?.coords?.longitude);

              if(!Number.isFinite(lat) || !Number.isFinite(lng)){
                reject(makeLocationError('invalid','현재 위치 좌표가 올바르지 않습니다.'));
                return;
              }

              if(
                typeof acceptGPSPosition !== 'function' ||
                !acceptGPSPosition(position)
              ){
                reject(makeLocationError('invalid','현재 위치를 확인하지 못했습니다.'));
                return;
              }

              const accuracy = Number.isFinite(position?.coords?.accuracy)
                ? Number(position.coords.accuracy)
                : null;

              if(
                accuracy !== null &&
                accuracy > FACILITY_POS_MAX_ACC_M
              ){
                reject(makeLocationError(
                  'accuracy',
                  '현재 위치 정확도가 낮습니다.'
                ));
                return;
              }

              try{
                if(typeof drawMe === 'function' && map){
                  drawMe();
                }
              }catch(error){}

              resolve({
                lat:Number(myLat),
                lng:Number(myLng),
                accuracy:currentAccuracy()
              });
            }catch(error){
              reject(makeLocationError('invalid','현재 위치를 확인하지 못했습니다.',error));
            }
          },
          error=>{
            let reason = 'unknown';
            if(Number(error?.code) === 1) reason = 'permission';
            else if(Number(error?.code) === 2) reason = 'unavailable';
            else if(Number(error?.code) === 3) reason = 'timeout';

            reject(makeLocationError(
              reason,
              error?.message || '현재 위치를 확인하지 못했습니다.',
              error
            ));
          },
          {
            timeout:FACILITY_GPS_TIMEOUT_MS,
            enableHighAccuracy:true,
            maximumAge:FACILITY_POS_MAX_AGE_MS
          }
        );
      });
    };
  }

  /* ==========================================================
     안전시설 검색 실행

     기존에는 모든 위치 실패를 '권한을 허용하세요'로 출력했다.
     실제 Geolocation 오류 원인에 맞는 안내를 표시한다.
     ========================================================== */

  if(typeof swBeginFacilityCommand === 'function'){
    swBeginFacilityCommand = async function(command){
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
        appendChatMessage('bot',locationMessage(error),true);
        return {
          status:'location_error',
          reason:error?.swLocationReason || null,
          code:Number.isFinite(Number(error?.code)) ? Number(error.code) : null
        };
      }

      if(token !== swFacilityRequestToken){
        return {status:'cancelled'};
      }

      try{
        const settled = await Promise.allSettled(
          command.keys.map(key=>
            swFindNearestFacility(
              key,
              origin,
              {policeSubtype:command.policeSubtype}
            )
          )
        );

        if(token !== swFacilityRequestToken){
          return {status:'cancelled'};
        }

        const failed = settled.filter(item=>item.status === 'rejected').length;

        if(failed === settled.length){
          throw new Error('모든 시설 조회 실패');
        }

        const results = settled
          .filter(item=>item.status === 'fulfilled' && item.value)
          .map(item=>item.value)
          .sort((a,b)=>a.distanceM-b.distanceM);

        const incomplete = results.some(item=>item.dataIncomplete);

        if(failed || incomplete){
          hideChatTyping();
          appendChatMessage(
            'bot',
            '일부 시설 자료를 확인하지 못했습니다. 조회된 결과를 안내하며, 더 가까운 시설이 있을 수 있습니다.',
            true
          );
        }

        swAppendFacilityResults(results,command);

        return {
          status:failed || incomplete ? 'partial' : 'ok',
          failed,
          incomplete
        };
      }catch(error){
        if(token !== swFacilityRequestToken){
          return {status:'cancelled'};
        }

        hideChatTyping();
        appendChatMessage(
          'bot',
          '생활안전지도에서 주변 시설을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          true
        );
        return {status:'error'};
      }
    };
  }

  /* ==========================================================
     Long Press 자동 출발지

     기존 코드는 myLat/myLng가 숫자이기만 하면 사용했다.
     이제 최근 GPS인지 hasCurrentLocation()으로 확인한다.
     ========================================================== */

  if(typeof getSafeWalkCurrentOrigin === 'function'){
    getSafeWalkCurrentOrigin = function(){
      if(hasFreshMeasuredPosition()){
        return Promise.resolve({
          lat:Number(myLat),
          lng:Number(myLng),
          label:'📍 현재 위치',
          src:'gps'
        });
      }

      return new Promise((resolve,reject)=>{
        if(!navigator.geolocation){
          reject(makeLocationError(
            'unsupported',
            '현재 위치 기능을 지원하지 않습니다.'
          ));
          return;
        }

        navigator.geolocation.getCurrentPosition(
          position=>{
            if(
              typeof acceptGPSPosition !== 'function' ||
              !acceptGPSPosition(position)
            ){
              reject(makeLocationError('invalid','현재 위치를 확인하지 못했습니다.'));
              return;
            }

            try{
              if(typeof drawMe === 'function'){
                drawMe();
              }
            }catch(error){}

            resolve({
              lat:Number(myLat),
              lng:Number(myLng),
              label:'📍 현재 위치',
              src:'gps'
            });
          },
          error=>reject(error || makeLocationError('unknown','현재 위치를 확인하지 못했습니다.')),
          {
            enableHighAccuracy:true,
            timeout:8000,
            maximumAge:FACILITY_POS_MAX_AGE_MS
          }
        );
      });
    };
  }

  /* ==========================================================
     용어 통일
     ========================================================== */

  try{
    if(
      typeof SW_CHAT_FACILITY_META !== 'undefined' &&
      SW_CHAT_FACILITY_META?.child_house
    ){
      SW_CHAT_FACILITY_META.child_house.label = '아동안전지킴이집';
    }
  }catch(error){}

  try{
    if(
      typeof FACILITY_ROUTE_LABEL !== 'undefined' &&
      FACILITY_ROUTE_LABEL
    ){
      FACILITY_ROUTE_LABEL.child_house = '🏠 아동안전지킴이집 3순위';
    }
  }catch(error){}

  if(typeof safeWalkAgentFacilityLabel === 'function'){
    const baseFacilityLabel = safeWalkAgentFacilityLabel;
    safeWalkAgentFacilityLabel = function(key){
      if(key === 'child_house'){
        return '아동안전지킴이집';
      }
      return baseFacilityLabel(key);
    };
  }

  function normalizeRouteReasonTerminology(){
    const reason = document.getElementById('routeReason');
    if(!reason) return;

    if(reason.innerHTML.includes('어린이안전지킴이집')){
      reason.innerHTML = reason.innerHTML.replaceAll(
        '어린이안전지킴이집',
        '아동안전지킴이집'
      );
    }
  }

  if(typeof updateRoutePanel === 'function'){
    const baseUpdateRoutePanel = updateRoutePanel;
    updateRoutePanel = function(){
      const result = baseUpdateRoutePanel.apply(this,arguments);
      normalizeRouteReasonTerminology();
      return result;
    };
  }

  if(document.readyState === 'loading'){
    document.addEventListener(
      'DOMContentLoaded',
      normalizeRouteReasonTerminology,
      {once:true}
    );
  }else{
    normalizeRouteReasonTerminology();
  }

  console.log('[SafeWalk] 2026-09-06 위치/시설 안정화 패치 활성화');
})();
