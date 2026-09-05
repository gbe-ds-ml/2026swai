/* ============================================================
   SafeWalk v2.5.0 — chat-agent.js

   Worker AI 중심 Agent Router

   모든 자연어 질문을 먼저 Workers AI가 판단한다.

   Worker 판단 결과
   ├─ 일반 질문
   │    → AI 답변
   │
   ├─ 길찾기
   │    → 기존 chat.js
   │    → VWorld 실제 장소 검색
   │
   └─ 가까운 안전시설
        → 기존 chat-facility.js
        → GPS + SafeMap 실제 공공데이터

   중요:
   - AI는 좌표를 만들지 않는다.
   - AI는 시설명을 추측하지 않는다.
   - AI는 "무슨 기능을 실행할지"만 판단한다.
   ============================================================ */


/* ============================================================
   설정
   ============================================================ */

const SAFEWALK_AGENT_HISTORY_TURNS = 8;

const SAFEWALK_AGENT_HISTORY_MAX_MESSAGES =
  SAFEWALK_AGENT_HISTORY_TURNS * 2;

const SAFEWALK_AGENT_HISTORY_ITEM_MAX = 1200;


/* ============================================================
   대화 History
   ============================================================ */

let safeWalkAgentHistory = [];


/* ============================================================
   최근 시설 조회 결과

   AI에 좌표는 보내지 않는다.
   이름/거리/종류 정도만 대화 맥락으로 보관한다.
   ============================================================ */

let safeWalkAgentLastFacilityResults = [];


/* ============================================================
   문자열 정리
   ============================================================ */

function safeWalkAgentCleanText(value){

  return String(value || '')

    .replace(
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
      ' '
    )

    .replace(
      /\s+/g,
      ' '
    )

    .trim()

    .slice(
      0,
      SAFEWALK_AGENT_HISTORY_ITEM_MAX
    );

}


/* ============================================================
   History 저장
   ============================================================ */

function safeWalkAgentRemember(
  role,
  content
){

  if(
    role !== 'user' &&
    role !== 'assistant'
  ){
    return;
  }


  const text =
    safeWalkAgentCleanText(
      content
    );


  if(!text){
    return;
  }


  safeWalkAgentHistory.push({

    role,

    content:text

  });


  if(
    safeWalkAgentHistory.length >
    SAFEWALK_AGENT_HISTORY_MAX_MESSAGES
  ){

    safeWalkAgentHistory =
      safeWalkAgentHistory.slice(
        -SAFEWALK_AGENT_HISTORY_MAX_MESSAGES
      );

  }

}


function safeWalkAgentRememberTurn(
  userText,
  assistantText
){

  safeWalkAgentRemember(
    'user',
    userText
  );


  safeWalkAgentRemember(
    'assistant',
    assistantText
  );

}


/* ============================================================
   Worker용 History
   ============================================================ */

function safeWalkAgentGetHistory(){

  return safeWalkAgentHistory

    .slice(
      -SAFEWALK_AGENT_HISTORY_MAX_MESSAGES
    )

    .map(
      item=>({

        role:item.role,

        content:item.content

      })
    );

}


/* ============================================================
   History 초기화

   필요하면 콘솔에서:
   clearSafeWalkAgentHistory()
   ============================================================ */

function clearSafeWalkAgentHistory(){

  safeWalkAgentHistory = [];

  safeWalkAgentLastFacilityResults = [];

}


window.clearSafeWalkAgentHistory =
  clearSafeWalkAgentHistory;


/* ============================================================
   chat-facility.js 결과 가로채기

   실제 시설 데이터가 나온 뒤
   다음 대화에서

   "그중 어디가 제일 가까워?"
   "아까 찾은 곳이 뭐였지?"

   같은 질문을 이해하도록 결과 이름을 기억한다.
   ============================================================ */

