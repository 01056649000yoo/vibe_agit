import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('선생님만 읽기: 끄면 친구 댓글도 함께 꺼진다', async () => {
    const source = await readFile('src/modules/writing/mission-form/PeerReadingChoice.jsx', 'utf8');
    const match = source.match(/export const peerReadingPatch = [\s\S]*?\);\n/);
    assert.ok(match);
    // 순수 함수 하나라 그대로 꺼내 시험한다
    const peerReadingPatch = new Function(`${match[0].replace('export const', 'const')}; return peerReadingPatch;`)();
    assert.deepEqual(peerReadingPatch(false), { peer_reading_enabled: false, allow_comments: false });
    assert.deepEqual(peerReadingPatch(true), { peer_reading_enabled: true });
});

test('과제 만드는 화면 네 곳(일반·편지·보고서·시)이 같은 단추를 쓰고, 저장·불러오기·다시 내기가 값을 옮긴다', async () => {
    const forms = [
        'src/components/teacher/MissionForm.jsx',
        'src/modules/writing/mission-types/letter/LetterMissionForm.jsx',
        'src/modules/writing/mission-types/report/ReportMissionForm.jsx',
        'src/modules/writing/mission-types/poem/PoemMissionForm.jsx'
    ];
    for (const form of forms) {
        const source = await readFile(form, 'utf8');
        assert.match(source, /<PeerReadingChoice/, `${form} 에 선생님만 읽기 단추가 없다`);
        assert.match(source, /peer_reading_enabled/, `${form} 가 값을 다루지 않는다`);
    }
    for (const typeForm of forms.slice(1)) {
        const source = await readFile(typeForm, 'utf8');
        assert.match(source, /peer_reading_enabled: form\.peer_reading_enabled/, `${typeForm} 저장 값에 빠졌다`);
    }
    const manager = await readFile('src/hooks/useMissionManager.js', 'utf8');
    assert.equal((manager.match(/allow_comments, peer_reading_enabled/g) || []).length, 2, '과제 불러오기 두 곳');
    const past = await readFile('src/modules/writing/mission-form/pastMission.js', 'utf8');
    assert.match(past, /peer_reading_enabled/, '내가 낸 과제 다시 내기에 빠졌다');
});

test('서버가 정한다: 과제 글 공개 범위는 과제 설정에서, 설정을 바꾸면 이미 낸 글도 따라간다', async () => {
    const migration = await readFile('supabase/migrations/20261385_mission_teacher_only_reading.sql', 'utf8');
    assert.match(migration, /peer_reading_enabled BOOLEAN NOT NULL DEFAULT TRUE/);
    assert.match(migration, /m\.peer_reading_enabled = FALSE\)\s*THEN 'private'/);
    assert.match(migration, /AFTER UPDATE OF peer_reading_enabled ON public\.writing_missions/);
    assert.match(migration, /visibility IN \('class', 'private'\)/);
    const list = await readFile('supabase/migrations/20261386_student_mission_list_peer_reading.sql', 'utf8');
    assert.match(list, /mission\.peer_reading_enabled/);
    const card = await readFile('src/components/student/MissionList.jsx', 'utf8');
    assert.match(card, /mission\.peer_reading_enabled === false/);
    assert.match(card, /🔒 선생님만 읽어요/);
});

test('과제 만드는 화면 네 곳이 같은 틀(번호 단계 카드·아래 고정 줄·공용 스위치)을 쓴다', async () => {
    const forms = {
        'src/components/teacher/MissionForm.jsx': 4,
        'src/modules/writing/mission-types/letter/LetterMissionForm.jsx': 4,
        'src/modules/writing/mission-types/report/ReportMissionForm.jsx': 4,
        'src/modules/writing/mission-types/poem/PoemMissionForm.jsx': 4
    };
    for (const [form, steps] of Object.entries(forms)) {
        const source = await readFile(form, 'utf8');
        assert.equal((source.match(/<MissionFormStep\s/g) || []).length, steps, `${form} 는 단계 카드 ${steps}개`);
        assert.match(source, /<MissionFormActions/, `${form} 에 아래 고정 줄이 없다`);
        assert.match(source, /<PeerCommentSwitch/, `${form} 의 댓글 켜기가 공용 스위치가 아니다`);
        assert.match(source, /<RubricSettings[\s\S]{0,160}bare[\s\S]{0,160}rubric=/, `${form} 는 루브릭을 rubric= 로 넘긴다(편지가 value= 로 넘겨 켜지지 않던 일)`);
    }
    // 미션 태그는 ④ 평가와 관리 안에 있다(선생님 결정)
    const general = await readFile('src/components/teacher/MissionForm.jsx', 'utf8');
    assert.ok(general.indexOf('🏷️ 미션 태그') > general.indexOf('number={4}'), '미션 태그가 ④ 단계에 있어야 한다');
});
