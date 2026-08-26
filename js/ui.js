/* ============================================================
   SafeWalk v2.0 — ui.js
   지도 화면의 공용 UI 부품: 레이어 바텀시트, 경로 패널 위치 조정,
   경로 상세 접기/펼치기, 토스트 메시지.
   "패널이 겹친다 / 시트가 안 열린다" 같은 문제는 이 파일을 보세요.
   ============================================================ */

let sheetInited=false;
let routePanelResizeBound=false;

/* ── Bottom Sheet(레이어 설정) ── */
function applyLayerSheetState(open,animate=true){
  const sheet=document.getElementById('sheet');
  const toggleBtn=document.getElementById('sheetToggleBtn');
  if(!sheet||!toggleBtn)return;
  const next=Boolean(open);
  sheet.dataset.sheetState=next?'open':'closed';
  sheet.classList.toggle('open',next);
  sheet.style.transition=animate?'transform .3s cubic-bezier(.4,0,.2,1)':'none';
  sheet.style.transform=next?'translate3d(0,0,0)':'translate3d(0,calc(100% - 56px),0)';
  toggleBtn.setAttribute('aria-expanded',next?'true':'false');
  const label=document.getElementById('sheetLabel');
  if(label)label.textContent=next?'레이어 설정 접기':'레이어 설정';
  const arrow=document.getElementById('sheetToggleArrow');
  if(arrow)arrow.textContent=next?'⌄':'⌃';
  if(!next)document.body.classList.remove('route-panel-suppressed');
  requestAnimationFrame(()=>{syncRoutePanelWithSheet();updateRoutePanelPosition();});
}
function openLayerSheet(){applyLayerSheetState(true,true);}
function closeLayerSheet(){applyLayerSheetState(false,true);}
function toggleLayerSheet(event){
  if(event){event.preventDefault();event.stopPropagation();}
  const sheet=document.getElementById('sheet');
  if(!sheet)return false;
  const isOpen=sheet.dataset.sheetState==='open'||sheet.classList.contains('open');
  isOpen?closeLayerSheet():openLayerSheet();
  return false;
}
function initSheet(){
  if(sheetInited)return;
  sheetInited=true;
  if(!routePanelResizeBound){
    routePanelResizeBound=true;
    window.addEventListener('resize',()=>{resetRouteDetails();syncRoutePanelWithSheet();});
    window.addEventListener('orientationchange',()=>setTimeout(syncRoutePanelWithSheet,250));
  }
  initRouteDetailsToggle();
  applyLayerSheetState(false,false);
}
function getSheetVisibleHeight(){
  const sheet=document.getElementById('sheet');
  if(!sheet||!sheet.classList.contains('show'))return 0;
  const h=sheet.offsetHeight||0;
  if(!h)return 0;
  if(sheet.dataset.sheetState==='open')return h;
  return Math.min(56,h);
}
function isCompactRouteLayout(){
  return window.matchMedia('(max-width:768px), (max-height:560px) and (max-width:1024px)').matches;
}
function setRoutePanelSuppressed(suppressed){
  const shouldSuppress=Boolean(suppressed)&&isCompactRouteLayout();
  const wasSuppressed=document.body.classList.contains('route-panel-suppressed');
  document.body.classList.toggle('route-panel-suppressed',shouldSuppress);
  if(shouldSuppress&&!wasSuppressed)resetRouteDetails();
}
function syncRoutePanelWithSheet(){
  const sheet=document.getElementById('sheet');
  const suppress=Boolean(sheet&&sheet.classList.contains('show')&&sheet.dataset.sheetState==='open'&&isCompactRouteLayout());
  setRoutePanelSuppressed(suppress);
  requestAnimationFrame(()=>updateRoutePanelPosition());
}

/* ── 경로 상세 접기/펼치기 ── */
function setRouteDetailsOpen(open){
  const box=document.getElementById('routeDetailsBox');
  const btn=document.getElementById('routeDetailsToggle');
  const panel=document.getElementById('routePanel');
  const details=document.getElementById('routeDetails');
  if(!box)return;
  const next=Boolean(open);
  box.classList.toggle('open',next);
  if(btn)btn.setAttribute('aria-expanded',next?'true':'false');
  if(!next){
    if(panel)panel.scrollTop=0;
    if(details)details.scrollTop=0;
  }
  requestAnimationFrame(()=>updateRoutePanelPosition());
}
function toggleRouteDetails(event){
  if(event){event.preventDefault();event.stopPropagation();}
  const box=document.getElementById('routeDetailsBox');
  if(!box)return false;
  setRouteDetailsOpen(!box.classList.contains('open'));
  return false;
}
function resetRouteDetails(){setRouteDetailsOpen(!isCompactRouteLayout());}
function initRouteDetailsToggle(){
  const btn=document.getElementById('routeDetailsToggle');
  if(!btn||btn.dataset.bound==='1')return;
  btn.dataset.bound='1';
  let handledAt=0;
  btn.addEventListener('click',e=>{
    if(Date.now()-handledAt<400){e.preventDefault();return;}
    toggleRouteDetails(e);
  });
  btn.addEventListener('pointerup',e=>{
    if(e.pointerType==='mouse')return;
    handledAt=Date.now();
    toggleRouteDetails(e);
  });
  resetRouteDetails();
}

/* ── 경로 패널 위치(바텀시트와 겹치지 않게) ── */
function updateRoutePanelPosition(visibleHeightOverride){
  const panel=document.getElementById('routePanel');
  if(!panel)return;
  const baseBottom=70;
  if(!panel.classList.contains('show')){
    panel.style.setProperty('--route-panel-bottom',baseBottom+'px');
    return;
  }
  const visible=Number.isFinite(visibleHeightOverride)?visibleHeightOverride:getSheetVisibleHeight();
  const sheet=document.getElementById('sheet');
  const mobileSheetOpen=Boolean(isCompactRouteLayout()&&sheet&&sheet.dataset.sheetState==='open');
  if(mobileSheetOpen){
    if(!document.body.classList.contains('route-panel-suppressed'))setRoutePanelSuppressed(true);
    panel.style.setProperty('--route-panel-bottom',baseBottom+'px');
    return;
  }
  let target=visible>70?visible+12:baseBottom;
  const topSafe=88;
  const vh=window.visualViewport?window.visualViewport.height:window.innerHeight;
  const maxBottom=Math.max(baseBottom,vh-panel.offsetHeight-topSafe);
  target=Math.max(baseBottom,Math.min(target,maxBottom));
  panel.style.setProperty('--route-panel-bottom',Math.round(target)+'px');
}
function updateRouteButtonVisibility(){
  const routeBtn=document.getElementById('routeBtn');
  if(routeBtn)routeBtn.style.display=grp==='cpted'?'none':'flex';
}

/* ── 토스트 메시지 ── */
function showRouteToast(msg,duration=3800){
  const t=document.getElementById('routeToast');
  if(!t){alert(msg);return;}

  t.textContent=msg;
  t.classList.add('show');

  clearTimeout(t._timer);

  t._timer=setTimeout(
    ()=>t.classList.remove('show'),
    duration
  );
}
