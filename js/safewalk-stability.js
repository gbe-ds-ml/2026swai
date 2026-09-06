/* ============================================================
   SafeWalk stabilization patch v2.2 — 2026-09-06

   이번 버전의 역할
   ------------------------------------------------------------
   1. Long Press 출발지에서 stale GPS 사용 방지
   2. 사용자 표기 "아동안전지킴이집" 통일
   3. chat-facility.js의 GPS/시설조회 로직은 더 이상 덮어쓰지 않음

   중요
   ------------------------------------------------------------
   이전 안정화 파일은 GPS accuracy 200m 초과 시
   주변시설 조회 자체를 중단했다.
   v2.2에서는 그 로직을 완전히 제거했다.

   주변시설 조회와 accuracy 경고는
   chat-facility.js v2.4가 담당한다.
   ============================================================ */

(function(){
  'use strict';

  const POSITION_MAX_AGE_MS = 120000;


  /* ==========================================================
     최근 실제 GPS 확인
     ========================================================== */

  function hasFreshMeasuredPosition(
    maxAgeMs=POSITION_MAX_AGE_MS
  ){
    try{
      return (
        typeof hasCurrentLocation ===
          'function' &&
        hasCurrentLocation(maxAgeMs) &&
        Number.isFinite(myLat) &&
        Number.isFinite(myLng)
      );
    }catch(error){
      return false;
    }
  }


  /* ==========================================================
     Long Press 자동 출발지

     - 최근 실제 GPS가 있으면 즉시 사용
     - 없을 때만 Geolocation 1회 요청
     - accuracy가 낮다는 이유만으로 출발지 지정을 막지 않음
     ========================================================== */

  if(
    typeof getSafeWalkCurrentOrigin ===
    'function'
  ){
    getSafeWalkCurrentOrigin =
      function(){

        if(hasFreshMeasuredPosition()){
          return Promise.resolve({
            lat:Number(myLat),
            lng:Number(myLng),
            label:'📍 현재 위치',
            src:'gps'
          });
        }

        return new Promise(
          (resolve,reject)=>{

            if(!navigator.geolocation){
              reject(
                new Error(
                  '현재 위치 기능을 지원하지 않습니다.'
                )
              );
              return;
            }

            navigator.geolocation
              .getCurrentPosition(

                position=>{

                  try{
                    if(
                      typeof acceptGPSPosition !==
                        'function' ||
                      !acceptGPSPosition(position)
                    ){
                      reject(
                        new Error(
                          '현재 위치를 확인하지 못했습니다.'
                        )
                      );
                      return;
                    }
                  }catch(error){
                    reject(error);
                    return;
                  }

                  try{
                    if(
                      typeof drawMe ===
                      'function'
                    ){
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

                error=>
                  reject(
                    error ||
                    new Error(
                      '현재 위치를 확인하지 못했습니다.'
                    )
                  ),

                {
                  enableHighAccuracy:false,
                  timeout:8000,
                  maximumAge:
                    POSITION_MAX_AGE_MS
                }
              );
          }
        );
      };
  }


  /* ==========================================================
     용어 통일
     ========================================================== */

  try{
    if(
      typeof SW_CHAT_FACILITY_META !==
        'undefined' &&
      SW_CHAT_FACILITY_META?.child_house
    ){
      SW_CHAT_FACILITY_META
        .child_house
        .label =
          '아동안전지킴이집';
    }
  }catch(error){}

  try{
    if(
      typeof FACILITY_ROUTE_LABEL !==
        'undefined' &&
      FACILITY_ROUTE_LABEL
    ){
      FACILITY_ROUTE_LABEL
        .child_house =
          '🏠 아동안전지킴이집 3순위';
    }
  }catch(error){}

  if(
    typeof safeWalkAgentFacilityLabel ===
    'function'
  ){
    const baseFacilityLabel =
      safeWalkAgentFacilityLabel;

    safeWalkAgentFacilityLabel =
      function(key){

        if(key === 'child_house'){
          return '아동안전지킴이집';
        }

        return baseFacilityLabel(key);
      };
  }


  function normalizeRouteReasonTerminology(){
    const reason =
      document.getElementById(
        'routeReason'
      );

    if(!reason) return;

    if(
      reason.innerHTML.includes(
        '어린이안전지킴이집'
      )
    ){
      reason.innerHTML =
        reason.innerHTML
          .replaceAll(
            '어린이안전지킴이집',
            '아동안전지킴이집'
          );
    }
  }


  if(
    typeof updateRoutePanel ===
    'function'
  ){
    const baseUpdateRoutePanel =
      updateRoutePanel;

    updateRoutePanel =
      function(){

        const result =
          baseUpdateRoutePanel.apply(
            this,
            arguments
          );

        normalizeRouteReasonTerminology();

        return result;
      };
  }


  if(
    document.readyState ===
    'loading'
  ){
    document.addEventListener(
      'DOMContentLoaded',
      normalizeRouteReasonTerminology,
      {once:true}
    );
  }else{
    normalizeRouteReasonTerminology();
  }


  console.log(
    '[SafeWalk] nearby facility stability patch v2.2 active'
  );
})();
