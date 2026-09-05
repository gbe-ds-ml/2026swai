import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import worker from '../worker/ai-worker.mjs';

const root=new URL('../',import.meta.url);
const source=path=>fs.readFileSync(new URL(path,root),'utf8');
const noop=()=>{};

function environment(){
  const nodes=new Map();
  const node=id=>{
    if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,style:{},dataset:{},
      classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},setAttribute:noop,
      getAttribute:()=>null,addEventListener:noop,appendChild:noop});
    return nodes.get(id);
  };
  class Polyline{
    constructor(points,options={}){this.points=points;this.options=options;}
    getLatLngs(){return this.points;}
    getBounds(){return bounds;}
    addTo(){return this;}
  }
  class Polygon extends Polyline{}
  const bounds={getNorth:()=>36.1,getSouth:()=>35.9,getWest:()=>128.9,getEast:()=>129.1,
    getNorthWest:()=>({lat:36.1,lng:128.9}),getSouthEast:()=>({lat:35.9,lng:129.1})};
  const context=vm.createContext({console:{log:noop,warn:noop,error:noop},URL,URLSearchParams,
    AbortController,Response,Request,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:noop,
    location:{href:'https://example.test'},navigator:{},localStorage:{getItem:()=>null,setItem:noop},
    document:{getElementById:node,body:node('body'),readyState:'loading',addEventListener:noop},
    window:{},L:{Polyline,Polygon,polyline:(p,o)=>new Polyline(p,o),
      latLngBounds:()=>bounds,CRS:{EPSG3857:{project:p=>({x:p.lng,y:p.lat})}}},
    showRouteToast:noop,resetRouteDetails:noop,syncRoutePanelWithSheet:noop,
    closeSearchPanel:noop,hideChatTyping:noop,appendChatMessage:noop,sendChatMessage:noop});
  const run=code=>vm.runInContext(code,context);
  for(const path of ['js/config.js','js/utils.js','js/map.js','js/layers.js','js/route.js','js/emergency.js'])run(source(path));
  run("grp='youth';");
  return {context,run,node,bounds};
}

test('all repository JavaScript parses',()=>{
  for(const directory of ['js','worker']){
    for(const name of fs.readdirSync(new URL(directory+'/',root)).filter(n=>/\.m?js$/.test(n))){
      const path=new URL(directory+'/'+name,root);
      const result=spawnSync(process.execPath,['--check',path.pathname],{encoding:'utf8'});
      assert.equal(result.status,0,directory+'/'+name+'\n'+result.stderr);
    }
  }
  const scripts=[...source('index.html').matchAll(/src="(js\/[^"?]+\.js)(?:\?[^\"]*)?"/g)].map(match=>match[1]);
  new vm.Script(scripts.map(source).join('\n;\n'));
});

test('denied GPS cannot put default or stored coordinates in an emergency message',()=>{
  const {context,run,node}=environment();
  context.navigator.geolocation={getCurrentPosition:(_,error)=>error(),watchPosition:()=>1};
  run('map={setView(){},removeLayer(){}};initializedLocationMap=map;getGPS();');
  assert.equal(run('myLat'),null);
  assert.equal(run('hasCurrentLocation()'),false);
  assert.match(run('buildLocationMessage()'),/현재 위치를 확인하지 못했습니다/);
  assert.doesNotMatch(run('buildLocationMessage()'),/36\.019|129\.3435|maps\.google/);
  assert.equal(node('locTxt').textContent,'현재 위치 미확인');
});

test('fresh measured GPS works; stale measurements cannot be shared as current',()=>{
  const {run,context}=environment();
  context.position={coords:{latitude:36.02,longitude:129.35,accuracy:12},timestamp:Date.now()};
  assert.equal(run('acceptGPSPosition(position)'),true);
  assert.match(run('buildLocationMessage()'),/36\.020000/);
  assert.match(run('buildLocationMessage()'),/정확도: 약 12m/);
  run('myPositionTimestamp=Date.now()-121000;');
  assert.doesNotMatch(run('buildLocationMessage()'),/maps\.google/);
});

