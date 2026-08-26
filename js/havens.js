/* ============================================================
   SafeWalk v2.2.0 — havens.js

   추가 레이어 공통 UI

   변경 사항
   ------------------------------------------------------------
   - OSM 안심 편의점 기능 완전 제거
   - 어린이 / 여성·청소년 / 노인 모두
     "즐겨찾는 장소" 기능만 공통 제공
   - 기존 map.js / layers.js 호환을 위해
     haven 관련 함수명은 no-op으로 유지

   실제 즐겨찾기 저장/표시/삭제 기능은
   audit.js가 담당한다.
   ============================================================ */


/* ============================================================
   기존 코드 호환용 Haven 상태

   안심 편의점 기능은 더 이상 사용하지 않는다.
   ============================================================ */

let havenLayer = null;
let havenChipOn = false;


/* ============================================================
   안심 편의점 호환 함수

   map.js / layers.js의 기존 호출이 남아 있어도
   오류가 발생하지 않도록 함수만 유지한다.
   ============================================================ */

function initHavenLayer(){

  /*
    안심 편의점 기능 제거.
    어떠한 레이어나 외부 API 요청도 생성하지 않는다.
  */

  havenLayer = null;
  havenChipOn = false;

}


function resetHavenFeature(){

  havenLayer = null;
  havenChipOn = false;

}


function setHavenLayerVisible(){

  /*
    기능 제거됨.
    기존 layers.js 호환을 위한 빈 함수.
  */

  havenChipOn = false;

}


async function refreshHavens(){

  /*
    기능 제거됨.
    Overpass API를 호출하지 않는다.
  */

  return;

}


/* ============================================================
   모든 이용자 유형 공통 추가 레이어

   layers.js의 buildChips()가
   어린이 / 여성·청소년 / 노인 구분 없이 호출한다.
   ============================================================ */

function appendExtraChips(container){

  if(!container){
    return;
  }


  /* ========================================================
     중복 생성 방지
     ======================================================== */

  const existingRow =
    container.querySelector(
      '.chip-row[data-kind="audit"]'
    );


  if(existingRow){
    return;
  }


  /* ========================================================
     즐겨찾는 장소 ON/OFF 레이어
     ======================================================== */

  const row =
    document.createElement(
      'div'
    );


  const favoriteOn =

    typeof auditChipOn === 'undefined'

      ? true

      : Boolean(auditChipOn);


  row.className =
    'chip-row' +
    (
      favoriteOn
        ? ' on'
        : ''
    );


  row.dataset.kind =
    'audit';


  row.dataset.key =
    'audit';


  row.setAttribute(
    'role',
    'switch'
  );


  row.setAttribute(
    'aria-checked',
    favoriteOn
      ? 'true'
      : 'false'
  );


  row.setAttribute(
    'aria-label',
    '즐겨찾는 장소'
  );


  row.setAttribute(
    'tabindex',
    '0'
  );


  row.innerHTML =

    '<div class="chip-left">'+

      '<span class="chip-dot" '+
        'style="background:#2563eb">'+
      '</span>'+

      '<div>'+

        '<div class="chip-label">'+
          '⭐ 즐겨찾는 장소'+
        '</div>'+

      '</div>'+

    '</div>'+

    '<span class="sw-vis">'+

      '<span class="toggle-thumb">'+
        '<span class="mini-spin"></span>'+
      '</span>'+

    '</span>';


  container.appendChild(
    row
  );


  /* ========================================================
     즐겨찾기 추가 버튼
     ======================================================== */

  const addBtn =
    document.createElement(
      'button'
    );


  addBtn.type =
    'button';


  addBtn.id =
    'auditAddBtn';


  addBtn.className =
    'audit-add-btn';


  addBtn.textContent =
    '⭐ 즐겨찾는 장소 추가하기';


  addBtn.setAttribute(
    'aria-label',
    '지도에서 즐겨찾는 장소 추가하기'
  );


  addBtn.addEventListener(

    'click',

    event=>{

      event.preventDefault();

      event.stopPropagation();


      if(
        typeof startAuditPick ===
        'function'
      ){

        startAuditPick();

      }

    }

  );


  container.appendChild(
    addBtn
  );

}


/* ============================================================
   상태 안내
   ============================================================ */

console.log(
  '[SafeWalk v2.2] 안심 편의점 제거 · 전 연령 즐겨찾기 활성화'
);
