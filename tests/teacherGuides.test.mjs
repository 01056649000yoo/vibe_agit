import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TEACHER_GUIDES } from '../src/constants/teacherGuides.js';
import { getGenreEntries } from '../src/modules/writing/mission-types/genreCatalog.js';
import { LETTER_PAPERS } from '../src/modules/writing/mission-types/letter/letterPapers.js';

const guideText = (guide) => [
    guide.summary,
    ...(guide.steps || []),
    ...(guide.notes || []),
    ...(guide.sections || []).flatMap((section) => [
        section.label,
        section.summary,
        ...section.steps,
        ...section.notes
    ])
].join('\n');

test('모든 도움말은 화면이 그릴 수 있는 모양을 갖춘다', () => {
    // `TeacherGuideButton`은 `activeSection.steps.map`을 그냥 부른다.
    // 섹션에 steps 나 notes 가 없으면 도움말 창이 열리다 멈춘다.
    for (const [tabId, guide] of Object.entries(TEACHER_GUIDES)) {
        assert.ok(guide.title?.trim(), `${tabId}: 제목이 없다`);
        assert.ok(guide.summary?.trim(), `${tabId}: 한 줄 요약이 없다`);

        const sections = guide.sections || [];
        if (sections.length === 0) {
            assert.ok(Array.isArray(guide.steps) && guide.steps.length > 0, `${tabId}: 순서 안내가 없다`);
            assert.ok(Array.isArray(guide.notes) && guide.notes.length > 0, `${tabId}: 알아 둘 것이 없다`);
            continue;
        }

        const seenIds = new Set();
        for (const section of sections) {
            const where = `${tabId}/${section.id || '이름 없는 탭'}`;
            assert.ok(section.id?.trim(), `${tabId}: 탭 id 가 없다`);
            assert.ok(!seenIds.has(section.id), `${where}: 탭 id 가 겹친다`);
            seenIds.add(section.id);
            assert.ok(section.label?.trim(), `${where}: 탭 이름이 없다`);
            assert.ok(section.summary?.trim(), `${where}: 탭 요약이 없다`);
            assert.ok(Array.isArray(section.steps) && section.steps.length > 0, `${where}: 순서 안내가 없다`);
            assert.ok(Array.isArray(section.notes) && section.notes.length > 0, `${where}: 알아 둘 것이 없다`);
        }
    }
});

test('도움말이 말하는 글 종류·편지지 개수는 실제 목록과 같다', () => {
    // 개수를 손으로 적어 두면 종류가 늘어도 도움말만 옛말을 한다. 두 곳을 한 검사에서 본다.
    const text = guideText(TEACHER_GUIDES.dashboard);
    const entries = getGenreEntries();
    const templates = entries.filter((entry) => entry.missionTypeId);
    const basics = entries.filter((entry) => !entry.missionTypeId);

    assert.ok(text.includes(`${entries.length}가지 글`), `도움말은 글 종류를 ${entries.length}가지로 적어야 한다`);
    assert.ok(text.includes(`${templates.length}종`), `전용 틀 개수는 ${templates.length}종이어야 한다`);
    assert.ok(text.includes(`${basics.length}종`), `기본 글쓰기 개수는 ${basics.length}종이어야 한다`);
    assert.ok(text.includes(`편지지 ${LETTER_PAPERS.length}종`), `편지지는 ${LETTER_PAPERS.length}종이어야 한다`);

    for (const entry of entries) {
        assert.ok(text.includes(entry.id), `도움말에 '${entry.id}'이(가) 빠졌다`);
    }
});

test('선생님 과제 도움말은 핵심 기능을 네 탭으로 나눠 현재 운영 흐름을 안내한다', () => {
    const text = guideText(TEACHER_GUIDES.dashboard);
    const guideButton = readFileSync('src/components/teacher/TeacherGuideButton.jsx', 'utf8');
    const guideContent = readFileSync('src/components/teacher/TeacherGuideContent.jsx', 'utf8');

    assert.deepEqual(
        TEACHER_GUIDES.dashboard.sections.map(({ id, label }) => ({ id, label })),
        [
            { id: 'create', label: '과제 만들기' },
            { id: 'lab', label: '연구소 연결' },
            { id: 'review', label: '제출·피드백' },
            { id: 'complete', label: '승인·평가' }
        ]
    );
    assert.equal(TEACHER_GUIDES.dashboard.updates, undefined);
    assert.doesNotMatch(text, /추가되었습니다|최근 업데이트/);
    assert.match(text, /11가지 글/);
    assert.match(text, /전용 틀은 편지·시·관찰·조사 보고서·안건 의견 모으기 4종/);
    assert.match(text, /기본 글쓰기는 생활문·설명문·기사문·기행문·논설문·이야기\(동화\)·기타 7종/);
    assert.match(text, /계기교육용 편지지 7종.*15줄 빈 편지지/);
    assert.match(text, /연구소 좋은 질문 불러오기/);
    assert.match(text, /연구소 자료 연결/);
    assert.match(text, /글 개요짜기·좋은 질문 고르기·한줄모아/);
    assert.match(text, /학생에게 어떻게 보일까요/);
    assert.match(text, /기존 핵심 질문은 수정·삭제·전체 교체할 수 없습니다/);
    assert.match(text, /새 질문을 뒤에 추가/);
    assert.match(text, /다시 쓰기로 돌려보낸 뒤 아직 재제출하지 않은 글을 걷어오는/);
    assert.match(text, /되돌리기.*회수한 글을 학생에게 다시 보내/);
    assert.match(text, /평가하기/);
    assert.match(text, /리포트/);
    assert.match(guideButton, /<TeacherGuideContent[\s\S]*guide=\{guide\}/);
    assert.match(guideContent, /guide\?\.sections \|\| \[\]/);
    assert.match(guideContent, /role="tablist"[\s\S]*role="tab"[\s\S]*aria-selected/);
    assert.match(guideContent, /role=\{sections\.length > 0 \? 'tabpanel' : undefined\}/);
    assert.doesNotMatch(guideButton, /최근 업데이트|guide\.updates/);
});

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

