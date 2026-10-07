/**
 * 밑줄 감지 전용 규칙.
 *
 * 이 파일은 학생이 글쓰기 창을 열 때마다 함께 내려가는 빠른 1차 규칙이다(개수는 SPELLING_DETECTION_RULE_COUNT, 2026-10-07 띄어쓰기 규칙 20개 추가).
 * 500개 전체 규칙은 첫 화면을 막지 않도록 별도 청크에서 뒤이어 불러온다.
 *
 * 【판정 기준 — 오탐 0이 최우선 (2026-08-04 결정)】
 * 맞게 쓴 글에 빨간 줄이 그어지는 것은 못 잡는 것보다 나쁘다. 초등학생은 밑줄을 보고
 * 맞는 글을 틀리게 고치거나 밑줄 자체를 믿지 않게 된다. 그래서
 *
 *   ○ 넣는다 — 한국어에 그런 형태가 아예 없는 것. 문맥과 무관하게 항상 틀린 것.
 *   ✕ 뺀다  — 문맥에 따라 맞을 수 있는 것.
 *
 * 뺀 예: `안돼`(→'안되다'의 활용이면 맞다), `낳다/낫다`(아기를 낳다는 맞다),
 *        `바램`(색이 바램은 맞다), `가르치다/가리키다`, `맞히다/맞추다`, `-데/-대`,
 *        `한번/한 번`, `로서/로써`, `이따가/있다가` — 전부 글자만 봐서는 가릴 수 없다.
 *        이 표현들은 수첩에서 직접 찾아볼 수 있게 두되 자동 밑줄은 긋지 않는다.
 *
 * 【정규식 작성 규칙】
 * - 괄호는 반드시 `(?:...)` 로 쓴다. 규칙마다 정확히 하나의 괄호만 갖도록 아래에서 묶기 때문에,
 *   규칙 안에 캡처 괄호가 있으면 어느 규칙이 걸렸는지 못 찾는다.
 * - `entryId` 는 수첩에 상세 설명이 있는 경우에만 채운다. 없으면 `right` 만으로 안내한다.
 *
 * 【필드】
 * - `wrong` / `right` — 학생에게 "무엇을 무엇으로" 고치라고 보여 줄 말.
 * - `spaceBefore` — 띄어쓰기 규칙만. 걸린 글자에서 이 꼴이 **마지막으로** 나오는 자리 앞에 띄어쓰기를 넣어
 *   그 자리에 맞는 바른 꼴을 보여 준다(`세명` → `세 명`, `하지않` → `하지 않`). 없으면 `right` 를 그대로 보여 준다.
 * - `lookup` — 표준국어대사전에서 **실제로 찾을 표제어**. `right` 를 그대로 찾으면 빈손으로 오는 경우가
 *   많아서 따로 둔다. 사전에는 활용형이 아니라 기본형·표제어만 있기 때문이다.
 *     `됬` → 보여 줄 말 `됐`, 찾을 말 **`되다`** (`됐` 은 표제어가 아니다)
 *     `슴니다` → 보여 줄 말 `습니다`, 찾을 말 **`습니다`** (어미)
 *     `할께` → 보여 줄 말 `-게`, 찾을 말 **`게`** (어미)
 *   사전은 낱말로 찾으므로 표제어 앞의 하이픈(`-습니다`)은 떼고 적는다.
 *     `떡볶기` → 보여 줄 말·찾을 말 모두 `떡볶이` (표제어가 그대로 있다)
 */

