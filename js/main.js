/* ============================================================
   SafeWalk v2.0 — main.js
   앱 시작점: 인트로 화면 버튼, 화면 전환, 초기화.
   가장 마지막에 로드되는 파일입니다.

   [v2 개선]
   - DOMContentLoaded에서 로딩 화면을 숨긴다(기존 window.onload는
     모든 이미지·폰트를 기다려서 스피너가 오래 떠 있었음)
   - Leaflet CDN 로드 실패 확인을 "지도 시작" 시점으로 이동
   - 뒤로가기 시 진행 중이던 AI 길찾기 대화도 함께 정리
   ============================================================ */

/* ── 인트로 ── */
function toggleRouteGuide(){
  const guide=document.getElementById('routeGuide');
  if(!guide)return;
  guide.classList.toggle('open');
  const btn=guide.querySelector('.route-guide-more');
  if(btn)btn.textContent=guide.classList.contains('open')?'점수 계산 접기':'점수 계산 자세히 보기';
}
function pick(el){
  document.querySelectorAll('.age-card').forEach(c=>c.classList.remove('selected'));
  el.classList.add('selected');
  grp=el.dataset.group;
  document.getElementById('startBtn').classList.add('on');
  warmupLocation(); /* 위치·중심 타일을 미리 받아 지도 진입을 빠르게 — map.js */
}

/* Leaflet이 아직 없으면(CDN 실패) 지도를 시작하지 않고 안내한다 */
function ensureLeafletReady(){
  if(typeof L!=='undefined')return true;
  showRouteToast('지도 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하고 새로고침해 주세요.');
  return false;
}

function start(){
  if(!grp)return;
  if(!ensureLeafletReady())return;
  document.getElementById('intro').classList.add('out');
  document.getElementById('map-screen').classList.add('show');
  setChromeVisible(true);
  updateRouteButtonVisibility();
  initMap();
}
function startCpted(){
  if(!ensureLeafletReady())return;
  grp='cpted';
  document.querySelectorAll('.age-card').forEach(c=>c.classList.remove('selected'));
  document.getElementById('startBtn').classList.remove('on');
  document.getElementById('intro').classList.add('out');
  document.getElementById('map-screen').classList.add('show');
  setChromeVisible(true);
  updateRouteButtonVisibility();
  clearRoute();
  initMap();
}
function goBack(){
  document.body.classList.remove('route-panel-suppressed');
  document.getElementById('intro').classList.remove('out');
  document.getElementById('map-screen').classList.remove('show');
  const sheet=document.getElementById('sheet');
  if(sheet)applyLayerSheetState(false,false);
  setChromeVisible(false);
  clearRoute();
  cptedTapRequestToken++;
  clearCptedGuide(true);

  /* 진행 중이던 AI 길찾기 대화 흐름도 무효화한다 */
  chatRouteRequestToken++;
  chatRouteFlow=null;
  disableOldChatRouteControls();

  /* v2.1 기능 정리(안전 감사·안심 편의점·긴급 패널·사이렌).
     안심 타이머는 귀갓길 보호가 목적이므로 여기서 끄지 않는다. */
  resetAuditFeature();
  resetHavenFeature();
  closeEmergencyPanel();
  stopSiren();

  if(watchId){navigator.geolocation.clearWatch(watchId);watchId=null;}
  mapDomCleanups.forEach(fn=>fn());
  mapDomCleanups=[];
  if(map){map.remove();map=null;}
  myMark=null;
  layers={};wmsTiles={};chipOn={};counts={};
  markerCache={};markerFetchBounds={};markerFetchZoom={};markerFetchTruncated={};
  layerMinZoom={};
  safeFacilityPoints=[];safeFacilitySeen=new Set();
  suppressMoveFetch=false;
  zoomBlocked=false;
  closeSearchPanel();
  routeOrigin=null;routeDest=null;activeSlot='dest';routeSnapNote='';
  updateSlotUI();
  const spr=document.getElementById('spResults');if(spr)spr.innerHTML='';
  const spi=document.getElementById('spInput');if(spi)spi.value='';

  resetPageScrollToTop();
}

/* 브라우저가 이전 스크롤 위치를 자동 복원하지 않도록 설정 */
if('scrollRestoration' in history){
  history.scrollRestoration='manual';
}


/* 항상 화면 최상단으로 이동 */
function resetPageScrollToTop(){

  window.scrollTo({
    top:0,
    left:0,
    behavior:'instant'
  });

}


/* ── 부팅 ── */
document.addEventListener('DOMContentLoaded',function(){

  resetPageScrollToTop();

  bindViewportSync();

  bindSearchInput();

  bindChatInput();

  const ver=document.getElementById('versionTag');

  if(ver)ver.textContent=APP_VERSION;

  restoreSafeTimer();

  document.getElementById('loading').classList.add('hide');


  /*
    모바일 Safari / Chrome에서
    레이아웃 계산 후 스크롤 위치가 다시 복원되는 경우 방지
  */
  requestAnimationFrame(
    resetPageScrollToTop
  );

  setTimeout(
    resetPageScrollToTop,
    100
  );

});


/*
  뒤로가기 캐시(bfcache)로 페이지가 복원될 때도
  메인 화면이면 최상단으로 맞춤
*/
window.addEventListener('pageshow',function(){

  const intro=
    document.getElementById('intro');

  if(
    intro &&
    !intro.classList.contains('out')
  ){
    resetPageScrollToTop();
  }

});
