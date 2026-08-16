/* ============================================================
   SafeWalk v2.0 — viewport.js
   모바일 화면 크기·키보드 대응.
   visualViewport로 "키보드가 열렸는지"와 "핀치 확대인지"를 구분해
   CSS 변수(--vv-top, --vv-bottom, --app-vh)로 UI를 재배치합니다.
   이 파일은 지도 데이터와 무관하므로 건드릴 일이 거의 없습니다.
   ============================================================ */

let invalidateTimer=null;
let stableVisualViewportHeight=0;
let lastViewportChromeSignature='';

function isTextEntryElement(el){
  if(!el||!el.tagName)return false;
  const tag=el.tagName.toLowerCase();
  return tag==='input'||tag==='textarea'||tag==='select'||el.isContentEditable===true;
}

function isCompactMobileUI(){
  return window.matchMedia('(max-width:768px), (pointer:coarse)').matches;
}

function dismissMobileKeyboard(){
  if(!isCompactMobileUI())return;
  const active=document.activeElement;
  if(isTextEntryElement(active)&&typeof active.blur==='function')active.blur();
  requestAnimationFrame(syncViewportChrome);
}

function syncViewportChrome(){
  const root=document.documentElement;
  const vv=window.visualViewport;
  const layoutHeight=Math.max(1,window.innerHeight);
  const activeIsInput=isTextEntryElement(document.activeElement);

  let top=0;
  let bottom=0;
  let h=layoutHeight;
  let keyboardOpen=false;

  if(vv){
    const visibleHeight=Math.max(1,vv.height);
    const viewportScale=Number(vv.scale)||1;
    const pageZoomed=Math.abs(viewportScale-1)>0.02;

    /*
      브라우저 전체 화면 확대가 아니라 키보드가 열린 경우에만
      visualViewport 크기를 UI 배치에 반영한다.

      지도 핀치 확대·축소 중에는 위·아래 UI와 앱 높이를 건드리지
      않으므로 Leaflet 지도 영역만 확대·축소된다.
    */
    if(!activeIsInput&&!pageZoomed){
      stableVisualViewportHeight=Math.max(
        stableVisualViewportHeight,
        visibleHeight,
        layoutHeight
      );
    }else if(stableVisualViewportHeight===0){
      stableVisualViewportHeight=Math.max(visibleHeight,layoutHeight);
    }

    const keyboardLoss=Math.max(
      0,
      stableVisualViewportHeight-visibleHeight
    );

    keyboardOpen=Boolean(
      activeIsInput &&
      !pageZoomed &&
      keyboardLoss>120
    );

    if(keyboardOpen){
      h=visibleHeight;
      top=Math.max(0,vv.offsetTop||0);
      bottom=Math.max(
        0,
        layoutHeight-visibleHeight-(vv.offsetTop||0)
      );
    }
  }

  const roundedTop=Math.round(top);
  const roundedBottom=Math.round(bottom);
  const roundedHeight=Math.round(h);
  const signature=[
    roundedTop,
    roundedBottom,
    roundedHeight,
    keyboardOpen?'1':'0'
  ].join('|');

  root.style.setProperty('--vv-top',roundedTop+'px');
  root.style.setProperty('--vv-bottom',roundedBottom+'px');
  root.style.setProperty('--app-vh',roundedHeight+'px');

  if(document.body){
    document.body.classList.toggle('keyboard-open',keyboardOpen);
  }

  /*
    실제 화면 높이나 키보드 상태가 바뀐 경우에만 Leaflet 크기를
    다시 계산한다. 지도 확대 제스처마다 UI 재배치가 발생하지 않는다.
  */
  if(signature!==lastViewportChromeSignature){
    lastViewportChromeSignature=signature;
    clearTimeout(invalidateTimer);
    invalidateTimer=setTimeout(()=>{
      if(map)map.invalidateSize({animate:false});
    },160);
    updateRoutePanelPosition();
  }
}

function bindViewportSync(){
  if(window.__swViewportBound)return;
  window.__swViewportBound=true;

  window.addEventListener('resize',syncViewportChrome);
  window.addEventListener('orientationchange',()=>{
    stableVisualViewportHeight=0;
    setTimeout(syncViewportChrome,260);
  });
  window.addEventListener('pageshow',syncViewportChrome);

  document.addEventListener('focusin',()=>requestAnimationFrame(syncViewportChrome));
  document.addEventListener('focusout',()=>setTimeout(syncViewportChrome,80));

  if(window.visualViewport){
    window.visualViewport.addEventListener('resize',syncViewportChrome);
    window.visualViewport.addEventListener('scroll',syncViewportChrome);
  }

  syncViewportChrome();
}

/* 지도 화면의 상단바·바텀시트·AI 버튼을 한 번에 보이기/숨기기 */
function setChromeVisible(on){
  const visible=Boolean(on);
  const bar=document.getElementById('topbar');
  if(bar)bar.classList.toggle('show',visible);
  const sheet=document.getElementById('sheet');
  if(sheet)sheet.classList.toggle('show',visible);
  const chatFab=document.getElementById('chatFab');
  if(chatFab)chatFab.classList.toggle('show',visible);
  if(!visible){
    updateZoomNotice(false);
    closeSearchPanel();
    closeChatPanel();
    if(typeof closeEmergencyPanel==='function')closeEmergencyPanel();
    if(typeof closeAuditPanel==='function')closeAuditPanel();
  }
  syncViewportChrome();
}