const RULES = [
    // ── 어미·종결 (소리 나는 대로 적어서 생기는 오류) ─────────────────────────
    { id: 'doeyo', wrong: '되요', right: '돼요', lookup: '되다', entryId: 'dwae-doe', source: '되요' },
    { id: 'dwaet', wrong: '됬', right: '됐', lookup: '되다', entryId: 'dwae-doe', source: '됬' },
    { id: 'seumnida', wrong: '슴니다', right: '습니다', lookup: '습니다', source: '슴니다' },
    { id: 'eupnida', wrong: '읍니다', right: '습니다', lookup: '습니다', source: '읍니다' },
    { id: 'ipnida', wrong: '임니다', right: '입니다', lookup: '입니다', source: '임니다' },
    { id: 'anieyo', wrong: '아니예요', right: '아니에요', lookup: '아니다', entryId: 'anieyo', source: '아니예요' },
    // `이예요` 는 규칙에 넣지 않는다. 앞말에 받침이 없으면 '고양이예요'·'종이예요'처럼 맞는 형태라
    // 글자만 봐서는 '책이예요'(틀림)와 가릴 수 없다.
    { id: 'bwaeyo', wrong: '뵈요', right: '봬요', lookup: '뵈다', entryId: 'bwaeyo', source: '뵈요' },
    // '-ㄹ게'를 '-ㄹ께'로 적는 오류. 받침 ㄹ은 정규식으로 가릴 수 없어 실제로 쓰이는 형태만 적는다.
    {
        id: 'kke',
        wrong: '-께',
        right: '-게',
        lookup: '게',
        source: '(?:할|갈|볼|올|줄|놀|울|들|앉을|만들|드릴|보낼|기다릴|먹을|잡을|읽을|있을|없을|쓸|칠|잘|열)께'
    },
    {
        id: 'kkeo',
        wrong: '-꺼',
        right: '-거',
        lookup: '거',
        source: '(?:할|갈|볼|올|줄|될|놀|만들|먹을|있을|없을|잡을|읽을|쓸|열)꺼'
    },

    // ── 웬 / 왠 ('왠'은 '왠지' 말고는 쓰이지 않는다) ──────────────────────────
    { id: 'wenji', wrong: '웬지', right: '왠지', lookup: '왠지', entryId: 'wen-waen', source: '웬지' },
    { id: 'waen', wrong: '왠', right: '웬', lookup: '웬', entryId: 'wen-waen', source: '왠(?!지)' },

    // ── 어떡해 / 어떻게 ──────────────────────────────────────────────────────
    { id: 'eottheohae', wrong: '어떻해', right: '어떡해', lookup: '어떡하다', entryId: 'eotteoke-eotteokhae', source: '어떻해' },
    { id: 'eotteokge', wrong: '어떡게', right: '어떻게', lookup: '어떻다', entryId: 'eotteoke-eotteokhae', source: '어떡게' },

    // ── 낱말 (형태 자체가 없는 것) ───────────────────────────────────────────
    { id: 'myeochil', wrong: '몇일', right: '며칠', lookup: '며칠', entryId: 'myeochil', source: '몇일' },
    { id: 'geumse', wrong: '금새', right: '금세', lookup: '금세', entryId: 'geumse', source: '금새' },
    { id: 'oraenman', wrong: '오랫만', right: '오랜만', lookup: '오랜만', entryId: 'oraenman', source: '오랫만' },
    { id: 'yeokhal', wrong: '역활', right: '역할', lookup: '역할', entryId: 'yeokhal', source: '역활' },
    { id: 'seollem', wrong: '설레임', right: '설렘', lookup: '설렘', entryId: 'seollem', source: '설레임' },
    { id: 'dodeche', wrong: '도데체', right: '도대체', lookup: '도대체', source: '도데체' },
    { id: 'eouieopda', wrong: '어의없', right: '어이없', lookup: '어이없다', source: '어의없' },
    // `희안` 은 뺐다 — 사람 이름(희안)에 그대로 걸린다.
    { id: 'nunssal', wrong: '눈쌀', right: '눈살', lookup: '눈살', source: '눈쌀' },
    { id: 'neokduri', wrong: '넉두리', right: '넋두리', lookup: '넋두리', source: '넉두리' },
    { id: 'seolgeoji', wrong: '설겆이', right: '설거지', lookup: '설거지', source: '설겆이' },
    // `찌게` 만 보면 '고구마를 찌게 불을 켰다'(찌다+게)에 걸린다. 음식 이름으로 붙은 것만 잡는다.
    {
        id: 'jjigae',
        wrong: '찌게',
        right: '찌개',
        lookup: '찌개',
        source: '(?:김치|된장|부대|순두부|청국장|비지|고추장|참치|동태|생선)찌게'
    },
    { id: 'yukgyejang', wrong: '육계장', right: '육개장', lookup: '육개장', source: '육계장' },
    { id: 'tteokbokki', wrong: '떡볶기', right: '떡볶이', lookup: '떡볶이', source: '떡볶기' },
    { id: 'gopppaegi', wrong: '곱배기', right: '곱빼기', lookup: '곱빼기', source: '곱배기' },
    { id: 'muripsseu', wrong: '무릎쓰', right: '무릅쓰', lookup: '무릅쓰다', source: '무릎쓰' },
    { id: 'gapjjagi', wrong: '갑짜기', right: '갑자기', lookup: '갑자기', source: '갑짜기' },
    { id: 'eojjapi', wrong: '어짜피', right: '어차피', lookup: '어차피', source: '어짜피' },
    { id: 'hamateomyeon', wrong: '하마트면', right: '하마터면', lookup: '하마터면', source: '하마트면' },
    { id: 'amutteun', wrong: '아뭏든', right: '아무튼', lookup: '아무튼', source: '아뭏든' },
    // `요세` 는 뺐다 — 요세미티 같은 고유 이름에 걸린다.
    { id: 'changpi', wrong: '챙피', right: '창피', lookup: '창피', source: '챙피' },
    { id: 'machumbeop', wrong: '마춤법', right: '맞춤법', lookup: '맞춤법', source: '마춤법' },
    { id: 'samgaha', wrong: '삼가하', right: '삼가', lookup: '삼가다', source: '삼가하' },
    { id: 'seoseumchi', wrong: '서슴치', right: '서슴지', lookup: '서슴지', source: '서슴치' },
    { id: 'tongteoreo', wrong: '통털어', right: '통틀어', lookup: '통틀다', source: '통털어' },
    { id: 'jjajipgi', wrong: '짜집기', right: '짜깁기', lookup: '짜깁기', source: '짜집기' },
    { id: 'ttellaeya', wrong: '뗄래야', right: '떼려야', lookup: '떼려야', source: '뗄래야' },
    { id: 'gaegujangi', wrong: '개구장이', right: '개구쟁이', lookup: '개구쟁이', source: '개구장이' },
    { id: 'meotjangi', wrong: '멋장이', right: '멋쟁이', lookup: '멋쟁이', source: '멋장이' },

    // ── 사이시옷 (학교 생활에서 자주 쓰는 말) ────────────────────────────────
    { id: 'deunggyogil', wrong: '등교길', right: '등굣길', lookup: '등굣길', source: '등교길' },
    { id: 'hagyogil', wrong: '하교길', right: '하굣길', lookup: '하굣길', source: '하교길' },
    { id: 'namuip', wrong: '나무잎', right: '나뭇잎', lookup: '나뭇잎', source: '나무잎' },
    // '꽃입니다'에 걸리지 않게 뒤에 '니'가 오는 경우는 뺀다.
    { id: 'kkotip', wrong: '꽃입', right: '꽃잎', lookup: '꽃잎', source: '꽃입(?!니)' },

    // ── '-이'로 적는 부사를 '-히'로 적는 오류 ────────────────────────────────
    { id: 'kkaekkeusi', wrong: '깨끗히', right: '깨끗이', lookup: '깨끗이', entryId: 'kkaekkeusi', source: '깨끗히' },
    { id: 'gomgomi', wrong: '곰곰히', right: '곰곰이', lookup: '곰곰이', entryId: 'gomgomi', source: '곰곰히' },
    { id: 'ilili', wrong: '일일히', right: '일일이', lookup: '일일이', source: '일일히' },
    { id: 'teumteumi', wrong: '틈틈히', right: '틈틈이', lookup: '틈틈이', source: '틈틈히' },
    { id: 'beonbeoni', wrong: '번번히', right: '번번이', lookup: '번번이', source: '번번히' },
    { id: 'satsati', wrong: '샅샅히', right: '샅샅이', lookup: '샅샅이', source: '샅샅히' },
    { id: 'natnati', wrong: '낱낱히', right: '낱낱이', lookup: '낱낱이', source: '낱낱히' },
    { id: 'nanali', wrong: '나날히', right: '나날이', lookup: '나날이', source: '나날히' },
    { id: 'gyeopgyeobi', wrong: '겹겹히', right: '겹겹이', lookup: '겹겹이', source: '겹겹히' },
    { id: 'jjamjjami', wrong: '짬짬히', right: '짬짬이', lookup: '짬짬이', source: '짬짬히' },

    // ── 띄어쓰기 (명사와 헷갈릴 일이 없는 형태만 — 2026-08-04 결정) ──────────
    // `[가-힣]수` 로 잡던 예전 규칙은 '박수 없이'·'실수 없이'·'점수 없이'까지 물어서 뺐다.
    {
        id: 'hal-su',
        wrong: '~수 있다',
        right: '~ 수 있다',
        lookup: '수',
        entryId: 'hal-su-itda',
        source: '(?:할|갈|볼|올|줄|될|들|쓸|쉴|잘|클|놀|울|알|만들|먹을|있을|없을|잡을|읽을|걸을|찾을|배울|그릴|마실|앉을)수(?=\\s*(?:있|없|밖에))'
    },
    { id: 'geot-gatda', wrong: '것같다', right: '것 같다', lookup: '같다', entryId: 'geot-gatda', source: '(?:것|거)같' },

    // ── 띄어쓰기 2 (2026-10-07 — 주간 검수 대기의 64%가 띄어쓰기였다) ─────────
    // **붙여 쓰면 늘 틀리는 꼴만** 넣는다. 한글 맞춤법 제47항은 `-아/-어` 뒤 보조 용언(참아 주다·해 보다·
    // 먹어 버리다)과 `듯하다·만하다·척하다` 는 붙여 써도 **허용**하므로 규칙으로 만들지 않는다.
    // `-지 않다`·`-지 못하다`·`-고 싶다`·`-어야 하다` 는 그 허용에 들지 않는다.
    // 뒤를 보는 정규식(lookbehind)은 쓰지 않는다 — 옛 아이패드 사파리에서 결합 정규식 전체가 깨진다.
    // 앞 글자를 하나 함께 잡는 것은 낱말 맨 앞(`않다` 로 시작하는 줄)에 걸리지 않게 하려는 것이다.
    // `마지않다`(…해 마지않다)·`마지못하다`는 한 낱말이라 앞 글자에서 `마`(U+B9C8)만 뺀다(학생 글 4000편으로 확인).
    { id: 'ji-anh', spaceBefore: '않', wrong: '-지않다', right: '-지 않다', lookup: '않다', source: '[가-맇막-힣]지않' },
    { id: 'ji-mot', spaceBefore: '못', wrong: '-지못하다', right: '-지 못하다', lookup: '못하다', source: '[가-맇막-힣]지못(?=하|해|했|할|한|함|합)' },
    { id: 'go-sip', spaceBefore: '싶', wrong: '-고싶다', right: '-고 싶다', lookup: '싶다', source: '[가-힣]고싶' },
    // `-어야 하다`: 앞 글자를 아·어 소리로 끝나는 꼴로 묶는다. `여야`(정당)·`아야`(감탄)는 뺐고,
    // `해야겠다`·`해야지` 는 한 어미라 맞으므로 `하` 꼴만 잡는다.
    {
        id: 'eoya-hada', spaceBefore: '[하합했해할한함]',
        wrong: '-어야하다',
        right: '-어야 하다',
        lookup: '하다',
        source: '(?:해|가|와|봐|줘|돼|써|자|사|서|타|켜|꺼|껴|져|워|러|려|어|내|세|쳐|겨|봬|해내)야(?:하|합|했|해|할|한|함)'
    },
    // 의존 명사 `게`·`거`(것이·것): `-는` 뒤는 늘 띄운다. `하는게임` 처럼 다른 낱말이 붙어도 띄우면 맞는 글이 된다.
    { id: 'neun-ge', spaceBefore: '게', wrong: '-는게', right: '-는 게', lookup: '것', source: '[가-힣]는게' },
    { id: 'neun-geo', spaceBefore: '거', wrong: '-는거', right: '-는 거', lookup: '것', source: '[가-힣]는거' },
    // `때문`은 늘 의존 명사라 앞말과 띄운다(너 때문에·비가 오기 때문에). `때문` 으로 끝나는 한 낱말은 없다.
    { id: 'ttaemun', spaceBefore: '때문', wrong: '-때문', right: '- 때문', lookup: '때문', source: '[가-힣]때문' },
    // `-ㄹ 것/때/줄/거`: 받침 ㄹ 은 정규식으로 못 가려 실제로 쓰는 꼴만 적는다(위 hal-su 와 같은 방식).
    // `들것`(나르는 들것)·`볼거리`·`먹을거리` 는 한 낱말이라 뺐다.
    {
        id: 'hal-geot', spaceBefore: '것',
        wrong: '-ㄹ것',
        right: '-ㄹ 것',
        lookup: '것',
        source: '(?:할|갈|볼|올|줄|될|쓸|쉴|잘|놀|울|알|만들|먹을|있을|없을|잡을|읽을|찾을|배울|그릴|마실|앉을)것'
    },
    {
        id: 'hal-ttae', spaceBefore: '때',
        wrong: '-ㄹ때',
        right: '-ㄹ 때',
        lookup: '때',
        source: '(?:할|갈|볼|올|줄|될|들|쓸|쉴|잘|클|놀|울|알|만들|먹을|있을|없을|잡을|읽을|걸을|찾을|배울|그릴|마실|앉을|어릴|아플|힘들|심심할|화날|슬플|기쁠)때'
    },
    {
        id: 'hal-jul', spaceBefore: '줄',
        wrong: '-ㄹ줄 알다',
        right: '-ㄹ 줄 알다',
        lookup: '줄',
        source: '(?:할|갈|볼|올|될|쓸|탈|놀|만들|먹을|읽을|찾을|그릴|칠|잘)줄(?=\\s*(?:알|몰))'
    },
    {
        id: 'hal-geoya', spaceBefore: '거',
        wrong: '-ㄹ거야',
        right: '-ㄹ 거야',
        lookup: '것',
        source: '(?:할|갈|볼|올|줄|될|들|쓸|쉴|잘|놀|울|알|만들|먹을|있을|없을|잡을|읽을|찾을|배울|그릴|마실|앉을)거(?=야|예|에요|다|라|면|지|니|든|고|잖|래|요)'
    },
    // `-ㄴ 것`: 관형어 뒤 `것` 은 늘 띄운다. `단것`·`어린것`·`날것` 같은 한 낱말이 걸리지 않게 앞 글자를 좁혔다.
    { id: 'neun-geot', spaceBefore: '것', wrong: '-는것', right: '-는 것', lookup: '것', source: '(?:는|던|된|운)것' },
    // `-게 되다`: `게` 로 끝나는 명사(가게·무게)에 `되다` 가 붙는 낱말은 없다.
    { id: 'ge-doeda', spaceBefore: '[되돼됐됩될된]', wrong: '-게되다', right: '-게 되다', lookup: '되다', source: '[가-힣]게(?:되|돼|됐|됩|될|된)' },
    // 관형사 `몇`·`여러`·`아무` 뒤 단위·명사는 띄운다. `몇몇`·`며칠`·`아무것`·`아무리`·`여러분` 은 한 낱말이라 꼴로 뺐다.
    { id: 'myeot-unit', spaceBefore: '(?:개|가지|번|명|시간|살|권|마리|장|층|학년|사람|년|달|주일|등)', wrong: '몇개', right: '몇 개', lookup: '몇', source: '몇(?:개|가지|번|명|시간|살|권|마리|장|층|학년|사람|년|달|주일|등)' },
    { id: 'yeoreo-gaji', spaceBefore: '(?:가지|개|번|명|사람|곳|나라|모로|날|색|종류)', wrong: '여러가지', right: '여러 가지', lookup: '여러', source: '여러(?:가지|개|번|명|사람|곳|나라|모로|날|색|종류)' },
    { id: 'amu-mal', spaceBefore: '(?:말|일|때|곳|사람|생각|소리|짓|이유|데)', wrong: '아무말', right: '아무 말', lookup: '아무', source: '아무(?:말|일|때|곳|사람|생각|소리|짓|이유|데)' },
    // 셈 관형사 + 단위: 뒤에 조사·띄어쓰기·끝이 와야만 잡는다 — `두개골`·`네가지금` 이 걸리지 않게. `한가지`(같은 것)는 한 낱말이라 뺐다.
    {
        id: 'number-unit', spaceBefore: '(?:개|가지|명|마리|권|장|살)',
        wrong: '두개',
        right: '두 개',
        lookup: '개',
        source: '(?:한(?=개|명|마리|권|장|살)|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(?:개|가지|명|마리|권|장|살)(?=[\\s.,!?을를이가은는도만씩에의와과로랑]|$)'
    },
    { id: 'ye-reul-deul', spaceBefore: '들', wrong: '예를들어', right: '예를 들어', lookup: '들다', source: '예를들' },
    { id: 'jal-moreu', spaceBefore: '모르', wrong: '잘모르다', right: '잘 모르다', lookup: '모르다', source: '잘모르' },
    { id: 'deon-jung', spaceBefore: '중', wrong: '-던중', right: '-던 중', lookup: '중', source: '(?:던|는)중(?=에|이|$|[\\s.,])' }
];

