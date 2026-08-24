/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(`src/modules/tool/classroom-arrangement/${path}`, 'utf8');

/*
 * 2026-08-24: 자리·역할 뽑기를 시작하면 끝날 때까지 멈출 방법이 없었다.
 * 창에는 "추첨이 끝날 때까지 창을 그대로 두세요" 만 있었다.
 * 수업 중에 잘못 시작하면 다 끝나기를 기다려야 했다.
 *
 * ⚠️ 자리와 역할은 **같은 구조를 두 벌 갖고 있다**. 한쪽만 고치면 다른 쪽이 그대로 남으므로
 * 이 검사는 두 벌을 **한꺼번에** 본다(검사를 쪼개면 반쪽 수정을 못 잡는다).
 */

const PAIRS = [
    { screen: 'SeatArrangement.jsx', modal: 'SeatLotteryModal.jsx', what: '자리' },
    { screen: 'RoleArrangement.jsx', modal: 'RoleLotteryModal.jsx', what: '역할' }
];

test('자리·역할 뽑기 모두 진행 중에 멈출 수 있다', async () => {
    for (const { screen, modal, what } of PAIRS) {
        const [screenSource, modalSource] = await Promise.all([read(screen), read(modal)]);

        // 화면이 창에 중단 함수를 넘긴다. reset 은 타이머를 끄고 처음 상태로 되돌린다.
        assert.match(screenSource, /onCancel=\{reset\}/, `${screen}: 중단 함수를 창에 넘기지 않는다`);

        // 창이 그 함수를 받아 버튼으로 노출한다.
        assert.ok(modalSource.includes('onClose, onCancel,'), `${modal}: onCancel 을 받지 않는다`);
        assert.match(modalSource, /className="arrange-lottery-cancel"/, `${modal}: 중단 버튼이 없다`);
        assert.ok(modalSource.includes('중단하기'), `${modal}: 중단 버튼 글자가 없다`);

        // 되돌릴 수 없는 동작이므로 한 번 물어본다.
        assert.ok(
            modalSource.includes(`window.confirm('${what} 뽑기를 중단할까요?`),
            `${modal}: 묻지 않고 바로 중단한다`
        );

        // 예전의 "그대로 두세요" 안내는 남아 있으면 안 된다 — 이제 멈출 수 있다.
        assert.ok(
            !modalSource.includes('추첨이 끝날 때까지 창을 그대로 두세요'),
            `${modal}: 멈출 수 없다는 옛 안내가 남아 있다`
        );
    }
});

test('중단은 타이머를 끄고 처음 상태로 되돌린다', async () => {
    for (const { screen } of PAIRS) {
        const source = await read(screen);

        // reset 이 예약된 동작을 전부 끄지 않으면, 창을 닫아도 뒤에서 계속 돈다.
        const resetStart = source.indexOf('const reset = () => {');
        assert.ok(resetStart >= 0, `${screen}: reset 을 찾지 못했다`);
        const resetBody = source.slice(resetStart, source.indexOf('};', resetStart));

        assert.ok(resetBody.includes('timers.current.forEach(window.clearTimeout)'), `${screen}: 예약된 뽑기를 끄지 않는다`);
        assert.ok(resetBody.includes("setPhase('idle')"), `${screen}: 처음 상태로 되돌리지 않는다`);
        assert.ok(resetBody.includes('setModalOpen(false)'), `${screen}: 창을 닫지 않는다`);
    }
});

/*
 * 2026-08-24: 교실 **전자칠판**에 띄우면 이름이 작아 아이들이 자기 이름을 못 찾았다.
 * 칠판 크기와 반 인원이 교실마다 달라 한 값으로 못 맞추므로 교사가 고르게 한다.
 *
 * ⚠️ 이름이 나오는 곳이 네 군데다. 각각에 크기를 박으면 또 한 곳만 고치게 되므로
 * **CSS 변수 하나**를 곱해 쓰고, 이 검사가 네 곳을 한꺼번에 본다.
 */