test('HTTP failures and malformed facility payloads are not successful empty results',async()=>{
  const {context,run,bounds}=environment();context.bounds=bounds;
  for(const response of [new Response('{}',{status:503}),Response.json({error:'upstream'}),Response.json({})]){
    context.fetch=async()=>response;
    await assert.rejects(run("requestSafemapMarkers('bell',bounds)"));
  }
});

test('facility pagination retrieves the next page and tracks incomplete responses',async()=>{
  const {context,run,bounds}=environment();context.bounds=bounds;
  let pages=[];
  context.fetch=async(_,options)=>{
    const page=Number(options.body.get('currentPage'));pages.push(page);
    return Response.json({resultList:Array.from({length:page===1?500:1},(_,i)=>({id:page+':'+i}))});
  };
  const all=await run("requestSafemapMarkers('bell',bounds)");
  assert.equal(all.length,501);assert.equal(all.truncated,false);assert.deepEqual(pages,[1,2]);
  pages=[];
  context.fetch=async(_,options)=>{
    const page=Number(options.body.get('currentPage'));pages.push(page);
    return Response.json({resultList:Array.from({length:500},(_,i)=>({id:page+':'+i}))});
  };
  const limited=await run("requestSafemapMarkers('bell',bounds)");
  assert.equal(limited.length,2000);assert.equal(limited.truncated,true);assert.equal(pages.length,4);
});

test('a server that repeats page one does not create duplicate facilities',async()=>{
  const {context,run,bounds}=environment();context.bounds=bounds;
  context.fetch=async()=>Response.json({resultList:Array.from({length:500},(_,i)=>({id:i}))});
  const result=await run("requestSafemapMarkers('bell',bounds)");
  assert.equal(result.length,500);assert.equal(result.truncated,true);
});

test('facility stats distinguish an error, zero, disabled layers, and partial counts',()=>{
  const {run,node}=environment();
  run("chipOn={bell:true,police:true,child_house:false,cctv:true};counts={bell:0,police:0,cctv:31};markerFetchErrors={bell:true};markerFetchTruncated={cctv:true};updateStats();");
  assert.match(node('statsBar').innerHTML,/조회 실패/);
  assert.match(node('statsBar').innerHTML,/>0</);
  assert.match(node('statsBar').innerHTML,/>–</);
  assert.match(node('statsBar').innerHTML,/>31\+</);
  assert.equal(node('statsNote').hidden,false);
  assert.match(node('statsStatus').textContent,/일부 데이터/);
  run("grp='cpted';updateStats();");
  assert.equal(node('statsNote').hidden,true);
});

test('route facility failure is preserved and a successful zero count earns zero points',async()=>{
  const {context,run}=environment();
  context.fetch=async()=>Response.json({error:'offline'},{status:503});
  const corridor=await run('fetchCorridorFacilities([{lat:36,lng:129},{lat:36,lng:129.002}])');
  assert.equal(corridor.failed,corridor.total);assert.ok(corridor.total>0);
  assert.equal(run('evaluateRouteSafety([{lat:36,lng:129},{lat:36,lng:129.002}],[]).score'),0);
  const scored=run("evaluateRouteSafety([{lat:36,lng:129},{lat:36,lng:129.002}],[{id:'near',key:'bell',lat:36.0009,lng:129.001},{id:'far',key:'bell',lat:36.002,lng:129.001}])");
  assert.equal(scored.total,1);assert.ok(scored.score>0);assert.equal(scored.shortBonus,0);
});

test('failed road routing yields a reference line without a travel time, score, timer, or facility request',async()=>{
  const {run,node}=environment();
  run(`map={fitBounds(){},removeLayer(){}};
    routeOrigin={lat:36,lng:129};routeDest={lat:36,lng:129.002};
    requestWalkingRoute=async()=>{throw new Error('offline')};
    clearRoute=()=>{routeRunToken++};drawEndpointMarkers=()=>{};
    let facilityRequests=0,timerOffers=0;
    fetchCorridorFacilities=async()=>{facilityRequests++};offerSafeTimer=()=>timerOffers++;
  `);
  await run('runSearchRoute()');
  assert.equal(run('facilityRequests'),0);assert.equal(run('timerOffers'),0);
  assert.equal(run('fallbackRouteLine.options.safeWalkRoute'),false);
  assert.equal(node('routePanel').dataset.routeState,'fallback');
  assert.equal(node('routeDuration').textContent,'산출 불가');
  assert.equal(node('routeScore').textContent,'측정 불가');
});

