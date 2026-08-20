import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TEACHER_GUIDES } from '../src/constants/teacherGuides.js';

const guideText = (guide) => [guide.summary, ...guide.steps, ...guide.notes].join('\n');

test('독서록 도움말은 교사 확인 보상과 학생별 책장 내보내기를 안내한다', () => {
    const text = guideText(TEACHER_GUIDES['reading-logs']);

    assert.match(text, /포인트는 교사가 확인한 글에만 지급/);
    assert.match(text, /학생별 책장/);
    assert.match(text, /독서록 모음 내보내기/);
    assert.match(text, /엑셀·PDF 또는 구글 문서/);
    assert.match(text, /확인 독서록 전체 내보내기/);
    assert.match(text, /독서록 완료조건\/포인트/);
    assert.doesNotMatch(text, /독서마라톤|모둠 대항전|마라톤 거리|쪽수 미확인/);
    assert.doesNotMatch(text, /학생 완료 시점에 지급/);
});

test('독서록 이벤트 안내는 독서마라톤 운영 내용을 별도로 모아 안내한다', () => {
    const text = guideText(TEACHER_GUIDES['reading-events']);

    assert.match(text, /개인전·우리 반 전체전·모둠 대항전/);
    assert.match(text, /교사가 확인 완료한 독서록만 마라톤 거리에 반영/);
    assert.match(text, /쪽수 정보가 없어도 독서록 저장·교사 확인·포인트 지급은 정상적으로 진행/);
    assert.match(text, /페이지 정보 확인이 필요한 책/);
    assert.match(text, /쪽수 미확인 책은 0쪽으로 계산하지 않으며/);
    assert.match(text, /모둠을 추가하거나 삭제하면.*자동으로 균등 배정/);
    assert.match(text, /랜덤 배정.*인원 차이를 최대 1명/);
    assert.match(text, /선택 상자로 학생을 직접 옮길/);
    assert.match(text, /균등 재배정 \/ 랜덤 배정 \/ 직접 배정/);
    assert.match(text, /크게 보기.*배정 결과를 함께 확인/);
    assert.match(text, /우리 모둠 거리.*모둠 순위.*자기 기여 거리/);
    assert.match(text, /초안 저장하기.*학생 배정 확인하고 시작하기/);
    assert.match(text, /첫 독서 기록이 반영된 뒤.*배정이 고정/);
    assert.match(text, /팀이 목표를 완주하고 학생이 교사가 정한 개인 최소 요건까지 충족/);
    assert.match(text, /개인전 메달과 단체전 메달은 서로 다른 디자인/);
});

test('학생 독서록 화면은 일반 도움말 오른쪽에 이벤트 안내 아이콘을 둔다', () => {
    const source = readFileSync(
        'src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx',
        'utf8'
    );

    assert.match(
        source,
        /TeacherGuideButton tabId="reading-logs" variant="help"\s*\/>\s*<TeacherGuideButton tabId="reading-events"\s*\/>/
    );
});

test('일기 도움말은 교사 확인 보상과 학생별 책장 내보내기를 안내한다', () => {
    const text = guideText(TEACHER_GUIDES.diaries);

    assert.match(text, /포인트는 교사가 확인한 글에만 지급/);
    assert.match(text, /학생별 책장/);
    assert.match(text, /일기 모음 내보내기/);
    assert.match(text, /엑셀·PDF 또는 구글 문서/);
    assert.match(text, /나의 아지트 → 일기 책장.*읽기 전용으로 계속 남/);
    assert.match(text, /내용·제목·공개 범위를 수정하거나 삭제할 수 없/);
    assert.match(text, /친구 공개.*교사 확인 후에도 친구들이.*일기 책장/);
    assert.match(text, /나만 보기.*작성 학생과 교사만 볼 수/);
    assert.doesNotMatch(text, /교사 확인 전에 이미 처리/);
});
