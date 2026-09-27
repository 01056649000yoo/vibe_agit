/**
 * 하루 DB 부하 계산(2026-09-27) — `snapshot-query-load.mjs` 가 쓰는 순수 함수.
 *
 * `pg_stat_statements` 는 **DB 를 켠 뒤부터 쌓인 누적값**이고 DB 를 다시 켜면 0 으로 돌아간다. 그래서 하루치는
 * "오늘 누적 − 어제 누적" 으로 구하고, 그 사이 통계가 초기화됐으면(`stats_reset` 이 바뀜) 오늘 누적 전체를 하루치로 본다.
 * 이 파일은 DB·파일에 손대지 않는다(`node --test` 가 바로 부른다).
 */

/** 쿼리 글에서 부른 함수 이름을 꺼낸다(PostgREST 호출은 "public"."이름", 예약 작업은 public.이름( ). */
export const functionNameOf = (query = '') => {
    const quoted = query.match(/"public"\."([a-z0-9_]+)"/i);
    if (quoted) return quoted[1];
    const plain = query.match(/\bpublic\.([a-z0-9_]+)\s*\(/i);
    if (plain) return plain[1];
    return `(SQL) ${String(query).replace(/\s+/g, ' ').trim().slice(0, 60)}`;
};

/**
 * @param {{ statsReset: string, byId: Record<string, [number, number]> }|null} previous 어제 남긴 누적(없으면 null)
 * @param {{ statsReset: string, rows: { queryid: string, calls: number, totalMs: number, query: string, name?: string }[] }} current
 *   `name` 은 DB 가 쿼리 글 전체에서 뽑은 함수 이름(없으면 `query` 앞부분에서 찾는다)
 * @param {{ top?: number }} options
 * @returns {{ entry: object, state: object }} entry = 하루치 한 줄, state = 다음 날 견줄 누적
 */
export const computeDailyLoad = (previous, current, { top = 10 } = {}) => {
    const sameBaseline = previous && previous.statsReset === current.statsReset;
    const byName = new Map();
    let calls = 0;
    let totalMs = 0;
    const byId = {};
    for (const row of current.rows) {
        const id = String(row.queryid);
        const before = sameBaseline ? previous.byId[id] || [0, 0] : [0, 0];
        // 같은 기준 안에서도 쿼리 글 캐시가 밀려나면 누적이 줄 수 있다 — 음수는 0 으로 본다.
        const deltaCalls = Math.max(0, Number(row.calls) - before[0]);
        const deltaMs = Math.max(0, Number(row.totalMs) - before[1]);
        byId[id] = [Number(row.calls), Number(row.totalMs)];
        if (deltaCalls === 0 && deltaMs === 0) continue;
        calls += deltaCalls;
        totalMs += deltaMs;
        const name = row.name || functionNameOf(row.query);
        const item = byName.get(name) || { name, calls: 0, totalMs: 0 };
        item.calls += deltaCalls;
        item.totalMs += deltaMs;
        byName.set(name, item);
    }
    const ranked = [...byName.values()]
        .sort((a, b) => b.totalMs - a.totalMs)
        .slice(0, top)
        .map((item) => ({
            name: item.name,
            calls: item.calls,
            totalMs: Math.round(item.totalMs),
            meanMs: item.calls ? Math.round((item.totalMs / item.calls) * 100) / 100 : 0
        }));
    return {
        entry: {
            statsReset: current.statsReset,
            // 어제 누적과 이어지지 않으면(첫 기록·DB 재시작) 하루치가 아니라 "재시작 뒤 누적" 이다.
            baseline: sameBaseline ? 'previous-snapshot' : 'stats-reset',
            calls,
            totalMs: Math.round(totalMs),
            top: ranked
        },
        state: { statsReset: current.statsReset, byId }
    };
};

/** 장부 여러 줄을 사람이 읽는 요약으로. 평일(월~금)만 따로 평균을 낸다. */
export const summarizeLedger = (entries) => {
    const days = entries.map((entry) => ({
        date: entry.date,
        weekday: new Date(`${entry.date}T12:00:00+09:00`).getDay(),
        calls: entry.calls,
        totalMs: entry.totalMs,
        baseline: entry.baseline
    }));
    const weekdays = days.filter((day) => day.weekday >= 1 && day.weekday <= 5 && day.baseline === 'previous-snapshot');
    const average = (list, key) => (list.length ? Math.round(list.reduce((sum, day) => sum + day[key], 0) / list.length) : 0);
    const peak = days.reduce((best, day) => (day.totalMs > (best?.totalMs ?? -1) ? day : best), null);
    const byName = new Map();
    for (const entry of entries) {
        for (const item of entry.top || []) {
            const sum = byName.get(item.name) || { name: item.name, calls: 0, totalMs: 0 };
            sum.calls += item.calls;
            sum.totalMs += item.totalMs;
            byName.set(item.name, sum);
        }
    }
    return {
        days,
        weekdayAverage: { calls: average(weekdays, 'calls'), totalMs: average(weekdays, 'totalMs'), count: weekdays.length },
        peak,
        top: [...byName.values()].sort((a, b) => b.totalMs - a.totalMs).slice(0, 10)
    };
};
