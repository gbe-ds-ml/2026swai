/* ============================================================
   SafeWalk v2.6.1 — safewalk-ui-patch.js

   UI / 용어 통합 패치

   1. "어린이안전지킴이집"
      → "아동안전지킴이집"

   2. CCTV 레이어 아이콘
      📷
      → CPTED에서 사용하는 assets/poi32.svg

   내부 데이터 key인 child_house는 변경하지 않는다.
   ============================================================ */


/* ============================================================
   공개 용어
   ============================================================ */

const SW_CHILD_HOUSE_PUBLIC_LABEL =
  '아동안전지킴이집';


/* ============================================================
   CPTED SVG 아이콘

   메인화면 범죄예방환경설계 버튼에서 사용 중인
   assets/poi32.svg를 그대로 재사용한다.
   ============================================================ */

const SW_CCTV_CPTED_ICON_HTML =

  '<img '+

    'src="assets/poi32.svg" '+

    'class="sw-cctv-cpted-icon" '+

    'alt="" '+

    'aria-hidden="true">'+
  '';


/* ============================================================
   CSS
   ============================================================ */

function injectSafeWalkUiPatchStyles(){

  if(
    document.getElementById(
      'safeWalkUiPatchStyles'
    )
  ){
    return;
  }


  const style =
    document.createElement(
      'style'
    );


  style.id =
    'safeWalkUiPatchStyles';


  style.textContent = `

    /* CCTV → CPTED SVG */

    .sw-cctv-cpted-icon{

      display:inline-block;

      width:19px;

      height:19px;

      object-fit:contain;

      vertical-align:-4px;

      flex:0 0 auto;

    }


    .chip-label
    .sw-cctv-cpted-icon{

      width:19px;

      height:19px;

      vertical-align:-4px;

    }


    .stat-emoji
    .sw-cctv-cpted-icon{

      width:20px;

      height:20px;

      vertical-align:0;

    }


    .route-pill
    .sw-cctv-cpted-icon{

      width:16px;

      height:16px;

      vertical-align:-3px;

    }


    .pbadge
    .sw-cctv-cpted-icon{

      width:16px;

      height:16px;

      vertical-align:-3px;

    }

  `;


  document.head.appendChild(
    style
  );

}


/* ============================================================
   문자열 용어 변환
   ============================================================ */

function normalizeSafeWalkPublicTerm(value){

  return String(
    value ?? ''
  )

  .replace(
    /어린이안전지킴이집/g,
    SW_CHILD_HOUSE_PUBLIC_LABEL
  );

}


/* ============================================================
   SafeWalk JS 설정값 변경
   ============================================================ */

function applySafeWalkUiConstants(){

  /* ========================================================
     기본 레이어
     ======================================================== */

  if(
    typeof LAYER !==
      'undefined'
  ){

    if(
      LAYER.child_house
    ){

      LAYER.child_house.label =
        SW_CHILD_HOUSE_PUBLIC_LABEL;

    }


    if(
      LAYER.cctv
    ){

      /*
        지도 CCTV 마커 자체는 기존 공식 CCTV SVG 유지.
        이번 변경은 레이어 메뉴/통계/팝업 표시용 아이콘이다.
      */

      LAYER.cctv.emoji =
        SW_CCTV_CPTED_ICON_HTML;

    }

  }


  /* ========================================================
     경로 안전도 항목
     ======================================================== */

  if(
    typeof FACILITY_ROUTE_LABEL !==
      'undefined'
  ){

    FACILITY_ROUTE_LABEL.child_house =

      '🏠 '+
      SW_CHILD_HOUSE_PUBLIC_LABEL+
      ' 3순위';


    FACILITY_ROUTE_LABEL.cctv =

      SW_CCTV_CPTED_ICON_HTML+
      ' CCTV 2순위';

  }


  /* ========================================================
     가까운 안전시설 챗봇
     ======================================================== */

  if(
    typeof SW_CHAT_FACILITY_META !==
      'undefined' &&
    SW_CHAT_FACILITY_META.child_house
  ){

    SW_CHAT_FACILITY_META
      .child_house
      .label =

        SW_CHILD_HOUSE_PUBLIC_LABEL;

  }

}


/* ============================================================
   getFacilityInfo() 보완

   layers.js에 fallback 문자열이 남아 있더라도
   사용자에게는 아동안전지킴이집으로 표시한다.
   ============================================================ */

function wrapSafeWalkFacilityInfo(){

  if(
    typeof getFacilityInfo !==
      'function' ||
    getFacilityInfo._swPublicTermWrapped
  ){
    return;
  }


  const base =
    getFacilityInfo;


  const wrapped =
    function(
      key,
      item
    ){

      const info =
        base(
          key,
          item
        );


      if(
        !info ||
        typeof info !==
          'object'
      ){

        return info;

      }


      if(
        typeof info.name ===
        'string'
      ){

        info.name =
          normalizeSafeWalkPublicTerm(
            info.name
          );

      }


      return info;

    };


  wrapped._swPublicTermWrapped =
    true;


  getFacilityInfo =
    wrapped;

}


/* ============================================================
   Agent 시설 라벨 보완
   ============================================================ */

function wrapSafeWalkAgentFacilityLabel(){

  if(
    typeof safeWalkAgentFacilityLabel !==
      'function' ||
    safeWalkAgentFacilityLabel
      ._swPublicTermWrapped
  ){
    return;
  }


  const base =
    safeWalkAgentFacilityLabel;


  const wrapped =
    function(key){

      if(
        key ===
        'child_house'
      ){

        return SW_CHILD_HOUSE_PUBLIC_LABEL;

      }


      return normalizeSafeWalkPublicTerm(

        base(
          key
        )

      );

    };


  wrapped._swPublicTermWrapped =
    true;


  safeWalkAgentFacilityLabel =
    wrapped;

}