test('이름 크기는 한 값으로 네 곳이 함께 바뀐다', async () => {
    const css = await readFile('src/modules/tool/classroom-arrangement/classroomArrangement.css', 'utf8');

    // 이름을 그리는 네 자리가 모두 같은 변수를 곱해 쓴다.
    const namePlaces = [
        '.arrange-seat strong',
        '.arrange-seat-lottery-seat.is-filled strong',
        '.arrange-role-lottery-slot.is-filled strong'
    ];
    // ⚠️ 같은 선택자가 여러 규칙에 나온다(display 만 정하는 것도 있다).
    //    정규식을 만들지 않고, 규칙을 하나씩 잘라 보며 글자 크기를 정하는 것만 고른다.
    const rulesFor = (selector) => css
        .split('}')
        .map((chunk) => chunk + '}')
        .filter((rule) => rule.includes(selector) && rule.includes('font-size'));

    for (const place of namePlaces) {
        const rules = rulesFor(place);
        assert.ok(rules.length > 0, `${place} 의 글자 크기 규칙을 찾지 못했다`);
        for (const rule of rules) {
            assert.ok(rule.includes('var(--arrange-name-scale'), `${place} 가 이름 크기 값을 따르지 않는다`);
        }
    }

    // 좁은 화면(`@media`)용 규칙도 같은 값을 따라야 한다 — 여기만 빠지면 태블릿에서 안 커진다.
    // ⚠️ 자리 번호(`1-1`)를 그리는 `small` 은 대상이 아니다. 커질 필요가 없고, 커지면 칸만 넓어진다.
    // 이름 칸(`.arrange-seat`·`.arrange-...-seat`·`.arrange-...-slot` 바로 아래 strong)만 본다.
    // 머리말의 인원 표시(`.arrange-seat-lottery-header>strong`)나 자리 번호(`small`)는 대상이 아니다.
    const nameRules = rulesFor('strong').filter((rule) => (
        rule.includes('-seat strong')
        || rule.includes('-seat.is-filled strong')
        || rule.includes('-slot strong')
        || rule.includes('-slot.is-filled strong')
    ));
    assert.ok(nameRules.length >= 4, `이름 규칙이 ${nameRules.length}개뿐이다 — 찾는 방법이 어긋났다`);
    for (const rule of nameRules) {
        assert.ok(rule.includes('var(--arrange-name-scale'), `이름 크기를 따르지 않는 규칙이 있다: ${rule.trim().slice(0, 70)}`);
    }
});

/*
 * ⚠️ 크기 값을 뽑기 창에만 얹으면 **창을 닫는 순간 이름이 다시 작아진다**.
 *    결과판은 창 밖(포털 밖)이라 값이 닿지 않기 때문이다. 두 곳 모두에 얹어야 한다.
 */
test('창을 닫고 결과판을 봐도 고른 크기가 유지된다', async () => {
    for (const { screen } of PAIRS) {
        const source = await read(screen);
        assert.ok(source.includes('const { sizeId, setSizeId, scale } = useNameSize();'), `${screen}: 크기 상태를 갖고 있지 않다`);
        assert.ok(source.includes("'--arrange-name-scale': scale"), `${screen}: 결과판에 크기가 닿지 않는다`);
        assert.ok(source.includes('sizeId={sizeId} onSizeChange={setSizeId} scale={scale}'), `${screen}: 창에 같은 값을 넘기지 않는다`);
    }
});

/*
 * ⚠️ **지난 기록 보기를 빠뜨렸다**(2026-08-24 사용자 지적). 이름이 나오는 화면을 셀 때
 *    뽑기 창 둘만 세고 지난 기록을 놓쳤다. 전자칠판으로 지난 결과를 볼 때도 이름은 커야 한다.
 *    이 검사가 **세 화면을 한꺼번에** 본다.
 */
test('지난 기록 보기에도 이름 크기 조절이 있다', async () => {
    const entry = await read('TeacherEntry.jsx');

    assert.ok(entry.includes('const { sizeId, setSizeId, scale } = useNameSize();'), '지난 기록이 크기 상태를 갖고 있지 않다');
    assert.ok(entry.includes('<NameSizeControl sizeId={sizeId} onChange={setSizeId} />'), '지난 기록 창에 조절 버튼이 없다');
    assert.ok(entry.includes("'--arrange-name-scale': scale"), '지난 기록 창에 크기가 닿지 않는다');
});