/**
 * 연구소처럼 별도 배포되는 학생 글쓰기 화면도 같은 빠른 규칙을 내려받아 쓸 수 있게 하는
 * 직렬화 전용 계약이다. 실제 검사는 아래의 결합 정규식을 그대로 사용한다.
 */
export const SPELLING_QUICK_DETECTION_RULES = Object.freeze(
    RULES.map((rule) => Object.freeze({ ...rule }))
);

/**
 * 규칙 하나에 괄호 하나씩을 붙여 통째로 이어 붙인다.
 * 규칙 수가 늘어도 글을 **한 번만** 훑으므로, 규칙 개수는 속도에 거의 영향을 주지 않는다.
 */
// RULES는 사용자 입력이 아닌 이 파일 안의 고정 리터럴만 포함한다.
// eslint-disable-next-line security/detect-non-literal-regexp -- 고정 규칙을 한 번의 탐색용 정규식으로 결합한다.
const COMBINED_PATTERN = new RegExp(RULES.map((rule) => `(${rule.source})`).join('|'), 'g');

export const SPELLING_DETECTION_RULE_COUNT = RULES.length;
export const SPELLING_DETECTION_ENTRY_IDS = Object.freeze([
    ...new Set(RULES.map((rule) => rule.entryId).filter(Boolean))
]);
/** 띄어쓰기 규칙이면 걸린 글자에 띄어쓰기를 넣은 꼴, 아니면 규칙의 `right`. */
const spacedRight = (rule, text) => {
    if (!rule.spaceBefore) return rule.right;
    let at = -1;
    // 고정 리터럴 규칙만 들어온다(위 RULES).
    // eslint-disable-next-line security/detect-non-literal-regexp -- 이 파일 안의 고정 규칙
    for (const found of text.matchAll(new RegExp(rule.spaceBefore, 'g'))) {
        if (found.index > 0) at = found.index;
    }
    return at > 0 ? `${text.slice(0, at)} ${text.slice(at)}` : rule.right;
};

