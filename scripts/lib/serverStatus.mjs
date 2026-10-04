/**
 * 서버 점검 요약 — 판단·문장 만들기만 한다(순수 함수, 2026-10-04).
 * 실제로 읽어 오는 일은 `scripts/server-status-summary.mjs`. 텔레그램(오픈클로)·터미널이 같은 문장을 쓴다.
 *
 * 규칙: **읽기만 한다.** 여기서 고치거나 재시작하는 일은 없다(선생님 결정 — 오픈클로는 알림·묻고 답하기까지만).
 */

/** 점검 한 줄: { label, ok, detail, level } — level: 'ok' | 'warn' | 'problem' */
export const line = (label, level, detail) => ({ label, level, detail });

const ICON = { ok: '✅', warn: '🟡', problem: '🔴' };

/** 백업 상태 한 줄(`PASS  2026-10-04 04:00:39 …`)을 오늘(KST) 기준으로 판정. 오늘 04:00 전이면 어제 것도 정상. */
export const judgeBackup = (statusLine, { today, yesterday, hour }) => {
    const match = String(statusLine || '').match(/^(PASS|FAIL\w*|\w+)\s+(\d{4}-\d{2}-\d{2})/);
    if (!match) return line('백업', 'problem', '기록을 읽지 못함');
    const [, state, day] = match;
    const fresh = day === today || (hour < 5 && day === yesterday);
    if (state !== 'PASS') return line('백업', 'problem', `${day} ${state}`);
    return fresh ? line('백업', 'ok', `${day} 성공(내장·드라이브·외장 SSD)`) : line('백업', 'problem', `마지막 성공이 ${day} — 오늘 백업이 없음`);
};

/** 자동 업데이트·루틴 상태 파일 한 줄. 실패·확인 필요 말만 경고로 올린다. */
export const judgeRoutine = (label, statusLine) => {
    const text = String(statusLine || '').trim();
    if (!text) return line(label, 'warn', '기록 없음');
    const [state] = text.split(/\s+/);
    // 폴더 경로·확인 로그 같은 `키=/경로` 는 알림에 필요 없다.
    const summary = text.replace(/\s+\S+=\/\S+/g, '').replace(/\s+/g, ' ').slice(0, 90);
    if (/^(FAILED|ROLLED_BACK|BLOCKED|NEEDS_ATTENTION|NEEDS_NODE|ATTENTION)$/.test(state)) return line(label, 'problem', summary);
    return line(label, 'ok', summary);
};

export const judgeDisk = (freeGb, dockerPct) => {
    if (freeGb < 10 || dockerPct >= 85) return line('디스크', 'problem', `맥 여유 ${freeGb}GB · 도커 ${dockerPct}%`);
    if (freeGb < 25 || dockerPct >= 75) return line('디스크', 'warn', `맥 여유 ${freeGb}GB · 도커 ${dockerPct}%`);
    return line('디스크', 'ok', `맥 여유 ${freeGb}GB · 도커 ${dockerPct}%`);
};

export const judgeCertificates = (certs, { now = Date.now() } = {}) => {
    const days = certs.filter((cert) => cert.end).map((cert) => ({ ...cert, days: Math.floor((new Date(cert.end) - now) / 86400000) }));
    if (!days.length) return line('인증서', 'warn', '확인하지 못함');
    const soonest = days.sort((a, b) => a.days - b.days)[0];
    const level = soonest.days < 7 ? 'problem' : soonest.days < 21 ? 'warn' : 'ok';
    return line('인증서', level, `가장 빠른 만료 ${soonest.days}일 뒤(${soonest.name})`);
};

/** 전체 판정과 텔레그램·터미널용 문장. 문제가 먼저, 정상은 아래로. */
export const buildSummary = (lines, { title = '🖥️ 맥미니 서버 점검', at = '' } = {}) => {
    const order = { problem: 0, warn: 1, ok: 2 };
    const sorted = [...lines].sort((a, b) => order[a.level] - order[b.level]);
    const problems = lines.filter((item) => item.level === 'problem').length;
    const warnings = lines.filter((item) => item.level === 'warn').length;
    const headline = problems ? `🔴 확인 필요 ${problems}건${warnings ? ` · 주의 ${warnings}건` : ''}`
        : warnings ? `🟡 대체로 정상 · 주의 ${warnings}건` : '✅ 모두 정상';
    const text = [`${title}${at ? ` (${at})` : ''}`, headline, '', ...sorted.map((item) => `${ICON[item.level]} ${item.label}: ${item.detail}`)].join('\n');
    return { text, problems, warnings, problemKey: sorted.filter((item) => item.level === 'problem').map((item) => item.label).join('|') };
};
