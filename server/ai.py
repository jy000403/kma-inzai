# -*- coding: utf-8 -*-
"""Claude API — 문의에 맞는 커리큘럼 · 모듈 상세 · 고쳐 쓰기"""

import json
import re

from .config import env


# ── Claude API — 문의에 맞는 커리큘럼 쓰기 ────────────────
#
# 지난 제안서를 통째로 가져오면 칸은 금방 차지만 이 문의에 맞지는 않는다.
# 5시간짜리 문의에 16시간 커리큘럼이 붙고, 고객이 말한 '변화관리' 는
# 한 줄도 없는 채로 제안서가 완성되는 일이 실제로 있었다.
#
# 여기서는 비슷한 제안서 몇 건을 '참고자료' 로만 주고, 요청한 시간·차수·대상에
# 맞는 커리큘럼을 새로 쓰게 한다.
#
# 고객을 알아볼 수 있는 것은 보내지 않는다 — 회사명·사람 이름·이메일·전화번호는
# 여기서 지우고 나간다. 노션과 같은 원칙이다.

AI_MODEL = env('ANTHROPIC_MODEL', 'claude-opus-5')

_MAIL_RE = re.compile(r'[\w.+-]+@[\w-]+\.[\w.-]+')
_TEL_RE = re.compile(r'0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}')


def ai_key():
    return env('ANTHROPIC_API_KEY')


def scrub(text, names=()):
    """고객을 알아볼 수 있는 것을 지운다. 지운 자리는 무엇이었는지만 남긴다."""
    s = str(text or '')
    for n in names:
        n = str(n or '').strip()
        if len(n) >= 2:
            s = s.replace(n, '○○')
    s = _MAIL_RE.sub('(메일)', s)
    s = _TEL_RE.sub('(연락처)', s)
    return s


AI_SYSTEM = """\
당신은 한국능률협회(KMA) 인재개발센터의 교육 기획자입니다.
고객사가 보낸 교육 문의를 읽고, 그 문의에 맞는 커리큘럼을 설계합니다.

■ 가장 중요한 원칙
커리큘럼의 근거는 오직 [고객 문의]입니다.
[참고 자료]는 다른 회사에 나갔던 제안서이고, 그 회사의 업종·대상·사정은
이번 문의와 다릅니다. 참고 자료는 '쓸 만한 조각을 꺼내 쓰는 재료' 일 뿐
따라 쓰는 틀이 아닙니다.

■ 참고 자료를 쓰는 법
- 써도 되는 것: 모듈을 나누는 방식, 실습·진단·롤플레이 같은 진행 방법,
  시간 배분의 감각, 문장을 쓰는 말투.
- 절대 가져오면 안 되는 것: 그 회사의 업종·직군·대상(예: 청원경찰, 생산직,
  비서, 임원 등 이번 문의에 없는 대상), 그 회사만의 사정과 제도 이름,
  고객사 이름, 이번 문의와 무관한 주제.
- 문의에 없는 대상이나 업종을 지어내지 마십시오. 문의에 '경력입사자 온보딩'
  이라고 적혀 있으면 경력입사자 온보딩 과정을 씁니다. 참고 자료에 청원경찰
  교육이 있다고 해서 청원경찰 이야기를 넣으면 안 됩니다.
- 쓸 만한 조각이 없으면 참고하지 않아도 됩니다. 억지로 갖다 붙이지 마십시오.

■ 커리큘럼 규칙
1. 모든 모듈은 문의 글에서 근거를 댈 수 있어야 합니다. 문의에 없는 주제를
   넣었다면 그 모듈은 빼십시오.
2. 요청한 교육시간이 있으면 모듈 시간의 합을 정확히 그 값으로 맞춥니다.
3. 교육시간이 안 적혀 있으면 대상과 주제에 맞는 현실적인 길이로 잡고,
   note 에 '문의에 시간이 없어 ○시간으로 잡았다' 고 적습니다.
   적혀 있지도 않은데 20시간이 넘는 과정을 만들지 마십시오.
4. 문의에 적힌 주제는 빠뜨리지 않습니다. 고객이 쓴 말이 모듈에 드러나야 합니다.
5. 대상(직급·직무)에 맞는 눈높이로 씁니다.
6. 모듈은 3~6개로 묶습니다. 5시간짜리에 모듈 8개를 넣지 않습니다.
7. 한국어로 씁니다. 과장하지 않고, 실제로 할 수 있는 것만 적습니다.

■ 충실하게 쓰기
이 글은 그대로 제안서 장표에 들어갑니다. 고객이 읽고 '이 사람들이 우리 이야기를
제대로 들었구나' 하고 느껴야 합니다.

- 뭉뚱그리지 마십시오. '리더십 역량을 강화합니다' 는 아무 말도 안 한 것입니다.
  '조직개편 이후 팀원이 보이는 반응을 유형별로 나눠 보고, 유형마다 팀장이
  먼저 건넬 첫 마디를 만들어 봅니다' 처럼 무엇을 하는지가 보이게 씁니다.
- 문의에 적힌 말을 그대로 되받아 씁니다. 고객이 '동요' 라고 썼으면 '동요' 라고
  쓰고 '변화 저항' 으로 바꿔 부르지 않습니다.
- 상황·문제·방향·운영 방식·기대 변화는 줄바꿈으로 나눈 3~4줄씩 씁니다.
  한 줄은 한 문장으로 끊습니다(줄 하나가 불렛 하나가 됩니다).
- 기대 변화는 '역량이 향상된다' 가 아니라 교육 다음 주에 실제로 달라질
  행동으로 씁니다.

■ 모듈 내용(detail)은 정해진 꼴로 씁니다
인재개발센터가 실제로 내보낸 제안서는 모듈 하나를 이렇게 씁니다. 그대로 따르십시오.

1) 성과를 만드는 리더의 코칭 패러다임
· 코칭·티칭·멘토링·카운슬링의 차이를 사례로 구분하고 적용 상황을 정리
· 성과관리 방식의 변화와 팀장에게 요구되는 역할 전환 포인트를 확인
· 좋은 코치의 조건을 기준으로 나의 코칭 준비도를 자가 진단하고 점검
2) ○○사 팀장의 코칭 이슈 진단
· 팀원 성장과 목표 달성 과정에서 겪는 코칭 어려움을 조별로 공유
· 지시형 관리와 코칭형 관리의 결과 차이를 실제 사례로 비교 분석
· 본 과정을 통해 해결하고자 하는 개인별 코칭 과제를 선정하고 공유

지켜야 할 것:
- **소주제 2개**, 소주제마다 **'· ' 로 시작하는 상세 3줄**. 모두 8줄입니다.
  (3시간이 넘는 긴 모듈만 소주제 3개까지)
- 소주제는 '1)' '2)' 로 번호를 붙입니다. 상세 줄은 가운뎃점 '· ' 으로 시작합니다.
- 상세 한 줄은 **28~35자**. 25자 아래로 끊지 마십시오.
- 상세 줄은 **명사형으로 끝맺습니다** — '정리 / 확인 / 점검 / 공유 / 분석 /
  작성 / 진행 / 도출 / 선정' 처럼. '~한다', '~합니다' 로 끝내지 않습니다.
- 진행 방법은 (실습) 같은 말머리로 붙이지 말고 **문장 안에 녹입니다.**
  (나쁨) "(실습) 업무 분해 실습"
  (좋음) "· 본인이 맡은 과제를 Project와 Task로 나눠 3단계 WBS 초안을 작성"
  '사례로', '조별로', '롤플레이로', '자가 진단하고' 처럼 어떻게 하는지가 보이게 씁니다.
- 두 번째 소주제에는 **고객사 이름을 넣어** 이 회사 이야기로 만듭니다
  (예: "2) ○○사 팀장의 코칭 이슈 진단").
- 줄바꿈은 \n 입니다. 한 줄이 곧 장표의 한 줄입니다.
- 모듈 하나당 듣기만 하는 줄로 채우지 마십시오. 해 보는 줄이 반드시 섞여야 합니다.

■ 학습 목표(goals)
- '~할 수 있다' 로 끝맺습니다. ('~할 수 있음' 이 아닙니다)
- 25~35자. 예) "조직 목표를 팀원 목표로 연결하는 목표설정 코칭을 수행할 수 있다"

■ 학습 키워드(keywords)
- **정확히 4개**를 씁니다. 양식의 키워드 칸이 모듈마다 넷이라, 셋만 주면 한 칸이 빕니다.
- 4~10자짜리 전문 용어·프레임워크 이름으로 씁니다. 문장이 아닙니다.
- 소주제와 같은 말을 쓰지 마십시오 — 소주제는 옆 칸에 따로 실립니다.
  (소주제가 '목표 합의 롤플레이' 면 키워드는 'SMART 목표' 처럼 개념 쪽으로)
  예) "SMART 목표", "KPI Cascading", "SBI 피드백", "GROW 면담", "코칭 대화 모델"

■ 역량 체계(values)
양식 4장은 '핵심 가치 → 핵심 역량 → 구성원 행동 변화' 세 칸짜리 표입니다.
실제 제안서는 이렇게 씁니다.

  성장 지향 | 성과 코칭 역량      | 팀원과 정기 1on1 코칭 대화 실행
  공정 신뢰 | 평가 설계·판단 역량  | KPI 근거로 평가 결과를 설명
  실행 완결 | 목표–피드백 연결 역량 | 목표 합의부터 면담까지 완결 운영

- 핵심 가치는 **네 글자 안팎**입니다. 모듈 이름을 그대로 넣지 마십시오.
- 행동 변화는 **교육 다음 주에 눈으로 볼 수 있는 행동**입니다.
  '역량이 향상된다' 는 아무것도 말하지 않은 것입니다.

■ 환경 분석(env)은 실제 제안서 수준으로 씁니다
양식 2장은 고객사를 둘러싼 환경을 정책·경제·사회·기술 네 축으로 보여 주는 장입니다.
실제로 나간 제안서는 이렇게 생겼습니다.

  머리말 1줄 — KT커머스는 그룹사 통합구매를 기반으로 사업을 확장하고 있으며,
               공정성과 데이터 기반 운영이 경쟁력의 핵심으로 부상하고 있습니다.
  머리말 2줄 — 이러한 변화는 직책자에게 코칭 역량과 KPI 기반의 공정한 평가 역량을
               동시에 요구합니다.
  축 이름   — 정책 환경 / 경제 환경 / 사회 환경 / 기술 환경
  소제목    — 공정거래·상생협력 규제의 지속 강화
  상세      — 구매·조달 전 과정에 대한 절차적 투명성과 공정한 판단 기준 요구가
              확대되고 있습니다.
  조직 정체성 — KT 그룹사 통합구매를 기반으로 외부 기업까지 구매 서비스 영역을
               확장하며 성장하고 있습니다.
  인용      — "KT커머스의 성과는 팀장의 대화의 질과 평가의 공정성에서 나옵니다"

지켜야 할 것:
- headline 은 **두 문장**입니다. 앞 문장은 이 회사가 지금 무엇을 하고 무엇이
  핵심으로 떠오르는지, 뒤 문장은 **그 변화가 이번 교육 대상에게 무엇을 요구하는지**.
  뒤 문장이 없으면 환경 이야기가 교육과 따로 놉니다.
- axis 는 **'정책 환경' '경제 환경' '사회 환경' '기술 환경'** 그대로 씁니다.
  (양식이 앞에 01·02·03·04 를 붙여 줍니다. 긴 제목을 쓰면 칸을 넘칩니다)
- points 의 title 은 **15~20자 명사구**. 예) "보상 공정성에 대한 구성원 기대 상승"
- points 의 detail 은 **35~45자**, '~고 있습니다' 로 끝맺습니다.
  예) "평가 결과를 납득할 수 있는지가 조직 몰입과 인재 유지를 좌우하는 변수가
      되고 있습니다."
- identity 3줄은 각 **40~50자**, '~고 있습니다' 로 끝맺습니다.
  사업 구조 / 주력 사업 / 이번 교육으로 이루려는 것 순서로 씁니다.
- quote 는 **"○○의 성과는 … 에서 나옵니다"** 처럼 이 교육의 값을 한마디로.

근거는 문의 글과 업종·규모에서 읽어 낼 수 있는 것, 그리고 그 업종이라면 누구나
아는 공개된 사실까지입니다. 이 회사의 매출·조직·전략처럼 확인할 수 없는 숫자나
내부 사정은 적지 마십시오. 업종 일반론만 늘어놓아도 안 됩니다 —
'그래서 이 회사가' 가 문장마다 보여야 합니다.

다만 분량을 채우려고 문의에 없는 이야기를 지어내지는 마십시오 —
빈 줄보다 나쁜 것이 틀린 줄입니다."""


