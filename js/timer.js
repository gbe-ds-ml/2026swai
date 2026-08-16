/* ============================================================
   SafeWalk v2.1 — timer.js
   안심 타이머(도착 확인) — WalkSafe의 HomeSafe 벤치마킹.

   길찾기 결과가 나오면 "예상 시간 + 10분" 타이머를 제안한다.
   시간 안에 '도착했어요'를 누르지 않으면 경고 화면을 띄우고
   보호자 문자·112 전화·사이렌 버튼을 크게 보여준다.

   한계(정직하게): 브라우저 탭이 완전히 종료되면 알림을 띄울 수
   없다. 화면을 껐다 켜면 localStorage의 마감시각을 확인해
   즉시 경고를 복원한다. 자동 문자 발송은 하지 않는다 —
   문자는 항상 사용자가 버튼을 눌러 보낸다.
   ============================================================ */

let safeTimerInterval=null;

function readSafeTimer(){
  try{
    const raw=localStorage.getItem(SAFE_TIMER_STORAGE_KEY);
    if(!raw)return null;
    const t=JSON.parse(raw);
    if(!t||!Number.isFinite(t.deadline))return null;
    return t;
  }catch(e){return null;}
}
function writeSafeTimer(t){
  try{
    if(t)localStorage.setItem(SAFE_TIMER_STORAGE_KEY,JSON.stringify(t));
    else localStorage.removeItem(SAFE_TIMER_STORAGE_KEY);
  }catch(e){}
}

/* 경로 패널에 타이머 제안 버튼 표시(route.js가 성공 시 호출) */
function offerSafeTimer(summary,destLabel){
  const box=document.getElementById('safeTimerBox');
  if(!box)return;
  if(readSafeTimer()){box.innerHTML='';return;} /* 이미 진행 중이면 제안 안 함 */
  const totalSec=Math.round((summary&&Number.isFinite(summary.durationSec)?summary.durationSec:0)+SAFE_TIMER_BUFFER_SEC);
  const mins=Math.max(1,Math.round(totalSec/60));
  box.innerHTML='';
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='safe-timer-offer';
  btn.textContent='🕒 안심 타이머 시작 ('+mins+'분 안에 도착 확인)';
  btn.addEventListener('click',()=>startSafeTimer(totalSec,destLabel||''));
  box.appendChild(btn);
}
function clearSafeTimerOffer(){
  const box=document.getElementById('safeTimerBox');
  if(box)box.innerHTML='';
}

function startSafeTimer(totalSec,destLabel){
  writeSafeTimer({
    deadline:Date.now()+totalSec*1000,
    dest:String(destLabel||''),
    startedAt:Date.now()
  });
  clearSafeTimerOffer();
  showRouteToast('🕒 안심 타이머 시작. 도착하면 상단의 "도착했어요"를 눌러 주세요.');
  renderSafeTimerPill();
  tickSafeTimer();
}

function finishSafeTimer(arrivedSafely){
  writeSafeTimer(null);
  if(safeTimerInterval){clearInterval(safeTimerInterval);safeTimerInterval=null;}
  const pill=document.getElementById('safeTimerPill');
  if(pill)pill.classList.remove('show');
  hideSafeTimerAlert();
  stopSiren();
  if(arrivedSafely)showRouteToast('✅ 무사 도착을 확인했습니다. 안심 타이머를 종료합니다.');
}

function renderSafeTimerPill(){
  const pill=document.getElementById('safeTimerPill');
  if(!pill)return;
  pill.classList.add('show');
}

function formatRemaining(ms){
  const s=Math.max(0,Math.round(ms/1000));
  const m=Math.floor(s/60);
  const r=s%60;
  return m+':'+String(r).padStart(2,'0');
}

function tickSafeTimer(){
  if(safeTimerInterval)clearInterval(safeTimerInterval);
  safeTimerInterval=setInterval(updateSafeTimerUI,1000);
  updateSafeTimerUI();
}

function updateSafeTimerUI(){
  const t=readSafeTimer();
  const pill=document.getElementById('safeTimerPill');
  if(!t){
    if(safeTimerInterval){clearInterval(safeTimerInterval);safeTimerInterval=null;}
    if(pill)pill.classList.remove('show');
    return;
  }
  const remain=t.deadline-Date.now();
  if(remain<=0){
    showSafeTimerAlert(t);
    return;
  }
  if(pill){
    pill.classList.add('show');
    const txt=document.getElementById('safeTimerText');
    if(txt)txt.textContent='🕒 '+formatRemaining(remain)+(t.dest?' · '+t.dest:'');
  }
}

/* ── 시간 초과 경고 ── */
function showSafeTimerAlert(t){
  const overlay=document.getElementById('safeTimerAlert');
  if(!overlay)return;
  if(overlay.classList.contains('show'))return;
  overlay.classList.add('show');
  const sub=document.getElementById('safeTimerAlertSub');
  if(sub)sub.textContent=(t&&t.dest?('목적지 "'+t.dest+'" 도착 예정 시간이 지났습니다.'):'도착 예정 시간이 지났습니다.')+
    ' 괜찮다면 "무사히 도착했어요"를 눌러 주세요.';
  const pill=document.getElementById('safeTimerPill');
  if(pill)pill.classList.remove('show');
}
function hideSafeTimerAlert(){
  const overlay=document.getElementById('safeTimerAlert');
  if(overlay)overlay.classList.remove('show');
}
function safeTimerSendSms(){
  const t=readSafeTimer();
  openGuardianSms('[SafeWalk 안심 타이머] 도착 예정 시간이 지났습니다.'+(t&&t.dest?' (목적지: '+t.dest+')':''));
}

/* 부팅·화면 복귀 시 타이머 복원 */
function restoreSafeTimer(){
  if(readSafeTimer())tickSafeTimer();
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden&&readSafeTimer())updateSafeTimerUI();
  });
}