function navigationEnvironment(){
  const env=environment();
  let code=source('js/route-navigation.js');
  code=code.replace(/\}\)\(\);\s*$/,`window.testNavigation={findRoutePolyline,updateNavigation,progressOnRoute,
    setPath(path){routeLatLngs=path;navigationMode=true;}};})();`);
  env.run(code);
  return env;
}

test('navigation only accepts a route explicitly marked as a road response',()=>{
  const {context,run}=navigationEnvironment();
  const fake=new context.L.Polyline([{lat:36,lng:129},{lat:36,lng:129.002}],{color:'#ef4444'});
  context.candidate=fake;
  run('map={eachLayer(fn){fn(candidate);}};');
  assert.equal(context.window.testNavigation.findRoutePolyline(),null);
  fake.options.safeWalkRoute=true;
  assert.equal(context.window.testNavigation.findRoutePolyline(),fake);
});

test('projecting beyond the destination cannot falsely announce arrival',()=>{
  const {context,run,node}=navigationEnvironment();
  const path=[{lat:36,lng:129},{lat:36,lng:129.002}];
  context.window.testNavigation.setPath(path);
  run('routeDest={lat:36,lng:129.002};');
  context.position={coords:{latitude:36,longitude:129.008,accuracy:10},timestamp:Date.now()};
  run('acceptGPSPosition(position)');
  context.window.testNavigation.updateNavigation();
  assert.match(node('swNavStatus').textContent,/벗어나/);
  assert.doesNotMatch(node('swNavStatus').textContent,/🏁/);
  context.position={coords:{latitude:36,longitude:129.002,accuracy:10},timestamp:Date.now()};
  run('acceptGPSPosition(position)');
  context.window.testNavigation.updateNavigation();
  assert.match(node('swNavStatus').textContent,/🏁/);
  context.position.coords.accuracy=100;context.position.timestamp=Date.now();
  run('acceptGPSPosition(position)');context.window.testNavigation.updateNavigation();
  assert.doesNotMatch(node('swNavStatus').textContent,/🏁/);
});

test('facility history distinguishes location failure, request failure, and a successful empty search',()=>{
  const {run}=environment();run(source('js/chat-agent.js'));
  assert.match(run("safeWalkAgentBuildFacilityHistory({status:'location_error'})"),/조회를 실행하지 못/);
  assert.match(run("safeWalkAgentBuildFacilityHistory({status:'error'})"),/유무는 확인되지/);
  assert.match(run("safeWalkAgentBuildFacilityHistory({status:'ok'})"),/조회했지만/);
  assert.match(run("safeWalkAgentBuildFacilityHistory({status:'partial'})"),/확정할 수 없/);
});

test('facility command returns distinct location, total failure, empty, and partial outcomes',async()=>{
  const {run}=environment();run(source('js/chat-facility.js'));
  run("swAppendFacilityResults=()=>{};swResolveFacilityOrigin=async()=>{throw new Error('denied')};");
  assert.equal((await run("swBeginFacilityCommand({keys:['bell']})")).status,'location_error');
  run("swResolveFacilityOrigin=async()=>({lat:36,lng:129});swFindNearestFacility=async()=>{throw new Error('offline')};");
  assert.equal((await run("swBeginFacilityCommand({keys:['bell','police']})")).status,'error');
  run('swFindNearestFacility=async()=>null;');
  assert.equal((await run("swBeginFacilityCommand({keys:['bell']})")).status,'ok');
  run("swFindNearestFacility=async key=>{if(key==='bell')throw new Error('offline');return {key,distanceM:20}};");
  assert.equal((await run("swBeginFacilityCommand({keys:['bell','police']})")).status,'partial');
});

