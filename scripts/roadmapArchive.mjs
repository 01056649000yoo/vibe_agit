/**
 * ROADMAP 줄이기 — 순수 함수. 명령은 `scripts/roadmap.mjs`.
 *
 * 왜 (2026-09-28): ROADMAP 은 "앞으로 할 일만" 두기로 했지만 4,305줄까지 자라 두 번째 WORKLOG 가 됐다.
 * `현재 위치` 만 1,970줄(기능별 완료 서술 102절), 완료 `[x]` 1,229개 대 미완료 `[ ]` 162개.
 * 지우지 않고 **옮긴다** — 기준은 이 파일 한 곳이라 어느 모델이 돌려도 같은 결과다.
 *
 * 옮기는 기준
 *   ① `현재 위치` 의 `###` 절 전부 → docs/roadmap/YYYY-MM.md (제목의 첫 날짜 달). 절은 기능 작업 기록이라
 *      진행 중이어도 옮기고, 남은 `[ ]` 는 BACKLOG 로 모인다. 계속 할 일은 OPEN_ITEMS 에 한 줄로 올린다.
 *   ② `현재 위치` 의 머리 항목(`- [x] **…** (날짜)`) 중 가장 최근 항목보다 KEEP_CURRENT_DAYS 일 넘게 오래된 것.
 *   ③ Stage 절(`## Stage …`) 중 `[ ]` 가 하나도 없는 것은 통째로, 남은 Stage 안의 `###` 절 중 `[ ]` 가 없는 것
 *      → docs/roadmap/stages-done.md
 *   ④ 결정 기록 중 가장 최근 결정보다 KEEP_DECISION_DAYS 일 넘게 오래된 것 → docs/roadmap/decisions-YYYY-MM.md
 *
 * BACKLOG(docs/roadmap/BACKLOG.md)는 옮긴 파일들의 `[ ]` 줄을 매번 새로 모은 생성 파일이다.
 */

export const KEEP_CURRENT_DAYS = 7;
export const KEEP_DECISION_DAYS = 14;
// 2026-09-28 첫 정리 뒤 857줄 — 그중 절반이 Stage 4d(포인트 경제, 진행 중 계획)다. 넘치면 끝난 절부터 옮긴다.
export const MAX_ROADMAP_LINES = 900;

const DATE = /(\d{4}-\d{2}-\d{2})/;
const OPEN = /^\s*- \[ \]/;

const addDays = (iso, days) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};
const trimBlock = (lines) => {
    const copy = [...lines];
    while (copy.length && copy.at(-1).trim() === '') copy.pop();
    return copy;
};

/** `## ` 기준으로 나눈다. 첫 `## ` 앞은 머리. */
export const splitH2 = (text) => {
    const lines = text.split('\n');
    const sections = [];
    let head = [];
    let current = null;
    for (const line of lines) {
        if (line.startsWith('## ')) {
            current = { title: line, lines: [line] };
            sections.push(current);
        } else if (current) current.lines.push(line);
        else head.push(line);
    }
    return { head, sections };
};

/** 한 절 안을 주어진 제목 단계 앞 머리와 그 단계 절들로 나눈다. */
const splitHeading = (lines, marker) => {
    const intro = [];
    const subs = [];
    let current = null;
    for (const line of lines) {
        if (line.startsWith(marker)) {
            current = { title: line, lines: [line] };
            subs.push(current);
        } else if (current) current.lines.push(line);
        else intro.push(line);
    }
    return { intro, subs };
};
const splitH3 = (lines) => splitHeading(lines, '### ');

/** 머리 항목 묶음: 날짜가 붙은 최상위 `- ` 줄에서 다음 날짜 붙은 최상위 줄 앞까지. */
const splitDatedBullets = (lines) => {
    const lead = [];
    const groups = [];
    let current = null;
    for (const line of lines) {
        const dated = /^- /.test(line) && line.match(DATE);
        if (dated) {
            current = { date: dated[1], lines: [line] };
            groups.push(current);
        } else if (current) current.lines.push(line);
        else lead.push(line);
    }
    return { lead, groups };
};

const hasOpen = (lines) => lines.some((line) => OPEN.test(line));
const monthOf = (lines) => lines.join('\n').match(DATE)?.[1]?.slice(0, 7) ?? null;

/**
 * @param {string} roadmap
 * @returns {{ roadmap: string, moves: Record<string, string[]>, counts: Record<string, number> }}
 *   moves: 보관 파일 이름 → 거기 **맨 위에** 더할 블록들(각 블록은 여러 줄 글)
 */
