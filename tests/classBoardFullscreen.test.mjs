import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/*
 * 전체화면이 저절로 들어가고 풀리던 것(2026-09-29 선생님 요청으로 점검).
 *   1) 발표 화면이 스크린 내용이 바뀔 때마다(자동 저장·탭 넘기기) 전체화면을 다시 시도했다.
 *   2) 브라우저 기본 창(confirm·prompt·alert)은 크롬에서 전체화면을 강제로 푼다(크롬으로 확인).
 *   3) 급식판 단축 요청이 처리되지 못하고 남아, 나중에 메뉴로 열어도 저절로 전체화면이 됐다(headerToolShortcut 검사).
 */

const CLASS_BOARD = 'src/modules/tool/class-board';

const collect = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? collect(full) : [full];
});

test('발표 화면에서 열리는 부품은 브라우저 기본 창을 쓰지 않는다(전체화면이 풀린다)', () => {
    // 발표 화면 본체·편집 도구·위젯(알림장 쓰기 포함)·배치 틀. 학급운영도구 편집 화면(TeacherEntry)은 전체화면이 아니라 뺀다.
    const files = [
        `${CLASS_BOARD}/ClassBoardPresentationPage.jsx`,
        ...collect(`${CLASS_BOARD}/presentation`),
        ...collect(`${CLASS_BOARD}/widgets`),
        ...collect(`${CLASS_BOARD}/host`),
    ].filter((file) => /\.(jsx?|mjs)$/.test(file));
    const offenders = files.filter((file) => /\bwindow\.(confirm|prompt|alert)\s*\(/.test(readFileSync(file, 'utf8')));
    assert.deepEqual(offenders, [], '앱 안 확인 창(useConfirmDialog)을 쓰세요');
    const page = readFileSync(`${CLASS_BOARD}/ClassBoardPresentationPage.jsx`, 'utf8');
    assert.match(page, /const \{ ask, confirmDialog \} = useConfirmDialog\(\);/);
    assert.match(page, /\{confirmDialog\}\s*\n\s*<\/main>/);
    const composer = readFileSync(`${CLASS_BOARD}/widgets/notice-board/NoticeComposer.jsx`, 'utf8');
    assert.match(composer, /\{confirmDialog\}/);
    assert.match(composer, /class-board-notice-composer__template-name/, '서식 이름은 그 줄 안에서 받는다');
});

test('자동 전체화면은 창을 처음 열 때 한 번만 시도하고 주소 표시를 지운다', () => {
    const page = readFileSync(`${CLASS_BOARD}/ClassBoardPresentationPage.jsx`, 'utf8');
    const effect = page.slice(page.indexOf('if (!autoFullscreen'), page.indexOf('const toggleFullscreen'));
    assert.match(effect, /autoFullscreenTriedRef\.current\) return undefined;\s*\n\s*autoFullscreenTriedRef\.current = true;/);
    assert.match(effect, /url\.searchParams\.delete\('fullscreen'\)[\s\S]*window\.history\.replaceState/);
    // 주소를 지운 뒤에 요청한다 — 탭을 넘길 때 주소가 이어져 다음 스크린에서 다시 시도하지 않게.
    assert.ok(effect.indexOf("searchParams.delete('fullscreen')") < effect.indexOf('requestFullscreen()'));
});

test('전체화면에서는 Esc 를 브라우저가 먼저 가져가므로 알림장 쓰기는 `닫기` 단추로 안내한다', () => {
    const page = readFileSync(`${CLASS_BOARD}/ClassBoardPresentationPage.jsx`, 'utf8');
    assert.match(page, /\{fullscreen \? '닫기' : '닫기 \(Esc\)'\}/);
    const guides = readFileSync('src/constants/teacherGuides.js', 'utf8');
    assert.match(guides, /전체화면에서는 Esc 를 누르면 브라우저가 먼저 전체화면을 풉니다/);
});
