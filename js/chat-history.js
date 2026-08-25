/* ============================================================
   SafeWalk v2.4.0 — chat-history.js
   ------------------------------------------------------------
   기존 chat.js를 수정하지 않고
   AI 일반대화에 최근 대화 이력을 추가한다.

   로드 순서 중요:
   chat.js → chat-history.js → chat-facility.js

   처리 구조
   1) 명확한 길찾기
      → 기존 chat.js
      → VWorld 실제 검색

   2) 가까운 안전시설
      → chat-facility.js
      → SafeMap 실제 공공데이터

   3) 일반 안전 질문 / 후속 대화
      → Cloudflare Worker
      → 최근 8턴 대화 전달
   ============================================================ */


/* ============================================================
   설정
   ============================================================ */

/*
  8턴 =
  사용자 8개 + AI 8개
  최대 16개 메시지
*/
const SAFEWALK_CHAT_HISTORY_MAX_TURNS=8;

const SAFEWALK_CHAT_HISTORY_MAX_MESSAGE_CHARS=1200;


/* ============================================================
   상태
   ============================================================ */

let safeWalkChatHistory=[];


/* ============================================================
   대화 텍스트 정리
   ============================================================ */

function normalizeSafeWalkHistoryText(value){

  return String(value||'')

    /*
      제어 문자 제거
    */
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
      SAFEWALK_CHAT_HISTORY_MAX_MESSAGE_CHARS
    );

}


/* ============================================================
   Worker에 보낼 history
   ============================================================ */

function getSafeWalkChatHistoryPayload(){

  return safeWalkChatHistory

    .slice(
      -(SAFEWALK_CHAT_HISTORY_MAX_TURNS*2)
    )

    .map(
      item=>({

        role:
          item.role,

        content:
          item.content

      })
    );

}


/* ============================================================
   history 저장
   ============================================================ */

function rememberSafeWalkChatMessage(
  role,
  content
){

  if(
    role!=='user' &&
    role!=='assistant'
  ){
    return;
  }


  const text=
    normalizeSafeWalkHistoryText(
      content
    );


  if(
    !text
  ){
    return;
  }


  safeWalkChatHistory.push({

    role,

    content:text

  });


  const maxMessages=
    SAFEWALK_CHAT_HISTORY_MAX_TURNS*2;


  if(
    safeWalkChatHistory.length>
    maxMessages
  ){

    safeWalkChatHistory=

      safeWalkChatHistory.slice(
        -maxMessages
      );

  }

}


/* 사용자 + AI 한 턴 저장 */

function rememberSafeWalkChatTurn(
  userText,
  assistantText
){

  rememberSafeWalkChatMessage(
    'user',
    userText
  );


  rememberSafeWalkChatMessage(
    'assistant',
    assistantText
  );

}


/* ============================================================
   대화 기억 초기화
   ============================================================ */

function clearSafeWalkChatHistory(){

  safeWalkChatHistory=[];

}


window.clearSafeWalkChatHistory=
  clearSafeWalkChatHistory;


window.getSafeWalkChatHistoryPayload=
  getSafeWalkChatHistoryPayload;


/* ============================================================
   chat.js 로드 확인
   ============================================================ */

if(
  typeof sendChatMessage!==
  'function'
){

  console.error(
    '[SafeWalk chat-history] chat.js가 먼저 로드되어야 합니다.'
  );

}

