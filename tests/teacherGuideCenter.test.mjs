import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { TEACHER_NAV_GROUPS } from '../src/constants/teacherNav.js';
import { TEACHER_GUIDES } from '../src/constants/teacherGuides.js';
import {
    TEACHER_GUIDE_JOURNEYS,
    getJourneysForGuide
} from '../src/guides/teacherGuideJourneys.js';
import {
    TEACHER_GUIDE_TARGETS,
    getTeacherGuideSection
} from '../src/guides/teacherGuideRegistry.js';

const centerSource = readFileSync('src/components/teacher/TeacherGuideCenter.jsx', 'utf8');
const contentSource = readFileSync('src/components/teacher/TeacherGuideContent.jsx', 'utf8');
const buttonSource = readFileSync('src/components/teacher/TeacherGuideButton.jsx', 'utf8');
const dashboardSource = readFileSync('src/components/teacher/TeacherDashboard.jsx', 'utf8');
const settingsSource = readFileSync('src/components/teacher/TeacherSettingsHub.jsx', 'utf8');
const toolsSource = readFileSync('src/components/teacher/TeachingToolsHub.jsx', 'utf8');
const gamesSource = readFileSync('src/modules/game/teacher/RegisteredGameModuleCards.jsx', 'utf8');
const registrySource = readFileSync('src/modules/registry.js', 'utf8');

test('활용 안내서는 교사의 목적에 따른 여덟 개 큰 흐름을 제공한다', () => {
    assert.equal(TEACHER_GUIDE_JOURNEYS.length, 8);
    assert.deepEqual(
        TEACHER_GUIDE_JOURNEYS.map(({ id }) => id),
        [
            'getting-started',
            'first-writing-class',
            'self-writing',
            'spelling-and-ai',
            'class-operations',
            'motivation',
            'evaluation-records',
            'term-closing'
        ]
    );

    for (const journey of TEACHER_GUIDE_JOURNEYS) {
        assert.ok(journey.title?.trim(), `${journey.id}: 제목이 없다`);
        assert.ok(journey.summary?.trim(), `${journey.id}: 큰 흐름 설명이 없다`);
        assert.ok(journey.estimatedTime?.trim(), `${journey.id}: 예상 사용 시점이 없다`);
        assert.ok(journey.steps.length >= 2, `${journey.id}: 단계가 너무 적다`);

        const stepIds = new Set();
        for (const journeyStep of journey.steps) {
            assert.ok(!stepIds.has(journeyStep.id), `${journey.id}: ${journeyStep.id} 단계가 겹친다`);
            stepIds.add(journeyStep.id);
            assert.ok(journeyStep.title?.trim(), `${journey.id}/${journeyStep.id}: 단계 제목이 없다`);
            assert.ok(journeyStep.purpose?.trim(), `${journey.id}/${journeyStep.id}: 큰 목적 설명이 없다`);
            assert.ok(TEACHER_GUIDES[journeyStep.guideRef], `${journey.id}/${journeyStep.id}: 존재하지 않는 도움말 참조`);
            assert.deepEqual(journeyStep.target, TEACHER_GUIDE_TARGETS[journeyStep.guideRef]);
            assert.equal(journeyStep.steps, undefined, `${journey.id}/${journeyStep.id}: 상세 순서를 안내서에 복사하면 안 된다`);
            assert.equal(journeyStep.notes, undefined, `${journey.id}/${journeyStep.id}: 상세 주의사항을 안내서에 복사하면 안 된다`);
            if (journeyStep.sectionRef) {
                assert.ok(
                    getTeacherGuideSection(journeyStep.guideRef, journeyStep.sectionRef),
                    `${journey.id}/${journeyStep.id}: 존재하지 않는 도움말 세부 탭 참조`
                );
            }
        }
    }
});