export const planArchive = (roadmap) => {
    const { head, sections } = splitH2(roadmap);
    const moves = {};
    const counts = { currentSections: 0, currentBullets: 0, stages: 0, stageSections: 0, decisions: 0 };
    const push = (file, block) => {
        (moves[file] ||= []).push(trimBlock(block).join('\n'));
    };

    const out = [...head];
    for (const section of sections) {
        const { title } = section;

        if (/^## .*현재 위치/.test(title)) {
            const { intro, subs } = splitH3(section.lines.slice(1));
            for (const sub of subs) {
                // 제목에 날짜가 없으면 본문 첫 날짜의 달, 그것도 없으면 undated.md
                push(`${monthOf([sub.title]) ?? monthOf(sub.lines) ?? 'undated'}.md`, sub.lines);
                counts.currentSections += 1;
            }
            // 지난번에 붙인 안내문은 항목이 아니다. 맨 끝 항목에 딸려 함께 옮겨지면(2026-10-01) 줄 수 확인이 깨지므로
            // 먼저 떼어 두고, 아래에서 한 번만 다시 붙인다.
            const isArchiveNote = (line) => line.startsWith('> 지난 `현재 위치` 절') || line.startsWith('> [docs/roadmap/BACKLOG');
            const hadNote = intro.some(isArchiveNote);
            const { lead, groups } = splitDatedBullets(intro.filter((line) => !isArchiveNote(line)));
            const newest = groups.map((g) => g.date).sort().at(-1);
            const cutoff = newest ? addDays(newest, -KEEP_CURRENT_DAYS) : null;
            const kept = [];
            for (const group of groups) {
                if (cutoff && group.date < cutoff) {
                    push(`${group.date.slice(0, 7)}.md`, group.lines);
                    counts.currentBullets += 1;
                } else kept.push(...group.lines);
            }
            const addNote = counts.currentSections || counts.currentBullets || hadNote;
            // 안내문을 다시 붙일 때는 떼어 낸 자리의 빈 줄이 남지 않게 한다(두 번 돌려도 같은 결과).
            while (addNote && kept.length && kept.at(-1).trim() === '') kept.pop();
            out.push(title, ...lead, ...kept);
            if (addNote) {
                out.push('> 지난 `현재 위치` 절·완료 항목은 [docs/roadmap/](docs/roadmap/) 에 달별로 있다. 거기 남은 `[ ]` 는',
                    '> [docs/roadmap/BACKLOG.md](docs/roadmap/BACKLOG.md) 에 모이고, 지금 할 일은 [docs/OPEN_ITEMS.md](docs/OPEN_ITEMS.md) 에 있다.', '');
            }
            continue;
        }

        if (/^## Stage /.test(title)) {
            if (!hasOpen(section.lines)) {
                push('stages-done.md', section.lines);
                counts.stages += 1;
                continue;
            }
            const { intro, subs } = splitH3(section.lines);
            const kept = [...intro];
            for (const sub of subs) {
                if (hasOpen(sub.lines)) {
                    // 남은 `###` 안에서도 `[ ]` 없는 `####` 는 옮긴다(4c 처럼 끝난 하위 절이 많은 곳).
                    const { intro: subIntro, subs: minors } = splitHeading(sub.lines.slice(1), '#### ');
                    kept.push(sub.title, ...subIntro);
                    for (const minor of minors) {
                        if (hasOpen(minor.lines)) kept.push(...minor.lines);
                        else {
                            push('stages-done.md', [`<!-- ${title.slice(3)} › ${sub.title.slice(4)} -->`, ...minor.lines]);
                            counts.stageSections += 1;
                        }
                    }
                } else {
                    push('stages-done.md', [`<!-- ${title.slice(3)} -->`, ...sub.lines]);
                    counts.stageSections += 1;
                }
            }
            out.push(...kept);
            continue;
        }

        if (/^## .*결정 기록/.test(title)) {
            const { lead, groups } = splitDatedBullets(section.lines.slice(1));
            const newest = groups.map((g) => g.date).sort().at(-1);
            const cutoff = newest ? addDays(newest, -KEEP_DECISION_DAYS) : null;
            const kept = [];
            for (const group of groups) {
                if (cutoff && group.date < cutoff) {
                    push(`decisions-${group.date.slice(0, 7)}.md`, group.lines);
                    counts.decisions += 1;
                } else kept.push(...group.lines);
            }
            out.push(title, ...lead, ...kept);
            if (counts.decisions) {
                out.push('', `> ${KEEP_DECISION_DAYS}일보다 오래된 결정은 [docs/roadmap/](docs/roadmap/) 의 \`decisions-YYYY-MM.md\` 에 있다. \`grep -n "말" docs/roadmap/decisions-*.md\`.`);
            }
            continue;
        }

        out.push(...section.lines);
    }

    // 안내문을 두 번 넣지 않는다(두 번째 실행에서).
    const text = out.join('\n')
        .replace(/(> 지난 `현재 위치` 절[^\n]*\n[^\n]*\n\n)(?=[\s\S]*> 지난 `현재 위치` 절)/g, '')
        .replace(/(\n> \d+일보다 오래된 결정은[^\n]*)(?=[\s\S]*> \d+일보다 오래된 결정은)/g, '');
    return { roadmap: text.replace(/\n{3,}/g, '\n\n'), moves, counts };
};