else{


  /*
    기존 함수를 복구용으로 보존
  */

  const safeWalkBaseSendChatMessageV24=
    sendChatMessage;


  /* ==========================================================
     sendChatMessage 확장
     ========================================================== */

  sendChatMessage=
    async function(){


      if(
        chatBusy
      ){
        return;
      }


      const input=
        document.getElementById(
          'chatInput'
        );


      const message=
        String(
          input
            ?input.value
            :''
        )
        .trim();


      /* ─────────────────────────────
         빈 질문
         ───────────────────────────── */

      if(
        !message
      ){

        if(
          input
        ){
          input.focus();
        }

        return;
      }


      /* ─────────────────────────────
         글자 수
         ───────────────────────────── */

      if(
        message.length>
        CHAT_MAX_LENGTH
      ){

        appendChatMessage(

          'bot',

          '질문은 '+
          CHAT_MAX_LENGTH+
          '자 이하로 입력해 주세요.',

          true

        );

        return;
      }


      /* ─────────────────────────────
         사용자 질문 표시
         ───────────────────────────── */

      appendChatMessage(
        'user',
        message
      );


      if(
        input
      ){

        input.value='';

        input.style.height=
          '44px';

      }


      if(
        typeof dismissMobileKeyboard===
        'function'
      ){

        dismissMobileKeyboard();

      }


      /* ======================================================
         1. 명확한 길찾기

         AI에 보내지 않는다.
         기존 chat.js의 VWorld 실제 검색을 사용한다.
         ====================================================== */

      const routeCommand=
        parseChatRouteCommand(
          message
        );


      if(
        routeCommand
      ){

        await beginChatRouteCommand(
          routeCommand
        );

        return;

      }


      /* ======================================================
         2. 일반 AI 질문
         ====================================================== */

      setChatBusy(
        true
      );


      showChatTyping();


      const controller=
        new AbortController();


      /*
        이전 25초 → 30초

        최근 대화가 추가되므로
        모바일 환경의 약간 느린 응답까지 고려
      */

      const timeout=
        setTimeout(
          ()=>controller.abort(),
          30000
        );


      try{


        /* ====================================================
           Cloudflare Worker 요청
           ==================================================== */

        const response=
          await fetch(

            CHAT_API_URL,

            {

              method:'POST',

              headers:{
                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({

                  /*
                    이번 질문
                  */
                  message,


                  /*
                    이전 대화
                    현재 질문은 포함하지 않음
                  */
                  history:
                    getSafeWalkChatHistoryPayload(),


                  /*
                    현재 SafeWalk 상태
                    - 이용자 유형
                    - 현재 지역
                    - 현재 경로
                    - 안전도 등
                  */
                  context:
                    getSafeWalkChatContext()

                }),


              signal:
                controller.signal

            }

          );


        const raw=
          await response.text();


        let data=null;


        try{

          data=
            JSON.parse(
              raw
            );

        }

        catch(e){

          throw new Error(
            'AI 서버가 올바른 JSON을 반환하지 않았습니다.'
          );

        }


        if(

          !response.ok ||

          !data ||

          data.ok!==true

        ){

          throw new Error(

            (
              data &&
              data.error
            )

            ||

            (
              'AI 요청 실패: HTTP '+
              response.status
            )

          );

        }


        hideChatTyping();


        /* ====================================================
           Worker가 길찾기라고 판단한 경우

           브라우저 정규식이 놓친
           자연스러운 길찾기 표현의 2차 안전망
           ==================================================== */

        const aiRouteCommand=
          normalizeWorkerRouteAction(

            data.action,

            message

          );


        if(
          aiRouteCommand
        ){

          await beginChatRouteCommand(
            aiRouteCommand
          );

          return;

        }


        /* ====================================================
           일반 AI 답변
           ==================================================== */

        const answer=
          String(

            data.answer ||
            '답변을 생성하지 못했습니다.'

          )
          .trim();


        appendChatMessage(

          'bot',

          answer

        );


        /* ====================================================
           정상적인 일반 대화만 history에 저장

           길찾기 UI 메시지,
           오류 메시지는 기억하지 않는다.
           ==================================================== */

        rememberSafeWalkChatTurn(

          message,

          answer

        );


      }

      catch(error){


        console.error(
          'SafeWalk AI 연결 오류:',
          error
        );


        hideChatTyping();


        const isTimeout=

          error &&
          error.name==='AbortError';


        appendChatMessage(

          'bot',

          isTimeout

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
          typeof syncViewportChrome===
          'function'
        ){

          requestAnimationFrame(
            syncViewportChrome
          );

        }

      }

    };


  sendChatMessage
    ._safeWalkHistoryV24=
    true;


  /*
    문제 발생 시 디버깅할 수 있도록
    기존 sendChatMessage 보존
  */

  window.safeWalkBaseSendChatMessageV24=
    safeWalkBaseSendChatMessageV24;


  console.log(
    '[SafeWalk v2.4] 최근 대화 8턴 Worker 전달 활성화'
  );

}
