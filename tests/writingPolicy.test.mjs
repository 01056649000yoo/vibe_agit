import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateWritingReward,
    evaluateWritingPolicy,
    getWritingPolicyError,
    measureWritingContent,
    normalizeWritingPolicy,
    READING_LOG_POLICY_DEFAULTS,
    writingPolicyFromMission
} from '../src/modules/writing/policy/writingPolicy.js';

test('공백은 글자 수에 포함하고 보이지 않는 서식 문자는 제외한다', () => {
    assert.deepEqual(measureWritingContent('한 줄\u200B 글\n\n둘째 줄'), {
        charCount: 11,
        paragraphCount: 2
    });
});

test('독서록 기본 정책은 200자·1문단·100P·하루 1편이다', () => {
    assert.deepEqual(normalizeWritingPolicy(READING_LOG_POLICY_DEFAULTS), {
        is_enabled: true,
        min_chars: 200,
        min_paragraphs: 1,
        base_reward: 100,
        bonus_enabled: false,
        bonus_threshold: 0,
        bonus_reward: 0,
        repeat_bonus_enabled: false,
        repeat_bonus_threshold: 0,
        repeat_bonus_reward: 0,
        repeat_bonus_max_count: 0,
        daily_reward_limit: 1
    });
});

test('글자와 문단 중 하나라도 부족하면 완료할 수 없다', () => {
    const evaluation = evaluateWritingPolicy(
        { min_chars: 100, min_paragraphs: 2 },
        { charCount: 99, paragraphCount: 1 }
    );
    assert.equal(evaluation.complete, false);
    assert.match(getWritingPolicyError(evaluation), /100자/);
});

test('장르 입력 틀이 문단 검사를 맡으면 공용 문단 검사를 건너뛴다', () => {
    const evaluation = evaluateWritingPolicy(
        { min_chars: 10, min_paragraphs: 5 },
        { charCount: 10, paragraphCount: 0 },
        { skipParagraphValidation: true, unitLabel: '연' }
    );
    assert.equal(evaluation.complete, true);
});

test('추가 분량 보너스는 최소 글자와 추가 기준을 모두 넘을 때만 계산한다', () => {
    const policy = {
        min_chars: 100,
        base_reward: 50,
        bonus_enabled: true,
        bonus_threshold: 100,
        bonus_reward: 20
    };
    assert.equal(calculateWritingReward(policy, { charCount: 199 }).total, 50);
    assert.deepEqual(calculateWritingReward(policy, { charCount: 200 }), {
        total: 70,
        base: 50,
        bonus: 20,
        bonusAchieved: true,
        repeatBonus: 0,
        repeatCount: 0,
        repeatStartsAt: 200
    });
});

test('과제 승인 보상은 제출 당시 저장된 보상값을 우선한다', () => {
    const policy = writingPolicyFromMission(
        { min_chars: 100, min_paragraphs: 1, base_reward: 100, bonus_threshold: 100, bonus_reward: 10 },
        { awarded_base_reward: 80, awarded_bonus_threshold: 50, awarded_bonus_reward: 5 }
    );
    assert.equal(calculateWritingReward(policy, { charCount: 150 }).total, 85);
});

test('반복 보너스는 현행 추가 보너스 기준 뒤부터 구간별로 최대 횟수까지만 계산한다', () => {
    const policy = {
        min_chars: 300,
        base_reward: 100,
        bonus_enabled: true,
        bonus_threshold: 200,
        bonus_reward: 30,
        repeat_bonus_enabled: true,
        repeat_bonus_threshold: 200,
        repeat_bonus_reward: 10,
        repeat_bonus_max_count: 3
    };
    assert.equal(calculateWritingReward(policy, { charCount: 499 }).total, 100);
    assert.equal(calculateWritingReward(policy, { charCount: 500 }).total, 130);
    assert.deepEqual(calculateWritingReward(policy, { charCount: 900 }), {
        total: 150,
        base: 100,
        bonus: 30,
        bonusAchieved: true,
        repeatBonus: 20,
        repeatCount: 2,
        repeatStartsAt: 500
    });
    assert.equal(calculateWritingReward(policy, { charCount: 1500 }).total, 160);
});

