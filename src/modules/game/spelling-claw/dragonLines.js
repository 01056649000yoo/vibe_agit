/**
 * 수호룡이 내는 맞춤법 문제의 말(2026-10-01). 학생이 키운 수호룡이 단계에 따라 말투를 바꾼다
 * (알 → 해츨링 → 자란 수호룡). 그림 단계는 `dragon/presentation.js` 의 getDragonStage 가 정한다.
 */
const TONES = {
    // 알: 아직 말을 못 해 알 속에서 소리만 들린다.
    egg: {
        ask: { choose: '(톡톡) …바른 말은 어느 쪽일까?', blankChoose: '(톡톡) …빈칸에 무엇이 들어갈까?', fixWrite: '(톡톡) …틀린 곳을 고쳐 줄래?', spacingWrite: '(톡톡) …띄어쓰기를 고쳐 줄래?' },
        right: '(알이 기쁘게 흔들린다!)', wrong: '(알이 갸우뚱한다…) 이렇게 쓰는 거래:', pass: '(알이 반짝!) 코인이 굴러 나왔어!'
    },
    // 해츨링: 짧고 귀여운 말.
    hatchling: {
        ask: { choose: '바른 말을 골라 줘!', blankChoose: '빈칸에 들어갈 말은 뭘까?', fixWrite: '틀린 곳이 있어! 고쳐 써 줘!', spacingWrite: '띄어쓰기가 이상해! 고쳐 줘!' },
        right: '맞았어! 역시 작가야!', wrong: '앗, 아쉬워! 이렇게 쓰는 거야:', pass: '와! 코인을 줄게!'
    },
    // 자란 수호룡: 차분하게 가르쳐 준다.
    grown: {
        ask: { choose: '어느 쪽이 바른 말인지 골라 보렴.', blankChoose: '빈칸에 알맞은 말을 골라 보렴.', fixWrite: '틀린 곳을 찾아 바르게 고쳐 쓰렴.', spacingWrite: '띄어쓰기를 바르게 고쳐 쓰렴.' },
        right: '훌륭하구나. 바른 글이 수호룡을 빛나게 해.', wrong: '괜찮아, 이렇게 쓰면 된단다:', pass: '잘 해냈구나. 이 코인을 받으렴.'
    }
};

export const dragonToneOf = (form) => (form === 'egg' || form === 'egg-awake' ? 'egg'
    : form === 'hatchling' ? 'hatchling' : 'grown');

export const dragonLine = (form, key, questionType) => {
    const tone = Reflect.get(TONES, dragonToneOf(form));
    if (key === 'ask') return Reflect.get(tone.ask, questionType) || tone.ask.choose;
    return Reflect.get(tone, key) || '';
};