test('교사 도움말 26개는 빠짐없이 활용 안내서의 큰 흐름과 연결된다', () => {
    // 개수를 못 박는 이유는 도움말이 조용히 사라지는 것을 잡기 위해서다.
    // 아래 반복문이 "새로 넣고 연결 안 함"을 잡고, 이 숫자가 "있던 것이 없어짐"을 잡는다.
    assert.equal(Object.keys(TEACHER_GUIDES).length, 26);
    for (const guideId of Object.keys(TEACHER_GUIDES)) {
        assert.ok(getJourneysForGuide(guideId).length > 0, `${guideId}: 연결된 활용 안내서가 없다`);
        assert.ok(TEACHER_GUIDE_TARGETS[guideId], `${guideId}: 실제 화면 이동 대상이 없다`);
    }
});

test('도움말 화면 이동 대상은 실제 교사 탭과 등록 모듈만 사용한다', () => {
    const teacherTabs = new Set(TEACHER_NAV_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.id)));
    for (const [guideId, target] of Object.entries(TEACHER_GUIDE_TARGETS)) {
        assert.ok(teacherTabs.has(target.tab), `${guideId}: 존재하지 않는 교사 탭 ${target.tab}`);
        if (target.section?.startsWith('module:')) {
            const moduleId = target.section.slice('module:'.length);
            assert.match(registrySource, new RegExp(`/${moduleId}/manifest`), `${guideId}: 설정 모듈이 등록되지 않았다`);
        }
        if (target.tool) {
            assert.match(registrySource, new RegExp(`/${target.tool}/manifest`), `${guideId}: 수업 도구가 등록되지 않았다`);
        }
        if (target.module) {
            assert.match(registrySource, new RegExp(`/${target.module}/manifest`), `${guideId}: 놀이 모듈이 등록되지 않았다`);
        }
    }
});

test('탭 도움말과 활용 안내서는 같은 공용 도움말 렌더러를 사용한다', () => {
    assert.match(buttonSource, /<TeacherGuideContent[\s\S]*guide=\{guide\}/);
    assert.match(centerSource, /<TeacherGuideContent[\s\S]*guide=\{guide\}[\s\S]*initialSectionId/);
    assert.match(contentSource, /activeSection\.steps\.map/);
    assert.match(contentSource, /activeSection\.notes\.map/);
    assert.doesNotMatch(centerSource, /journeyStep\.steps|journeyStep\.notes/);
    assert.match(buttonSource, /openTeacherGuideCenter/);
    assert.match(buttonSource, /활용 안내서에서 전체 흐름 보기/);
});

test('활용 안내서는 지연 로딩되고 설정·도구·놀이터 안쪽 화면으로 이동한다', () => {
    assert.match(dashboardSource, /lazy\(\(\) => import\('\.\/TeacherGuideCenter'\)\)/);
    assert.match(dashboardSource, /text="활용 안내서"/);
    assert.match(dashboardSource, /TEACHER_GUIDE_CENTER_OPEN_EVENT/);
    assert.match(dashboardSource, /onNavigate=\{handleWorkspaceNavigate\}/);
    assert.match(settingsSource, /navigationTarget\?\.tab !== 'settings'/);
    assert.match(settingsSource, /setSection\(navigationTarget\.section\)/);
    assert.match(toolsSource, /navigationTarget\?\.tab !== 'tools'/);
    assert.match(toolsSource, /setSelectedId\(navigationTarget\.tool\)/);
    assert.match(gamesSource, /navigationTarget\?\.tab !== 'playground'/);
    assert.match(gamesSource, /setSelectedId\(navigationTarget\.module\)/);
});

test('활용 안내서는 접근 가능한 전체 화면 창이며 별도 데이터 요청을 시작하지 않는다', () => {
    assert.match(centerSource, /role="dialog"/);
    assert.match(centerSource, /aria-modal="true"/);
    assert.match(centerSource, /aria-labelledby=\{titleId\}/);
    assert.match(centerSource, /event\.key === 'Escape'/);
    assert.match(centerSource, /event\.key !== 'Tab'/);
    assert.match(centerSource, /aria-expanded=\{expanded\}/);
    assert.match(centerSource, /aria-controls=\{panelId\}/);
    assert.doesNotMatch(centerSource, /supabase|\.rpc\(|\.from\(|fetch\(|setInterval|postgres_changes/);
});