test('완료조건·포인트 설정은 넓은 화면에서 묶음을 나란히 편다', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile('src/modules/writing/policy/writingPolicy.css', 'utf8');

    /*
     * 2026-09-03: 묶음이 한 열로만 쌓여 오른쪽이 비고 화면만 길어졌다.
     * 실측 1,080px 폭에서 801px → 426px로 줄었다. 다시 한 열로 되돌아가지 않게 못 박는다.
     */
    assert.match(css, /\.writing-policy-fields \{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(360px,1fr\)\)/);
    // 묶음마다 칸 수가 둘 또는 셋이라 안쪽도 자리에 맞게 접혀야 한다.
    assert.match(css, /\.writing-policy-fields__grid \{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(130px,1fr\)\)/);
    // `문단`·`자마다` 같은 단위가 두 줄로 깨지지 않아야 한다.
    assert.match(css, /\.writing-policy-field__input strong \{[^}]*white-space:nowrap/);
});

test('독서마라톤 진행 화면은 짧은 칸 아래를 비우지 않고 겹친 여백을 줄인다', async () => {
    const { readFile } = await import('node:fs/promises');
    const css = await readFile('src/modules/writing/reading-log/marathon/readingMarathon.css', 'utf8');

    /*
     * 2026-09-03: 두 순위 칸을 늘여 높이를 맞추는 바람에 짧은 쪽 아래가 133px 비어 있었다.
     * 각자 내용만큼만 차지하게 바꾸니 14px로 줄었다. 되돌아가면 다시 빈다.
     */
    assert.match(css, /\.reading-marathon-settings__tracks \{[^}]*align-items: start/);

    /*
     * 바깥 상자 · 구획 · 안쪽 카드가 겹쳐 글이 시작하는 자리가 69px 안쪽이었다(실측).
     * 세 단계를 조금씩 줄여 56px로 당겼다. 한 단계라도 되돌리면 다시 밀린다.
     */
    assert.match(css, /\.reading-marathon-settings \{ padding: clamp\(16px, 2vw, 22px\); \}/);
    assert.match(css, /padding: clamp\(14px, 1\.8vw, 18px\)/);
    assert.match(css, /\.reading-marathon-settings__tracks > section \{[^}]*padding: 13px/);
});

test('독서마라톤 교사 화면은 반 전체 위치를 보여 주되 학생 화면과 섞지 않는다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [course, screen, css] = await Promise.all([
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonClassCourse.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/readingMarathon.css', 'utf8')
    ]);

    /*
     * 학생 화면은 달리는 사람이 하나뿐이다. 반 전체 위치는 교사만 보는 것이라
     * `학생에게 이렇게 보여요` 안에 넣으면 그 구획의 제목이 거짓말이 된다.
     * 반드시 `현재 운영 현황` 쪽에 있어야 한다.
     */
    assert.match(screen, /reading-marathon-overview[\s\S]*<ReadingMarathonClassCourse[\s\S]*<\/section>[\s\S]*reading-marathon-student-preview/);
    assert.match(course, /교사 확인용 · 학생 화면에는 나오지 않습니다/);

    // 새로 읽는 자료 없이 이미 받아 둔 순위표만 쓴다.
    assert.match(screen, /leaderboard=\{snapshot\?\.leaderboard\}/);
    assert.doesNotMatch(course, /supabase|rpc\(|fetch\(/);

    // 굽은 코스는 위아래로 자리를 크게 먹어 곧은 트랙으로 그린다.
    assert.doesNotMatch(course, /getCoursePosition/);
    assert.match(course, /const MAX_ROWS = 4/);

    // 학생 화면 확인은 접어 두고 필요할 때만 편다.
    assert.match(screen, /<details className="reading-marathon-student-preview"/);
    assert.match(screen, /<summary className="reading-marathon-section-heading"/);
    assert.match(css, /\.reading-marathon-student-preview > summary::after \{[^}]*펼쳐 보기/);
    assert.match(css, /\.reading-marathon-student-preview\[open\] > summary::after \{[^}]*접기/);
});
