/**
 * Node 실행환경 규칙의 순수 계산(2026-10-03). 판단은 여기서만 하고, 실제로 깔고 되돌리는 일은
 * `scripts/node-runtime-update.mjs`·`scripts/openclaw-autoupdate.sh` 가 한다. 규칙 원문은 `docs/NODE_RUNTIME_POLICY.md`.
 *
 *   - 같은 큰 버전(major) 안의 패치·작은 버전만 자동으로 올린다. 큰 버전은 절대 자동으로 바꾸지 않는다.
 *   - 새 패치는 나온 지 quarantineDays(기본 7일)가 지나야 올린다(갓 나온 판의 회수·버그를 피한다).
 *   - 쓰는 큰 버전의 지원 종료가 eolWarnDays(기본 90일) 안으로 들어오면 알린다.
 *   - 앱(오픈클로 등)이 요구하는 Node 범위를 지금 실행환경이 못 맞추면 업데이트를 시도하지 않고 알린다.
 */

const parse = (version) => {
    const match = String(version || '').trim().replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1, 4).map(Number) : null;
};

export const majorOf = (version) => parse(version)?.[0] ?? null;

export const compareVersions = (a, b) => {
    const left = parse(a);
    const right = parse(b);
    if (!left || !right) return 0;
    for (let index = 0; index < 3; index += 1) {
        if (left[index] !== right[index]) return left[index] - right[index];
    }
    return 0;
};

/**
 * npm `engines.node` 범위 일부(`>=24.16.0 <25 || >=26.1.0`, `^22.12.0`, `>=20`)를 판정한다.
 * 모르는 모양이면 null(판정 못 함) — 부르는 쪽은 모르면 업데이트하지 않는다.
 */
export const satisfiesRange = (version, range) => {
    const target = parse(version);
    if (!target || !range) return null;
    const normalize = (text) => {
        const [major = '0', minor = '0', patch = '0'] = text.replace(/^v/, '').split('.');
        return `${Number(major)}.${Number(minor)}.${Number(patch)}`;
    };
    const one = (comparator) => {
        const caret = comparator.match(/^\^(\d+(?:\.\d+){0,2})$/);
        if (caret) {
            const base = normalize(caret[1]);
            return compareVersions(version, base) >= 0 && majorOf(version) === majorOf(base);
        }
        const match = comparator.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/);
        if (!match) return undefined;
        const diff = compareVersions(version, normalize(match[2]));
        switch (match[1] || '=') {
            case '>=': return diff >= 0;
            case '<=': return diff <= 0;
            case '>': return diff > 0;
            case '<': return diff < 0;
            default: return diff === 0;
        }
    };
    let known = true;
    const result = String(range).split('||').some((alternative) => alternative.trim().split(/\s+/).filter(Boolean).every((comparator) => {
        const value = one(comparator);
        if (value === undefined) known = false;
        return value === true;
    }));
    return known ? result : null;
};

/**
 * nodejs.org `dist/index.json` 에서 그 큰 버전의 **LTS** 판 중, 나온 지 quarantineDays 가 지난 가장 새 판.
 * 지금 판보다 새 것이 없으면 null.
 */
export const pickPatchTarget = (releases, { major, current, today, quarantineDays = 7 }) => {
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - quarantineDays);
    const candidates = (releases || [])
        .filter((release) => release.lts && majorOf(release.version) === major)
        .filter((release) => new Date(`${release.date}T00:00:00Z`) <= cutoff)
        .sort((a, b) => compareVersions(b.version, a.version));
    const best = candidates[0];
    if (!best) return null;
    return compareVersions(best.version, current) > 0 ? best.version.replace(/^v/, '') : null;
};

/** 쓰는 큰 버전들의 지원 종료 경고. Release 일정(schedule.json)의 `end` 를 본다. */
export const eolWarnings = (schedule, majors, { today, warnDays = 90 }) => {
    const now = new Date(`${today}T00:00:00Z`);
    return [...new Set(majors)].flatMap((major) => {
        const end = schedule?.[`v${major}`]?.end;
        if (!end) return [];
        const days = Math.round((new Date(`${end}T00:00:00Z`) - now) / 86400000);
        if (days > warnDays) return [];
        return [{ major, end, days, expired: days < 0 }];
    });
};

/** brew `brew info --json=v2` 의 한 공식에서 지금 깔린 판과 받을 수 있는 판. */
export const brewVersions = (info) => {
    const formula = info?.formulae?.[0];
    if (!formula) return null;
    const installed = formula.installed?.map((entry) => entry.version).sort(compareVersions).at(-1) || null;
    return { installed, available: formula.versions?.stable || null, pinned: Boolean(formula.pinned) };
};