if(
  typeof swAppendFacilityResults ===
  'function'
){

  const safeWalkBaseAppendFacilityResults =
    swAppendFacilityResults;


  swAppendFacilityResults =
    function(
      results,
      command
    ){

      safeWalkAgentLastFacilityResults =

        Array.isArray(results)

          ?results.map(
              item=>({

                key:
                  String(
                    item?.key ||
                    ''
                  ),

                name:
                  String(
                    item?.name ||
                    ''
                  ),

                addr:
                  String(
                    item?.addr ||
                    ''
                  ),

                distanceM:
                  Number(
                    item?.distanceM
                  )

              })
            )

          :[];


      return safeWalkBaseAppendFacilityResults(

        results,

        command

      );

    };

}


/* ============================================================
   시설 종류 라벨
   ============================================================ */

function safeWalkAgentFacilityLabel(key){

  switch(key){

    case 'police':
      return '치안시설';

    case 'bell':
      return '안전비상벨';

    case 'child_house':
      return '어린이안전지킴이집';

    case 'cctv':
      return 'CCTV';

    default:
      return '안전시설';

  }

}


/* ============================================================
   거리 표시
   ============================================================ */

function safeWalkAgentDistanceText(value){

  const distance =
    Number(value);


  if(
    !Number.isFinite(distance)
  ){
    return '';
  }


  if(
    distance < 1000
  ){

    return (
      Math.round(distance) +
      'm'
    );

  }


  return (
    (
      distance /
      1000
    ).toFixed(1) +
    'km'
  );

}


/* ============================================================
   실제 시설 결과를 AI History용 문장으로 변환

   좌표는 절대 넣지 않는다.
   ============================================================ */

function safeWalkAgentBuildFacilityHistory(outcome){
  if(outcome?.status==='location_error')return '현재 GPS 위치를 확인하지 못해 시설 조회를 실행하지 못했습니다. 주변 시설 유무는 확인되지 않았습니다.';
  if(!outcome||!['ok','partial'].includes(outcome.status))return '안전시설 조회에 실패했습니다. 주변 시설이 없다는 뜻이 아니며 시설 유무는 확인되지 않았습니다.';
  if(outcome.status==='partial'&&!safeWalkAgentLastFacilityResults.length)return '일부 시설 조회에 실패했고 나머지 조회 범위에서는 요청한 시설을 찾지 못했습니다. 시설 유무를 확정할 수 없습니다.';

  const results =
    safeWalkAgentLastFacilityResults;


  if(
    !Array.isArray(results) ||
    !results.length
  ){

    return (
      'SafeWalk가 현재 위치 주변의 실제 공공데이터를 조회했지만 ' +
      '요청한 안전시설을 찾지 못했습니다.'
    );

  }


  const items =
    results.map(
      item=>{

        const label =
          safeWalkAgentFacilityLabel(
            item.key
          );


        const distance =
          safeWalkAgentDistanceText(
            item.distanceM
          );


        let text =
          label +
          ': ' +
          (
            item.name ||
            '시설명 미상'
          );


        if(distance){

          text +=
            ' · 현재 위치에서 직선거리 약 ' +
            distance;

        }


        if(item.addr){

          text +=
            ' · ' +
            item.addr;

        }


        return text;

      }
    );


  return (
    (outcome.status==='partial'?'일부 자료만 조회되었습니다. 가장 가까운 시설이라고 단정할 수 없습니다. ':'') +
    'SafeWalk가 현재 위치 기준 SafeMap 공공데이터를 직접 조회한 결과: ' +
    items.join(' / ')
  );

}


/* ============================================================
   Worker facility action → chat-facility.js command
   ============================================================ */