test('이름 크기 조절은 두 창에 모두 있고 고른 값을 기억한다', async () => {
    const control = await read('NameSizeControl.jsx');

    assert.match(control, /NAME_SIZE_STEPS/);
    assert.ok(control.includes('window.localStorage.setItem'), '고른 크기를 기억하지 않는다');
    // 저장소가 막힌 환경에서도 화면이 죽으면 안 된다.
    assert.match(control, /catch \{/);

    for (const { modal } of PAIRS) {
        const source = await read(modal);
        assert.ok(source.includes('<NameSizeControl sizeId={sizeId} onChange={onSizeChange} />'), `${modal}: 조절 버튼이 없다`);
        assert.ok(source.includes("'--arrange-name-scale': scale"), `${modal}: 고른 크기가 창에 적용되지 않는다`);
    }
});

/*
 * 2026-08-24 두 가지 지적.
 *
 * ⚠️ 전역 `button` 규칙이 글자를 흰색으로 정한다(`src/index.css`). 이 도구의 버튼이 배경만
 *    흰색으로 덮으면 **흰 바탕에 흰 글씨**가 되어 글자가 사라진다. 지난 기록의 기록명이 그랬다.
 */
test('흰 배경 버튼은 글자색도 함께 정한다', async () => {
    const css = await readFile('src/modules/tool/classroom-arrangement/classroomArrangement.css', 'utf8');

    // `<button>` 에 붙는 클래스만 본다. div·section 은 전역 button 규칙과 무관하다.
    const buttonClasses = ['arrange-history-open', 'arrange-history-delete', 'arrange-lottery-cancel'];
    for (const cls of buttonClasses) {
        const rules = css
            .split('}')
            .map((chunk) => chunk + '}')
            .filter((rule) => rule.includes(`.${cls} {`) || rule.includes(`.${cls} {`.replace(' {', '{')));
        assert.ok(rules.length > 0, `.${cls} 규칙을 찾지 못했다`);
        for (const rule of rules) {
            if (!rule.includes('background')) continue;
            assert.ok(rule.includes('color:'), `.${cls} 가 배경만 덮고 글자색을 안 정한다 — 흰 글씨가 된다`);
        }
    }
});

/*
 * 시작 버튼이 왼쪽 설정 칸 맨 아래에 있어 눈에 띄지 않았다.
 * 결과가 나오는 자리 바로 위, 오른쪽에 둔다.
 */
test('역할 나누기 시작 버튼은 결과판 오른쪽 위에 있다', async () => {
    const [source, css] = await Promise.all([
        read('RoleArrangement.jsx'),
        readFile('src/modules/tool/classroom-arrangement/classroomArrangement.css', 'utf8')
    ]);

    // 결과판(arrange-role-board) 안의 머리말에 시작 버튼이 있어야 한다.
    const boardStart = source.indexOf('className="arrange-role-board"');
    assert.ok(boardStart >= 0, '결과판을 찾지 못했다');
    const heading = source.slice(boardStart, boardStart + 700);
    assert.ok(heading.includes('arrange-panel-heading'), '결과판에 머리말이 없다');
    assert.ok(heading.includes('역할 나누기 시작'), '시작 버튼이 결과판 위에 없다');

    // 왼쪽 설정 칸에 남아 있으면 안 된다 — 두 곳에 생기면 어느 것을 눌러야 할지 헷갈린다.
    assert.equal(
        source.split('역할 나누기 시작').length - 1, 1,
        '시작 버튼이 두 곳에 있다'
    );

    // 머리말 안에서는 꽉 채우지 않는다(왼쪽 칸용 width:100% 를 그대로 쓰면 가로로 늘어난다).
    assert.ok(
        css.includes('.arrange-panel-heading .arrange-primary { width:auto;'),
        '머리말 안 시작 버튼이 가로로 늘어난다'
    );
});

/*
 * 2026-08-24: "자리 배치 결과가 저장이 안 되는 경우가 있다" 는 제보의 원인이었다.
 *
 * `빠른 입력`(손으로 이름을 넣는 방식)으로 뽑으면 `if (source === 'class')` 조건 때문에
 * **기록이 아예 저장되지 않았다**. 오류도 안 떠서 조용히 안 남았다.
 * 이름이 아지트 명단과 달라 지난 기록·역할 나누기와도 맞지 않았으므로 그 방식을 없앴다.
 */
test('자리 배치는 아지트 학급 명단만 쓰고 결과를 늘 기록한다', async () => {
    const [source, css] = await Promise.all([
        read('SeatArrangement.jsx'),
        readFile('src/modules/tool/classroom-arrangement/classroomArrangement.css', 'utf8')
    ]);

    // 손으로 이름을 넣는 길이 남아 있으면 안 된다.
    for (const trace of ['parseQuickNames', 'quickText', 'arrange-quick-input', "setSource(", "source === 'quick'"]) {
        assert.ok(!source.includes(trace), `빠른 입력 흔적이 남아 있다: ${trace}`);
    }
    assert.ok(!css.includes('.arrange-quick-input'), '빠른 입력 스타일이 남아 있다');

    // 명단은 아지트 학급 하나뿐이다.
    assert.ok(source.includes('const roster = students;'), '명단이 아지트 학급 하나가 아니다');

    // 저장에 조건이 붙어 있으면 또 조용히 안 남는 경우가 생긴다.
    assert.ok(!source.includes("if (source === 'class')"), '결과 저장에 조건이 남아 있다');
    assert.ok(source.includes("await onCreateHistory('seat'"), '결과를 기록하지 않는다');
});

/*
 * ⚠️ 자리와 저장 절차를 **두 벌로 갖고 있었다**(2026-08-24 점검에서 확인).
 *    이제 `useEditableResult` 하나에 모았으므로, 이 검사는 두 가지를 함께 본다.
 *    (1) 저장 절차가 공용 파일 **한 곳**에만 있다.
 *    (2) 자리·역할 화면이 그것을 **실제로 쓴다** — 한쪽이 몰래 자기 것을 다시 만들면 걸린다.
 */
test('교사 편집은 조건 점수 없이 랜덤 원본과 연결된 수정본으로 저장한다', async () => {
    const editable = await read('resultSwap.js');

    // (1) 저장 절차는 공용 파일에만 있다.
    assert.ok(editable.includes('violations: null'), '공용 저장이 조건 점수를 남긴다');
    assert.ok(editable.includes('edited: true'), '공용 저장이 수정본 표시를 남기지 않는다');
    assert.ok(editable.includes('onSaveEditedHistory?.(randomHistoryId, editedHistoryId, kind'), '랜덤 원본과 수정본을 연결하지 않는다');
    assert.ok(editable.includes('setEditedHistoryId(nextId)'), '최신 수정본 기록을 기억하지 않는다');
    assert.ok(editable.includes('setManualEdited(true)'), '저장 뒤 교사 편집 상태를 잊는다');
    assert.ok(editable.includes('setRandomHistoryId(createdId || null)'), '랜덤 원본 기록을 기억하지 않는다');

    // (2) 두 화면이 공용 절차를 그대로 쓰고, 자기 몫(무엇을 저장할지)만 넘긴다.
    for (const { screen, what } of PAIRS) {
        const source = await read(screen);
        const kind = screen.startsWith('Seat') ? 'seat' : 'role';
        assert.ok(!source.includes('evaluateSeatAssignments'), `${screen}: 교사 편집 뒤 자리 조건을 다시 계산한다`);
        assert.ok(!source.includes('evaluateRoleAssignments'), `${screen}: 교사 편집 뒤 역할 조건을 다시 계산한다`);
        assert.ok(source.includes(`useEditableResult({ keyOf: ${kind === 'seat' ? 'seatKeyOf' : 'roleKeyOf'}, kind: '${kind}'`), `${screen}: 공용 편집 흐름을 쓰지 않는다`);
        assert.ok(source.includes('editable.linkRandomHistory(createdId)'), `${screen}: 랜덤 원본을 수정본과 연결하지 않는다`);
        assert.ok(source.includes('editable.save('), `${screen}: 공용 저장을 부르지 않는다`);
        assert.ok(source.includes(`noun="${what}"`), `${screen}: 맞바꾸기 안내에 넘기는 낱말이 틀렸다`);
        // 저장 절차를 화면이 다시 갖기 시작하면 여기서 걸린다.
        assert.ok(!source.includes('onSaveEditedHistory?.('), `${screen}: 저장 절차를 또 한 벌 갖고 있다`);
        assert.ok(!source.includes('violations: null'), `${screen}: 조건 점수 처리를 또 한 벌 갖고 있다`);
        assert.ok(!source.includes('onReplaceHistory'), `${screen}: 랜덤 원본을 지우던 옛 저장 통로가 남아 있다`);
    }

    const entry = await read('TeacherEntry.jsx');
    assert.ok(entry.includes('{ ...payload, originalHistoryId }'), '수정본에 랜덤 원본 ID를 저장하지 않는다');
    assert.ok(entry.includes('removeHistory(previousEditedHistoryId)'), '다시 고칠 때 이전 수정본만 정리하지 않는다');
    assert.ok(!entry.includes('removeHistory(originalHistoryId)'), '랜덤 원본을 삭제한다');
    assert.ok(entry.includes("item.payload?.edited ? '교사 수정본'"), '지난 기록이 교사 수정본을 구분하지 않는다');
    assert.ok(entry.includes("editedByOriginalId.has(item.id) ? '랜덤 원본'"), '수정본이 있는 랜덤 원본을 표시하지 않는다');
    assert.ok(entry.includes('className="arrange-history-comparison"'), '원본과 수정본 비교 화면이 없다');
    assert.ok(entry.includes('랜덤 원본과 교사가 보완한 수정본입니다.'), '비교 화면의 의미를 안내하지 않는다');

    // 교사에게 직접 보완 권한을 안내하는 문구는 공용 띠에 있다.
    const editBar = await read('ResultEditBar.jsx');
    assert.ok(editBar.includes('조건과 관계없이'), '교사에게 직접 보완 권한을 안내하지 않는다');
});