/** 오류가 아주 많은 붙여넣기에서도 밑줄 DOM과 검사 시간이 끝없이 늘지 않게 한다. */
export const MAX_SPELLING_ISSUES = 50;

/**
 * 브라우저·키보드의 맞춤법 엔진과 관계없이 수첩 규칙으로 확인 가능한 위치를 찾는다.
 * 문맥에 따라 둘 다 맞을 수 있는 표현은 위 판정 기준에 따라 애초에 규칙에 없다.
 */
export const findSpellingIssues = (value, limit = MAX_SPELLING_ISSUES) => {
    const text = String(value || '');
    if (!text) return [];

    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : MAX_SPELLING_ISSUES;
    if (safeLimit === 0) return [];

    const issues = [];
    COMBINED_PATTERN.lastIndex = 0;

    let match = COMBINED_PATTERN.exec(text);
    while (match) {
        // 괄호 순서가 규칙 순서라 처음 채워진 괄호가 걸린 규칙이다.
        const ruleIndex = match.slice(1).findIndex((group) => group !== undefined);
        const rule = ruleIndex >= 0 ? RULES.at(ruleIndex) : null;
        if (rule) {
            issues.push({
                id: `${rule.id}-${match.index}`,
                ruleId: rule.id,
                entryId: rule.entryId || rule.id,
                label: rule.label || `${rule.wrong} / ${rule.right}`,
                start: match.index,
                end: match.index + match[0].length,
                text: match[0],
                wrong: rule.wrong,
                right: spacedRight(rule, match[0]),
                lookup: rule.lookup || rule.right
            });
            if (issues.length >= safeLimit) break;
        }

        // 길이 0으로 매치되는 규칙은 없지만, 만약 생기면 무한 반복을 막는다.
        if (match.index === COMBINED_PATTERN.lastIndex) COMBINED_PATTERN.lastIndex += 1;
        match = COMBINED_PATTERN.exec(text);
    }

    return issues;
};

/** 수첩 검색이 "이 문장에서 실제로 걸린 항목"을 위로 올릴 때 쓴다. */
export const findDetectedEntryIds = (value) => new Set(
    findSpellingIssues(value).map((issue) => issue.entryId)
);