function safeWalkAgentMakeFacilityCommand(
  action,
  originalMessage
){

  if(
    !action ||
    action.type !== 'facility'
  ){

    return null;

  }


  const type =
    String(
      action.facilityType ||
      ''
    );


  let keys;


  switch(type){

    case 'police':

      keys = [
        'police'
      ];

      break;


    case 'bell':

      keys = [
        'bell'
      ];

      break;


    case 'child_house':

      keys = [
        'child_house'
      ];

      break;


    case 'cctv':

      keys = [
        'cctv'
      ];

      break;


    case 'all':

      keys = [
        'police',
        'bell',
        'child_house',
        'cctv'
      ];

      break;


    default:

      return null;

  }


  let policeSubtype = null;


  if(
    type === 'police'
  ){

    const subtype =
      String(
        action.policeSubtype ||
        ''
      );


    if(
      subtype === '경찰서' ||
      subtype === '지구대' ||
      subtype === '파출소'
    ){

      policeSubtype =
        subtype;

    }

  }


  return {

    keys,

    generic:
      type === 'all',

    policeSubtype,

    originalMessage:
      originalMessage

  };

}


/* ============================================================
   Worker route action 정리

   기존 chat.js 함수 사용
   ============================================================ */

function safeWalkAgentMakeRouteCommand(
  action,
  originalMessage
){

  if(
    !action ||
    action.type !== 'route'
  ){

    return null;

  }


  if(
    typeof normalizeWorkerRouteAction !==
    'function'
  ){

    return null;

  }


  return normalizeWorkerRouteAction(

    action,

    originalMessage

  );

}


/* ============================================================
   Worker 호출
   ============================================================ */

async function safeWalkAgentCallWorker(
  message,
  signal
){

  const response =
    await fetch(

      CHAT_API_URL,

      {

        method:
          'POST',

        headers:{
          'Content-Type':
            'application/json'
        },

        body:
          JSON.stringify({

            message,

            history:
              safeWalkAgentGetHistory(),

            context:
              getSafeWalkChatContext()

          }),

        signal

      }

    );


  const raw =
    await response.text();


  let data;


  try{

    data =
      JSON.parse(
        raw
      );

  }

  catch(error){

    throw new Error(
      'AI 서버가 올바른 JSON을 반환하지 않았습니다.'
    );

  }


  if(
    !response.ok ||
    !data ||
    data.ok !== true
  ){

    throw new Error(

      data?.error ||

      (
        'AI 요청 실패: HTTP ' +
        response.status
      )

    );

  }


  if(typeof data.answer==='string'){
    data.answer=data.answer.replace(/<(think|analysis|reasoning)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi,'').trim();
  }
  if(!data.action||!['none','route','facility'].includes(data.action.type))throw new Error('AI 명령 형식이 올바르지 않습니다.');
  if(data.action.type==='none'&&(typeof data.answer!=='string'||!data.answer))throw new Error('AI 답변을 확인하지 못했습니다.');
  return data;

}


/* ============================================================
   기존 sendChatMessage 최종 교체

   중요:
   여기서는 parseChatRouteCommand()
   swParseNearbyFacilityCommand()

   둘 다 호출하지 않는다.

   항상 AI Worker에게 먼저 묻는다.
   ============================================================ */

