/* ============================================================
   SafeWalk v2.0 — utils.js
   어디서나 쓰이는 작은 도우미 함수 모음.
   지도·API 상태에 의존하지 않는 "순수 함수"만 둡니다.
   ============================================================ */

/* HTML 특수문자 이스케이프 — API 응답 등 외부 문자열을
   innerHTML에 넣기 전 반드시 이 함수를 거쳐야 합니다(XSS 방지). */
function esc(t){
  return String(t==null?'':t)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* API 응답 객체에서 문자열 필드를 안전하게 꺼내기 */
function xv(it,tag){return it&&it[tag]!=null?String(it[tag]).trim():'';}

/* ── 거리·시간 표기 ── */
function formatDistance(m){
  if(!Number.isFinite(m))return '-';
  return m>=1000?(m/1000).toFixed(1)+'km':Math.round(m)+'m';
}
function formatDuration(sec){
  if(!Number.isFinite(sec))return '-';
  return '약 '+Math.max(1,Math.round(sec/60))+'분';
}

/* ── 지구상 두 점 사이 거리(m) — 하버사인 공식 ── */
function distM(lat1,lng1,lat2,lng2){
  const R=6371000;
  const dLat=(lat2-lat1)*Math.PI/180;
  const dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+
    Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function pathDistanceMeters(points){
  let sum=0;
  for(let i=1;i<points.length;i++)sum+=distM(points[i-1].lat,points[i-1].lng,points[i].lat,points[i].lng);
  return sum;
}

/* ── 점과 선분 사이 거리(m) — 안전도 평가에 사용 ── */
function toXY(p,ref){
  const R=6371000;
  const lat0=ref.lat*Math.PI/180;
  return {
    x:(p.lng-ref.lng)*Math.PI/180*R*Math.cos(lat0),
    y:(p.lat-ref.lat)*Math.PI/180*R
  };
}
function distancePointToSegmentMeters(p,a,b){
  const pp=toXY(p,a);
  const bb=toXY(b,a);
  const dx=bb.x,dy=bb.y;
  const len2=dx*dx+dy*dy;
  if(len2===0)return Math.sqrt(pp.x*pp.x+pp.y*pp.y);
  let t=(pp.x*dx+pp.y*dy)/len2;
  t=Math.max(0,Math.min(1,t));
  const x=t*dx,y=t*dy;
  return Math.sqrt((pp.x-x)**2+(pp.y-y)**2);
}
function minDistanceToPathMeters(p,path){
  if(!path||!path.length)return Infinity;
  if(path.length===1)return distM(p.lat,p.lng,path[0].lat,path[0].lng);
  let min=Infinity;
  for(let i=1;i<path.length;i++){
    const d=distancePointToSegmentMeters(p,path[i-1],path[i]);
    if(d<min)min=d;
  }
  return min;
}

/* ── 인코딩된 폴리라인 디코드 (OSRM precision 5 / Valhalla precision 6) ── */
function decodePolyline(str,precision){
  if(typeof str!=='string'||!str.length)return [];
  const factor=Math.pow(10,precision||6);
  let index=0,lat=0,lng=0,byte=null,shift=0,result=0;
  const coordinates=[];
  while(index<str.length){
    byte=null;shift=0;result=0;
    do{byte=str.charCodeAt(index++)-63;result|=(byte&0x1f)<<shift;shift+=5;}while(byte>=0x20);
    lat+=((result&1)?~(result>>1):(result>>1));
    shift=0;result=0;
    do{byte=str.charCodeAt(index++)-63;result|=(byte&0x1f)<<shift;shift+=5;}while(byte>=0x20);
    lng+=((result&1)?~(result>>1):(result>>1));
    coordinates.push([lng/factor,lat/factor]);
  }
  return coordinates;
}
