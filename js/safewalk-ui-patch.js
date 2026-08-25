/* SafeWalk v2.7.0 — safewalk-ui-patch.js */

const SW_CHILD_HOUSE_PUBLIC_LABEL=
  '아동안전지킴이집';


/*
  config.js에 이미 정의된
  실제 CCTV 공식 아이콘을 그대로 사용한다.
*/

const SW_CCTV_PUBLIC_ICON_URL=

  (
    typeof CCTV_ICON_URL!==
      'undefined'

    &&

    CCTV_ICON_URL
  )

  ?CCTV_ICON_URL

  :'assets/poi01_17_1.svg';


const SW_CCTV_ICON_HTML=

  '<img '+
    'src="'+SW_CCTV_PUBLIC_ICON_URL+'" '+
    'class="sw-cctv-public-icon" '+
    'alt="" '+
    'aria-hidden="true">'+
  '';


/* ============================================================
   CCTV SVG 표시 스타일
   ============================================================ */

function injectSafeWalkUiPatchStyles(){

  if(
    document.getElementById(
      'safeWalkUiPatchStyles'
    )
  ){

    return;

  }


  const style=
    document.createElement(
      'style'
    );


  style.id=
    'safeWalkUiPatchStyles';


  style.textContent=`

    .sw-cctv-public-icon{

      display:inline-block;

      width:18px;

      height:18px;

      object-fit:contain;

      vertical-align:-4px;

      flex:0 0 auto;

    }


    .chip-label .sw-cctv-public-icon{

      width:19px;

      height:19px;

      vertical-align:-4px;

    }


    .stat-emoji .sw-cctv-public-icon{

      width:20px;

      height:20px;

      vertical-align:0;

    }


    .route-pill .sw-cctv-public-icon,
    .pbadge .sw-cctv-public-icon{

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
   용어 변경
   ============================================================ */

function normalizeSafeWalkPublicTerm(value){

  return String(
    value??''
  )

  .replace(
    /어린이안전지킴이집/g,
    SW_CHILD_HOUSE_PUBLIC_LABEL
  );

}


/* ============================================================
   SafeWalk 전역 UI 설정값 변경
   ============================================================ */

function applySafeWalkUiConstants(){

  if(
    typeof LAYER!==
    'undefined'
  ){

    if(
      LAYER.child_house
    ){

      LAYER.child_house.label=
        SW_CHILD_HOUSE_PUBLIC_LABEL;

    }


    if(
      LAYER.cctv
    ){

      LAYER.cctv.emoji=
        SW_CCTV_ICON_HTML;

    }

  }


  if(
    typeof FACILITY_ROUTE_LABEL!==
    'undefined'
  ){

    FACILITY_ROUTE_LABEL.child_house=

      '🏠 '+
      SW_CHILD_HOUSE_PUBLIC_LABEL+
      ' 3순위';


    FACILITY_ROUTE_LABEL.cctv=

      SW_CCTV_ICON_HTML+
      ' CCTV 2순위';

  }


  /*
    chat-facility.js 출력
  */

  if(
    typeof SW_CHAT_FACILITY_META!==
      'undefined'

    &&

    SW_CHAT_FACILITY_META.child_house
  ){

    SW_CHAT_FACILITY_META
      .child_house
      .label=

        SW_CHILD_HOUSE_PUBLIC_LABEL;

  }

}


/* ============================================================
   시설명 fallback 용어 변경
   ============================================================ */

function wrapSafeWalkFacilityInfo(){

  if(
    typeof getFacilityInfo!==
      'function'

    ||

    getFacilityInfo
      ._swPublicTermWrapped
  ){

    return;

  }


  const base=
    getFacilityInfo;


  const wrapped=
    function(
      key,
      item
    ){

      const info=
        base(
          key,
          item
        );


      if(
        info &&
        typeof info===
          'object'

        &&

        typeof info.name===
          'string'
      ){

        info.name=
          normalizeSafeWalkPublicTerm(
            info.name
          );

      }


      return info;

    };


  wrapped._swPublicTermWrapped=
    true;


  getFacilityInfo=
    wrapped;

}


/* ============================================================
   CCTV 팝업 교체

   1. 위 배지:
      실제 CCTV SVG + CCTV

   2. 아래 상세:
      📷 2대
      → 2대

   카메라 이모지 삭제.
   ============================================================ */

function wrapSafeWalkCctvPopup(){

  if(
    typeof mkMarker!==
      'function'

    ||

    mkMarker
      ._swCctvPopupWrapped
  ){

    return;

  }


  const base=
    mkMarker;


  const wrapped=
    function(
      key,
      lat,
      lng,
      it
    ){


      if(
        key!==
        'cctv'
      ){

        return base(
          key,
          lat,
          lng,
          it
        );

      }


      const m=
        LAYER.cctv;


      const info=
        getFacilityInfo(
          'cctv',
          it
        );


      const prps=
        xv(
          it,
          'instl_prps_se'
        )||'';


      const cnt=
        xv(
          it,
          'cmr_cntom'
        )||'';


      const tel=
        xv(
          it,
          'mng_inst_telno'
        )||'';


      /*
        기존:
        어린이보호 📷 2대 📞 ...

        변경:
        어린이보호 2대 📞 ...
      */

      const extra=

        (
          prps

            ?'<span style="color:#2563eb">'+
              esc(prps)+
              '</span> '

            :''
        )

        +

        (
          cnt

            ?'<span style="color:#64748b">'+
              esc(cnt)+
              '대</span> '

            :''
        )

        +

        (
          tel

            ?'<span style="color:#64748b">'+
              '📞 '+
              esc(tel)+
              '</span>'

            :''
        );


      return L.marker(

        [
          lat,
          lng
        ],

        {

          /*
            실제 지도 마커도
            기존 CCTV 공식 SVG 그대로.
          */

          icon:
            getCctvMarkerIcon()

        }

      )

      .bindPopup(

        L.popup({

          className:
            'safepopup',

          closeButton:
            true,

          maxWidth:
            240

        })

        .setContent(

          '<div class="pbadge" style="'+
            'background:'+m.color+'18;'+
            'color:'+m.color+
          '">'+

            SW_CCTV_ICON_HTML+
            ' CCTV'+

          '</div>'+

          '<div class="ptitle">'+
            esc(
              info.name
            )+
          '</div>'+

          (
            info.addr

              ?'<div class="prow">'+
                '📍 '+
                esc(info.addr)+
                '</div>'

              :''
          )

          +

          (
            extra

              ?'<div class="prow">'+
                extra+
                '</div>'

              :''
          )

        )

      );

    };


  wrapped._swCctvPopupWrapped=
    true;


  mkMarker=
    wrapped;

}


/* ============================================================
   기존 HTML / 동적 생성 UI의 옛 용어 변경
   ============================================================ */

function replaceSafeWalkTermInNode(root){

  if(!root)return;


  if(
    root.nodeType===
    Node.TEXT_NODE
  ){

    if(
      root.nodeValue &&
      root.nodeValue.includes(
        '어린이안전지킴이집'
      )
    ){

      root.nodeValue=

        normalizeSafeWalkPublicTerm(
          root.nodeValue
        );

    }


    return;

  }


  if(
    root.nodeType!==
      Node.ELEMENT_NODE

    &&

    root.nodeType!==
      Node.DOCUMENT_FRAGMENT_NODE
  ){

    return;

  }


  if(
    root.nodeType===
    Node.ELEMENT_NODE
  ){

    if(
      root.tagName===
        'SCRIPT'

      ||

      root.tagName===
        'STYLE'
    ){

      return;

    }


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

          const before=
            root.getAttribute(
              attr
            );


          const after=
            normalizeSafeWalkPublicTerm(
              before
            );


          if(
            before!==
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


  const walker=
    document.createTreeWalker(

      root,

      NodeFilter.SHOW_TEXT

    );


  const targets=[];


  let node;


  while(
    (
      node=
        walker.nextNode()
    )
  ){

    if(
      node.parentElement

      &&

      (
        node.parentElement.tagName===
          'SCRIPT'

        ||

        node.parentElement.tagName===
          'STYLE'
      )
    ){

      continue;

    }


    if(
      node.nodeValue

      &&

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
    n=>{

      n.nodeValue=

        normalizeSafeWalkPublicTerm(
          n.nodeValue
        );

    }
  );

}


/* ============================================================
   이후 동적으로 생기는 문구도 자동 변환
   ============================================================ */

function observeSafeWalkTerminology(){

  if(
    window
      ._safeWalkTerminologyObserver
  ){

    return;

  }


  const observer=
    new MutationObserver(

      mutations=>{

        mutations.forEach(
          m=>{

            m.addedNodes
              .forEach(
                n=>
                  replaceSafeWalkTermInNode(
                    n
                  )
              );


            if(
              m.type===
              'characterData'
            ){

              replaceSafeWalkTermInNode(
                m.target
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


  window
    ._safeWalkTerminologyObserver=

      observer;

}


/* ============================================================
   적용
   ============================================================ */

injectSafeWalkUiPatchStyles();


applySafeWalkUiConstants();


wrapSafeWalkFacilityInfo();


wrapSafeWalkCctvPopup();


if(
  document.readyState===
  'loading'
){

  document.addEventListener(

    'DOMContentLoaded',

    ()=>{

      applySafeWalkUiConstants();


      replaceSafeWalkTermInNode(
        document.body
      );


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


  observeSafeWalkTerminology();

}


console.log(
  '[SafeWalk v2.7] 용어 + CCTV 공식 아이콘 패치 활성화'
);
