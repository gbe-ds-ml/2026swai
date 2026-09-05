/* ============================================================
   SafeWalk v2.1 — emergency.js
   긴급 도움 패널: 112/119 전화, 보호자 문자, 좌표 복사,
   사이렌+화면 점멸 (HollieGuard 벤치마킹).

   모든 동작이 브라우저만으로 실행됩니다.
   - 전화/문자: tel:, sms: 링크 (기기 기본 앱 호출)
   - 사이렌: Web Audio 발진기 2개 음을 교차 재생
   - 점멸: body에 CSS 애니메이션 클래스 토글
   ============================================================ */

let sirenCtx=null;
let sirenOsc=null;
let sirenTimer=null;
let sirenOn=false;

/* ── 보호자 번호 ── */
function getGuardianPhone(){
  try{return localStorage.getItem(GUARDIAN_STORAGE_KEY)||'';}catch(e){return '';}
}
function setGuardianPhone(num){
  const clean=String(num||'').replace(/[^0-9+]/g,'');
  try{
    if(clean)localStorage.setItem(GUARDIAN_STORAGE_KEY,clean);
    else localStorage.removeItem(GUARDIAN_STORAGE_KEY);
  }catch(e){}
  return clean;
}
function saveGuardianFromInput(){
  const inp=document.getElementById('guardianInput');
  if(!inp)return;
  const saved=setGuardianPhone(inp.value);
  showRouteToast(saved?'보호자 번호를 저장했습니다.':'보호자 번호를 지웠습니다.');
  updateEmergencyPanelState();
}

/* ── 위치 문구 ── */
function buildLocationMessage(prefix){
  let msg=prefix||'[SafeWalk] 지금 도움이 필요합니다.';
  if(hasCurrentLocation()){
    msg+='\n현재 위치: '+
      '(위도 '+myLat.toFixed(6)+', 경도 '+myLng.toFixed(6)+')'+
      '\n지도: https://maps.google.com/?q='+myLat.toFixed(6)+','+myLng.toFixed(6);
    if(Number.isFinite(myPositionAccuracy))msg+='\nGPS 정확도: 약 '+Math.round(myPositionAccuracy)+'m';
  }else{
    msg+='\n(현재 위치를 확인하지 못했습니다. 주변 건물이나 도로명을 함께 알려 주세요.)';
  }
  return msg;
}
function openGuardianSms(prefix){
  const phone=getGuardianPhone();
  const body=encodeURIComponent(buildLocationMessage(prefix));
  location.href='sms:'+(phone?phone:'')+'?body='+body;
}
async function copyMyLocation(){
  const text=buildLocationMessage('[SafeWalk] 내 위치 공유');
  try{
    await navigator.clipboard.writeText(text);
    showRouteToast(hasCurrentLocation()?'현재 위치 정보를 복사했습니다. 메신저에 붙여넣어 공유하세요.':'위치 미확인 안내를 복사했습니다. 주변 건물이나 도로명을 함께 알려 주세요.');
  }catch(e){
    showRouteToast('복사에 실패했습니다. 위치: '+
      (hasCurrentLocation()?myLat.toFixed(5)+', '+myLng.toFixed(5):'확인 필요'));
  }
}

/* ── 사이렌 + 점멸 ── */
function startSiren(){
  if(sirenOn)return;
  try{
    sirenCtx=sirenCtx||new (window.AudioContext||window.webkitAudioContext)();
    if(sirenCtx.state==='suspended')sirenCtx.resume();
    sirenOsc=sirenCtx.createOscillator();
    const gain=sirenCtx.createGain();
    gain.gain.value=0.6;
    sirenOsc.type='square';
    sirenOsc.frequency.value=880;
    sirenOsc.connect(gain);
    gain.connect(sirenCtx.destination);
    sirenOsc.start();
    let high=false;
    sirenTimer=setInterval(()=>{
      high=!high;
      if(sirenOsc)sirenOsc.frequency.setValueAtTime(high?1250:880,sirenCtx.currentTime);
    },350);
    sirenOn=true;
    document.body.classList.add('siren-flash');
    updateEmergencyPanelState();
  }catch(e){
    console.warn('사이렌 재생 실패:',e);
    showRouteToast('이 기기에서는 사이렌 소리를 재생할 수 없습니다.');
  }
}
function stopSiren(){
  if(sirenTimer){clearInterval(sirenTimer);sirenTimer=null;}
  if(sirenOsc){try{sirenOsc.stop();}catch(e){}sirenOsc=null;}
  sirenOn=false;
  document.body.classList.remove('siren-flash');
  updateEmergencyPanelState();
}
function toggleSiren(){sirenOn?stopSiren():startSiren();}

/* ── 패널 열고 닫기 ── */
function toggleEmergencyPanel(){
  const el=document.getElementById('emergencyPanel');
  if(!el)return;
  el.classList.contains('show')?closeEmergencyPanel():openEmergencyPanel();
}
function openEmergencyPanel(){
  const el=document.getElementById('emergencyPanel');
  if(!el)return;
  closeSearchPanel();
  closeChatPanel();
  el.classList.add('show');
  updateEmergencyPanelState();
}
function closeEmergencyPanel(){
  const el=document.getElementById('emergencyPanel');
  if(el)el.classList.remove('show');
}
function updateEmergencyPanelState(){
  const btn=document.getElementById('sirenBtn');
  if(btn){
    btn.textContent=sirenOn?'🔇 사이렌 끄기':'📢 사이렌 + 화면 점멸';
    btn.classList.toggle('active',sirenOn);
  }
  const inp=document.getElementById('guardianInput');
  if(inp&&document.activeElement!==inp)inp.value=getGuardianPhone();
  const smsBtn=document.getElementById('guardianSmsBtn');
  if(smsBtn){
    smsBtn.textContent=getGuardianPhone()
      ?'💬 보호자에게 내 위치 문자'
      :'💬 문자로 내 위치 보내기 (받는 사람 직접 선택)';
  }
}
