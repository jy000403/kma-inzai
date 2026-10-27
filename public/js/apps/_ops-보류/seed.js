/* seed.js — 초기 데이터
 *
 * 값의 출처는 요구사항 정의서 부록 A / 2장 / 5장이다.
 * 문서에서 확인되지 않은 값은 절대 채우지 않고 빈칸으로 두었다(사용자 지침 SRC-1).
 * 빈칸은 화면에서 '확인 필요'로 표시되고, 관련 항목은 미결 질문으로 등록해 두었다.
 */
(function (g) {
  'use strict';

  var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

  var CHECKLIST_CATEGORIES = [
    '음향·IT', '사무·현장용품', '구급약품', '다과·주류',
    '출력물', '현수막·배너', '결제·서류', '기타·비상'
  ];
  var CLASSIFICATIONS = ['요청', '세부', '검토'];
  var ITEM_STATUS = ['미착수', '진행중', '완료', '불필요(제외)', '논의 필요'];
  var OCCUPANT_TYPES = ['교육생', 'KMA 운영진', '고객사 담당', '강사', '예비', '미배정'];
  var FACT_TAGS = ['사실', '해석', '제안', '확인불가'];
  var SOURCE_TYPES = ['대화', '미팅', '답사', '문서', '메모리'];

  /* ── 프로그램 / 지역 / 차수 (부록 A.1) ───────────────── */

  var programs = [{
    id: 'p_hana', client: '하나은행', name: '2026 하나은행 부·점장 힐링프로그램',
    targetLabel: '부·점장', format: '1박2일', pm: '이아롱 책임전문위원', planner: '박주열'
  }];

  var regions = [
    { id: 'r_yn', programId: 'p_hana', name: '영남' },
    { id: 'r_cc', programId: 'p_hana', name: '충청' },
    { id: 'r_hn', programId: 'p_hana', name: '호남' }
  ];

  var sessions = [
    { id: 's_yn1', regionId: 'r_yn', no: 1, startDate: '2026-09-08', endDate: '2026-09-09', headcount: 30, lodgingVenueId: 'v_ever', status: '완료', note: '' },
    { id: 's_yn2', regionId: 'r_yn', no: 2, startDate: '2026-09-14', endDate: '2026-09-15', headcount: 30, lodgingVenueId: 'v_ever', status: '완료', note: '' },
    { id: 's_yn3', regionId: 'r_yn', no: 3, startDate: '2026-10-15', endDate: '2026-10-16', headcount: 30, lodgingVenueId: 'v_ever', status: '예정',
      note: '당초 9/17~18에서 변경됨',
      changes: [{ field: 'startDate', from: '2026-09-17', to: '2026-10-15', at: '', reason: '일정 변경 (변경일 미기재)' },
                { field: 'endDate', from: '2026-09-18', to: '2026-10-16', at: '', reason: '일정 변경 (변경일 미기재)' }] },
    { id: 's_cc1', regionId: 'r_cc', no: 1, startDate: '2026-10-13', endDate: '2026-10-14', headcount: null, lodgingVenueId: 'v_elite', status: '예정',
      note: '변경된 일정 (이전 값 기록 없음) · 차수별 인원 확인 필요' },
    { id: 's_cc2', regionId: 'r_cc', no: 2, startDate: '2026-10-22', endDate: '2026-10-23', headcount: null, lodgingVenueId: 'v_elite', status: '예정', note: '차수별 인원 확인 필요' },
    { id: 's_cc3', regionId: 'r_cc', no: 3, startDate: '2026-10-28', endDate: '2026-10-29', headcount: null, lodgingVenueId: 'v_elite', status: '예정',
      note: '메모리에 10/29~30 기록도 있음 (점검 No 1). 10월 확정본 기준 10/28~29로 입력' },
    { id: 's_hn1', regionId: 'r_hn', no: 1, startDate: '2026-10-19', endDate: '2026-10-20', headcount: null, lodgingVenueId: 'v_hong', status: '예정', note: '호남 합계 30명 · 차수별 인원 확인 필요' },
    { id: 's_hn2', regionId: 'r_hn', no: 2, startDate: '2026-10-26', endDate: '2026-10-27', headcount: null, lodgingVenueId: 'v_hong', status: '예정', note: '호남 합계 30명 · 차수별 인원 확인 필요' }
  ];

  /* ── 장소 (2.2 / 5장) ─────────────────────────────── */

  var venues = [
    { id: 'v_ever',  type: '숙소', name: '밀양 에버미라클 호텔', aliases: ['에버미라클'], region: '영남', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '' },
    { id: 'v_elite', type: '숙소', name: '영동 일라이트 호텔', aliases: ['일라이트', '일라이트 호텔'], region: '충청', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '부대시설 별도 미이용 — 안내 문구 협의 필요 (BR-09)' },
    { id: 'v_hong',  type: '숙소', name: '마이산 홍삼빌', aliases: ['홍삼빌', '진안 마이산 홍삼빌'], region: '호남', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '2026-08-14 숙소 변경 제안으로 확정된 것으로 보임 (점검 No 2)' },

    { id: 'v_cable', type: '프로그램', name: '얼음골 케이블카', aliases: [], region: '영남', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '' },
    { id: 'v_wine',  type: '프로그램', name: '영동와인전망대', aliases: ['와인전망대'], region: '충청', phone: '', openHours: '', closedWeekdays: ['월'], closedOnRain: true,
      restrictions: ['단체 사진 촬영 금지', '음주 후 이용 불가', '입장 인원 준수'], status: '사용', note: '운영시간 값은 원본 답사 기록에서 옮겨 적어야 함' },
    { id: 'v_herb',  type: '프로그램', name: '진안 산약초타운 힐링 산책', aliases: ['산약초타운'], region: '호남', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '' },
    { id: 'v_arbo',  type: '프로그램', name: '국립진안고원수목원', aliases: ['국립진안고원 산림치유원', '진안고원수목원'], region: '호남', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '실내 프로그램은 오후만 운영 (BR-06)' },
    { id: 'v_rain',  type: '프로그램', name: '레인보우 식물원', aliases: [], region: '충청', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '제외', note: '충청 프로그램에서 제외 결정 (BR-03)' },

    { id: 'v_club',  type: '식당', name: '일라이트CC 클럽하우스 레스토랑', aliases: ['클럽하우스'], region: '충청', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '' },
    { id: 'v_hall',  type: '식당', name: '일라이트 호텔 대형 홀', aliases: ['대형 홀'], region: '충청', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '' },
    { id: 'v_heal',  type: '식당', name: '마이산 힐링하우스', aliases: ['힐링하우스'], region: '호남', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '예약금 법인카드 결제 대상' },
    { id: 'v_don',   type: '식당', name: '진안 마이돈', aliases: ['마이돈'], region: '호남', phone: '', openHours: '', closedWeekdays: ['수'], closedOnRain: false, restrictions: [], status: '사용', note: '수요일 휴무 (BR-05)' },
    { id: 'v_baek',  type: '식당', name: '백제회관', aliases: [], region: '', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '담당 지역 미기재 — 확인 필요' },

    { id: 'v_yeoui', type: '기타', name: '여의도', aliases: [], region: '', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '구간 실거리 기준점' },
    { id: 'v_iroom', type: '기타', name: '이룸센터', aliases: [], region: '', phone: '', openHours: '', closedWeekdays: [], closedOnRain: false, restrictions: [], status: '사용', note: '운영 차량 출발지. 이룸센터 기준 거리 기록 없음 — 여의도 기준 거리만 확인됨' }
  ];

  /* 층별·부대시설 — 항목 존재만 확인됨. 값은 원본 답사 기록에서 옮겨 적어야 한다. */
  var facilities = [
    { id: 'f_e1', venueId: 'v_elite', floor: '', category: '층별 안내', description: '' },
    { id: 'f_e2', venueId: 'v_elite', floor: '', category: '주차장', description: '지하/지상 구분 확인 필요' },
    { id: 'f_e3', venueId: 'v_elite', floor: '', category: '편의점', description: '' },
    { id: 'f_e4', venueId: 'v_elite', floor: '', category: '흡연 장소', description: '' },
    { id: 'f_e5', venueId: 'v_elite', floor: '', category: '식당 위치', description: '' }
  ];

  /* 구간 실거리 (부록 A.2) */
  var distances = [
    { id: 'd1', fromVenueId: 'v_yeoui', toVenueId: 'v_ever',  mode: '차량', distanceM: 371000, minutes: null, steps: null, crosswalks: null, source: '네이버 지도' },
    { id: 'd2', fromVenueId: 'v_yeoui', toVenueId: 'v_elite', mode: '차량', distanceM: 240000, minutes: null, steps: null, crosswalks: null, source: '네이버 지도' },
    { id: 'd3', fromVenueId: 'v_yeoui', toVenueId: 'v_hong',  mode: '차량', distanceM: 257000, minutes: null, steps: null, crosswalks: null, source: '네이버 지도' },
    { id: 'd4', fromVenueId: 'v_elite', toVenueId: 'v_ever',  mode: '차량', distanceM: 200000, minutes: null, steps: null, crosswalks: null, source: '네이버 지도' },
    { id: 'd5', fromVenueId: 'v_hong',  toVenueId: 'v_elite', mode: '차량', distanceM: 70000,  minutes: null, steps: null, crosswalks: null, source: '네이버 지도' },
    { id: 'd6', fromVenueId: 'v_elite', toVenueId: 'v_club',  mode: '도보', distanceM: 124, minutes: 2, steps: 194, crosswalks: null, source: '네이버 지도' },
    { id: 'd7', fromVenueId: 'v_elite', toVenueId: 'v_wine',  mode: '도보', distanceM: 122, minutes: 2, steps: 191, crosswalks: 2, source: '네이버 지도' }
  ];

  /* ── 객실 (부록 A.4) ──────────────────────────────── */

  function room(no, type, cap, assumed) {
    return { id: 'rm_' + no, venueId: 'v_ever', roomNo: String(no), roomType: type, capacity: cap, capacityAssumed: !!assumed, available: true };
  }
  var rooms = [
    room(207, '스탠다드트윈', 2, true), room(307, '스탠다드트윈', 2, true), room(309, '스탠다드트윈', 2, true),
    room(209, '패밀리트윈', 2, true), room(212, '패밀리트윈', 2, true), room(306, '패밀리트윈', 2, true), room(308, '패밀리트윈', 2, true),
    room(102, '스탠다드더블', 2, true), room(103, '스탠다드더블', 2, true), room(202, '스탠다드더블', 2, true),
    room(203, '스탠다드더블', 2, true), room(205, '스탠다드더블', 2, true), room(206, '스탠다드더블', 2, true),
    room(201, '슈페리어트윈', 2, true), room(312, '슈페리어트윈', 2, true), room(313, '슈페리어트윈', 2, true),
    room(301, '스위트', 2, false), room(302, '스위트', 2, false),
    room(213, '(타입 기록 없음)', 2, true),
    room(303, '프리미엄더블', 2, true), room(305, '프리미엄더블', 2, true),
    room(106, '온돌', 2, true), room(107, '온돌', 2, true), room(108, '온돌', 2, true),
    room(215, '스탠다드더블', 2, true),
    room(101, '디럭스키즈', 2, true), room(105, '디럭스키즈', 2, true), room(211, '디럭스키즈', 2, true)
  ];

  /* 영남 1차수 배정표 — 메모리에 기록된 그대로 옮긴다.
   * 303호는 '강사·운영진' 목록에 있으나 배치 원칙상 최고령 교육생이므로
   * 규칙 검증에서 불일치로 잡히도록 기록된 값을 그대로 둔다 (점검 No 6). */
  function asg(no, type, single) {
    return { id: 'as_' + no, sessionId: 's_yn1', roomId: 'rm_' + no, occupantType: type, occupantCode: '', singleUse: !!single, isSpare: false, note: '' };
  }
  var assignments = [].concat(
    [207, 307, 309, 209, 212, 306, 308, 201, 312, 313, 301, 302].map(function (n) { return asg(n, '교육생', false); }),
    [102, 103, 202, 203, 205, 206].map(function (n) { return asg(n, '교육생', true); }),
    [asg(213, '교육생', true)],
    [106, 107, 108, 215, 303].map(function (n) { return asg(n, 'KMA 운영진', true); }),
    [asg(305, '고객사 담당', true)],
    [101, 105, 211].map(function (n) { return asg(n, '미배정', false); })
  );
  assignments.filter(function (a) { return a.roomId === 'rm_213'; })[0].note = '성별 조정용 1인실';
  assignments.filter(function (a) { return a.roomId === 'rm_305'; })[0].note = '하나은행 담당자 (BR-16)';
  assignments.filter(function (a) { return a.roomId === 'rm_303'; })[0].note = '메모리 목록은 강사·운영진, 배치 원칙은 최고령 교육생 — 점검 No 6';

  /* 교육생 명단은 확인된 자료가 없으므로 비워 둔다.
   * 확인된 사실: 영남 1차수 30명, 여성 4명, 6명×5개조. */
  var participants = [];

  /* ── 체크리스트 (부록 A.3) ────────────────────────── */

  var checklists = [
    { id: 'cl_yn1_b', sessionId: 's_yn1', templateType: 'B', title: '영남 1차수 준비물 체크리스트' },
    { id: 'cl_yn1_a', sessionId: 's_yn1', templateType: 'A', title: '영남 1차수 운영 체크리스트' }
  ];

  function ci(name, category, classification, status, note, qtyFormula) {
    return {
      id: 'ci_' + (ci._n = (ci._n || 0) + 1), checklistId: 'cl_yn1_b',
      name: name, category: category, area: '', qty: null, qtyFormula: qtyFormula || '',
      owner: '', role: '', dueDate: '', status: status || '미착수', checked: false,
      classification: classification, note: note || ''
    };
  }
  var checklistItems = [
    ci('BGM', '음향·IT', '요청'),
    ci('노트북', '음향·IT', '요청'),
    ci('블루투스 스피커', '음향·IT', '요청', '불필요(제외)', '불필요 결정'),
    ci('오디오(AUX) 케이블', '음향·IT', '세부', '불필요(제외)', '불필요 결정'),
    ci('다과 트레이', '다과·주류', '요청'),
    ci('술', '다과·주류', '요청'),
    ci('병따개', '다과·주류', '세부', '불필요(제외)', '불필요 결정'),
    ci('가위', '사무·현장용품', '요청'),
    ci('칼', '사무·현장용품', '요청'),
    ci('볼펜', '사무·현장용품', '세부', '미착수', '수량 = 교육생 수 + 여분', '{인원}+5'),
    ci('구급약품', '구급약품', '요청'),
    ci('짐보관 안내표', '출력물', '요청', '미착수', '반드시 포함'),
    ci('만족도 설문지', '출력물', '검토', '논의 필요', '필요 여부 논의 필요', '{인원}'),
    ci('주차 안내 계획', '기타·비상', '검토', '미착수', 'BR-07 — 버스 미운행, 참가자 개별 차량 이동')
  ];

  /* ── 운영 차량 ────────────────────────────────────── */

  var rentals = [{
    id: 'rt1', startAt: '2026-10-12T09:10', endAt: '2026-10-29T22:00',
    reserver: '', originVenueId: 'v_iroom', hourlyRate: 2500, perKmRate: 200,
    billingUnit: '미확정', note: '예약자·과금 단위(분/시간 올림) 확인 필요'
  }];

  /* 일자별 동선: 기록된 구간과 거리는 확인됐으나 개별 일자는 이 문서에 없다.
   * 순서·거리는 점검 No 10의 합계식(240+200+371+257+240+257+70+240)과 동일하게 입력한다. */
  function trip(n, from, to, km) {
    return { id: 'tp' + n, rentalId: 'rt1', seq: n, date: '', fromVenueId: from, toVenueId: to, distanceKm: km, unused: false, note: '일자 미기재 — 원본 메모리 확인 필요' };
  }
  var trips = [
    trip(1, 'v_yeoui', 'v_elite', 240),
    trip(2, 'v_elite', 'v_ever', 200),
    trip(3, 'v_ever', 'v_yeoui', 371),
    trip(4, 'v_yeoui', 'v_hong', 257),
    trip(5, 'v_elite', 'v_yeoui', 240),
    trip(6, 'v_yeoui', 'v_hong', 257),
    trip(7, 'v_hong', 'v_elite', 70),
    trip(8, 'v_elite', 'v_yeoui', 240)
  ];

  /* ── 식사 · 일정 ──────────────────────────────────── */
  /* 요구사항 정의서 2.3의 점검 No 4는 "진안 마이돈 수요일 휴무 vs 호남 Day1 석식일"을 대조했다.
   * 그 점검이 성립하려면 호남 Day1 석식 장소가 마이돈이어야 하므로 그 전제를 그대로 입력해 둔다.
   * 실제 확정 여부는 미결 질문(q21)으로 남겨 두었다. 나머지 일정은 기록이 없어 비워 둔다. */
  var meals = [
    { id: 'ml1', sessionId: 's_hn1', day: 1, mealType: '석식', venueId: 'v_don', startTime: '18:00', note: '점검 No 4의 전제 — 장소 확정 필요' },
    { id: 'ml2', sessionId: 's_hn2', day: 1, mealType: '석식', venueId: 'v_don', startTime: '18:00', note: '점검 No 4의 전제 — 장소 확정 필요' }
  ];
  var activities = [];

  /* ── 운영 지식(사실 카드) ─────────────────────────── */

  function fact(id, content, opt) {
    opt = opt || {};
    return {
      id: id, content: content, tag: opt.tag || '사실',
      subject: opt.subject || '', attribute: opt.attribute || '', value: opt.value || '',
      sourceType: opt.sourceType || '메모리', sourceRef: opt.sourceRef || '',
      recordedAt: opt.recordedAt || '', links: opt.links || [], supersededBy: opt.supersededBy || '',
      note: opt.note || ''
    };
  }
  var facts = [
    fact('mf01', '2026 하나은행 부·점장 힐링프로그램, 1박2일. PM 이아롱 책임전문위원, 기획 박주열.', { subject: '프로그램', attribute: '개요' }),
    fact('mf02', '지역·차수 구성: 영남 3차수, 충청 3차수, 호남 2차수. 인원 영남 90명, 충청 70명, 호남 30명.', { subject: '프로그램', attribute: '규모' }),
    fact('mf03', '영남 3차수 일정은 당초 9/17~18에서 10/15~16으로 변경됨.', { subject: '영남 3차수', attribute: '일정', value: '2026-10-15~16', links: ['session:s_yn3'] }),
    fact('mf04', '충청 3차수 일정 10/29(목)~30(금).', { subject: '충청 3차수', attribute: '일정', value: '2026-10-29~30', links: ['session:s_cc3'], note: '10/28~29 기록과 충돌 (점검 No 1)' }),
    fact('mf05', '충청 3차수 일정 10/28~29. 10월 캘린더 확정본 기준.', { subject: '충청 3차수', attribute: '일정', value: '2026-10-28~29', links: ['session:s_cc3'], note: '10/29~30 기록과 충돌 (점검 No 1)' }),
    fact('mf06', '호남 숙소를 마이산 홍삼빌로 변경 제안 (2026-08-14).', { subject: '호남 숙소', attribute: '명칭', value: '마이산 홍삼빌', recordedAt: '2026-08-14', links: ['venue:v_hong'] }),
    fact('mf07', '충청 차수는 월요일에 시작할 수 없음.', { subject: '충청', attribute: '일정 제약', links: ['rule:BR-02'] }),
    fact('mf08', '저녁식사 시작 시각은 18:00.', { subject: '전 지역', attribute: '식사', links: ['rule:BR-01'] }),
    fact('mf09', '버스를 운행하지 않고 참가자가 개별 차량으로 이동하므로 주차 계획이 필요함.', { subject: '전 지역', attribute: '이동', links: ['rule:BR-07'] }),
    fact('mf10', '영남 1차수 30명을 6명씩 5개조로 편성하고, 여성 교육생 4명은 조별 1명씩 분산.', { subject: '영남 1차수', attribute: '조 편성', links: ['session:s_yn1', 'rule:BR-18'] }),
    fact('mf11', '영남 1차수 객실 배정: 강사 객실 미배정, 운영진 1인 1실(KMA 4명 + 하나은행 1명), 교육생 2인 1실 기본.', { subject: '영남 1차수', attribute: '객실 배정', links: ['session:s_yn1'] }),
    fact('mf12', '야간 소음 대응 예비실 1실(스탠다드더블)을 사전 배정 없이 비워 둠.', { subject: '영남 1차수', attribute: '객실 배정', links: ['rule:BR-17'], note: '예비실 호실은 미확정' }),
    fact('mf13', '강사·운영진 객실 목록의 216호는 215호로 수정해야 함.', { subject: '영남 1차수', attribute: '객실 번호', value: '215', note: '점검 No 7 — 배정표에 215호로 입력함' }),
    fact('mf14', '프리미엄더블 303호는 최고령 교육생, 305호는 하나은행 담당자 배정.', { subject: '영남 1차수', attribute: '객실 배정', links: ['rule:BR-16'] }),
    fact('mf15', '운영 차량 대여 2026-10-12 09:10 ~ 10-29 22:00, 시간당 2,500원, km당 유류비 200원.', { subject: '운영 차량', attribute: '요금', links: ['rental:rt1'] }),
    fact('mf16', '홍삼빌·마이산 힐링하우스 예약금은 답사 현장에서 법인카드로 결제.', { subject: '호남', attribute: '결제' }),
    fact('mf17', '대상자 표기는 가운뎃점을 넣어 부·점장으로 통일.', { subject: '전 문서', attribute: '표기', links: ['rule:BR-19'] }),
    fact('mf18', '영동와인전망대는 월요일 및 우천 시 휴무. 단체 사진 촬영 금지, 음주 후 이용 불가, 입장 인원 준수.', { subject: '영동와인전망대', attribute: '운영', links: ['venue:v_wine'] }),
    fact('mf19', '레인보우 식물원은 충청 프로그램에서 제외.', { subject: '충청', attribute: '장소', links: ['venue:v_rain'] }),
    fact('mf20', '국립진안고원수목원 실내 프로그램은 오후만 운영되어 우천 시 오전 대체안이 필요함.', { subject: '국립진안고원수목원', attribute: '운영', links: ['venue:v_arbo'] }),
    fact('mf21', '일라이트 호텔 부대시설은 별도 이용하지 않으며, 참가자 안내 문구를 고객사와 협의해야 함.', { subject: '일라이트 호텔', attribute: '이용 범위', links: ['venue:v_elite'] }),
    fact('mf22', '영남 1차수 준비물에서 블루투스 스피커·오디오(AUX) 케이블·병따개는 불필요로 결정.', { subject: '영남 1차수', attribute: '준비물' }),
    fact('mf23', '영남 1차수 준비물에 짐보관 안내표를 반드시 포함.', { subject: '영남 1차수', attribute: '준비물' }),
    fact('mf24', '만족도 설문지는 필요 여부 논의 필요.', { subject: '영남 1차수', attribute: '준비물', tag: '확인불가' }),
    fact('mf25', '충청 현수막 2종 규격이 확인됨. 구체 수치는 원본 기록 확인 필요.', { subject: '충청', attribute: '제작물', tag: '확인불가' })
  ];

  /* ── 미결 질문 (11장 + 확인불가 항목) ─────────────── */

  function q(id, question, subject, status) {
    return { id: id, question: question, subjectLink: subject || '', owner: '', answer: '', status: status || '미해결', dueContext: '' };
  }
  var questions = [
    q('q01', '충청 3차수 일정이 10/28~29인지 10/29~30인지 확정 (점검 No 1)', 'session:s_cc3'),
    q('q02', '호남 장소 명칭 확정 — 국립진안고원 산림치유원 / 국립진안고원수목원 / 마이산 홍삼빌 (점검 No 2)', 'venue:v_hong'),
    q('q03', '에버미라클 303호가 강사·운영진인지 최고령 교육생인지 확정 (점검 No 6)', 'session:s_yn1'),
    q('q04', '스위트 외 객실 정원이 2인인지, 예비실이 어느 호실인지 확정 (점검 No 8)', 'session:s_yn1'),
    q('q05', '운영 차량 10/20~10/22 사이 홍삼빌 → 일라이트 이동 기록 확인 (점검 No 9)', 'rental:rt1'),
    q('q06', '운영 차량 과금 단위(분 단위 / 시간 올림) 확인 (점검 No 11)', 'rental:rt1'),
    q('q07', '충청 70명의 차수별 인원 분배 확인 (점검 No 12)', 'region:r_cc'),
    q('q08', '영남 1차수 강사 인원 및 교안 수량 확인', 'session:s_yn1'),
    q('q09', '일라이트 호텔 부대시설 미이용 관련 참가자 안내 문구 협의 (BR-09)', 'venue:v_elite'),
    q('q10', '백제회관 담당 지역 확인', 'venue:v_baek'),
    q('q11', '[결정] 사용자 범위 — 본인만 / KMA 운영진 공유 / 하나은행 담당자까지', ''),
    q('q12', '[결정] 적용 범위 — 하나은행 전용 / 다른 고객사 과정까지 확장', ''),
    q('q13', '[결정] 노션과의 관계 — 대체 / 병행', ''),
    q('q14', '[결정] 교육생 정보 저장 수준 — 저장 안 함 / 코드+속성 / 실명', ''),
    q('q15', '[결정] 외부 클라우드 사용 가능 여부 (회사 규정)', ''),
    q('q16', '[결정] 사용 목표 시점 — 10/12 차량 출발 전 / 10월 운영 이후', ''),
    q('q17', '[결정] BR별 규칙 강도 (차단 / 경고 / 권장)', ''),
    q('q18', '[결정] 영남 1차수 기록 규칙(BR-10~18)을 다른 차수에도 적용할지', ''),
    q('q19', '프로젝트 전용 지침·지식 파일 존재 여부', ''),
    q('q20', '충청 현수막 2종 규격 수치 확인', 'region:r_cc'),
    q('q21', '호남 Day1 석식 장소가 진안 마이돈이 맞는지 확인 (점검 No 4의 전제로 입력해 둠)', 'venue:v_don')
  ];

  /* ── 규칙 (5장) ───────────────────────────────────── */
  /* severity 는 [제안] 값이다. 11장 No 10 확정 전까지 규칙 화면에서 바꿀 수 있다. */
  var rules = [
    { id: 'BR-01', description: '저녁식사 시작 18:00', scope: '전 지역', severity: '경고', active: true },
    { id: 'BR-02', description: '충청 차수 월요일 시작 불가', scope: '충청', severity: '경고', active: true },
    { id: 'BR-03', description: '레인보우 식물원 제외', scope: '충청', severity: '차단', active: true },
    { id: 'BR-04', description: '영동와인전망대 월요일·우천 휴무', scope: '충청', severity: '경고', active: true },
    { id: 'BR-05', description: '진안 마이돈 수요일 휴무', scope: '호남', severity: '경고', active: true },
    { id: 'BR-06', description: '국립진안고원수목원 실내 프로그램은 오후만 → 우천 시 오전 대체안 필요', scope: '호남', severity: '경고', active: true },
    { id: 'BR-07', description: '버스 미운행, 참가자 개별 차량 이동 → 주차 계획 필요', scope: '전 지역', severity: '경고', active: true },
    { id: 'BR-08', description: '운영 차량 동선은 연속되어야 함', scope: '운영 차량', severity: '경고', active: true },
    { id: 'BR-09', description: '일라이트 호텔 부대시설 별도 미이용 — 안내 문구 협의 필요', scope: '충청', severity: '권장', active: true },
    { id: 'BR-10', description: '강사 객실 미배정', scope: '영남 1차수', severity: '경고', active: true },
    { id: 'BR-11', description: '운영진 1인 1실 (KMA 4명 + 하나은행 1명)', scope: '영남 1차수', severity: '경고', active: true },
    { id: 'BR-12', description: '교육생 2인 1실 기본, 연령대 높은 인원 1인실·스위트 우선', scope: '영남 1차수', severity: '권장', active: true },
    { id: 'BR-13', description: '같은 본부끼리 최대한 묶기', scope: '영남 1차수', severity: '권장', active: true },
    { id: 'BR-14', description: '남녀 혼숙 불가', scope: '영남 1차수', severity: '차단', active: true },
    { id: 'BR-15', description: '여성 4명은 인접한 두 객실에 2명씩, 스위트 정원 2인', scope: '영남 1차수', severity: '경고', active: true },
    { id: 'BR-16', description: '프리미엄더블 303호 최고령 교육생, 305호 하나은행 담당자', scope: '영남 1차수', severity: '경고', active: true },
    { id: 'BR-17', description: '야간 소음 대응 예비실 1실(스탠다드더블)은 사전 배정 없이 비움', scope: '영남 1차수', severity: '경고', active: true },
    { id: 'BR-18', description: '30명 6명×5개조, 여성 교육생 조별 1명씩 분산', scope: '영남 1차수', severity: '경고', active: true },
    { id: 'BR-19', description: '대상자 표기 부·점장 (가운뎃점)', scope: '전 문서', severity: '경고', active: true },
    { id: 'BR-20', description: '영동와인전망대 — 단체 사진 촬영 금지, 음주 후 이용 불가, 입장 인원 준수', scope: '충청', severity: '경고', active: true }
  ];

  var lint = [
    { id: 'lt1', wrong: '부점장', right: '부·점장', note: 'BR-19' }
  ];

  var notionLinks = [
    { id: 'nl1', label: '영남 1차수 준비물 체크리스트 페이지', value: '3d712415-bdd7-81ed-87b8-d7a7d2a09d38', note: '대화 요약 기록 기준 — 노션에서 실제 값 확인 필요' },
    { id: 'nl2', label: '체크리스트 데이터소스', value: '333f0ad9-8db8-4cd9-bcbe-f73979abcb7d', note: '대화 요약 기록 기준 — 노션에서 실제 값 확인 필요' }
  ];

  g.OpsSeed = {
    WEEKDAYS: WEEKDAYS,
    CHECKLIST_CATEGORIES: CHECKLIST_CATEGORIES,
    CLASSIFICATIONS: CLASSIFICATIONS,
    ITEM_STATUS: ITEM_STATUS,
    OCCUPANT_TYPES: OCCUPANT_TYPES,
    FACT_TAGS: FACT_TAGS,
    SOURCE_TYPES: SOURCE_TYPES,
    data: function () {
      return JSON.parse(JSON.stringify({
        programs: programs, regions: regions, sessions: sessions,
        venues: venues, facilities: facilities, distances: distances,
        meals: meals, activities: activities,
        rooms: rooms, participants: participants, assignments: assignments,
        checklists: checklists, checklistItems: checklistItems,
        rentals: rentals, trips: trips,
        facts: facts, questions: questions, rules: rules, lint: lint,
        attachments: [], notionLinks: notionLinks, changeLog: []
      }));
    }
  };
})(window);
