/* ============================================================
   SafeWalk English hotfix v1.4 — 2026-11-11

   목적
   1) 영어 모드에서 경로 결과/타이머/안내/토스트 등
      실행 중 동적으로 생성되는 한글 UI까지 영어로 변환
   2) search.js가 영문 검색을 담당하고, 이 파일은 추가 UI 번역만 제공
   3) AI 채팅 요청에 현재 UI 언어(ko/en)를 명시적으로 전달
   4) 여성·청소년 카드의 표시 구조를 안정적으로 통일
   5) v1.4: 영어 모드에서 한글로 남던 문구 보완
      (레이어 이름, 지도 팝업, 즐겨찾기, 길게 누르기 경로 지정, CPTED,
       AI 안내 화면의 장소 확인·오류 문구, 여러 줄 메시지, 이미지 대체 문구,
       브라우저 탭 제목)

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
    "신고 전 확인해 주세요":"Before you report",
    "허위 신고는 관련 법령에 따라 처벌 또는 과태료 부과 대상이 될 수 있습니다.":"Making a false report may result in criminal penalties or an administrative fine under applicable law.",
    "실제 긴급 상황에서는 즉시 112 또는 119로 신고해 주세요.":"In a real emergency, call 112 or 119 immediately.",
    "경찰 신고":"Police",
    "112 문자 신고":"Text 112",
    "현재위치 보내기":"Share current location",
    "보호자 문자":"Text guardian",
    "번호 입력 필요":"Phone number required",
    "💬 보호자에게 내 위치 문자":"💬 Text my location to guardian",
    "💬 문자로 내 위치 보내기 (받는 사람 직접 선택)":"💬 Text my location (choose recipient)",
    "🔇 사이렌 끄기":"🔇 Turn siren off",
    "보호자 번호를 저장했습니다.":"Guardian phone number saved.",
    "보호자 번호를 지웠습니다.":"Guardian phone number removed.",
    "보호자 전화번호를 먼저 입력하고 저장해 주세요.":"Enter and save a guardian phone number first.",
    "현재 위치 정보를 복사했습니다. 메신저에 붙여넣어 공유하세요.":"Location copied. Paste it into a message to share it.",
    "위치 미확인 안내를 복사했습니다. 주변 건물이나 도로명을 함께 알려 주세요.":"Location-unavailable message copied. Include a nearby building or street name.",
    "이 기기에서는 사이렌 소리를 재생할 수 없습니다.":"This device cannot play the siren.",
    "[SafeWalk] 지금 도움이 필요합니다.":"[SafeWalk] I need help now.",
    "[SafeWalk] 내 위치 공유":"[SafeWalk] My location",
    "[SafeWalk] 보호자에게 긴급 위치를 공유합니다.":"[SafeWalk] Sharing my emergency location with my guardian.",
    "[SafeWalk 112 문자신고]\n현재 위치에서 긴급 도움이 필요합니다.\n상황을 추가로 입력한 뒤 전송해 주세요.":"[SafeWalk 112 emergency text]\nI need urgent help at my current location.\nPlease describe the situation before sending.",
    "긴급 패널 닫기":"Close emergency panel",
    "질문 보내기":"Send question",
    "경로 정보 닫기":"Close route details",
    "보행 안내 시작":"Start walking guidance",
    "현재 위치 기준 경로 재계산 중":"Recalculating from current location",
    "⚠️ 보행 경로 조회 실패":"⚠️ Walking route unavailable",
    "점선은 출발지와 목적지를 연결한 참고선입니다. 실제 이동 경로로 이용하지 마세요.":"The dotted line only connects the origin and destination for reference. Do not use it as a walking route.",
    "산출 불가":"Unavailable",
    "측정 불가":"Unavailable",
    "현재 위치 미확인":"Location unavailable",
    "현재 위치 확인 중...":"Checking current location...",
    "위치 확인 필요":"Location needed",
    "안전시설을 조회하고 있습니다.":"Looking up safety facilities.",
    "🔍 지도를 확대하면 안전시설이 표시됩니다":"🔍 Zoom in to display safety facilities",
    "닫기":"Close",
    "출발지":"Origin",
    "목적지":"Destination",
    "도착지":"Destination",
    "출발지로 지정":"Set as origin",
    "도착지로 지정":"Set as destination",
    "목적지로 지정":"Set as destination",
    "지도에서 선택":"Select on map",
    "여기로 출발":"Start here",
    "여기로 도착":"Go here",
    "🌐 한국어":"🌐 한국어",
    "여성":"Women",
    "청소년":"Youth",
    "⭐ 즐겨찾는 장소 추가":"⭐ Add favorite place",
    "지도에서 선택한 장소를 이 기기에 저장합니다. 저장한 장소는 지도에서 다시 확인하고 삭제할 수 있습니다.":"Save the selected place on this device. You can view it again on the map or delete it.",
    "장소 이름":"Place name",
    "선택한 위치":"Selected location",
    "위치를 확인하고 있습니다.":"Checking location...",
    "⭐ 즐겨찾기에 저장":"⭐ Save to favorites",
    "📍 현재 위치와 출발지가 다릅니다":"📍 Your location differs from the route origin",
    "설정한 출발지에서 바로 안내를 시작하기에는 현재 위치가 멀리 떨어져 있습니다.":"You are too far from the selected origin to start guidance there.",
    "경로는 그대로 미리보기 할 수 있고, 실제 안내를 시작하려면 현재 위치를 출발지로 다시 계산할 수 있습니다.":"You can preview this route, or recalculate it from your current location to start guidance.",
    "현재 위치와 출발지 거리 확인 중...":"Checking the distance to the route origin...",
    "기존 경로 보기":"Preview existing route",
    "📍 현재 위치에서 안내":"📍 Start from my location",
    "현재 위치에서 안내를 선택하면 경로와 주변 안전시설, 안전도 점수를 다시 계산합니다.":"Starting from your location recalculates the route and nearby infrastructure accessibility score.",
    "현재 위치에서 안내를 선택하면 경로와 주변 안전시설, 시설 접근성 점수를 다시 계산합니다.":"Starting from your location recalculates the route and nearby infrastructure accessibility score.",
    "내 위치로":"Go to my location",
    "예: 집, 학교, 자주 가는 곳":"e.g. Home, school, or a place you visit often",
    "🚶 안내를 시작합니다. 현재 위치를 따라가며 남은 거리와 시간을 안내합니다.":"🚶 Guidance started. SafeWalk follows your location and shows the remaining distance and time.",
    "안내를 종료할까요? 현재 경로도 함께 삭제됩니다.":"End guidance? The current route will also be removed.",
    "안내를 종료하고 경로를 삭제했습니다.":"Guidance ended and the route was removed.",
    "현재 위치를 확인하지 못했습니다.":"Could not determine your current location.",
    "📍 현재 위치를 기준으로 경로와 안전도를 다시 계산합니다.":"📍 Recalculating the route and infrastructure accessibility from your current location.",
    "🚶 현재 위치에서 목적지까지 새 경로로 안내를 시작합니다. 안전시설과 안전도도 새 경로 기준으로 다시 반영했습니다.":"🚶 Starting a new route from your location. Infrastructure accessibility has been recalculated for this route.",
    "현재 위치 기준 경로 재계산에 실패했습니다. 기존 경로를 유지합니다.":"Could not recalculate from your location. The existing route is retained.",
    "현재 위치를 다시 확인하고 있습니다. 위치 수신 상태를 확인해 주세요.":"Checking your location again. Please check your location signal.",
    "GPS 정확도가 낮아 도착 여부를 확인할 수 없습니다. 주변 지형과 목적지를 직접 확인해 주세요.":"GPS accuracy is too low to confirm arrival. Check your surroundings and destination directly.",
    "🏁 목적지에 거의 도착했습니다. 도착 후 안내 종료를 눌러 주세요.":"🏁 You are almost at your destination. Tap “End guidance” after arriving.",
    "⚠️ 안내 경로에서 조금 벗어나 있습니다. 지도의 경로를 확인해 주세요.":"⚠️ You are slightly off the route. Check the route on the map.",
    "🔍 지도를 조금 더 확대하면 안전시설이 표시됩니다 (현재 축소 상태)":"🔍 Zoom in a little more to display safety facilities",
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


  /* ----------------------------------------------------------
     v1.4 추가 사전 (기존 항목이 있으면 기존 번역을 유지)
     ---------------------------------------------------------- */
  const EXACT_EN_V14 = {
    /* 초기화면 · 상단 · 접근성 문구 */
    '위치 확인됨':'Located',
    '레이어 설정 접기':'Hide layers',
    '점수 계산 접기':'Hide score calculation',
    '여성 및 청소년':'Women and youth',
    '여성과 남녀 청소년':'Women and youth',
    'CPTED 아이콘':'CPTED icon',
    '도착 확인 필요':'Arrival confirmation needed',
    '검색 패널 닫기':'Close search panel',
    '경로 패널 닫기':'Close route panel',
    '평가 패널 닫기':'Close feedback panel',
    'AI 안전 도우미 닫기':'Close AI safety guide',

    /* 레이어 이름 */
    '여성밤길안전':'Women’s night-walk safety',
    '노인범죄주의':'Senior crime-caution areas',
    '어린이범죄주의':'Child crime-caution areas',
    '범죄예방환경설계':'CPTED areas',
    '범죄주의구간':'Crime caution area',
    '안전시설':'Safety facility',
    '(이 지역 시설 밀집)':'(dense facility area)',
    '지도를 확대하면 선택한 레이어가 표시됩니다.':'Zoom in to display the selected layer.',
    '조회 실패':'Lookup failed',
    '일부 시설 조회에 실패했습니다. 지도를 이동하거나 다시 시도해 주세요.':'Some facility lookups failed. Move the map or try again.',
    '+ 표시는 조회 제한으로 일부 데이터만 집계되었음을 뜻합니다.':'A “+” mark means only part of the data was counted because of the lookup limit.',
    '일부 시설 조회에 실패했습니다. 지도를 이동하거나 다시 시도해 주세요. + 표시는 조회 제한으로 일부 데이터만 집계되었음을 뜻합니다.':'Some facility lookups failed. Move the map or try again. A “+” mark means only part of the data was counted because of the lookup limit.',
    '시설 조회 응답 형식이 올바르지 않습니다.':'The facility lookup response was not in the expected format.',

    /* 지도 팝업 */
    '📍 현재 내 위치':'📍 My current location',
    '현재 지도 화면 범위의 안전시설을 표시합니다':'Safety facilities within the current map view are shown.',
    '✓ 경찰 연계':'✓ Linked to police',
    '✗ 경찰 미연계':'✗ Not linked to police',
    '🏠 어린이 보호':'🏠 Child protection',
    '경찰서':'Police station',
    '지구대':'Police precinct',
    '파출소':'Police box',
    '치안센터':'Community police center',
    '생활방범':'Crime prevention',
    '어린이보호':'Child protection',
    '교통단속':'Traffic enforcement',
    '교통정보수집':'Traffic information',
    '시설물관리':'Facility management',
    '쓰레기단속':'Illegal-dumping enforcement',
    '재난재해':'Disaster monitoring',
    '차량방범':'Vehicle crime prevention',
    '다목적':'Multi-purpose',
    '현재 위치를 다시 확인합니다. 위치 권한과 수신 상태를 확인해 주세요.':'Checking your location again. Please check location permission and signal.',
    '지도 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.':'The map library could not be loaded. Check your internet connection and refresh the page.',

    /* CPTED 화면 */
    '🏗 가장 가까운 CPTED':'🏗 Nearest CPTED area',
    '조회 가능한 CPTED 정보 없음':'No CPTED information available',
    '현재 화면 주변에서 CPTED 상세 정보를 찾지 못했습니다.':'No detailed CPTED information was found near the current view.',
    '가장 가까운 CPTED 구역':'Nearest CPTED area',
    '지도에 점선으로 선택 지점과 CPTED 대표 좌표를 연결했습니다.':'A dotted line on the map connects the selected point to the reference point of the CPTED area.',
    'CPTED 화면에서는 지도에서 지점을 찍으면 가장 가까운 CPTED 구역까지 직선으로 안내합니다.':'On the CPTED screen, tap a point on the map to see a straight line to the nearest CPTED area.',
    'CPTED 화면에서는 일반 보행 길찾기를 실행할 수 없습니다. 다른 이용자 유형의 안전지도로 이동한 뒤 다시 시도해 주세요.':'Walking directions are not available on the CPTED screen. Switch to the safety map for another user type and try again.',
    'CPTED 화면에서는 일반 보행 길찾기를 실행할 수 없습니다. 다른 이용자 유형의 안전지도로 이동한 뒤 다시 요청해 주세요.':'Walking directions are not available on the CPTED screen. Switch to the safety map for another user type and ask again.',
    'CPTED 화면에서는 일반 보행 길찾기를 실행할 수 없습니다. 어린이·여성·청소년·노인 안전지도로 이동한 뒤 다시 시도해 주세요.':'Walking directions are not available on the CPTED screen. Switch to the Child, Women · Youth, or Senior safety map and try again.',

    /* 즐겨찾는 장소 */
    '즐겨찾는 장소':'Favorite place',
    '즐겨찾는 장소 추가':'Add favorite place',
    '즐겨찾는 장소 추가하기':'Add a favorite place',
    '지도에서 즐겨찾는 장소 추가하기':'Add a favorite place on the map',
    '즐겨찾기 패널 닫기':'Close favorites panel',
    '예: 집, 학교, 자주 가는 정류장':'e.g. Home, school, bus stop',
    '⭐ 즐겨찾기에 저장할 장소를 지도에서 한 번 터치하세요.':'⭐ Tap the place on the map that you want to save to favorites.',
    '⭐ 즐겨찾는 장소에 저장했습니다.':'⭐ Saved to favorite places.',
    '즐겨찾기 저장에 실패했습니다. 저장 공간을 확인해 주세요.':'Could not save the favorite. Check the storage available on this device.',
    '즐겨찾기에서 삭제했습니다.':'Removed from favorites.',
    '🗑 즐겨찾기 삭제':'🗑 Remove favorite',

    /* (이전 버전 화면) 체감 안전 평가 항목 */
    '조명':'Lighting',
    '밤에 밝은가요?':'Is it well lit at night?',
    '주변 시야':'Visibility',
    '주변이 트여 있고 사람 눈길이 닿나요?':'Is the area open and visible to passers-by?',
    '체감 안심':'Sense of safety',
    '전체적으로 안심되는 곳인가요?':'Does the place feel safe overall?',

    /* 장소 검색 */
    'VWorld 검색 요청 시간이 초과되었습니다.':'The VWorld search request timed out.',
    'VWorld 검색 서버에 연결하지 못했습니다.':'Could not connect to the VWorld search server.',
    'VWorld에서 올바른 검색 응답을 받지 못했습니다.':'VWorld did not return a valid search response.',
    '출발지를 마저 지정해 주세요.':'Please set the origin as well.',
    '도착지를 마저 지정해 주세요.':'Please set the destination as well.',

    /* 경로 */
    '⚠️ 경로는 표시했지만 안전시설 조회에 실패해 시설 접근성을 계산하지 못했습니다.':'⚠️ The route is shown, but the safety-facility lookup failed, so infrastructure accessibility could not be calculated.',
    '⚠️ 보행 경로를 조회하지 못했습니다. 점선은 두 지점을 연결한 참고선이며 실제 이동 경로가 아닙니다.':'⚠️ The walking route could not be retrieved. The dotted line only connects the two points for reference and is not an actual route.',
    '경로 API 실패 · 임시 직선 안내':'Route service unavailable · Temporary straight-line reference',
    '실제 도로망 경로 요청 실패':'The walking-network route request failed',
    '경로 geometry 없음':'No route geometry was returned',
    '프록시 응답에 경로 geometry 없음':'The proxy response contained no route geometry',
    'OSRM 응답에 경로 geometry 없음':'The OSRM response contained no route geometry',
    'Valhalla 응답에 경로 geometry 없음':'The Valhalla response contained no route geometry',
    "경로는 계속 유지됩니다. 종료하려면 '길찾기 취소'를 눌러주세요.":'The route is kept. To end it, select “Cancel directions”.',

    /* 지도 길게 누르기 · 지도에서 직접 지정 */
    '지도 선택 출발지':'Origin selected on map',
    '지도 선택 목적지':'Destination selected on map',
    '📍 현재 위치':'📍 Current location',
    '현재 위치':'Current location',
    '🚩 출발지를 설정했습니다. 경로를 계산합니다.':'🚩 Origin set. Calculating the route.',
    '🚩 출발지를 설정했습니다. 목적지를 지도에서 길게 눌러 지정하세요.':'🚩 Origin set. Press and hold the map to choose a destination.',
    '🚩 출발지를 설정했습니다. 목적지를 지정해 주세요.':'🚩 Origin set. Please choose a destination.',
    '📍 현재 위치를 출발지로 설정하고 있습니다.':'📍 Setting your current location as the origin.',
    '현재 위치를 확인하지 못했습니다. 위치 권한을 허용하거나 출발지를 직접 지정해 주세요.':'Could not determine your current location. Allow location access or set the origin yourself.',
    '현재 위치를 확인하지 못했습니다. 출발지를 직접 지정해 주세요.':'Could not determine your current location. Please set the origin yourself.',
    '🏁 목적지를 설정했습니다. 현재 위치에서 경로를 계산합니다.':'🏁 Destination set. Calculating the route from your current location.',
    '🏁 목적지를 설정했습니다. 출발지를 지정해 주세요.':'🏁 Destination set. Please choose an origin.',
    '🏁 목적지를 설정했습니다. 경로를 계산합니다.':'🏁 Destination set. Calculating the route.',
    '🏁 현재 위치에서 선택한 목적지까지 경로를 계산합니다.':'🏁 Calculating the route from your current location to the selected destination.',
    '📍 지도에서 선택':'📍 Selected on map',
    '이 위치를 경로에 사용할까요?':'Use this location for the route?',
    '목적지만 설정하면 현재 위치가 자동으로 출발지가 됩니다.':'If you set only a destination, your current location becomes the origin automatically.',
    '🚩 출발지로 설정':'🚩 Set as origin',
    '🏁 목적지로 설정':'🏁 Set as destination',
    '선택됨 · 손을 떼세요':'Selected · Release your finger',
    '현재 위치 기능을 지원하지 않습니다.':'Location services are not supported.',
    '현재 위치 기능을 지원하지 않는 브라우저입니다.':'This browser does not support location services.',
    '현재 위치 좌표가 올바르지 않습니다.':'The current location coordinates are invalid.',

    /* 보행 안내 */
    '기존 경로 미리보기를 유지합니다.':'Keeping the existing route preview.',
    '목적지 정보를 확인하지 못했습니다. 다시 길찾기해 주세요.':'Destination information could not be confirmed. Please run directions again.',
    '경로 재계산 기능을 불러오지 못했습니다.':'The route recalculation function could not be loaded.',
    '출발지 정보를 갱신할 수 없습니다.':'The origin could not be updated.',
    '재계산된 경로를 찾지 못했습니다.':'No recalculated route was found.',

    /* AI 안내 화면 */
    '가까운 안전시설':'Nearby safety facilities',
    'AI가 답변을 작성하고 있습니다':'The AI is writing a response',
    '주소와 기준 지점으로부터의 직선거리를 확인하고 정확한 장소를 선택해 주세요.':'Check the address and the straight-line distance from the reference point, then select the correct place.',
    '주소를 확인하고 정확한 장소를 선택해 주세요.':'Check the address and select the correct place.',
    '원하는 장소가 없다면 시·도 또는 구·군 이름을 포함해 다시 입력해 주세요.':'If the place you want is not listed, enter it again with the province, city, or district name.',
    '장소 검색 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.':'Could not connect to the place-search server. Please try again shortly.',
    '다음 출발지와 도착지가 맞습니까?':'Are this origin and destination correct?',
    '지도가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.':'The map is not ready yet. Please try again shortly.',
    '지도가 아직 준비되지 않았습니다.':'The map is not ready yet.',
    '현재 위치를 아직 확인하지 못했습니다. 위치 권한을 허용하고 잠시 후 다시 요청해 주세요.':'Your current location is not available yet. Allow location access and ask again shortly.',
    '현재 위치를 다시 확인한 뒤 길찾기를 시도해 주세요.':'Confirm your current location again, then try directions.',
    'AI 서버가 올바른 JSON을 반환하지 않았습니다.':'The AI server returned an invalid response.',
    'AI 명령 형식이 올바르지 않습니다.':'The AI returned an invalid action.',
    'AI 답변을 확인하지 못했습니다.':'No AI response was returned.',
    '답변을 생성하지 못했습니다.':'A response could not be generated.',
    'AI 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.':'The AI response is delayed. Please try again shortly.',
    '현재 AI 안내 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.':'Could not connect to the AI guide service. Please try again shortly.',
    '길찾기 요청을 정확하게 이해하지 못했습니다. 출발지와 목적지를 조금 더 구체적으로 말씀해 주세요.':'The directions request could not be understood. Please state the origin and destination more specifically.',
    '길찾기 요청을 취소했습니다.':'The directions request was cancelled.',
    '안전시설 조회 모듈을 사용할 수 없습니다.':'The safety-facility lookup module is unavailable.',
    '안전시설 조회 명령이 올바르지 않습니다.':'The safety-facility lookup request is invalid.',
    '현재 위치 권한이 차단되어 있습니다. 브라우저의 사이트 위치 권한을 허용한 뒤 다시 시도해 주세요.':'Location permission is blocked. Allow location access for this site in your browser and try again.',
    '현재 위치 신호를 확인하기 어렵습니다. 잠시 후 다시 시도해 주세요.':'The location signal is weak. Please try again shortly.',
    '현재 위치 확인이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.':'Location confirmation is taking longer than usual. Please try again shortly.',
    '현재 브라우저에서는 위치 기능을 사용할 수 없습니다.':'Location services are not available in this browser.',
    '현재 위치를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.':'Could not determine your current location. Please try again shortly.',
    '지원하지 않는 안전시설 종류입니다.':'Unsupported safety-facility type.',
    '시설 자료가 일부만 조회되어 결과를 확인할 수 없습니다.':'Only part of the facility data was retrieved, so the result cannot be confirmed.',
    '현재 위치 주변에서 요청한 안전시설을 찾지 못했습니다. 생활안전지도 데이터 제공 범위에 따라 일부 지역은 결과가 없을 수 있습니다.':'The requested safety facility was not found near your current location. Some areas may return no results depending on SafeMap data coverage.',
    '현재 위치 기준 가까운 안전시설을 종류별로 확인했습니다.':'The nearest safety facilities from your current location are listed by type.',
    '거리는 현재 GPS 좌표 기준 직선거리입니다. 실제 보행거리는 “여기로 길찾기”에서 확인해 주세요.':'Distances are straight-line distances from your current GPS position. Use “Directions here” to check the actual walking distance.',
    '시설 조회 기능을 사용할 수 없습니다. 페이지를 새로고침해 주세요.':'The facility lookup function is unavailable. Please refresh the page.',
    '모든 시설 조회 실패':'All facility lookups failed',
    '일부 시설 자료를 확인하지 못했습니다. 조회된 결과를 안내하며, 더 가까운 시설이 있을 수 있습니다.':'Some facility data could not be retrieved. The results shown use the data available; a closer facility may exist.',
    '생활안전지도에서 주변 시설을 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.':'Nearby facilities could not be retrieved from SafeMap. Please try again shortly.',

    /* 시설 접근성 점수 설명 (AI 서버를 거치지 않는 고정 안내) */
    '시설 접근성 점수 계산 안내':'How the infrastructure accessibility score is calculated',
    '현재 계산식: 시설 원점수 ÷ 45 × 100':'Formula: raw facility score ÷ 45 × 100',
    '현재 버전은 기본점수와 거리 보너스를 더하지 않습니다.':'This version adds no base score and no distance bonus.',
    '시설별 최대 점수':'Maximum score by facility type',
    '• 치안시설: 17점':'• Police facilities: 17 pts',
    '• CCTV: 11점':'• CCTV: 11 pts',
    '• 안전비상벨: 11점':'• Emergency bells: 11 pts',
    '• 아동안전지킴이집: 6점':'• Child Safety Houses: 6 pts',
    '• 어린이안전지킴이집: 6점':'• Child Safety Houses: 6 pts',
    '시설별 가중 점수에 경로와의 거리를 반영합니다.':'The weighted score of each facility reflects its distance from the route.',
    '• 30m 이내: 100%':'• Within 30 m: 100%',
    '• 30m 초과~60m 이내: 75%':'• Over 30 m, up to 60 m: 75%',
    '• 60m 초과~100m 이내: 40%':'• Over 60 m, up to 100 m: 40%',
    '• 100m 초과~150m 이내: 15%':'• Over 100 m, up to 150 m: 15%',
    '• 150m 초과: 반영하지 않음':'• Over 150 m: not counted',
    '정상 조회 결과 시설이 없으면 0점입니다. 모든 시설 조회가 실패하면 점수를 산출하지 않습니다.':'If a successful lookup finds no facilities, the score is 0. If every facility lookup fails, no score is produced.',
    '일부 자료만 조회되면 실제보다 낮게 계산될 수 있습니다.':'If only part of the data is retrieved, the score may be lower than it would be with complete data.',
    '100점은 평가항목의 상한이며, 안전 확률이나 실제 안전을 보장하는 수치가 아닙니다.':'100 is the upper limit of the evaluated items. It is not a probability of safety and does not guarantee actual safety.'
  };

  for(const [ko,en] of Object.entries(EXACT_EN_V14)){
    if(!EXACT_EN.has(ko))EXACT_EN.set(ko,en);
  }

  /* 영어 모드에서 앱이 사용자 말풍선에 대신 적어 주는 문구 */
  const USER_BUBBLE_EN={
    '내 주변 안전시설 알려줘':'Show safety facilities near me',
    '장소를 다시 선택할게요.':'I will choose the place again.'
  };

  const SCORE_HELP_QUESTION_EN='How is the SafeWalk infrastructure accessibility score calculated?';
  const SCORE_HELP_QUESTION_KO='SafeWalk 시설 접근성 점수는 어떻게 계산하나요?';
  const SCORE_HELP_LINES_KO=[
    '시설 접근성 점수 계산 안내','',
    '현재 계산식: 시설 원점수 ÷ 45 × 100',
    '현재 버전은 기본점수와 거리 보너스를 더하지 않습니다.','',
    '시설별 최대 점수',
    '• 치안시설: 17점','• CCTV: 11점','• 안전비상벨: 11점','• 아동안전지킴이집: 6점','',
    '시설별 가중 점수에 경로와의 거리를 반영합니다.',
    '• 30m 이내: 100%','• 30m 초과~60m 이내: 75%','• 60m 초과~100m 이내: 40%',
    '• 100m 초과~150m 이내: 15%','• 150m 초과: 반영하지 않음','',
    '정상 조회 결과 시설이 없으면 0점입니다. 모든 시설 조회가 실패하면 점수를 산출하지 않습니다.',
    '일부 자료만 조회되면 실제보다 낮게 계산될 수 있습니다.',
    '100점은 평가항목의 상한이며, 안전 확률이나 실제 안전을 보장하는 수치가 아닙니다.'
  ];

  function fullTranslate(value){
    return typeof window.safeWalkTranslate==='function'
      ?window.safeWalkTranslate(value)
      :translateDynamic(value);
  }

  function facilityNameEn(ko){
    const key=String(ko||'').trim();
    return FACILITY_EN[key]||EXACT_EN.get(key)||key;
  }

  function lowerFirst(value){
    const text=String(value||'');
    if(/^(CCTV|CPTED|Child Safety House)/.test(text))return text;
    return text.charAt(0).toLowerCase()+text.slice(1);
  }

  /* v1.4에서 추가한 동적 문구 규칙. 일치하지 않으면 null. */
  function translateDynamicV14(text){
    let m;

    /* 지도 팝업 · 통계 */
    m=text.match(/^(\d+)대$/);
    if(m)return m[1]+(m[1]==='1'?' camera':' cameras');
    m=text.match(/^저장일 (\d{4})\. ?(\d{1,2})\. ?(\d{1,2})\.?$/);
    if(m)return 'Saved on '+m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    m=text.match(/^저장일 (.+)$/);
    if(m)return 'Saved on '+m[1];
    m=text.match(/^위도 (-?\d+(?:\.\d+)?) · 경도 (-?\d+(?:\.\d+)?)$/);
    if(m)return 'Latitude '+m[1]+' · Longitude '+m[2];
    m=text.match(/^“(.+)”을\(를\) 즐겨찾기에서 삭제할까요\?$/);
    if(m)return 'Remove “'+(m[1]==='즐겨찾는 장소'?'Favorite place':m[1])+'” from favorites?';
    m=text.match(/^선택 지점에서 직선거리 약 (.+)$/);
    if(m)return 'Approx. '+m[1]+' in a straight line from the selected point';

    /* 레이어 */
    m=text.match(/^(.+)은\(는\) (이 지역 시설 밀집으로 )?zoom (\d+) 이상에서 표시됩니다\.$/);
    if(m)return facilityNameEn(m[1])+' is shown at zoom level '+m[3]+' or higher'+(m[2]?' because this area has many facilities':'')+'.';
    m=text.match(/^알 수 없는 레이어: (.+)$/);
    if(m)return 'Unknown layer: '+m[1];
    m=text.match(/^시설 조회 실패: HTTP (\d+)$/);
    if(m)return 'Facility lookup failed: HTTP '+m[1];
    m=text.match(/^(.*?)(치안시설|CCTV|안전비상벨|아동안전지킴이집|어린이안전지킴이집)\s+(\d)순위$/u);
    if(m&&/^[^\p{L}\p{N}]*$/u.test(m[1]))return m[1]+FACILITY_EN[m[2]]+' · Priority '+m[3];

    /* 장소 검색 */
    m=text.match(/^(.+): VWorld 검색 요청에 실패했습니다\.$/);
    if(m)return m[1]+': The VWorld search request failed.';
    m=text.match(/^지원하지 않는 VWorld 검색 유형입니다: (.+)$/);
    if(m)return 'Unsupported VWorld search type: '+m[1];

    /* 보행 안내 */
    m=text.match(/^현재 위치 ↔ 설정 출발지 · 약 (.+)$/);
    if(m)return 'Current location ↔ route origin · approx. '+m[1];

    /* AI 안내 화면 */
    m=text.match(/^조회된 시설 중 현재 위치에서 가까운 (.+)입니다\.$/);
    if(m)return 'This is the nearest '+lowerFirst(facilityNameEn(m[1]))+' found from your current location.';
    m=text.match(/^‘(.+)’의 장소 검색 결과를 찾지 못했습니다\. 지역명과 시설명을 함께 입력해 주세요\. 예: “현재 위치에서 포항시 포항역까지”$/);
    if(m)return 'No place results were found for “'+m[1]+'”. Enter the area name together with the place name, e.g. “From my current location to Pohang Station, Pohang”.';
    m=text.match(/^질문은 (\d+)자 이하로 입력해 주세요\.$/);
    if(m)return 'Please keep your question within '+m[1]+' characters.';
    m=text.match(/^AI 요청 실패: HTTP (\d+)$/);
    if(m)return 'AI request failed: HTTP '+m[1];
    m=text.match(/^(출발지|도착지) 선택: ([\s\S]+)$/);
    if(m)return (m[1]==='출발지'?'Origin':'Destination')+' selected: '+m[2];
    m=text.match(/^📍 현재 위치 · (.+)$/);
    if(m)return '📍 Current location · '+fullTranslate(m[1]);

    /* 여러 줄 메시지: 줄 단위로 번역 */
    if(text.includes('\n')){
      const lines=text.split('\n');
      const translated=lines.map(line=>line.trim()?fullTranslate(line):line);
      if(translated.some((line,index)=>line!==lines[index]))return translated.join('\n');
    }

    /* 앞에 그림 문자만 붙은 표시 이름: "🗺 어린이범죄주의", "🧒 어린이" 등 */
    m=text.match(/^([^\p{L}\p{N}]+?)\s*([\p{L}\p{N}][\s\S]*)$/u);
    if(m&&/[가-힣]/.test(m[2])){
      const rest=fullTranslate(m[2]);
      if(rest!==m[2])return m[1]+' '+rest;
    }

    return null;
  }

  function translateDynamic(rawValue){
    const raw=String(rawValue||'');
    const text=raw.trim();
    if(!text)return raw;

    const exact=EXACT_EN.get(text)||EXACT_EN.get(text.replace(/\s+/g,' '))||EXACT_EN.get(text.replace(/아동안전지킴이집/g,'어린이안전지킴이집'));
    if(exact)return raw.replace(text,exact);

    let m;

    /* Dynamic status values and complete messages (never rewrite place names). */
    m=text.match(/^(?:목적지 "(.+)" )?도착 예정 시간이 지났습니다\. 괜찮다면 "무사히 도착했어요"를 눌러 주세요\.$/);
    if(m)return raw.replace(text,'Your expected arrival time'+(m[1]?' at “'+m[1]+'”':'')+' has passed. If you are safe, tap “I arrived safely”.');
    m=text.match(/^\[SafeWalk 안심 타이머\] 도착 예정 시간이 지났습니다\.(?: \(목적지: (.+)\))?$/);
    if(m)return raw.replace(text,'[SafeWalk safety timer] My expected arrival time has passed.'+(m[1]?' (Destination: '+m[1]+')':''));
    m=text.match(/^복사에 실패했습니다\. 위치: (.+)$/);
    if(m)return raw.replace(text,'Copy failed. Location: '+(m[1]==='확인 필요'?'unavailable':m[1]));
    m=text.match(/^🗺 지도에서 (출발지|도착지)를 한 번 터치하세요\.$/);
    if(m)return raw.replace(text,'🗺 Tap the '+(m[1]==='출발지'?'origin':'destination')+' on the map.');
    m=text.match(/^(\d+)개$/);
    if(m)return raw.replace(text,m[1]+' found');
    m=text.match(/^(\d+)건$/);
    if(m)return raw.replace(text,m[1]+' found');
    m=text.match(/^(\d+)분$/);
    if(m)return raw.replace(text,m[1]+' min');
    m=text.match(/^출발지 (.+?) · 목적지 (.+)$/);
    if(m)return raw.replace(text,'Origin '+m[1]+' · Destination '+m[2]);

    m=text.match(/^(.*?)\s*(치안시설|안전비상벨|아동안전지킴이집|어린이안전지킴이집|범죄주의구간)$/u);
    if(m&&/^[^\p{L}\p{N}]*$/u.test(m[1]))return raw.replace(text,m[1]+(m[1]?' ':'')+(FACILITY_EN[m[2]]||'Crime caution area'));
    m=text.match(/^(이 지역 시설 밀집 · )?zoom (\d+)↑ 확대 필요$/);
    if(m)return raw.replace(text,(m[1]?'Dense facility area · ':'')+'Zoom in to level '+m[2]+'+');

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
      for(const [ko,en] of Object.entries(FACILITY_EN))tail=tail.replaceAll(ko,en);
      return raw.replace(text,'🔍 Zoom in — '+tail);
    }

    /* 시간 */
    m=text.match(/^약\s*(\d+)\s*분$/);
    if(m)return raw.replace(text,'~'+m[1]+' min');

    m=text.match(/^약\s*(\d+)\s*시간\s*(\d+)\s*분$/);
    if(m)return raw.replace(text,'~'+m[1]+' hr '+m[2]+' min');

    m=text.match(/^약\s*(\d+)\s*시간$/);
    if(m)return raw.replace(text,'~'+m[1]+' hr');

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
      const detail=m[1]
        .split(' · ')
        .map(part=>{
          const item=part.match(/^(.+) 약 (\d+)m$/);
          return item?fullTranslate(item[1])+' approx. '+item[2]+' m':part;
        })
        .join(' · ');
      return raw.replace(
        text,
        '⚠️ The searched point is separated from the mapped walking-network entry point — '+
        detail+
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

    const added=translateDynamicV14(text);
    if(added!==null)return raw.replace(text,added);

    return raw;
  }

  window.safeWalkExtraTranslation=translateDynamic;

  function translateWholePage(){
    if(typeof window.refreshSafeWalkTranslations==='function')window.refreshSafeWalkTranslations();
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
     v1.4: 본문 밖 문구(탭 제목, 요약 설명)와 이미지 대체 문구
     ---------------------------------------------------------- */
  function translateDocumentMeta(){
    document.title='SafeWalk | AI-Assisted Safe Walking Directions';
    const description='SafeWalk is a walking-safety map service that shows police facilities, CCTV, emergency bells, and Child Safety Houses from public data, with an infrastructure accessibility score for walking routes.';
    for(const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]']){
      const meta=document.querySelector(selector);
      if(meta&&/[가-힣]/.test(meta.getAttribute('content')||''))meta.setAttribute('content',description);
    }
    for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]','meta[name="apple-mobile-web-app-title"]']){
      const meta=document.querySelector(selector);
      if(meta&&/[가-힣]/.test(meta.getAttribute('content')||''))meta.setAttribute('content','SafeWalk | AI-Assisted Safe Walking Directions');
    }
  }

  function translateAlt(el){
    if(!el||typeof el.getAttribute!=='function')return;
    const value=el.getAttribute('alt');
    if(!value||!/[가-힣]/.test(value))return;
    const translated=fullTranslate(value);
    if(translated!==value)el.setAttribute('alt',translated);
  }

  function translateAllAlt(root){
    if(!root)return;
    if(root.nodeType===Node.ELEMENT_NODE){
      translateAlt(root);
      root.querySelectorAll('[alt]').forEach(translateAlt);
    }
  }

  function installAltObserver(){
    if(!document.body)return;
    translateAllAlt(document.body);
    new MutationObserver(mutations=>{
      for(const mutation of mutations){
        if(mutation.type==='attributes'){
          translateAlt(mutation.target);
          continue;
        }
        mutation.addedNodes.forEach(translateAllAlt);
      }
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['alt']});
  }

  /* ----------------------------------------------------------
     v1.4: AI 안내 화면
     - 사용자 말풍선은 번역 대상에서 제외되어 있으므로,
       앱이 대신 적어 주는 문구만 표시 직전에 영어로 바꾼다.
       (사용자가 직접 입력한 문장과 장소명·주소는 바꾸지 않는다.)
     - 점수 설명은 한국어 모드와 같이 AI 서버를 거치지 않고 고정 안내로 답한다.
     ---------------------------------------------------------- */
  function installChatEnglishFix(){
    if(typeof appendChatMessage==='function'&&!appendChatMessage.__swEnglish){
      const originalAppend=appendChatMessage;
      const wrappedAppend=function(role,text,isError){
        let shown=text;
        if(isEnglish()&&role==='user'&&typeof text==='string'){
          const m=text.match(/^(출발지|도착지) 선택: ([\s\S]+)$/);
          if(m)shown=(m[1]==='출발지'?'Origin':'Destination')+' selected: '+m[2];
          else if(USER_BUBBLE_EN[text])shown=USER_BUBBLE_EN[text];
        }
        return originalAppend.call(this,role,shown,isError);
      };
      wrappedAppend.__swEnglish=true;
      appendChatMessage=wrappedAppend;
    }

    if(typeof askChatQuick==='function'&&!askChatQuick.__swEnglish){
      const originalAsk=askChatQuick;
      const wrappedAsk=function(message){
        if(isEnglish()&&(message===SCORE_HELP_QUESTION_EN||message===SCORE_HELP_QUESTION_KO)){
          if(typeof chatBusy!=='undefined'&&chatBusy)return;
          if(typeof openChatPanel==='function')openChatPanel();
          const answer=SCORE_HELP_LINES_KO.map(line=>line?fullTranslate(line):line).join('\n');
          appendChatMessage('user',SCORE_HELP_QUESTION_EN);
          appendChatMessage('bot',answer);
          if(typeof safeWalkAgentRememberTurn==='function')safeWalkAgentRememberTurn(SCORE_HELP_QUESTION_EN,answer);
          return;
        }
        return originalAsk.apply(this,arguments);
      };
      wrappedAsk.__swEnglish=true;
      askChatQuick=wrappedAsk;
    }
  }

  /* ----------------------------------------------------------
     동적 UI 감시
     ---------------------------------------------------------- */
  function installDialogTranslation(){
    for(const name of ['alert','confirm']){
      const original=window[name];
      if(typeof original!=='function')continue;
      window[name]=function(message){
        const text=typeof window.safeWalkTranslate==='function'?window.safeWalkTranslate(message):message;
        return original.call(window,text);
      };
    }
  }

  function boot(){
    normalizeYouthCard();
    installDialogTranslation();
    installAgentLanguageFix();

    if(isEnglish()){
      translateDocumentMeta();
      installAltObserver();
      installChatEnglishFix();
      translateWholePage();

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