def ai_status():
    """커리큘럼을 쓸 수 있는 상태인지 — 키·SDK·망을 한 번에 본다.

    쓰려고 누른 뒤에야 '안 된다' 고 알면 늦다. 설정 화면에서 미리 볼 수 있게 한다.
    """
    out = {'ok': False, 'model': AI_MODEL}
    key = ai_key()
    out['key'] = bool(key)
    if not key:
        out['message'] = '환경변수 ANTHROPIC_API_KEY 가 없습니다.'
        return 200, out
    try:
        import anthropic
    except ImportError:
        out['sdk'] = False
        out['message'] = 'pip install anthropic 이 필요합니다.'
        return 200, out
    out['sdk'] = True

    # 망이 열려 있는지 — 실제 호출 대신 값이 거의 안 드는 토큰 세기로 확인한다
    try:
        c = anthropic.Anthropic(api_key=key, max_retries=2, timeout=30.0)
        c.messages.count_tokens(model=AI_MODEL,
                                messages=[{'role': 'user', 'content': 'ping'}])
        out['ok'] = True
        out['message'] = '쓸 수 있습니다.'
    except Exception as e:  # noqa: BLE001
        code = getattr(e, 'status_code', None)
        if code in (401, 403):
            out['message'] = 'API 키가 거절당했습니다. 키를 다시 확인해 주세요.'
        elif code == 429:
            out['ok'] = True          # 키는 맞다 — 지금만 몰린 것
            out['message'] = '지금 요청이 몰려 있습니다. 잠시 뒤 다시 해 보세요.'
        else:
            out['message'] = 'api.anthropic.com 에 닿지 못했습니다 (%s).' % str(e)[:120]
    return 200, out


