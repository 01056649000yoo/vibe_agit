import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { TEACHER_TOURS, getTeacherTourSteps, TEACHER_TOUR_ANCHORS } from '../src/guides/teacherTour.js';

test('동행 모드가 짚는 자리가 화면에 다 있다', () => {
    /*
     * 2026-09-14 머리말·메뉴 정리 때 물었던 것: 메뉴를 손대면 동행 모드가 깨지나.
     * 35단계 중 24단계가 머리말과 업무 메뉴를 짚는다. 숨은 단추에는 테두리를 씌울 수 없어
     * 그 단계에서 선생님이 갇힌다. 그래서 **자리가 사라졌는지**를 기계가 본다.
     *
     * 생김새(색·간격·배경)를 바꾸는 것은 안전하다. 위험한 것은 **접어 넣거나 지우는 것**이다.
     */
const walk = (dir) => readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : [full];
    });
    /*
     * **개발용 시안(`src/dev`)은 세지 않는다.** 거기에도 같은 자리를 심어 두어서, 함께 세면
     * 진짜 화면에서 자리가 사라져도 시안 덕분에 검사가 통과한다(2026-09-14 확인).
     */
    const sources = walk('src').filter((file) => /\.jsx?$/.test(file) && !file.startsWith(`src${path.sep}dev${path.sep}`))
        .map((file) => readFileSync(file, 'utf8')).join('\n');
    
    
    const anchors = new Set();
    TEACHER_TOURS.forEach((tour) => getTeacherTourSteps(tour.id).forEach((step) => {
        if (step.anchor) anchors.add(step.anchor);
        if (step.fallbackAnchor) anchors.add(step.fallbackAnchor);
    }));
    
    // 화면이 심는 자리: 손으로 적은 것 + 만들어 붙이는 것(tabAnchorId 등)
    const literal = new Set([...sources.matchAll(/tourAnchor\('([^']+)'\)/g)].map((m) => m[1]));
    const helpers = new Set([...sources.matchAll(/tourAnchor\((tabAnchorId|toolAnchorId|moduleAnchorId|launchAnchorId|sectionAnchorId|neighborSpaceAnchorId)\(/g)].map((m) => m[1]));
    const constants = new Set([...sources.matchAll(/tourAnchor\(TEACHER_TOUR_ANCHORS\.([A-Z_]+)\)/g)].map((m) => m[1]));
    
    constants.forEach((name) => literal.add(TEACHER_TOUR_ANCHORS[name]));
    
    const kindOf = (anchor) => anchor.includes(':') ? anchor.split(':')[0] : 'literal';
    const helperFor = { tab: 'tabAnchorId', tool: 'toolAnchorId', module: 'moduleAnchorId', launch: 'launchAnchorId', section: 'sectionAnchorId', 'neighbor-space': 'neighborSpaceAnchorId' };
    
    const missing = [...anchors].filter((anchor) => {
        const kind = kindOf(anchor);
        if (kind === 'literal') return !literal.has(anchor);
        return !helpers.has(helperFor[kind]);
    });

    assert.equal(missing.length, 0, `화면에서 못 찾은 자리: ${missing.join(', ')}`);
    // 머리말·업무 메뉴의 자리는 대시보드 그 파일에 있어야 한다. 시안이 대신해 주지 못한다.
    const dashboard = readFileSync('src/components/teacher/TeacherDashboard.jsx', 'utf8');
    assert.match(dashboard, /tourAnchor\(TEACHER_TOUR_ANCHORS\.CLASS_BOARD_OPEN\)/);
    assert.match(dashboard, /tourAnchor\(tabAnchorId\(group\.defaultTab\)\)/);
    assert.ok(literal.has(TEACHER_TOUR_ANCHORS.CLASS_BOARD_OPEN), '우리 반 스크린 자리가 사라졌습니다.');
});