const ARCHIVE_TITLES = {
    'stages-done.md': '# ROADMAP 보관 — 끝난 Stage·절',
    BACKLOG: '# 옮겨 온 미완료 체크 (BACKLOG)'
};
export const archiveTitle = (file) => {
    if (ARCHIVE_TITLES[file]) return ARCHIVE_TITLES[file];
    const decision = file.match(/^decisions-(\d{4})-(\d{2})\.md$/);
    if (file === 'undated.md') return '# ROADMAP `현재 위치` 보관 — 날짜 없는 절';
    if (decision) return `# ROADMAP 결정 기록 보관 — ${decision[1]}년 ${Number(decision[2])}월`;
    const month = file.match(/^(\d{4})-(\d{2})\.md$/);
    return month ? `# ROADMAP \`현재 위치\` 보관 — ${month[1]}년 ${Number(month[2])}월` : `# ROADMAP 보관 — ${file}`;
};
const ARCHIVE_NOTE = [
    '',
    '> ROADMAP 에서 옮겨 온 기록이다(`npm run roadmap:archive`). 통째로 읽지 말고 `grep` 으로 찾는다.',
    '> 남은 `[ ]` 는 [BACKLOG.md](BACKLOG.md) 에 모인다. 지금 할 일은 [OPEN_ITEMS](../OPEN_ITEMS.md) 에 있다.',
    ''
].join('\n');

/** 루트 기준 상대 링크를 docs/roadmap/ 기준으로 바꾼다(주소·앵커·절대 경로는 그대로). */
export const rebaseToArchive = (text) => text.replace(/\]\((?![a-z]+:|#|\/)([^)\s]+)\)/gi, '](../../$1)');

/** 보관 파일에 새 블록을 머리말 바로 아래(맨 위)에 넣는다. */
export const mergeArchive = (file, existing, blocks) => {
    const header = `${archiveTitle(file)}\n${ARCHIVE_NOTE}`;
    const body = existing ? existing.slice(existing.indexOf(ARCHIVE_NOTE) >= 0 ? existing.indexOf(ARCHIVE_NOTE) + ARCHIVE_NOTE.length : 0).trim() : '';
    return `${header}\n${blocks.map(rebaseToArchive).join('\n\n')}${body ? `\n\n${body}` : ''}\n`;
};

/** 보관 파일들에서 `[ ]` 줄을 모아 BACKLOG 를 만든다(생성 파일). */
export const buildBacklog = (archives) => {
    const lines = [
        ARCHIVE_TITLES.BACKLOG,
        '',
        '> ⚙️ **생성 파일이다 — 직접 고치지 않는다**(`npm run roadmap:archive` 가 만든다).',
        '> ROADMAP 에서 옮긴 절에 남아 있던 `[ ]` 를 모았다. **옮겨 오기만 했고 다시 확인하지 않았다** — 이미 끝났을 수 있다.',
        '> 처리 방법: 끝났으면 보관 파일의 그 줄을 `[x]` 로, 할 일이면 [OPEN_ITEMS](../OPEN_ITEMS.md) 에 한 줄로 올리고 `[x] → OI-번호` 로,',
        '> 안 할 일이면 `[-]` 로 바꾼다. 그러면 여기서 빠진다.',
        ''
    ];
    let total = 0;
    for (const file of Object.keys(archives).sort()) {
        let heading = null;
        const found = [];
        for (const line of archives[file].split('\n')) {
            if (/^#{2,3} /.test(line)) heading = line.replace(/^#+ /, '');
            if (OPEN.test(line)) found.push({ heading, text: line.trim().replace(/^- \[ \]\s*/, '').slice(0, 180) });
        }
        if (!found.length) continue;
        total += found.length;
        lines.push(`## [${file}](${file}) — ${found.length}건`, '');
        let last = null;
        for (const item of found) {
            if (item.heading !== last) {
                lines.push(`- **${item.heading ?? '(머리)'}**`);
                last = item.heading;
            }
            lines.push(`  - [ ] ${item.text}`);
        }
        lines.push('');
    }
    lines.splice(7, 0, `전체 ${total}건.`, '');
    return `${lines.join('\n').replace(/\n+$/, '')}\n`;
};
