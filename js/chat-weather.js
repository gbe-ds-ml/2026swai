/* SafeWalk — GPS 기반 오늘 날씨, 2026-09-28
 * 브라우저 → Open-Meteo 직접 조회. Worker/LLM에 좌표나 수치 생성 요청을 보내지 않는다.
 * 지도 중심·검색 장소·저장 위치·기본 지역을 GPS 대용으로 사용하지 않는다.
 */
(function(){
  'use strict';

  const FIELDS=['weather_code','temperature_2m_min','temperature_2m_max',
    'precipitation_probability_max','wind_speed_10m_max'];
  const MAX_GPS_AGE=120000;
  const CODES={
    0:['☀️','맑음','Clear'],1:['🌤️','대체로 맑음','Mainly clear'],
    2:['⛅','구름 조금','Partly cloudy'],3:['☁️','흐림','Overcast'],
    45:['🌫️','안개','Fog'],48:['🌫️','안개','Rime fog'],
    51:['🌦️','이슬비','Drizzle'],53:['🌦️','이슬비','Drizzle'],55:['🌦️','이슬비','Drizzle'],
    56:['🌧️','어는 이슬비','Freezing drizzle'],57:['🌧️','어는 이슬비','Freezing drizzle'],
    61:['🌧️','비','Rain'],63:['🌧️','비','Rain'],65:['🌧️','비','Rain'],
    66:['🌧️','어는 비','Freezing rain'],67:['🌧️','어는 비','Freezing rain'],
    71:['🌨️','눈','Snow'],73:['🌨️','눈','Snow'],75:['🌨️','눈','Snow'],77:['🌨️','싸락눈','Snow grains'],
    80:['🌦️','소나기','Rain showers'],81:['🌦️','소나기','Rain showers'],82:['🌦️','소나기','Rain showers'],
    85:['🌨️','눈 소나기','Snow showers'],86:['🌨️','눈 소나기','Snow showers'],
    95:['⛈️','뇌우','Thunderstorm'],96:['⛈️','뇌우','Thunderstorm with hail'],
    97:['⛈️','뇌우','Heavy thunderstorm'],99:['⛈️','뇌우','Thunderstorm with hail']
  };

  function matches(message){
    const text=String(message||'').normalize('NFKC').trim();
    return /날씨|기온|강수|풍속|일기\s*예보|우산|비\s*(?:가\s*)?(?:와|오|올|왔|내리|내릴)|눈\s*(?:이\s*)?(?:와|오|올|왔|내리|내릴)|바람.{0,8}(?:불|부|세|강|어때)/.test(text)
      || /(?:오늘|지금).{0,25}(?:밖에\s*나가|외출|산책|걷기|걸어|도보).{0,20}(?:어때|괜찮|좋|될까|될까요|가능)/.test(text)
      || /\b(?:weather|forecast|temperature|rain(?:y|ing)?|snow(?:y|ing)?|wind(?:y)?|umbrella)\b/i.test(text)
      || /\b(?:walk(?:ing)?|go(?:ing)?\s+out(?:side)?|outdoor)\b.*\b(?:today|now)\b/i.test(text);
  }

  function unsupportedDate(message){
    // 오늘 daily만 구현한다. 다른 날짜를 오늘 예보로 오인하거나 AI가 추측하지 않게 한다.
    return /내일|모레|어제|그저께|주말|다음\s*주|이번\s*주|다음\s*달|\d+\s*월|\d+\s*일|\d{4}-\d{2}-\d{2}|[월화수목금토일]요일|\b(?:tomorrow|yesterday|weekend|next\s+week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(message);
  }

  function english(){
    return typeof window.getSafeWalkLanguage==='function'&&window.getSafeWalkLanguage()==='en';
  }

  function measuredPosition(){
    if(typeof hasCurrentLocation!=='function'||!hasCurrentLocation(MAX_GPS_AGE))return null;
    if(typeof myLat!=='number'||typeof myLng!=='number'||
      !Number.isFinite(myLat)||!Number.isFinite(myLng)||Math.abs(myLat)>90||Math.abs(myLng)>180||
      typeof myPositionTimestamp!=='number'||myPositionTimestamp>Date.now())return null;
    return {lat:myLat,lng:myLng};
  }

  function getPosition(signal){
    if(signal?.aborted)return Promise.reject(new Error('cancelled'));
    const known=measuredPosition();
    if(known)return Promise.resolve(known);
    return new Promise((resolve,reject)=>{
      let done=false;
      const finish=(error,value)=>{
        if(done)return;
        done=true;
        clearTimeout(timer);
        signal?.removeEventListener('abort',cancel);
        if(error)reject(error);else resolve(value);
      };
      const cancel=()=>finish(new Error('cancelled'));
      const timer=setTimeout(()=>finish(new Error('gps_timeout')),10000);
      signal?.addEventListener('abort',cancel,{once:true});
      if(!navigator.geolocation){finish(new Error('gps_unavailable'));return;}
      try{
        navigator.geolocation.getCurrentPosition(position=>{
          if(done)return;
          try{
            if(typeof acceptGPSPosition!=='function')throw new Error('gps_unavailable');
            // 다른 GPS watch에서 더 최신 위치가 도착했다면 그 측정값을 사용한다.
            acceptGPSPosition(position);
            const current=measuredPosition();
            if(!current)throw new Error('gps_unavailable');
            finish(null,current);
          }catch(error){finish(error);}
        },error=>finish(new Error(error?.code===1?'gps_denied':'gps_unavailable')),
        {enableHighAccuracy:false,timeout:8000,maximumAge:MAX_GPS_AGE});
      }catch(error){finish(new Error('gps_unavailable'));}
    });
  }

  function localDate(data,now){
    if(typeof data.timezone==='string'){
      try{
        const parts=new Intl.DateTimeFormat('en-US',{
          timeZone:data.timezone,year:'numeric',month:'2-digit',day:'2-digit'
        }).formatToParts(now);
        const value=type=>parts.find(p=>p.type===type)?.value;
        return value('year')+'-'+value('month')+'-'+value('day');
      }catch(error){}
    }
    if(Number.isFinite(data.utc_offset_seconds)&&Math.abs(data.utc_offset_seconds)<=86400){
      return new Date(now.getTime()+data.utc_offset_seconds*1000).toISOString().slice(0,10);
    }
    throw new Error('weather_date');
  }

  function readToday(data){
    if(!data||data.error)throw new Error('weather_response');
    const date=localDate(data,new Date());
    const daily=data.daily;
    const index=Array.isArray(daily?.time)?daily.time.indexOf(date):-1;
    if(index<0)throw new Error('weather_date');
    const values={};
    for(const field of FIELDS){
      const value=Array.isArray(daily[field])?daily[field][index]:null;
      values[field]=typeof value==='number'&&Number.isFinite(value)?value:null;
    }
    // 누락값 null을 Number(null)=0으로 바꾸지 않는다. 단위도 확인한다.
    for(const field of ['temperature_2m_min','temperature_2m_max']){
      if(data.daily_units?.[field]!=='°C')values[field]=null;
    }
    if(data.daily_units?.precipitation_probability_max!=='%'||
      values.precipitation_probability_max<0||values.precipitation_probability_max>100){
      values.precipitation_probability_max=null;
    }
    if(data.daily_units?.wind_speed_10m_max!=='km/h'||values.wind_speed_10m_max<0){
      values.wind_speed_10m_max=null;
    }
    return {date,values};
  }

  function format(values,en){
    const missing=en?'No data':'정보 없음';
    const code=Number.isInteger(values.weather_code)?CODES[values.weather_code]:null;
    const number=(key,unit,decimals)=>values[key]===null||values[key]===undefined
      ?missing:values[key].toFixed(decimals)+unit;
    return [
      code?`${code[0]} ${en?"Today's weather":'오늘 날씨'}: ${code[en?2:1]}`
        :`❔ ${en?"Today's weather":'오늘 날씨'}: ${missing}`,
      '',
      `🌡️ ${en?'Low':'최저기온'}: ${number('temperature_2m_min',en?'°C':'℃',1)}`,
      `🔥 ${en?'High':'최고기온'}: ${number('temperature_2m_max',en?'°C':'℃',1)}`,
      `☔ ${en?'Precipitation probability':'강수확률'}: ${number('precipitation_probability_max','%',0)}`,
      `💨 ${en?'Maximum wind speed':'최대 풍속'}: ${number('wind_speed_10m_max',' km/h',1)}`
    ].join('\n');
  }

  async function reply(message,signal){
    const en=english();
    if(unsupportedDate(message)){
      return {error:true,text:en
        ?'Weather lookup currently supports only today at your current GPS location. Please ask “What is the weather today?”.'
        :'현재 날씨 조회는 현재 GPS 위치의 오늘 예보만 지원합니다. “오늘 날씨 알려줘”라고 질문해 주세요.'};
    }
    let phase='gps';
    const controller=new AbortController();
    const cancel=()=>controller.abort();
    if(signal?.aborted)controller.abort();
    signal?.addEventListener('abort',cancel,{once:true});
    let timeout;
    try{
      const position=await getPosition(controller.signal);
      phase='weather';
      const url=new URL('https://api.open-meteo.com/v1/forecast');
      url.search=new URLSearchParams({
        latitude:String(position.lat),longitude:String(position.lng),daily:FIELDS.join(','),
        timezone:'auto',temperature_unit:'celsius',wind_speed_unit:'kmh',forecast_days:'2'
      }).toString();
      timeout=setTimeout(cancel,12000);
      const response=await fetch(url.toString(),{
        signal:controller.signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'
      });
      if(!response.ok)throw new Error('weather_http');
      const today=readToday(await response.json());
      let text=format(today.values,en);
      // 보행 조언은 선택 사항. 수치로 안전 여부를 단정하지 않는다.
      if(today.values.precipitation_probability_max!==null&&today.values.precipitation_probability_max>=60){
        text+='\n\n'+(en?'Precipitation is likely; prepare an umbrella for your walk.':'강수 가능성이 높으므로 도보 이동 시 우산을 준비해 주세요.');
      }
      text+='\n\n'+(en?'📍 Current GPS location · Daily forecast: ':'📍 현재 GPS 위치 기준 · 오늘 하루 예보: ')+today.date;
      text+='\n'+(en?'Source: Open-Meteo':'출처: Open-Meteo');
      return {error:false,text};
    }catch(error){
      let reason;
      if(phase==='gps'){
        reason=error?.message==='gps_denied'
          ?(en?'Location permission is blocked. Allow location access and ask again.':'위치 권한이 차단되어 있습니다. 브라우저에서 위치 권한을 허용한 뒤 다시 질문해 주세요.')
          :(en?'Your current GPS location could not be confirmed. Check location access and reception, then ask again.':'현재 GPS 위치를 확인하지 못했습니다. 위치 권한과 수신 상태를 확인한 뒤 다시 질문해 주세요.');
      }else{
        reason=en?'Today’s forecast could not be retrieved from Open-Meteo. Please try again shortly.':'Open-Meteo에서 오늘 예보를 가져오지 못했습니다. 잠시 후 다시 질문해 주세요.';
      }
      return {error:true,text:format({},en)+'\n\n'+reason};
    }finally{
      clearTimeout(timeout);
      signal?.removeEventListener('abort',cancel);
    }
  }

  window.safeWalkWeather=Object.freeze({matches,reply});
})();