test('오늘 바뀐 교사 메뉴 도움말은 현재 화면의 사용 흐름을 함께 안내한다', () => {
    const dashboard = guideText(TEACHER_GUIDES.dashboard);
    const comments = guideText(TEACHER_GUIDES.comments);
    const mealBoard = guideText(TEACHER_GUIDES['meal-board']);
    const tools = guideText(TEACHER_GUIDES.tools);

    assert.match(dashboard, /기본값인 `전체 활성 글 과제`.*학생별 표로 합산/);
    assert.match(dashboard, /특정 미션[\s\S]*24명을 한눈에 볼 수 있는 상태 색상 카드/);
    assert.match(dashboard, /실시간 크게 보기.*6×4 확대 화면/);
    assert.match(dashboard, /12초 자동 갱신.*첫 제출.*다시 제출.*3회 제출/);
    assert.match(dashboard, /최근 제출 행을 누르면 해당 글이 바로 열/);

    assert.match(comments, /`처리할 것`.*기간 제한 없이/);
    assert.match(comments, /`기록`.*최근 7일.*최근 3일·2주·30일·전체/);
    assert.match(comments, /`새로고침` 중에는 보고 있던 목록을 유지.*현재 탭·기간·검색어/);
    assert.match(comments, /`더 보기`.*같은 조건의 다음 댓글/);
    assert.match(comments, /이전 조건에서 늦게 도착한 목록이나 `더 보기` 결과는 섞이지 않/);

    assert.match(mealBoard, /가입할 때 선택한 학교의 급식이 자동으로 연결/);
    assert.match(mealBoard, /`현재 학급만` 또는 `내 기본 학교로 저장`/);
    assert.match(mealBoard, /기본으로 접혀 있는 `우리 반 비고`/);
    assert.match(mealBoard, /전체화면 보기.*학생 이름과 비고가 포함되지 않/);
    assert.match(tools, /수업과 학급 운영 중 바로 사용하는/);
    assert.match(tools, /`URL 단축하기`.*쌤링크/);
    assert.match(tools, /`얘들아, 밥 먹자!`.*학생 정보가 빠진 급식판/);
});

test('오늘 확장한 어휘·칭호·학급 발자국 도움말은 실제 집계와 운영 규칙을 설명한다', () => {
    const vocab = guideText(TEACHER_GUIDES['vocab-tower']);
    const footprints = guideText(TEACHER_GUIDES.footprints);
    const dragon = guideText(TEACHER_GUIDES.dragon);

    assert.match(vocab, /같은 형태만 반복해 맞히면 연습 중/);
    assert.match(vocab, /틀리거나 힌트를 쓰면 연속 정답은 다시 0/);
    assert.match(vocab, /낮은 층.*선택형.*높은 층.*직접 입력/);
    assert.match(vocab, /보통 \*\*3일 뒤\*\*.*보통 \*\*14일 뒤\*\*/);
    assert.match(vocab, /맞힌 낱말은 반복 출제하지 않/);

    assert.match(footprints, /맨 위 12개 숫자/);
    for (const label of ['과제 글', '독서록', '일기', '학급 활동일', '활동 포인트', '교사 조정']) {
        assert.ok(footprints.includes(label), `학급 발자국 도움말에 '${label}'이 없다`);
    }
    assert.match(footprints, /교사 승인 시각.*완료본 생성 시각/);
    assert.match(footprints, /다시쓰기·수정 제출·교사 피드백/);
    assert.match(footprints, /시작 보너스는 활동 포인트에서 제외/);

    assert.match(dragon, /작가·소통·기록가·독서가 단계/);
    assert.match(dragon, /기록가·독서가 2~7단계 보상.*종목별 총 5,000P/);
    assert.match(dragon, /자동 지급되지 않고.*받을 보상 모두 받기/);
    assert.match(dragon, /시즌 종료.*미수령 보상.*받을 수 없/);
});