/* ============================================================
   DOM text node 변환

   index.html / route.js / chat / 향후 동적 UI 등에
   기존 문자열이 남아 있더라도 화면에서는 모두 통일한다.
   ============================================================ */

function replaceSafeWalkTermInNode(root){

  if(!root){
    return;
  }


  /*
    Text node
  */

  if(
    root.nodeType ===
    Node.TEXT_NODE
  ){

    const before =
      root.nodeValue;


    if(
      before &&
      before.includes(
        '어린이안전지킴이집'
      )
    ){

      root.nodeValue =
        normalizeSafeWalkPublicTerm(
          before
        );

    }


    return;

  }


  if(
    root.nodeType !==
    Node.ELEMENT_NODE &&
    root.nodeType !==
    Node.DOCUMENT_FRAGMENT_NODE
  ){

    return;

  }


  /*
    script/style 내용은 수정하지 않음
  */

  if(
    root.nodeType ===
    Node.ELEMENT_NODE
  ){

    const tag =
      root.tagName;


    if(
      tag === 'SCRIPT' ||
      tag === 'STYLE'
    ){

      return;

    }


    /*
      접근성 / 툴팁 속성
    */

    [
      'aria-label',
      'title',
      'placeholder'
    ]

    .forEach(
      attr=>{

        if(
          root.hasAttribute &&
          root.hasAttribute(
            attr
          )
        ){

          const before =
            root.getAttribute(
              attr
            );


          const after =
            normalizeSafeWalkPublicTerm(
              before
            );


          if(
            before !==
            after
          ){

            root.setAttribute(
              attr,
              after
            );

          }

        }

      }
    );

  }


  const walker =
    document.createTreeWalker(

      root,

      NodeFilter.SHOW_TEXT

    );


  const targets = [];


  let node;


  while(
    (
      node =
        walker.nextNode()
    )
  ){

    if(
      node.parentElement &&
      (
        node.parentElement.tagName ===
          'SCRIPT' ||

        node.parentElement.tagName ===
          'STYLE'
      )
    ){

      continue;

    }


    if(
      node.nodeValue &&
      node.nodeValue.includes(
        '어린이안전지킴이집'
      )
    ){

      targets.push(
        node
      );

    }

  }


  targets.forEach(
    item=>{

      item.nodeValue =
        normalizeSafeWalkPublicTerm(
          item.nodeValue
        );

    }
  );

}


/* ============================================================
   향후 동적으로 생성되는 UI도 감시

   routeReason
   chat answer
   layer chip
   popup 등
   ============================================================ */

function observeSafeWalkTerminology(){

  if(
    window._safeWalkTerminologyObserver
  ){
    return;
  }


  const observer =
    new MutationObserver(

      mutations=>{

        mutations.forEach(
          mutation=>{

            mutation.addedNodes
              .forEach(
                node=>{

                  replaceSafeWalkTermInNode(
                    node
                  );

                }
              );


            if(
              mutation.type ===
              'characterData'
            ){

              replaceSafeWalkTermInNode(
                mutation.target
              );

            }

          }
        );

      }

    );


  observer.observe(

    document.body,

    {

      childList:
        true,

      subtree:
        true,

      characterData:
        true

    }

  );


  window._safeWalkTerminologyObserver =
    observer;

}


/* ============================================================
   현재 생성되어 있는 CCTV 칩 아이콘 갱신

   혹시 지도 진입 후 이 스크립트가 재적용되는 상황까지 대응
   ============================================================ */

function refreshExistingSafeWalkCctvUi(){

  const row =
    document.querySelector(
      '.chip-row[data-kind="xml"][data-key="cctv"]'
    );


  if(row){

    const label =
      row.querySelector(
        '.chip-label'
      );


    if(label){

      label.innerHTML =

        SW_CCTV_CPTED_ICON_HTML+
        ' CCTV';

    }

  }


  const stat =
    document.querySelectorAll(
      '#statsBar .stat-item'
    );


  stat.forEach(
    item=>{

      const label =
        item.querySelector(
          '.stat-lbl'
        );


      if(
        label &&
        label.textContent.trim() ===
          'CCTV'
      ){

        const icon =
          item.querySelector(
            '.stat-emoji'
          );


        if(icon){

          icon.innerHTML =
            SW_CCTV_CPTED_ICON_HTML;

        }

      }

    }
  );

}


/* ============================================================
   적용
   ============================================================ */

injectSafeWalkUiPatchStyles();


applySafeWalkUiConstants();


wrapSafeWalkFacilityInfo();


wrapSafeWalkAgentFacilityLabel();


if(
  document.readyState ===
  'loading'
){

  document.addEventListener(

    'DOMContentLoaded',

    ()=>{

      applySafeWalkUiConstants();

      replaceSafeWalkTermInNode(
        document.body
      );

      refreshExistingSafeWalkCctvUi();

      observeSafeWalkTerminology();

    },

    {
      once:true
    }

  );

}

else{

  applySafeWalkUiConstants();

  replaceSafeWalkTermInNode(
    document.body
  );

  refreshExistingSafeWalkCctvUi();

  observeSafeWalkTerminology();

}


console.log(
  '[SafeWalk v2.6.1] UI 용어·CCTV CPTED 아이콘 패치 활성화'
);