def ai_curriculum(job):
    """문의 글로 커리큘럼을 쓴다."""
    key = ai_key()
    if not key:
        return 400, {'error': 'no_key',
                     'message': '환경변수 ANTHROPIC_API_KEY 를 넣어 주세요.'}
    try:
        import anthropic
    except ImportError:
        return 500, {'error': 'no_sdk',
                     'message': 'pip install anthropic 을 먼저 해 주세요.'}

    ask = str(job.get('inquiry') or '').strip()
    if len(ask) < 20:
        return 400, {'error': 'no_inquiry', 'message': '문의 내용이 너무 짧습니다.'}

    names = list(job.get('names') or [])
    hours = job.get('hours') or 0
    sessions = job.get('sessions') or 1
    head = job.get('headcount') or 0
    title = str(job.get('title') or '').strip()

    refs = []
    for r in (job.get('refs') or [])[:5]:
        rows = r.get('curriculum') or []
        # 그 건의 대상을 따로 적어 둔다 — '이건 우리 대상이 아니다' 라고
        # 못 박아 두면 그 쪽으로 끌려가는 일이 크게 줄어든다.
        who = ' · '.join([x for x in (r.get('targets') or []) if x][:3])
        refs.append({
            'concept': scrub(r.get('concept'), names),
            'hours': r.get('hours'),
            'who': who,
            # 커리큘럼 표를 넉넉히 넘긴다 — 모듈을 어떻게 쪼개고 시간을 어떻게
            # 나눴는지가 재료의 핵심인데, 7줄로 자르면 앞부분만 보고 만다.
            'modules': [' / '.join(x for x in row if x) for row in rows[1:16]],
            # 시그니처 표현(프레임워크 이름)과 산출물은 그대로 쓸 재료다.
            # 'SBI 피드백', '5R 코칭' 같은 말이 학습 키워드 칸을 채운다.
            'signature': scrub(r.get('signature'), names),
            'output': scrub(r.get('output'), names),
        })

    # 문의를 맨 앞·맨 뒤에 둔다. 가운데 낀 참고 자료보다 눈에 먼저·마지막에 남는다.
    parts = ['[고객 문의] — 이 글이 커리큘럼의 유일한 근거입니다',
             scrub(ask, names), '']
    parts.append('[요청 조건]')
    if title:
        parts.append('과정명(가안): ' + scrub(title, names))
    if hours:
        parts.append('교육시간: %s시간 — 모듈 시간의 합이 정확히 이 값이어야 합니다.' % hours)
    else:
        parts.append('교육시간: 문의에 안 적혀 있습니다. 대상과 주제에 맞는 현실적인 '
                     '길이로 잡고 note 에 그렇게 잡은 까닭을 적어 주세요.')
    if sessions and int(sessions) > 1:
        parts.append('차수: %s개 차수로 같은 내용을 반복 운영합니다.' % sessions)
    if head:
        parts.append('인원: 차수당 %s명' % head)

    if refs:
        parts.append('')
        parts.append('[참고 자료] — 다른 회사에 나갔던 제안서입니다')
        parts.append('업종도 대상도 이번 문의와 다릅니다. 모듈을 나누는 방식과 '
                     '진행 방법만 눈여겨보고, 대상·업종·그 회사 사정은 절대 가져오지 마세요. '
                     '쓸 것이 없으면 참고하지 않아도 됩니다.')
        for i, r in enumerate(refs, 1):
            parts.append('')
            parts.append('%d) %s' % (i, r['concept'][:280]))
            if r.get('who'):
                parts.append('   ※ 이 건의 대상: %s — 이번 문의의 대상이 아닙니다' % r['who'])
            for m in r['modules'][:14]:
                parts.append('   - ' + m[:260])
            if r.get('signature'):
                parts.append('   · 쓰인 프레임워크·표현: ' + r['signature'][:220])
            if r.get('output'):
                parts.append('   · 교육생 산출물: ' + r['output'][:220])

        # 마지막으로 한 번 더 못을 박는다 — 참고 자료를 읽은 직후가 가장 끌려가기 쉽다.
        parts.append('')
        parts.append('[다시 확인] 위 참고 자료의 대상·업종은 잊으십시오. '
                     '커리큘럼은 맨 위 [고객 문의]에 적힌 대상과 주제로만 씁니다. '
                     '모듈마다 "이게 문의 어디에 근거가 있나" 를 스스로 물어보고, '
                     '근거를 못 대는 모듈은 빼십시오.')

    # 양식의 칸 크기. 넘치면 '…' 으로 잘려 내용이 사라진다.
    caps = job.get('caps') or {}
    room = []
    LABEL = {'situation': '귀사의 상황', 'problem': '풀어야 할 문제',
             'direction': '제안 방향', 'ops': '운영 방식',
             'outcome': '이렇게 달라집니다', 'modules': '과정 설계(모듈 목록)'}
    for k, label in LABEL.items():
        c = caps.get(k)
        if isinstance(c, dict) and c.get('lines'):
            room.append('- %s: %d줄, 한 줄에 %d자 안팎'
                        % (label, int(c['lines']), int(c['lineLen'])))
        elif isinstance(c, dict) and c.get('room'):
            room.append('- %s: %d자 안팎' % (label, int(c['room'])))
    if caps.get('moduleTitle'):
        room.append('- 모듈 제목(title): %d자 안팎' % int(caps['moduleTitle']))
    if caps.get('moduleDetail'):
        want = int(caps['moduleDetail'])
        room.append('- 모듈 내용(detail): **%d자** — 이 양식이 모듈 하나에 내주는 자리입니다. '
                    '%d자 아래로 쓰면 자리가 휑하게 비고, %d자를 넘으면 잘립니다. '
                    '소주제 3개 × (이론)/(실습)/(토론) 3줄이면 이 분량이 나옵니다.'
                    % (want, int(want * 0.75), want))
    if room:
        parts.append('')
        parts.append('[양식이 받아 주는 분량 — 반드시 지킬 것]')
        parts.append('이 글은 고객사 PPT 양식의 칸에 한 줄씩 들어갑니다. '
                     '줄 수와 한 줄 길이가 정해져 있고, 넘기면 뒷부분이 '
                     '「…」 으로 잘려 나가 내용이 사라집니다. '
                     '문단으로 길게 쓰지 말고, 아래 줄 수에 맞춰 한 줄씩 끊어 쓰십시오. '
                     '한 줄 길이가 25자 안팎이면 문장이 아니라 짧은 문구로 씁니다 '
                     '(예: "팀원 반응 유형별 첫 마디 만들기"). '
                     '짧게 쓰라는 뜻이지 알맹이를 빼라는 뜻이 아닙니다 — '
                     '수식어를 덜어 내고 무엇을 하는지만 남기십시오.')
        parts += room
        parts.append('')
        parts.append('※ 위 글자 수는 다른 어떤 지시보다 우선합니다. '
                     '앞에서 "충실히 쓰라", "소주제를 여러 개 적으라" 고 한 것도 '
                     '이 한도 안에서만 지킵니다. 한도가 27자면 27자로 끝내십시오. '
                     '쓰고 나서 각 항목의 글자 수를 직접 세어 확인하십시오.')

    schema = {
        'type': 'object',
        'properties': {
            'course': {'type': 'string', 'description': (
                '과정명 — 제안서 표지에 그대로 찍힌다. 고객사 이름은 넣지 않는다. '
                '주제·행사·대상이 드러나는 명사구로 30자 안팎(예: 증권사 CIO 포럼 2027 기술전략 주제강연). '
                "'요청·문의·관련·가능여부' 같은 말, 부제(— …)와 괄호 메모는 넣지 않는다.")},
            # 제안서 한 장씩을 채우는 글이다. 한 줄이 한 불렛으로 들어가므로
            # 줄바꿈으로 나눠 쓰게 한다. 한 문장짜리로 끝내면 장이 휑하다.
            'situation': {
                'type': 'string',
                'description': '귀사의 상황. 문의에서 읽어 낸 것만 씁니다. '
                               '줄바꿈으로 나눈 3~4줄. 한 줄은 한 문장.',
            },
            'problem': {
                'type': 'string',
                'description': '지금 풀어야 할 문제. 교육으로 풀 수 있는 것으로 좁혀 '
                               '줄바꿈으로 나눈 3~4줄.',
            },
            'direction': {
                'type': 'string',
                'description': '제안 방향 — 이 문제를 어떤 방식으로 풀지. '
                               '줄바꿈으로 나눈 3~4줄. 실습·진단·사례 등 방법이 드러나게.',
            },
            'method': {
                'type': 'string',
                'description': '운영 방식 — 진행 형태, 조 편성, 강의와 실습 비중, '
                               '사전·사후 활동. 줄바꿈으로 나눈 2~4줄.',
            },
            'outcome': {
                'type': 'string',
                'description': '교육 후 달라지는 것. 눈에 보이는 행동 변화로. '
                               '줄바꿈으로 나눈 3~4줄.',
            },
            'modules': {
                'type': 'array',
                'items': {
                    'type': 'object',
                    'properties': {
                        'title': {'type': 'string', 'description': '모듈명. 예) M1. 변화의 이해'},
                        'hours': {'type': 'number', 'description': '이 모듈의 시간'},
                        'detail': {
                            'type': 'string',
                            'description': '이 모듈에서 실제로 무엇을 하는지. '
                                           '반드시 이 꼴로 씁니다 — '
                                           '"1) 소주제\\n· 상세\\n· 상세\\n· 상세\\n'
                                           '2) 소주제\\n· 상세\\n· 상세\\n· 상세". '
                                           '소주제 2개, 소주제마다 가운뎃점 상세 3줄(모두 8줄). '
                                           '상세 한 줄은 28~35자이고 "정리/확인/점검/공유/분석/'
                                           '작성/진행" 처럼 명사형으로 끝맺습니다. '
                                           '진행 방법은 말머리로 붙이지 말고 문장 안에 녹입니다. '
                                           '두 번째 소주제에는 고객사 이름을 넣습니다. '
                                           '"~을 이해한다" 처럼 뭉뚱그리지 마세요. '
                                           '※ 분량은 [양식이 받아 주는 분량]에 적힌 글자 수를 '
                                           '따릅니다. 거기 한도가 적혀 있으면 이 설명보다 '
                                           '그 한도가 우선입니다.',
                        },
                        # 양식의 Program Details 장에는 본문 옆에 세로 칸이 있고
                        # '▶ 학습 키워드 / ▶ 학습 목표' 가 들어간다. 이 값이 없으면
                        # 그 칸이 빈 채로 나간다.
                        'keywords': {
                            'type': 'array', 'items': {'type': 'string'},
                            'description': '이 모듈의 학습 키워드 **정확히 4개**. '
                                           '4~10자짜리 전문 용어·프레임워크 이름으로. '
                                           '예) "SMART 목표", "KPI Cascading", "SBI 피드백", '
                                           '"GROW 면담", "코칭 대화 모델". 문장이 아닙니다.',
                        },
                        'goals': {
                            'type': 'array', 'items': {'type': 'string'},
                            'description': '이 모듈을 마치면 무엇을 할 수 있게 되는지 1~2개. '
                                           '"~할 수 있다" 로 끝맺습니다("있음" 이 아닙니다). 예) '
                                           '"조직 목표를 팀원 목표로 연결하는 목표설정 코칭을 수행할 수 있다". '
                                           '25~35자.',
                        },
                        # 양식의 Program Details 장 머리 띠에 들어간다 —
                        # 'Program Details ( 성과관리 및 목표 달성을 위한 팀원 코칭 )'.
                        # 같은 묶음 이름을 가진 모듈이 한 장에 함께 실린다.
                        'group': {
                            'type': 'string',
                            'description': '이 모듈이 속한 묶음 이름 (15~25자). '
                                           '예) "성과관리 및 목표 달성을 위한 팀원 코칭". '
                                           '이웃한 모듈끼리는 같은 묶음 이름을 씁니다 — '
                                           '두 개씩 한 장에 실리므로 2개마다 바뀌는 것이 보통입니다.',
                        },
                        # 근거를 적게 하면 근거 없는 모듈이 눈에 띈다.
                        # 못 적겠으면 그 모듈은 애초에 넣지 말아야 한다.
                        'why': {
                            'type': 'string',
                            'description': '이 모듈이 문의의 어느 대목에 근거하는지. '
                                           '문의 글의 표현을 그대로 인용해 한 줄로.',
                        },
                    },
                    'required': ['title', 'hours', 'detail', 'keywords', 'goals',
                                 'group', 'why'],
                    'additionalProperties': False,
                },
            },
            'covered': {
                'type': 'array', 'items': {'type': 'string'},
                'description': '문의에서 읽어 낸 주제 가운데 이 커리큘럼이 다루는 것',
            },
            # 양식 4장(Course Approach)의 왼쪽 표. 이 값이 없으면 그 표가
            # 모듈 이름으로 채워져, 가치도 역량도 아닌 것이 '핵심 가치' 칸에 들어간다.
            'values': {
                'type': 'array',
                'description': '역량 체계 — 정확히 3줄. 양식 4장의 표에 그대로 들어갑니다.',
                'items': {
                    'type': 'object',
                    'properties': {
                        'value': {
                            'type': 'string',
                            'description': '핵심 가치. **네 글자 안팎의 짧은 말**로. '
                                           '예) "성장 지향", "공정 신뢰", "실행 완결". '
                                           '모듈 이름을 그대로 넣지 마십시오.',
                        },
                        'competency': {
                            'type': 'string',
                            'description': '그 가치를 이루는 핵심 역량. "~역량" 으로 끝맺습니다. '
                                           '10자 안팎. 예) "성과 코칭 역량", "평가 설계·판단 역량"',
                        },
                        'behavior': {
                            'type': 'string',
                            'description': '교육 뒤 현업에서 **눈으로 볼 수 있는 행동**. 15~22자. '
                                           '예) "팀원과 정기 1on1 코칭 대화 실행", '
                                           '"KPI 근거로 평가 결과를 설명". '
                                           '"~역량이 향상된다" 처럼 쓰지 마십시오.',
                        },
                    },
                    'required': ['value', 'competency', 'behavior'],
                    'additionalProperties': False,
                },
            },
            'teacher': {
                'type': 'string',
                'description': '이 과정에 맞는 강사상 — 어떤 경력·전문성을 가진 분이어야 하는지 '
                               '한두 문장. 사람 이름은 적지 않습니다.',
            },
            'note': {
                'type': 'string',
                'description': '기획자가 알아야 할 점 — 사전 준비, 장소·배치 조건, '
                               '고객사에 확인할 것. 없으면 빈 문자열.',
            },
            # 양식 2장(환경 분석)은 이 값이 없으면 통째로 빠진다.
            # 고객사를 둘러싼 환경을 우리가 읽어 냈다는 것을 보여 주는 장이라
            # 제안서의 첫인상을 좌우한다.
            'env': {
                'type': 'object',
                'description': '고객사 환경 분석 — 양식 2장에 그대로 들어갑니다.',
                'properties': {
                    'headline': {
                        'type': 'string',
                        'description': '두 문장. 앞 문장은 이 회사가 지금 무엇을 하고 무엇이 '
                                       '경쟁력의 핵심으로 떠오르는지, 뒤 문장은 그 변화가 '
                                       '이번 교육 대상에게 무엇을 요구하는지. 각 45~60자. 예) '
                                       '"○○는 그룹사 통합구매를 기반으로 사업을 확장하고 있으며, '
                                       '공정성과 데이터 기반 운영이 경쟁력의 핵심으로 부상하고 있습니다. '
                                       '이러한 변화는 직책자에게 코칭 역량과 KPI 기반의 공정한 '
                                       '평가 역량을 동시에 요구합니다."',
                    },
                    'summary': {
                        'type': 'string',
                        'description': '회사를 한 줄로 (25자 안팎). 예) '
                                       '"안전과 품질을 앞세운 국내 시멘트 제조사"',
                    },
                    'identity': {
                        'type': 'array', 'items': {'type': 'string'},
                        'description': '정확히 3줄. 각 40~50자이고 "~고 있습니다" 로 끝맺습니다. '
                                       '① 사업 구조 ② 주력 사업 ③ 이번 교육으로 이루려는 것 순서. 예) '
                                       '"KT 그룹사 통합구매를 기반으로 외부 기업까지 구매 서비스 '
                                       '영역을 확장하며 성장하고 있습니다."',
                    },
                    'quote': {
                        'type': 'string',
                        'description': '"○○의 성과는 … 에서 나옵니다" 꼴로 이 교육의 값을 '
                                       '한마디로. 따옴표 안에 들어갑니다. 40~60자. 예) '
                                       '"KT커머스의 성과는 팀장의 대화의 질과 평가의 공정성에서 나옵니다"',
                    },
                    'factors': {
                        'type': 'array',
                        'description': 'PEST 네 가지. 정책(P) · 시장(E) · 사회(S) · 기술(T) '
                                       '순서로 정확히 네 개.',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'axis': {
                                    'type': 'string',
                                    'description': '"정책 환경" "경제 환경" "사회 환경" "기술 환경" '
                                                   '넷 중 하나를 그대로. 양식이 앞에 01·02·03·04 를 '
                                                   '붙여 주므로 긴 제목을 쓰면 칸을 넘칩니다.',
                                },
                                'points': {
                                    'type': 'array',
                                    'description': '그 축의 근거 둘.',
                                    'items': {
                                        'type': 'object',
                                        'properties': {
                                            'title': {'type': 'string',
                                                      'description': '15~20자 명사구. 예) '
                                                                     '"보상 공정성에 대한 구성원 기대 상승"'},
                                            'detail': {'type': 'string',
                                                       'description': '35~45자, "~고 있습니다" 로 끝맺음. 예) '
                                                                      '"평가 결과를 납득할 수 있는지가 조직 '
                                                                      '몰입과 인재 유지를 좌우하는 변수가 '
                                                                      '되고 있습니다."'},
                                        },
                                        'required': ['title', 'detail'],
                                        'additionalProperties': False,
                                    },
                                },
                            },
                            'required': ['axis', 'points'],
                            'additionalProperties': False,
                        },
                    },
                },
                'required': ['headline', 'summary', 'identity', 'quote', 'factors'],
                'additionalProperties': False,
            },
        },
        'required': ['course', 'situation', 'problem', 'direction', 'method',
                     'outcome', 'modules', 'covered', 'values', 'teacher', 'note', 'env'],
        'additionalProperties': False,
    }

    # 여기서 막히면 제안서를 못 쓴다. 끊길 만한 자리를 모두 막아 둔다.
    #   · 429·5xx·연결 끊김 — SDK 가 되짚어 준다(max_retries). 기본 2회는 짧다.
    #   · 생각이 길어져 HTTP 가 먼저 끊기는 것 — 흘려 받고(stream) 넉넉한 timeout.
    #   · 답이 JSON 이 아닌 것 — 한 번 더 부른다.
    client = anthropic.Anthropic(api_key=key, max_retries=5, timeout=600.0)

    def call():
        with client.messages.stream(
            model=AI_MODEL,
            max_tokens=20000,
            system=AI_SYSTEM,
            thinking={'type': 'adaptive'},
            output_config={'effort': 'high',
                           'format': {'type': 'json_schema', 'schema': schema}},
            messages=[{'role': 'user', 'content': '\n'.join(parts)}],
        ) as stream:
            return stream.get_final_message()

    msg = None
    last = ''
    for attempt in range(2):
        try:
            msg = call()
        except anthropic.APIStatusError as e:
            code = e.status_code
            if code in (401, 403):
                return 502, {'error': 'key',
                             'message': 'API 키가 거절당했습니다. ANTHROPIC_API_KEY 값을 확인해 주세요.'}
            if code == 400:
                return 502, {'error': 'request',
                             'message': str(getattr(e, 'message', e))[:300]}
            last = 'status %s' % code
            continue                       # 429·5xx 는 한 번 더
        except anthropic.APIConnectionError as e:
            last = str(e)[:160]
            continue
        except Exception as e:  # noqa: BLE001
            # 흘려 받는 도중 서버가 연결을 끊으면 httpx/h11 쪽 예외가 그대로 올라온다.
            # SDK 가 감싸 주지 않는 자리라, 여기서 안 잡으면 화면이 통째로 멈춘다.
            last = type(e).__name__ + ': ' + str(e)[:140]
            continue

        if msg.stop_reason == 'max_tokens':
            # 답이 중간에 끊긴 것이다. 이대로 json.loads 에 넣으면
            # '응답이 JSON 이 아니었습니다' 로만 보여 까닭을 알 수 없다.
            last = '답이 길어 중간에 끊겼습니다'
            continue
        if msg.stop_reason == 'refusal':
            last = '모델이 거절했습니다'
            msg = None
            continue

        text = next((b.text for b in msg.content if b.type == 'text'), '')
        try:
            data = json.loads(text)
        except Exception:  # noqa: BLE001
            last = '응답이 JSON 이 아니었습니다'
            msg = None
            continue
        break
    else:
        return 502, {'error': 'failed',
                     'message': '커리큘럼을 쓰지 못했습니다 (%s).' % (last or '알 수 없음')}

    if msg is None:
        return 502, {'error': 'failed',
                     'message': '커리큘럼을 쓰지 못했습니다 (%s).' % (last or '알 수 없음')}

    got = round(sum(float(m.get('hours') or 0) for m in (data.get('modules') or [])), 1)
    return 200, {
        'ok': True, 'curriculum': data,
        'hoursAsked': hours, 'hoursGot': got,
        'usage': {'in': msg.usage.input_tokens, 'out': msg.usage.output_tokens},
    }


