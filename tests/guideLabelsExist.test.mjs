/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

// 도움말·활용 안내서·학생 도움말이 `백틱`으로 가리키는 단추·메뉴 이름이 실제 화면 코드에 있는지 본다.
// 화면 문구를 바꾸고 도움말을 안 고치면 선생님이 없는 단추를 찾게 된다(2026-09-24 v1 대조에서 4곳 발견:
// 문집 `구글 문서로 보내기`, 수호룡 시즌 단계, `전체 코드 보기`, `우리 모둠 거리`).
const GUIDE_FILES = [
    'src/constants/teacherGuides.js',
    'src/guides/teacherGuideJourneys.js',
    'src/components/student/studentGuide.js'
];

// 화면 코드에 글자 그대로는 없지만 맞는 이름. 까닭을 함께 적는다.
const KNOWN_ELSEWHERE = new Map([
    ['좋은 질문의 기준', '글쓰기 연구소 화면(별도 앱)의 입력 칸'],
    ['고친 자리표 저장', '`고친 ${board} 저장` 으로 조립'],
    ['고친 역할표 저장', '`고친 ${board} 저장` 으로 조립'],
    ['N판으로 바꾸기', '`${number}판으로 바꾸기` 로 조립'],
    ['선택한 독서록 확인', '`선택한 ${typeLabel} 확인` 으로 조립'],
    ['선택한 일기 확인', '`선택한 ${typeLabel} 확인` 으로 조립'],
    ['확인 취소로 인한 포인트 회수', 'DB 함수가 포인트 내역에 쓰는 문구'],
    ['중식', '나이스 급식 자료가 주는 끼니 이름']
]);

const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(entries.map((entry) => {
        const path = join(dir, entry.name);
        return entry.isDirectory() ? walk(path) : [path];
    }));
    return nested.flat();
};

const squash = (text) => text.replace(/\s+/g, '');

test('도움말이 가리키는 단추·메뉴 이름은 실제 화면 코드에 있다', async () => {
    const uiFiles = (await walk('src')).filter((path) => /\.(jsx?|css)$/.test(path)
        && !GUIDE_FILES.includes(path) && !path.includes('/dev/'));
    const ui = squash((await Promise.all(uiFiles.map((path) => readFile(path, 'utf8')))).join('\n'));
    const missing = [];
    for (const file of GUIDE_FILES) {
        const source = await readFile(file, 'utf8');
        for (const match of source.matchAll(/`([^`\n]{1,60})`/g)) {
            const label = match[1];
            // 조립 문구·숫자 예시·코드 조각은 대조하지 않는다.
            if (label.includes('${') || /\d{2,}|Kcal|data-|tab:|</.test(label) || /^[a-z0-9_-]+$/.test(label)) continue;
            for (const part of label.split(/\s*(?:→|\/|\\|·)\s*/)) {
                const core = part.replace(/^[^\p{L}\p{N}]+|^\d+\s*/u, '').replace(/[\s⚠️]+$/u, '').trim();
                if (core.length < 2 || KNOWN_ELSEWHERE.has(core)) continue;
                if (!ui.includes(squash(core))) missing.push(`${file}: ${core}`);
            }
        }
    }
    assert.deepEqual(missing, []);
});