function aiRequest(body={message:'안전시설을 설명해 주세요.'},headers={}){
  return new Request('https://example.test/chat',{method:'POST',headers:{
    Origin:'https://gbe-ds-ml.github.io','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...headers
  },body:typeof body==='string'?body:JSON.stringify(body)});
}
function aiEnv(run){return {AI:{run},AI_RATE_LIMITER:{limit:async()=>({success:true})}};}

test('an empty answer, unclosed reasoning, or invalid tool JSON retries the fallback model',async()=>{
  for(const invalid of [{response:''},{response:'<think>internal reasoning'},
    {tool_calls:[{name:'prepare_safe_walk_route',arguments:'{invalid json'}]}]){
    const models=[];
    const env=aiEnv(async model=>{models.push(model);return models.length===1?invalid:{response:'검증된 답변'};});
    const response=await worker.fetch(aiRequest(),env);const data=await response.json();
    assert.equal(response.status,200);assert.equal(data.answer,'검증된 답변');
    assert.equal(models.length,2);assert.match(models[1],/qwen/);
  }
});

test('missing, non-numeric, and out-of-range confidence cannot trigger a route',async()=>{
  for(const confidence of [undefined,'0.9',NaN,2,-1,null]){
    let calls=0;
    const env=aiEnv(async()=>{calls++;return calls===1?{tool_calls:[{name:'prepare_safe_walk_route',arguments:
      {originType:'current',originQuery:'',destinationQuery:'포항역',confidence}}]}:{response:'출발지와 목적지를 확인해 주세요.'};});
    const response=await worker.fetch(aiRequest(),env);const data=await response.json();
    assert.equal(data.action.type,'none');assert.equal(calls,2);
  }
});

test('valid route actions still match the frontend contract',async()=>{
  const env=aiEnv(async()=>({tool_calls:[{name:'prepare_safe_walk_route',arguments:
    {originType:'current',originQuery:'',destinationQuery:'포항역',confidence:0.9}}]}));
  const response=await worker.fetch(aiRequest(),env);const data=await response.json();
  assert.deepEqual(data.action,{type:'route',originType:'current',originQuery:'',destinationQuery:'포항역'});
});

test('context allowlist excludes GPS, guardian data, and arbitrary fields',async()=>{
  let prompt='';
  const env=aiEnv(async(_,input)=>{prompt=input.messages[0].content;return {response:'안내입니다.'};});
  await worker.fetch(aiRequest({message:'설명',context:{selectedGroup:'여성·청소년',currentArea:'포항시',
    myLat:'private-gps-value',guardianPhone:'private-guardian-value',injected:'private-unknown-value',
    route:{destination:'포항역',latitude:'private-route-gps-value'}}}),env);
  assert.match(prompt,/포항역/);assert.doesNotMatch(prompt,/private-/);
});

test('rate, origin, size, and required binding checks reject before inference',async()=>{
  let calls=0;const env=aiEnv(async()=>{calls++;return {response:'답변'};});
  assert.equal((await worker.fetch(aiRequest({}, {Origin:'https://other.test'}),env)).status,403);
  assert.equal((await worker.fetch(aiRequest(' '.repeat(50000)),env)).status,413);
  const limited=await worker.fetch(aiRequest(),{...env,AI_RATE_LIMITER:{limit:async()=>({success:false})}});
  assert.equal(limited.status,429);assert.equal(limited.headers.get('Retry-After'),'60');
  assert.equal((await worker.fetch(aiRequest(),{AI:env.AI})).status,503);
  assert.equal(calls,0);
});

test('an unresponsive primary has a bounded wait and falls back',async()=>{
  let calls=0;
  const env=aiEnv(()=>++calls===1?new Promise(()=>{}):Promise.resolve({response:'보조 모델 응답'}));
  const response=await worker.fetch(aiRequest(),env);
  assert.equal(response.status,200);assert.equal(calls,2);
  assert.equal((await response.json()).answer,'보조 모델 응답');
});
