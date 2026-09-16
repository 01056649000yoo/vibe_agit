import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [presentationPage, teacherEntry, classBoardCss] = await Promise.all([
    readFile('src/modules/tool/class-board/ClassBoardPresentationPage.jsx', 'utf8'),
    readFile('src/modules/tool/class-board/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/tool/class-board/classBoard.css', 'utf8')
]);

test('스크린 열기는 noopener 없이 새 탭을 먼저 열고 저장된 boardId로 이동한다', () => {
    const openScreen = teacherEntry.split('const openScreen = async () => {')[1].split('\n  };')[0];

    // noopener 옵션이 window.open에 없어야 WindowProxy 객체를 획득하여 이동할 수 있다.
    assert.doesNotMatch(openScreen, /window\.open\([^)]*noopener/);

    const openAt = openScreen.indexOf('window.open');
    const saveAt = openScreen.indexOf('await save()');
    assert.ok(openAt > -1 && saveAt > -1, '새 탭 열기와 저장이 모두 있어야 합니다.');
    assert.ok(openAt < saveAt, '저장을 기다린 뒤 새 탭을 열면 브라우저가 막습니다.');

    assert.match(openScreen, /target\.location\.replace\(`\/class-board\/\$\{boardId\}`\)/);
    assert.match(openScreen, /target\.close\(\)/);
});

test('발표 화면은 학급 스크린 목록을 로드하고 좌우 방향키로 전환한다', () => {
    // 학급 스크린 목록 로드
    assert.match(presentationPage, /classBoardApi\.getWorkspace\(data\.class\.id\)/);

    // 좌우키 이벤트 리스너
    assert.match(presentationPage, /event\.key === 'ArrowLeft'/);
    assert.match(presentationPage, /event\.key === 'ArrowRight'/);
    assert.match(presentationPage, /goToPrevBoard/);
    assert.match(presentationPage, /goToNextBoard/);

    // 브라우저 주소창 동기화 (전체화면 유지)
    assert.match(presentationPage, /window\.history\.pushState/);
    assert.match(presentationPage, /addEventListener\('popstate'/);

    // 상단 헤더 스위처 렌더링
    assert.match(presentationPage, /class-board-presentation-switcher/);
    assert.match(presentationPage, /goToPrevBoard/);
    assert.match(presentationPage, /goToNextBoard/);

    // CSS 스타일 선언
    assert.match(classBoardCss, /\.class-board-presentation-switcher/);
    assert.match(classBoardCss, /\.class-board-presentation-switcher__btn/);
    assert.match(classBoardCss, /\.class-board-presentation-switcher__title/);
});