def _cap_lines(detail, per):
    """소주제마다 상세 줄을 per 줄까지만 남긴다.
    더 쓰면 양식 칸 밖으로 넘쳐 PPT 가 끝줄을 잘라 낸다 — 잘리는 곳을 우리가 고르는 편이 낫다."""
    out, n = [], 0
    for ln in detail.split('\n'):
        if not ln.strip():
            continue
        if re.match(r'^\s*\d+\s*[).]', ln):
            n = 0
            out.append(ln)
            continue
        n += 1
        if n <= per:
            out.append(ln)
    return '\n'.join(out)


def ai_detail(job):
    """2차 — 이미 잡아 둔 모듈의 **속을 채운다.**

    1차(ai_curriculum)는 '무슨 모듈을 몇 시간씩' 을 정한다. 그건 골격이다.
    고객이 읽는 것은 그 안의 소주제와 실습 줄이고, 거기가 얇으면
    제안서 전체가 빈약해 보인다.

    **모듈 하나씩 따로 부른다.** 여섯 모듈을 한 번에 쓰면 모듈 하나에
    돌아가는 주의가 얇아진다. 하나만 놓고 생각하게 하면 그만큼 깊어진다.
    호출은 여러 번이지만 동시에 보내므로, 걸리는 시간은 가장 느린 모듈 하나 정도다.

    모듈 제목·시간·차례는 **건드리지 않는다.** 사람이 손본 구성을
    두 번째 호출이 뒤집어 놓으면 고쳐 놓은 보람이 없다.
    """
    key = ai_key()
    if not key:
        return 400, {'error': 'no_key',
                     'message': '환경변수 ANTHROPIC_API_KEY 를 넣어 주세요.'}
    try:
        import anthropic
    except ImportError:
        return 500, {'error': 'no_sdk',
                     'message': 'pip install anthropic 을 먼저 해 주세요.'}

    mods = list(job.get('modules') or [])
    if not mods:
        return 400, {'error': 'no_modules', 'message': '먼저 모듈을 만들어 주세요.'}
    ask = scrub(str(job.get('inquiry') or ''), list(job.get('names') or []))
    names = list(job.get('names') or [])
    caps = job.get('caps') or {}
    want = int(caps.get('moduleDetail') or 400)
    # 소주제마다 상세 몇 줄을 쓸지 — 양식 칸이 받는 글자 수로 정한다.
    # 늘 3줄로 묶어 두었더니 416자 칸에 290자만 차서 제안서가 얇아 보였다.
    # 칸의 85% 쯤을 목표로 한다(소주제 머리 15자 + 상세 한 줄 32자 꼴). 넘치면 PPT 가 깨지므로 6줄이 끝.
    per = max(3, min(6, int((want * 0.85 / 2 - 15) // 32)))
    # 양식이 줄 수를 알려 주면 그걸 따른다 — 글자 수로만 잡았더니 11줄 칸에 12줄을 써서
    # 모듈마다 끝줄이 잘려 나갔다. 소주제 머리 2줄을 빼고 한 줄은 여유로 남긴다.
    # 줄 수가 빠듯한 대신 한 줄을 칸 너비만큼 길게 써서 내용을 채운다(줄바꿈이 생기지 않는 선까지).
    rows = int(caps.get('moduleRows') or 0)
    width = int(caps.get('moduleLineLen') or 0)
    if rows:
        per = max(2, min(6, (rows - 3) // 2))
    hi = max(30, min(45, width - 8)) if width else 35
    lo = hi - 8
    lines_all = per * 2 + 2
    aim = per * 2 * (lo + hi) // 2 + 30        # 목표 글자 수 — 줄 수 × 줄 길이 + 소주제 머리

    # 참고 자료 — 1차와 같은 재료를 2차에도 준다.
    # 여기서 쓸 만한 것은 '그 주제를 어떤 활동으로 다뤘나' 와 프레임워크 이름이다.
    ref_lines = []
    for r in (job.get('refs') or [])[:5]:
        rows = r.get('curriculum') or []
        got = [' / '.join(x for x in row if x) for row in rows[1:16]]
        if not got and not r.get('signature'):
            continue
        ref_lines.append('- %s' % scrub(r.get('concept'), names)[:160])
        for m in got[:10]:
            ref_lines.append('    · ' + m[:240])
        if r.get('signature'):
            ref_lines.append('    · 쓰인 프레임워크: ' + scrub(r.get('signature'), names)[:200])

    schema = {
        'type': 'object',
        'properties': {
            'detail': {
                'type': 'string',
                'description': '"1) 소주제\\n· 상세\\n· 상세 …\\n2) 소주제\\n· 상세\\n· 상세 …" 꼴. '
                               '소주제 2개, 소주제마다 가운뎃점 상세 %d줄(모두 %d줄, 더 쓰지 않음). '
                               '상세 한 줄은 %d~%d자이고 "정리/확인/점검/공유/분석/작성/'
                               '진행" 처럼 명사형으로 끝맺습니다. 줄바꿈은 \\n.' % (per, lines_all, lo, hi),
            },
            'keywords': {
                'type': 'array', 'items': {'type': 'string'},
                'description': '학습 키워드 **정확히 4개**. 4~10자짜리 전문 용어·프레임워크 이름으로. '
                               '예) "SMART 목표", "KPI Cascading", "SBI 피드백".',
            },
            'goals': {
                'type': 'array', 'items': {'type': 'string'},
                'description': '"~할 수 있다" 로 끝나는 학습 목표 1~2개. 25~35자.',
            },
        },
        'required': ['detail', 'keywords', 'goals'],
        'additionalProperties': False,
    }

    client = anthropic.Anthropic(api_key=key, max_retries=5, timeout=600.0)

    def one(i, m):
        """모듈 하나를 쓴다. 앞뒤 모듈을 알려 줘 내용이 겹치지 않게 한다."""
        parts = ['[이번 문의]', ask or '(문의 글 없음)', '']
        if job.get('title'):
            parts += ['[과정 이름] ' + scrub(str(job['title']), names), '']
        cond = []
        for k, label in (('headcount', '인원'), ('hours', '총 교육시간'), ('sessions', '차수')):
            if job.get(k):
                cond.append('%s %s' % (label, job[k]))
        if cond:
            parts += ['[요청 조건] ' + ' · '.join(cond), '']

        parts.append('[과정 전체 흐름] — 이 가운데 %d번째 모듈만 씁니다' % (i + 1))
        for k, x in enumerate(mods):
            mark = '▶' if k == i else ' '
            parts.append('%s %d) %s (%s시간)'
                         % (mark, k + 1, scrub(str(x.get('title') or ''), names),
                            x.get('hours') or '?'))
        parts.append('')

        now = scrub(str(m.get('detail') or ''), names)
        parts += ['[지금 쓸 모듈] %s (%s시간)'
                  % (scrub(str(m.get('title') or ''), names), m.get('hours') or '?'),
                  '지금 내용(%d자): %s' % (len(now), now.replace('\n', ' / ')[:400] or '(비어 있음)'),
                  '']

        if ref_lines:
            parts += ['[참고 자료] — 다른 회사에 나갔던 제안서입니다',
                      '대상·업종은 이번 문의와 다릅니다. 활동을 짜는 방식과 프레임워크 이름만',
                      '눈여겨보고, 그 회사 사정은 가져오지 마십시오.']
            parts += ref_lines
            parts.append('')

        parts += ['[할 일]',
                  '위 %d번째 모듈의 detail 을 **%d자 안팎으로** 써 주십시오.' % (i + 1, aim),
                  '- 소주제마다 상세 %d줄씩 씁니다. 줄마다 무엇을 하는지(활동·도구·산출물)가 '
                  '보이게 구체적으로 씁니다. "이해", "향상" 같은 빈말로 줄을 채우지 않습니다.' % per,
                  '- 제목과 시간은 바꾸지 않습니다. 그 제목이 말하는 것만 다룹니다.',
                  '- 앞뒤 모듈이 다루는 것과 겹치지 않게 합니다. 이 모듈의 몫만 씁니다.',
                  '- %s시간 안에 실제로 할 수 있는 분량이어야 합니다.' % (m.get('hours') or '?'),
                  '- 두 번째 소주제에는 고객사 이야기를 넣어 이 회사 것으로 만듭니다.',
                  '- 지금 내용이 맞는 방향이면 살을 붙이고, 얄팍하면 통째로 다시 씁니다.']

        last = ''
        short = None       # 짧게 온 첫 답 — 다시 불러도 더 짧으면 이걸 쓴다
        for _ in range(3):
            try:
                with client.messages.stream(
                    model=AI_MODEL, max_tokens=8000, system=AI_SYSTEM,
                    thinking={'type': 'adaptive'},
                    output_config={'effort': 'high',
                                   'format': {'type': 'json_schema', 'schema': schema}},
                    messages=[{'role': 'user', 'content': '\n'.join(parts)}],
                ) as stream:
                    msg = stream.get_final_message()
            except anthropic.APIStatusError as e:
                if e.status_code in (401, 403):
                    raise RuntimeError('API 키가 거절당했습니다.')
                last = 'status %s' % e.status_code
                continue
            except anthropic.APIConnectionError as e:
                last = str(e)[:160]
                continue
            except Exception as e:  # noqa: BLE001
                last = type(e).__name__ + ': ' + str(e)[:140]
                continue
            if msg.stop_reason in ('max_tokens', 'refusal'):
                last = '답이 끊겼습니다' if msg.stop_reason == 'max_tokens' else '모델이 거절했습니다'
                continue
            text = next((b.text for b in msg.content if b.type == 'text'), '')
            try:
                got = json.loads(text)
            except Exception:  # noqa: BLE001
                last = '응답이 JSON 이 아니었습니다'
                continue
            got['detail'] = _cap_lines(str(got.get('detail') or ''), per)
            # 얇게 온 답은 한 번 더 쓰게 한다 — 칸의 60%도 못 채우면 제안서가 빈약해 보인다
            n = len(str(got.get('detail') or ''))
            if n >= aim * 0.7 or short is not None:
                if short is not None and n < len(str(short[0].get('detail') or '')):
                    return short
                return got, msg.usage
            short = (got, msg.usage)
            parts += ['', '[다시 쓰기] 방금 쓴 내용이 %d자로 짧습니다. 소주제마다 상세 %d줄을 '
                      '모두 채워 %d자 안팎으로 다시 써 주십시오. 줄 수는 늘리지 않습니다.' % (n, per, aim)]
        if short is not None:
            return short
        raise RuntimeError(last or '알 수 없음')

    # 모듈들을 **동시에** 쓴다.
    # 하나씩 차례로 쓰면 모듈 6개에 4분, 8개면 5분을 넘겨 배포한 웹(Vercel 함수 한 번에
    # 최대 300초)에서 잘린다. 모듈마다 과정 전체 흐름을 따로 넘기므로 서로 기다릴 일이 없다.
    # 한꺼번에 너무 많이 보내면 API 가 속도 제한을 걸 수 있어 6개씩.
    from concurrent.futures import ThreadPoolExecutor

    def run(i):
        try:
            return i, one(i, mods[i]), None
        except RuntimeError as e:
            return i, None, e

    with ThreadPoolExecutor(max_workers=min(6, len(mods))) as pool:
        done = sorted(pool.map(run, range(len(mods))), key=lambda x: x[0])

    out, tin, tout, bad = [], 0, 0, 0
    for i, res, err in done:
        m = mods[i]
        if err is None:
            got, usage = res
            tin += usage.input_tokens
            tout += usage.output_tokens
            out.append(got)
            continue
        if 'API 키' in str(err):
            return 502, {'error': 'key', 'message': str(err)}
        # 한 모듈이 실패해도 나머지는 살린다 — 다 버리면 한 번 더 몇 분을 기다려야 한다
        bad += 1
        out.append({'detail': m.get('detail') or '',
                    'keywords': m.get('keywords') or [],
                    'goals': m.get('goals') or []})

    if bad == len(mods):
        return 502, {'error': 'failed', 'message': '세부 내용을 쓰지 못했습니다.'}

    avg = int(sum(len(str(x.get('detail') or '')) for x in out) / max(1, len(out)))
    return 200, {'ok': True, 'modules': out, 'avg': avg, 'want': want, 'failed': bad,
                 'usage': {'in': tin, 'out': tout}}


def _ask_json(system, user, schema, max_tokens=8000, effort='medium'):
    """한 번 물어 JSON 을 받는다. (코드, 데이터 또는 오류 dict)"""
    key = ai_key()
    if not key:
        return 400, {'error': 'no_key', 'message': '환경변수 ANTHROPIC_API_KEY 를 넣어 주세요.'}
    try:
        import anthropic
    except ImportError:
        return 500, {'error': 'no_sdk', 'message': 'pip install anthropic 을 먼저 해 주세요.'}
    client = anthropic.Anthropic(api_key=key, max_retries=4, timeout=240.0)
    last = ''
    for _ in range(2):
        try:
            with client.messages.stream(
                model=AI_MODEL, max_tokens=max_tokens, system=system,
                thinking={'type': 'adaptive'},
                output_config={'effort': effort,
                               'format': {'type': 'json_schema', 'schema': schema}},
                messages=[{'role': 'user', 'content': user}],
            ) as stream:
                msg = stream.get_final_message()
        except anthropic.APIStatusError as e:
            if e.status_code in (401, 403):
                return 502, {'error': 'key', 'message': 'API 키가 거절당했습니다.'}
            last = 'status %s' % e.status_code
            continue
        except Exception as e:  # noqa: BLE001
            last = type(e).__name__ + ': ' + str(e)[:140]
            continue
        if msg.stop_reason in ('max_tokens', 'refusal'):
            last = msg.stop_reason
            continue
        text = next((b.text for b in msg.content if b.type == 'text'), '')
        try:
            return 200, json.loads(text)
        except Exception:  # noqa: BLE001
            last = '응답이 JSON 이 아니었습니다'
    return 502, {'error': 'failed', 'message': 'AI 가 답하지 못했습니다 (%s).' % (last or '알 수 없음')}


_MARKS = ['○○', '△△', '□□', '◇◇']


def _hide(s, names):
    """이름마다 다른 표시로 가린다 (고객사 ○○, 담당자 △△ …) — 되돌릴 때 섞이지 않게."""
    s = str(s or '')
    for i, n in enumerate(names[:len(_MARKS)]):
        n = str(n or '').strip()
        if len(n) >= 2:
            s = s.replace(n, _MARKS[i])
    s = _MAIL_RE.sub('(메일)', s)
    return _TEL_RE.sub('(연락처)', s)


_JOSA2 = {'이': ('이', '가'), '가': ('이', '가'), '을': ('을', '를'), '를': ('을', '를'),
          '은': ('은', '는'), '는': ('은', '는'), '과': ('과', '와'), '와': ('과', '와')}


def _josa(word, j):
    pair = _JOSA2.get(j)
    s = re.sub(r'[\s)\]」』"\'”’.]+$', '', str(word or ''))
    if not pair or not s:
        return j
    c = ord(s[-1])
    if 0xAC00 <= c <= 0xD7A3:
        return pair[0] if (c - 0xAC00) % 28 else pair[1]
    if s[-1].isdigit():
        return pair[0] if s[-1] in '013678' else pair[1]
    return pair[1] if s[-1].lower() in 'aeiouy' else pair[0]


def _restore(s, names):
    """가린 표시를 이름으로 되돌린다. 바로 뒤 조사도 그 이름의 받침에 맞춘다
    ('○○는' → '신한라이프생명보험은')."""
    s = str(s or '')
    for i, n in enumerate(names[:len(_MARKS)]):
        if not n:
            continue
        mark = _MARKS[i]
        s = re.sub(re.escape(mark) + r'(이|가|을|를|은|는|과|와)(?![가-힣])',
                   lambda m, n=n: str(n) + _josa(n, m.group(1)), s)
        s = s.replace(mark, str(n))
    return s


CONDENSE_SYSTEM = """\
당신은 한국능률협회(KMA) 제안서·결과보고서를 다듬는 편집자입니다.
파워포인트 양식의 칸은 글자 수가 정해져 있습니다. 칸보다 긴 글을 그 칸에 들어가게 다시 씁니다.

■ 규칙
- 각 글을 max 글자 이하로 다시 씁니다. 띄어쓰기도 한 글자로 셉니다.
- 뜻은 그대로 둡니다. 없는 내용을 더하지 않습니다. 숫자·고유명사·전문용어는 살립니다.
- 말줄임표(…, ...)로 끝내지 않습니다. 문장이 중간에 끊긴 느낌이 없어야 합니다.
- 원문이 '~합니다' 문장이면 문장으로, 제목·명사구면 명사구로 씁니다.
- 원문이 '제목 — 설명' 꼴이면 그 꼴을 살리되 필요하면 설명을 줄입니다.
- ○○ 는 고객사 이름, △△·□□ 는 사람 이름을 가린 것입니다. 그 표시를 그대로 씁니다.
- 줄일 때 ○○(고객사 이름)는 뜻에 꼭 필요할 때만 남깁니다 — 칸이 좁으면 빼는 편이 낫습니다.
"""


def ai_condense(job):
    """칸보다 긴 글을 칸에 맞게 줄인다. items: [{text, max}] → [{text, max, short}]"""
    names = [str(n) for n in (job.get('names') or []) if n]
    items = [x for x in (job.get('items') or []) if x and x.get('text') and int(x.get('max') or 0) >= 6][:80]
    if not items:
        return 200, {'ok': True, 'items': []}
    kind = str(job.get('kind') or '제안서')
    lines = []
    for i, x in enumerate(items):
        hid = _hide(x['text'], names)
        # 가린 이름(○○ 두 글자)은 되돌리면 길어진다 — '파라다이스 카지노 워커힐' 은 13자다.
        # 그만큼 한도를 줄여 물어야 되돌린 뒤에도 칸에 들어간다.
        grow = 0
        for k, n in enumerate(names[:len(_MARKS)]):
            grow += max(0, len(str(n)) - len(_MARKS[k])) * hid.count(_MARKS[k])
        room = max(6, int(x['max']) - grow)
        lines.append(json.dumps({'id': i, 'max': room, 'text': hid}, ensure_ascii=False))
    user = '문서 종류: %s\n\n아래 글들을 각각 max 글자 이하로 다시 써 주세요.\n\n%s' % (kind, '\n'.join(lines))
    schema = {
        'type': 'object', 'additionalProperties': False, 'required': ['items'],
        'properties': {'items': {'type': 'array', 'items': {
            'type': 'object', 'additionalProperties': False, 'required': ['id', 'short'],
            'properties': {'id': {'type': 'integer'}, 'short': {'type': 'string'}}}}},
    }
    code, data = _ask_json(CONDENSE_SYSTEM, user, schema, max_tokens=12000, effort='medium')
    if code != 200:
        return code, data
    out = []
    for r in data.get('items') or []:
        try:
            x = items[int(r.get('id'))]
        except (IndexError, TypeError, ValueError):
            continue
        short = _restore(str(r.get('short') or '').strip(), names)
        short = re.sub(r'(…|\.\.\.)\s*$', '', short).strip()
        # 고객사 이름을 되돌리면 길어질 수 있다 — 조금은 봐주고, 많이 넘으면 버린다
        if short and len(short) <= int(x['max']) + 4:
            out.append({'text': x['text'], 'max': int(x['max']), 'short': short})
    return 200, {'ok': True, 'items': out}


REVIEW_SYSTEM = """\
당신은 한국능률협회(KMA)에서 고객에게 나가는 제안서·결과보고서를 마지막으로 검수하는 사람입니다.
문서는 회사 양식에 이번 건의 내용을 채워 만든 것입니다. 양식에는 예전 고객사의 글이 남아 있을 수 있습니다.

■ 찾을 것 (이것만)
1. leftover — 이번 고객사(○○)가 아닌 **다른 고객사 이름이나 그 회사의 과정·사정**이
   마치 이번 건의 내용인 것처럼 남아 있는 곳. (예: 머리말 '2026 HMM … 결과 보고서',
   본문 '후성그룹의 인재사상은 …')
2. placeholder — '[내용 1]', '[기업명]', '○○사', 'TEXT' 처럼 양식의 빈칸 표시나 작성 안내가 남은 곳.
3. cover — 1번 장(표지)에 이번 고객사 이름(○○)과 과정명이 둘 다 보이는지. 없으면 알린다.

■ 문제가 아닌 것 (절대 적지 말 것)
- [고객 문의] 에 나오는 이름 — 이번 고객사의 약칭·브랜드명(예: '신한라이프생명보험' 의 '신한라이프'),
  교육 장소(골프장·연수원·호텔 등), 계열사·사업장 이름은 이번 건의 이름입니다.
- 마지막 장의 담당자 연락처(성명·전화·메일) 빈칸 — 따로 확인합니다.
- KMA 소개 장의 수행 실적·고객사 로고·포트폴리오 목록(여러 회사를 나열한 것) — KMA 의 실적이다.
- 강사 소개의 경력·강의 실적·유사 프로젝트 표에 나오는 다른 회사 — 강사의 이력이다.
- 양식의 고정 문구(‘Connect Values Navigate Growth’, 장 제목, 이름표 '[강의 분야]' 같은 머리글).
- 설문 문항, 일반 명사로 쓰인 업종 이름.

■ 고치기(fix)
- leftover 가 고객사 이름·과정명만 바꾸면 되는 경우에만 fix 에 바꿀 글을 적습니다
  (text 의 그 부분을 이번 건 이름으로 바꾼 전체 글). 문장의 뜻이 그 회사 사정이면 fix 는 비웁니다.
- text 는 문서에 있는 글을 **그대로 한 글자도 바꾸지 말고** 옮겨 적습니다(그래야 찾아 바꿀 수 있습니다).
- 문제가 없으면 빈 목록을 돌려줍니다. 애매하면 적지 않습니다. '문제 없음' 같은 항목은 만들지 않습니다.
"""


def ai_review(job):
    """다 만든 문서의 글을 읽고 다른 회사 흔적·빈칸 표시·표지 누락을 찾는다.
    job = {kind, company, person, course, slides: [{no, texts: [..]}], layouts: [..]}"""
    # 고객사 이름은 여러 꼴('(주)대교디앤에스', '대교디앤에스')이 모두 ○○ 한 가지로 보여야 한다.
    # 꼴마다 다른 표시를 쓰니 모델이 '△△(다른 이름)' 을 '○○' 로 바꾸라고 고쳐 왔다.
    raw = [str(n) for n in (job.get('names') or []) if n]
    co = raw[0] if raw else ''
    co_forms = sorted({n for n in raw if co and (n in co or co in n)}, key=len, reverse=True)
    others = [n for n in raw if n not in co_forms]
    names = [co] + others
    def hide(t):
        t = str(t or '')
        for f in co_forms:
            t = t.replace(f, '○○')
        return _hide(t, [''] + others)

    course = hide(job.get('course') or '')
    kind = str(job.get('kind') or '제안서')
    parts = ['문서 종류: %s' % kind, '이번 고객사: ○○', '이번 과정명: %s' % (course or '(없음)'), '']
    ask = hide(job.get('inquiry') or '')[:1500]
    if ask.strip():
        parts += ['[고객 문의] (이번 건 — 여기 나오는 이름·장소는 이번 고객사 쪽입니다)', ask, '']
    for s in (job.get('slides') or [])[:60]:
        ts = [hide(t)[:220] for t in (s.get('texts') or []) if str(t).strip()][:40]
        if ts:
            parts.append('[%s번 장]' % s.get('no'))
            parts.extend('- ' + t.replace('\n', ' / ') for t in ts)
    lay = [hide(t)[:200] for t in (job.get('layouts') or []) if str(t).strip()][:30]
    if lay:
        parts.append('[모든 장 공통 머리말·바닥글(레이아웃)]')
        parts.extend('- ' + t.replace('\n', ' / ') for t in lay)
    schema = {
        'type': 'object', 'additionalProperties': False, 'required': ['items'],
        'properties': {'items': {'type': 'array', 'items': {
            'type': 'object', 'additionalProperties': False,
            'required': ['slide', 'kind', 'text', 'problem', 'fix'],
            'properties': {
                'slide': {'type': 'integer', 'description': '장 번호, 레이아웃이면 0'},
                'kind': {'type': 'string', 'enum': ['leftover', 'placeholder', 'cover']},
                'text': {'type': 'string'}, 'problem': {'type': 'string'}, 'fix': {'type': 'string'}}}}},
    }
    code, data = _ask_json(REVIEW_SYSTEM, '\n'.join(parts), schema, max_tokens=8000, effort='high')
    if code != 200:
        return code, data
    out = []
    for r in data.get('items') or []:
        t_hid, f_hid = str(r.get('text') or ''), str(r.get('fix') or '')
        if re.search(r'문제\s*(가\s*)?없|무시하', str(r.get('problem') or '')):
            continue      # '문제 없음' 이라고 적어 온 것은 알릴 거리가 아니다
        # 문서에는 고객사가 어느 꼴로든 적혀 있을 수 있다 — 꼴마다 되돌려 짝을 만들어 둔다
        pairs = []
        for f in (co_forms or [co]):
            nm = [f] + others
            pairs.append([_restore(t_hid, nm), _restore(f_hid, nm)])
        first = pairs[0] if pairs else [t_hid, f_hid]
        out.append({'slide': int(r.get('slide') or 0), 'kind': str(r.get('kind') or ''),
                    'text': first[0], 'fix': first[1], 'pairs': pairs,
                    'problem': _restore(r.get('problem'), names)})
    return 200, {'ok': True, 'items': out, 'allowed': co_forms + ([job.get('course')] if job.get('course') else [])}


def ai_fix(job):
    """어긋난 곳을 고친다.

    '문의한 내용과 어긋납니다' 라고 알려 주기만 하면 받는 쪽에서는
    '그래서 어쩌라고' 가 된다. 무엇이 어긋났는지 알면 고치는 것까지가 일이다.

      topic — 문의에 있는데 커리큘럼이 안 다루는 주제를 넣는다
      hours — 모듈 시간 합을 요청 시간에 맞춘다
      room  — 양식 칸보다 긴 글을 그 칸에 맞게 줄인다
    """
    key = ai_key()
    if not key:
        return 400, {'error': 'no_key', 'message': '환경변수 ANTHROPIC_API_KEY 를 넣어 주세요.'}
    try:
        import anthropic
    except ImportError:
        return 500, {'error': 'no_sdk', 'message': 'pip install anthropic 을 먼저 해 주세요.'}

    kind = str(job.get('kind') or '').strip()
    names = list(job.get('names') or [])
    ask = scrub(str(job.get('inquiry') or ''), names)
    mods = list(job.get('modules') or [])

    def mod_lines():
        out = []
        for i, m in enumerate(mods):
            out.append('%d) %s (%s시간)' % (i + 1, scrub(str(m.get('title') or ''), names),
                                            m.get('hours') or '?'))
            d = scrub(str(m.get('detail') or ''), names).replace('\n', ' / ')
            out.append('   %s' % (d[:260] or '(비어 있음)'))
        return out

    if kind in ('topic', 'hours'):
        if not mods:
            return 400, {'error': 'no_modules', 'message': '먼저 모듈을 만들어 주세요.'}
        parts = ['[이번 문의]', ask or '(문의 글 없음)', '', '[지금 커리큘럼]'] + mod_lines() + ['']
        if kind == 'topic':
            miss = [scrub(str(x), names) for x in (job.get('missing') or [])]
            parts += ['[문제]',
                      '문의는 ' + ' · '.join(miss) + ' 을(를) 말했는데 커리큘럼이 그걸 안 다룹니다.',
                      '', '[할 일]',
                      '빠진 주제가 커리큘럼에 실제로 들어가게 고쳐 주십시오.',
                      '- 이미 있는 모듈에 녹일 수 있으면 그 모듈의 제목·내용을 고칩니다.',
                      '- 녹일 수 없으면 모듈을 새로 만들고, 대신 덜 중요한 모듈의 시간을 줄입니다.',
                      '- 이름만 끼워 넣지 마십시오. 그 주제로 무엇을 하는지가 내용에 보여야 합니다.']
            if job.get('hours'):
                parts.append('- 시간 합은 %s시간 그대로 유지합니다.' % job['hours'])
        else:
            parts += ['[문제]',
                      '문의는 %s시간인데 모듈 시간 합이 %s시간입니다.'
                      % (job.get('want'), job.get('now')),
                      '', '[할 일]',
                      '시간 합이 정확히 %s시간이 되게 고쳐 주십시오.' % job.get('want'),
                      '- 늘릴 때는 다루는 내용을 실제로 더합니다. 시간만 부풀리지 않습니다.',
                      '- 줄일 때는 덜 중요한 것을 덜어 냅니다. 내용은 그대로 두고 숫자만 줄이지 않습니다.',
                      '- 모듈을 없애거나 합쳐도 됩니다.']
        caps = job.get('caps') or {}
        if caps.get('moduleDetail'):
            parts.append('- 모듈 내용(detail)은 %d자 안팎으로 씁니다.' % int(caps['moduleDetail']))

        schema = {
            'type': 'object',
            'properties': {
                'modules': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'title': {'type': 'string', 'description': '모듈명'},
                            'hours': {'type': 'number', 'description': '이 모듈의 시간'},
                            'detail': {
                                'type': 'string',
                                'description': '"1) 소주제\\n(이론) …\\n(실습) …" 꼴. '
                                               '줄바꿈은 \\n, 불렛 기호는 쓰지 않습니다.',
                            },
                            'keywords': {'type': 'array', 'items': {'type': 'string'}},
                            'goals': {'type': 'array', 'items': {'type': 'string'}},
                        },
                        'required': ['title', 'hours', 'detail', 'keywords', 'goals'],
                        'additionalProperties': False,
                    },
                },
                'what': {'type': 'string', 'description': '무엇을 어떻게 고쳤는지 한 줄'},
            },
            'required': ['modules', 'what'],
            'additionalProperties': False,
        }

    elif kind == 'room':
        fields = list(job.get('fields') or [])
        longs = list(job.get('longMods') or [])
        if not fields and not longs:
            return 400, {'error': 'nothing', 'message': '줄일 것이 없습니다.'}
        parts = ['[이번 문의]', ask or '(문의 글 없음)', '', '[문제]',
                 '아래 글이 회사 PPT 양식의 칸보다 길어, 그대로 만들면 뒷부분이 잘려 나갑니다.',
                 '', '[줄여야 할 글]']
        for f in fields:
            parts.append('- %s (지금 %d자 → %d자 안팎, %s줄로)'
                         % (f.get('label'), len(str(f.get('text') or '')),
                            int(f.get('room') or 0), f.get('lines') or '?'))
            parts.append('  ' + scrub(str(f.get('text') or ''), names).replace('\n', ' / ')[:600])
        if longs:
            room = int(job.get('modRoom') or 400)
            parts.append('- 모듈 %d개의 내용 (각 %d자 안팎으로)'
                         % (len(longs), room))
            for i in longs:
                if i < len(mods):
                    parts.append('  [%d] %s' % (i + 1,
                                 scrub(str(mods[i].get('detail') or ''), names)
                                 .replace('\n', ' / ')[:400]))
        parts += ['', '[할 일]',
                  '뜻은 그대로 두고 분량만 줄입니다.',
                  '- 수식어와 겹치는 말을 덜어 냅니다. 무엇을 하는지는 남겨 둡니다.',
                  '- 줄 수를 지킵니다. 한 줄이 곧 장표의 한 줄입니다.',
                  '- 고객이 쓴 말(문의 글의 표현)은 지우지 마십시오.']

        schema = {
            'type': 'object',
            'properties': {
                'fields': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'key': {'type': 'string', 'description': '받은 칸 이름 그대로'},
                            'text': {'type': 'string', 'description': '줄인 글. 줄바꿈은 \\n.'},
                        },
                        'required': ['key', 'text'],
                        'additionalProperties': False,
                    },
                },
                'details': {
                    'type': 'array',
                    'description': '줄인 모듈 내용. 받은 차례 그대로.',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'at': {'type': 'number', 'description': '몇 번째 모듈인지 (0부터)'},
                            'text': {'type': 'string'},
                        },
                        'required': ['at', 'text'],
                        'additionalProperties': False,
                    },
                },
                'what': {'type': 'string', 'description': '무엇을 어떻게 줄였는지 한 줄'},
            },
            'required': ['fields', 'details', 'what'],
            'additionalProperties': False,
        }
    else:
        return 400, {'error': 'bad_kind', 'message': '고칠 갈래를 알 수 없습니다.'}

    for key_name, label in (('headcount', '인원'), ('hours', '총 교육시간'), ('sessions', '차수')):
        if job.get(key_name):
            parts.append('%s: %s' % (label, job[key_name]))

    client = anthropic.Anthropic(api_key=key, max_retries=5, timeout=600.0)
    last = ''
    for _ in range(2):
        try:
            with client.messages.stream(
                model=AI_MODEL, max_tokens=20000, system=AI_SYSTEM,
                thinking={'type': 'adaptive'},
                output_config={'effort': 'high',
                               'format': {'type': 'json_schema', 'schema': schema}},
                messages=[{'role': 'user', 'content': '\n'.join(parts)}],
            ) as stream:
                msg = stream.get_final_message()
        except anthropic.APIStatusError as e:
            if e.status_code in (401, 403):
                return 502, {'error': 'key', 'message': 'API 키가 거절당했습니다.'}
            last = 'status %s' % e.status_code
            continue
        except anthropic.APIConnectionError as e:
            last = str(e)[:160]
            continue
        except Exception as e:  # noqa: BLE001
            # 흘려 받는 도중 서버가 연결을 끊으면 httpx/h11 쪽 예외가 그대로 올라온다.
            # SDK 가 감싸 주지 않는 자리라, 여기서 안 잡으면 화면이 통째로 멈춘다.
            last = type(e).__name__ + ': ' + str(e)[:140]
            continue
        if msg.stop_reason == 'max_tokens':
            # 답이 중간에 끊긴 것이다. 이대로 json.loads 에 넣으면
            # '응답이 JSON 이 아니었습니다' 로만 보여 까닭을 알 수 없다.
            last = '답이 길어 중간에 끊겼습니다'
            continue
        if msg.stop_reason == 'refusal':
            last = '모델이 거절했습니다'
            continue
        text = next((b.text for b in msg.content if b.type == 'text'), '')
        try:
            data = json.loads(text)
        except Exception:  # noqa: BLE001
            last = '응답이 JSON 이 아니었습니다'
            continue
        out = {'ok': True, 'kind': kind, 'what': data.get('what') or '',
               'usage': {'in': msg.usage.input_tokens, 'out': msg.usage.output_tokens}}
        if kind in ('topic', 'hours'):
            got = data.get('modules') or []
            if not got:
                last = '모듈이 비어 돌아왔습니다'
                continue
            out['modules'] = got
            out['hoursGot'] = round(sum(float(m.get('hours') or 0) for m in got), 1)
        else:
            out['fields'] = data.get('fields') or []
            out['details'] = data.get('details') or []
        return 200, out
    return 502, {'error': 'failed', 'message': '고치지 못했습니다 (%s).' % (last or '알 수 없음')}
