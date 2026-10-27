/* seed.js — 초기 데이터 (요구사항 정의서 4.4 / 11장 기준)
 * 여기 값은 설정 화면에서 자유롭게 수정할 수 있고, 수정본은 localStorage 에 저장된다.
 */
(function (global) {
  'use strict';

  var DOC_TYPES = ['세금계산서', '견적서', '영수증'];

  /* 4.1 / 4.3 — 파일명 규칙.
   * builtin 규칙은 삭제할 수 없고 패턴만 수정할 수 있다. */
  var TEMPLATES = [
    { id: 't_tax',      label: '세금계산서 기본',            docTypes: ['세금계산서'], pattern: '세금계산서_{vendor}_{purpose}_{amount}',            builtin: true },
    { id: 't_quote',    label: '견적서 기본',                docTypes: ['견적서'],     pattern: '견적서_{vendor}_{purpose}_{amount}',                builtin: true },
    { id: 't_receipt',  label: '영수증 기본',                docTypes: ['영수증'],     pattern: '[{vendor}]_{purpose}_{docSubtype}({amount})_{date}', builtin: true },
    /* 4.3 변형 패턴 */
    { id: 't_r_nodate', label: '영수증 · 날짜 생략',         docTypes: ['영수증'],     pattern: '[{vendor}]_{purpose}({amount})',                     builtin: true },
    { id: 't_r_detail', label: '영수증 · 세부항목 표기',      docTypes: ['영수증'],     pattern: '[{vendor}]_{purpose}_세부항목_{amount}_{date}',       builtin: true },
    { id: 't_r_naver',  label: '영수증 · 네이버페이 화면별',  docTypes: ['영수증'],     pattern: '{purpose}_네이버페이_{amount}_{docSubtype}',          builtin: true }
  ];

  /* 11장 — 업체 사전 시드.
   * 용도는 고정 매핑이 아니라 "최근 사용 용도" 자동완성 후보로 쓴다. */
  var VENDORS = [
    { canonicalName: '한남관광',               aliases: ['(주)한남관광개발', '한남관광개발'], recentPurposes: ['28인승 우등버스대절비용'],          defaultDocType: '세금계산서' },
    { canonicalName: '씨피에스',               aliases: ['C.P.S', 'CPS', 'C.P.S.'],           recentPurposes: ['리플렛 제작'],                       defaultDocType: '세금계산서', note: '파일명 표준 표기 미확정' },
    { canonicalName: '서울주택도시개발공사',    aliases: ['SH공사', 'SH', '에스에이치공사'],   recentPurposes: ['현장투어 간식', '창신동트립 워크샵 다과'], defaultDocType: '영수증' },
    { canonicalName: '노보텔앰버서더동대문',    aliases: ['노보텔 앰버서더 동대문', 'Novotel Ambassador Dongdaemun', '노보텔앰배서더동대문'], recentPurposes: ['현장요청식사비'], defaultDocType: '영수증' },
    { canonicalName: '서울브루어리성수',       aliases: ['서울브루어리 성수', '서울브루어리'], recentPurposes: ['카페이용'],                          defaultDocType: '영수증' },
    { canonicalName: '포인트오브뷰',           aliases: ['point of view'],                    recentPurposes: ['경품지급용'],                        defaultDocType: '영수증' },
    { canonicalName: '모나미',                 aliases: [],                                   recentPurposes: ['경품지급용'],                        defaultDocType: '영수증' },
    { canonicalName: '탬버린즈',               aliases: ['tamburins'],                        recentPurposes: ['경품지급용'],                        defaultDocType: '영수증' },
    { canonicalName: '부산집막국수',           aliases: [],                                   recentPurposes: ['중식'],                              defaultDocType: '영수증' },
    { canonicalName: '고토리성수',             aliases: ['고토리 성수'],                      recentPurposes: ['저녁회식'],                          defaultDocType: '영수증' },
    { canonicalName: '유니크굿컴퍼니',         aliases: [],                                   recentPurposes: ['방탈출'],                            defaultDocType: '영수증' },
    { canonicalName: '필원',                   aliases: ['주식회사 필원', '(주)필원'],         recentPurposes: ['회의실 대관 및 다과세팅비'],          defaultDocType: '영수증', note: '파일명 표준 표기 미확정' },
    { canonicalName: '엠파킹',                 aliases: ['M파킹'],                            recentPurposes: ['운영주차비'],                        defaultDocType: '영수증' },
    { canonicalName: '이디야커피국회의사당역점', aliases: ['이디야커피', '이디야'],             recentPurposes: ['현장고객사요청답사비용'],            defaultDocType: '영수증' },
    { canonicalName: '쉐이크쉑',               aliases: ['shake shack', '쉑쉑'],              recentPurposes: ['현장고객사요청답사비용'],            defaultDocType: '영수증' },
    { canonicalName: '키키노히호',             aliases: [],                                   recentPurposes: ['현장고객사요청답사비용'],            defaultDocType: '영수증' },
    { canonicalName: '경복궁',                 aliases: [],                                   recentPurposes: ['입장권'],                            defaultDocType: '영수증' },
    { canonicalName: '제이제이오',             aliases: ['JJO'],                              recentPurposes: ['서울주택도시개발공사 현장투어 간식'],  defaultDocType: '영수증' },
    { canonicalName: '테크빌교육',             aliases: ['티처몰'],                           recentPurposes: ['투어 후 호텔 워크샵 다과'],          defaultDocType: '영수증' },
    { canonicalName: '쿠팡',                   aliases: ['coupang'],                          recentPurposes: ['서울주택도시개발공사 창신동트립 워크샵 다과'], defaultDocType: '영수증' },
    { canonicalName: '미벗',                   aliases: [],                                   recentPurposes: [],                                    defaultDocType: '영수증' },
    { canonicalName: '경성자동차교통',         aliases: ['경성택시'],                         recentPurposes: ['이동비'],                            defaultDocType: '영수증', note: '용도 미확정 · 짐운반증빙 동반' }
  ];

  /* 문서종류 칸 후보 (3장 용어 정의 / 4.3) */
  var SUBTYPES = ['영수증', '이용내역서', '짐운반증빙', '카드영수증', '주문내역', '구매영수증', '거래명세서'];

  var SETTINGS = {
    pdfPageMode: 'fit',     // 'fit' | 'a4'  (Q-13)
    aliasSuggest: true,     // FR-15
    learnVendors: true,     // FR-14 자동 학습
    subtypes: SUBTYPES.slice()
  };

  global.ReceiptSeed = {
    DOC_TYPES: DOC_TYPES,
    TEMPLATES: TEMPLATES,
    VENDORS: VENDORS,
    SUBTYPES: SUBTYPES,
    SETTINGS: SETTINGS
  };
})(window);