sendChatMessage =
  async function(){


    if(chatBusy){
      return;
    }


    const input =
      document.getElementById(
        'chatInput'
      );


    const message =
      String(
        input
          ?input.value
          :''
      )
      .trim();


    /* 빈 입력 */

    if(!message){

      if(input){
        input.focus();
      }

      return;

    }


    /* 최대 길이 */

    if(
      message.length >
      CHAT_MAX_LENGTH
    ){

      appendChatMessage(

        'bot',

        '질문은 ' +
        CHAT_MAX_LENGTH +
        '자 이하로 입력해 주세요.',

        true

      );

      return;

    }


    /* 사용자 메시지 */

    appendChatMessage(

      'user',

      message

    );


    if(input){

      input.value = '';

      input.style.height =
        '44px';

    }


    if(
      typeof dismissMobileKeyboard ===
      'function'
    ){

      dismissMobileKeyboard();

    }


    setChatBusy(
      true
    );


    showChatTyping();


    const controller =
      new AbortController();


    const timeout =
      setTimeout(

        ()=>controller.abort(),

        30000

      );


    try{

      /* ======================================================
         모든 질문을 AI Worker에게 먼저 전달
         ====================================================== */

      const data =
        await safeWalkAgentCallWorker(

          message,

          controller.signal

        );


      hideChatTyping();


      const action =
        data.action ||
        {
          type:'none'
        };


      /* ======================================================
         1. AI가 길찾기라고 판단
         ====================================================== */

      if(
        action.type ===
        'route'
      ){

        const routeCommand =
          safeWalkAgentMakeRouteCommand(

            action,

            message

          );


        if(
          !routeCommand
        ){

          const answer =

            data.answer ||

            '길찾기 요청을 정확하게 이해하지 못했습니다. 출발지와 목적지를 조금 더 구체적으로 말씀해 주세요.';


          appendChatMessage(

            'bot',

            answer

          );


          safeWalkAgentRememberTurn(

            message,

            answer

          );


          return;

        }


        /*
          History에는 사용자가 요청한 검색어만 기록한다.
          실제 좌표는 기록하지 않는다.
        */

        const routeMemory =

          routeCommand.originType ===
          'current'

            ?(
                '사용자가 현재 위치에서 "' +
                routeCommand.destinationQuery +
                '"까지 이동하려고 하여 SafeWalk가 실제 장소 후보 확인을 시작했습니다.'
              )

            :(
                '사용자가 "' +
                routeCommand.originQuery +
                '"에서 "' +
                routeCommand.destinationQuery +
                '"까지 이동하려고 하여 SafeWalk가 실제 장소 후보 확인을 시작했습니다.'
              );


        safeWalkAgentRememberTurn(

          message,

          routeMemory

        );


        await beginChatRouteCommand(
          routeCommand
        );


        return;

      }


      /* ======================================================
         2. AI가 현재 위치 주변 시설 검색이라고 판단
         ====================================================== */

      if(
        action.type ===
        'facility'
      ){

        if(
          typeof swBeginFacilityCommand !==
          'function'
        ){

          throw new Error(
            '안전시설 조회 모듈을 사용할 수 없습니다.'
          );

        }


        const command =
          safeWalkAgentMakeFacilityCommand(

            action,

            message

          );


        if(!command){

          throw new Error(
            '안전시설 조회 명령이 올바르지 않습니다.'
          );

        }


        /*
          이전 결과 제거
        */

        safeWalkAgentLastFacilityResults =
          [];


        const facilityOutcome=await swBeginFacilityCommand(command);
        if(facilityOutcome?.status==='cancelled')return;


        /*
          chat-facility.js가 실제 SafeMap 결과를
          화면에 출력한 뒤 그 결과를 History에 기록한다.
        */

        const facilityMemory =
          safeWalkAgentBuildFacilityHistory(facilityOutcome);


        safeWalkAgentRememberTurn(

          message,

          facilityMemory

        );


        return;

      }


      /* ======================================================
         3. 일반 대화
         ====================================================== */

      const answer =
        String(

          data.answer ||

          '답변을 생성하지 못했습니다.'

        )
        .trim();


      appendChatMessage(

        'bot',

        answer

      );


      safeWalkAgentRememberTurn(

        message,

        answer

      );

    }


    catch(error){

      console.error(

        '[SafeWalk Agent] 오류:',

        error

      );


      hideChatTyping();


      const timeoutError =

        error &&
        error.name ===
        'AbortError';


      appendChatMessage(

        'bot',

        timeoutError

          ?'AI 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.'

          :'현재 AI 안내 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',

        true

      );

    }


    finally{

      clearTimeout(
        timeout
      );


      setChatBusy(
        false
      );


      if(
        typeof syncViewportChrome ===
        'function'
      ){

        requestAnimationFrame(
          syncViewportChrome
        );

      }

    }

  };


sendChatMessage._safeWalkAgentV25 =
  true;


console.log(
  '[SafeWalk v2.5] Worker AI Agent Router 활성화'
);
