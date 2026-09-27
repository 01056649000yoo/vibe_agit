#!/usr/bin/env node

/*
 * 사용자 분석 한 판.
 *
 * 왜 모아 두나 (2026-09-14):
 *   "사용이 늘고 있나", "동행 모드가 도움이 되나" 를 물을 때마다 그 자리에서 SQL 을 짰다.
 *   기준이 매번 조금씩 달라져 지난번 수와 견줄 수가 없었다. 세는 기준을 여기 한 곳에 적어
 *   두면 **같은 자로 잰 값**이 나오고, 달라진 것이 진짜 달라진 것이다.
 *
 * 규칙 셋.
 *   1. **읽기만 한다.** SELECT 뿐이다. 운영 DB 라 쓰기는 마이그레이션으로만 한다.
 *   2. **사람을 식별하는 값은 내보내지 않는다.** 이름·메일·학교·글 내용은 한 줄도 나오지
 *      않는다. 세는 것과 비율만 나온다. 결과를 그대로 붙여도 개인정보가 새지 않아야 한다.
 *   3. 맥미니에서만 돈다 — `agit-db` 컨테이너가 없으면 그렇게 말하고 멈춘다.
 *
 * 쓰기: `npm run analyze:usage` (또는 `-- --weeks 12` 로 기간을 늘린다)
 */

import { execFileSync } from 'node:child_process';

const DB_CONTAINER = 'agit-db';
const DB_USER = 'supabase_admin';

const args = process.argv.slice(2);
const readOption = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    if (at === -1) return fallback;
    const value = Number(args.at(at + 1));
    return Number.isFinite(value) && value > 0 ? value : fallback;
};
const WEEKS = Math.min(26, readOption('weeks', 8));
const DAYS = Math.min(90, readOption('days', 30));

const psql = (sql) => {
    if (/\b(insert|update|delete|drop|alter|truncate|grant|revoke|create)\b/i.test(sql)) {
        throw new Error('이 도구는 읽기만 합니다. 쓰는 문장이 섞였습니다.');
    }
    try {
        return execFileSync('docker', [
            'exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres', '-t', '-A', '-F', '|', '-c', sql
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    } catch (error) {
        const detail = String(error.stderr || error.message || '').split('\n').find(Boolean) || '';
        throw new Error(`DB 를 읽지 못했습니다 (맥미니에서 도커가 떠 있어야 합니다). ${detail}`);
    }
};

const rows = (sql) => psql(sql).split('\n').filter(Boolean).map((line) => line.split('|'));
const one = (sql) => rows(sql).at(0) || [];
const n = (value) => Number(value || 0);
const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : '-');

/* ── 세는 기준 ────────────────────────────────────────────────────────────────
 * 교사 = 승인이 끝난 교사 프로필. 로그인 화면의 "함께하는 선생님" 과 같은 기준이다.
 * 살아 있는 학급·학생 = 지운 표시가 없는 것.
 * 글 = 학생이 쓴 글 전부(제출 전 초안 포함). "낸 글" 만 셀 때는 그렇게 적는다.
 */
const sections = [];

sections.push(['한눈에', () => {
    const [teachers, classes, students, posts, submitted] = one(`
        SELECT (SELECT count(*) FROM public.profiles WHERE role='TEACHER' AND is_approved AND approval_revoked_at IS NULL),
               (SELECT count(*) FROM public.classes WHERE deleted_at IS NULL),
               (SELECT count(*) FROM public.students WHERE deleted_at IS NULL),
               (SELECT count(*) FROM public.student_posts),
               (SELECT count(*) FROM public.student_posts WHERE is_submitted)`);
    const [week, weekKids, weekClasses] = one(`
        SELECT count(*), count(DISTINCT p.student_id), count(DISTINCT s.class_id)
        FROM public.student_posts p JOIN public.students s ON s.id=p.student_id
        WHERE p.created_at > now() - INTERVAL '7 days'`);
    return [
        `- 교사 **${n(teachers)}명** · 학급 **${n(classes)}개** · 학생 **${n(students)}명**`,
        `- 글 **${n(posts)}편**(낸 글 ${n(submitted)}편)`,
        `- 최근 7일: 글 **${n(week)}편** · 쓴 학생 ${n(weekKids)}명 · 학급 ${n(weekClasses)}개`
    ];
}]);

sections.push([`가입 깔때기 (최근 ${DAYS}일 가입한 교사)`, () => {
    const [signed, profiled, withClass, withStudents, withPosts] = one(`
        WITH new_teachers AS (
            SELECT p.id FROM public.profiles p
            WHERE p.role='TEACHER' AND p.created_at > now() - INTERVAL '${DAYS} days'
        )
        SELECT (SELECT count(*) FROM auth.users u LEFT JOIN public.profiles p ON p.id=u.id
                WHERE u.created_at > now() - INTERVAL '${DAYS} days' AND u.email IS NOT NULL
                  AND u.email !~ '^[0-9a-f-]{20,}@' AND (p.id IS NULL OR p.role='TEACHER')),
               (SELECT count(*) FROM new_teachers),
               (SELECT count(*) FROM new_teachers t WHERE EXISTS (SELECT 1 FROM public.classes c WHERE c.teacher_id=t.id AND c.deleted_at IS NULL)),
               (SELECT count(*) FROM new_teachers t WHERE EXISTS (SELECT 1 FROM public.students s JOIN public.classes c ON c.id=s.class_id WHERE c.teacher_id=t.id)),
               (SELECT count(*) FROM new_teachers t WHERE EXISTS (SELECT 1 FROM public.student_posts sp JOIN public.students s ON s.id=sp.student_id JOIN public.classes c ON c.id=s.class_id WHERE c.teacher_id=t.id))`);
    const steps = [
        ['계정을 만든 사람', n(signed)],
        ['가입을 끝냄(학교 정보까지)', n(profiled)],
        ['학급을 만듦', n(withClass)],
        ['학생을 등록함', n(withStudents)],
        ['학생 글까지 받음', n(withPosts)]
    ];
    const top = steps.at(0).at(1);
    return steps.map(([label, value], index) => {
        const previous = index === 0 ? value : steps.at(index - 1).at(1);
        const drop = index === 0 ? '' : ` · 앞 단계 대비 ${pct(value, previous)}`;
        return `- ${label}: **${value}명** (전체의 ${pct(value, top)})${drop}`;
    });
}]);

sections.push([`학교 확인 (가입 주차별, 최근 ${WEEKS}주)`, () => {
    /*
     * 학교는 **목록에서 고른 것만** 받는다(2026-09-14 결정). 이름과 학교가 정확해야
     * 문제가 생겼을 때 누구인지 알 수 있다. 그러므로 이 수는 앞으로 0이어야 정상이다 —
     * 0이 아닌 주가 생기면 어딘가 확인 없이 지나가는 구멍이 난 것이다.
     * (2026-09 이전 가입자는 학교 선택이 필수가 아니어서 확인 없이 저장돼 있다.)
     */
    /*
     * 주마다 나눠 본다. 통째로 세면 **규칙이 바뀐 때를 넘어** 섞인다 — 2026-09 이전에는
     * 학교를 고르지 않아도 가입이 됐고, 그 뒤로 목록에서 고르는 것만 허용됐다.
     * 섞어 놓으면 "직접 적은 사람 44%" 처럼 지금과 무관한 수가 나온다.
     */
    return rows(`
        SELECT to_char(w,'MM-DD'), total, manual FROM (
          SELECT date_trunc('week', created_at) w, count(*) total,
                 count(*) FILTER (WHERE school_verified_at IS NULL) manual
          FROM public.teachers WHERE created_at > now() - INTERVAL '${WEEKS} weeks' GROUP BY 1) t ORDER BY w`)
        .map(([week, total, manual]) => `- ${week} 주 가입 ${total}명 · 학교 확인 안 된 교사 **${manual}명** (${pct(n(manual), n(total))})`);
}]);

sections.push([`학생 등록 뒤에 무엇이 막나 (최근 ${DAYS}일 가입)`, () => {
    /*
     * 학생 등록과 첫 글 사이에는 단계가 더 있다. 통째로 "43%" 로 보면 어디가 막혔는지 모른다.
     * 2026-09-14 첫 판독: 학생 168 → **과제 90** → 학생 로그인 89 → 첫 글 73.
     * 과제만 만들면 그 뒤는 81%가 글까지 간다 — 문턱은 첫 과제다.
     */
    const [kids, missions, signedIn, posts] = one(`
        WITH t AS (
            SELECT p.id FROM public.profiles p
            WHERE p.role='TEACHER' AND p.created_at > now() - INTERVAL '${DAYS} days'
              AND EXISTS (SELECT 1 FROM public.students s JOIN public.classes c ON c.id=s.class_id WHERE c.teacher_id=p.id)
        )
        SELECT (SELECT count(*) FROM t),
               (SELECT count(*) FROM t WHERE EXISTS (SELECT 1 FROM public.writing_missions m JOIN public.classes c ON c.id=m.class_id WHERE c.teacher_id=t.id)),
               (SELECT count(*) FROM t WHERE EXISTS (SELECT 1 FROM public.students s JOIN public.classes c ON c.id=s.class_id JOIN auth.users u ON u.id=s.auth_id WHERE c.teacher_id=t.id AND u.last_sign_in_at IS NOT NULL)),
               (SELECT count(*) FROM t WHERE EXISTS (SELECT 1 FROM public.student_posts sp JOIN public.students s ON s.id=sp.student_id JOIN public.classes c ON c.id=s.class_id WHERE c.teacher_id=t.id))`);
    const steps = [['학생을 등록함', n(kids)], ['과제를 만듦', n(missions)], ['학생이 로그인함', n(signedIn)], ['학생 글을 받음', n(posts)]];
    return steps.map(([label, value], index) => {
        const previous = index === 0 ? value : steps.at(index - 1).at(1);
        return `- ${label}: **${value}명**${index === 0 ? '' : ` · 앞 단계 대비 ${pct(value, previous)}`}`;
    });
}]);

sections.push([`주마다 얼마나 쓰나 (최근 ${WEEKS}주)`, () => rows(`
        SELECT to_char(w,'MM-DD'), posts, kids, classes FROM (
          SELECT date_trunc('week', p.created_at) w, count(*) posts,
                 count(DISTINCT p.student_id) kids, count(DISTINCT s.class_id) classes
          FROM public.student_posts p JOIN public.students s ON s.id=p.student_id
          WHERE p.created_at > now() - INTERVAL '${WEEKS} weeks' GROUP BY 1) t ORDER BY w`)
    .map(([week, posts, kids, classes]) => `- ${week} 주 · 글 **${posts}편** · 학생 ${kids}명 · 학급 ${classes}개`)]);

sections.push(['꾸준히 쓰는 학급', () => {
    const [active7, active30, repeat] = one(`
        SELECT (SELECT count(DISTINCT s.class_id) FROM public.student_posts p JOIN public.students s ON s.id=p.student_id WHERE p.created_at > now() - INTERVAL '7 days'),
               (SELECT count(DISTINCT s.class_id) FROM public.student_posts p JOIN public.students s ON s.id=p.student_id WHERE p.created_at > now() - INTERVAL '30 days'),
               (SELECT count(*) FROM (
                   SELECT s.class_id FROM public.student_posts p JOIN public.students s ON s.id=p.student_id
                   WHERE p.created_at > now() - INTERVAL '28 days'
                   GROUP BY s.class_id HAVING count(DISTINCT date_trunc('week', p.created_at)) >= 3) q)`);
    const [total] = one(`SELECT count(*) FROM public.classes WHERE deleted_at IS NULL`);
    return [
        `- 최근 7일에 글이 있는 학급: **${n(active7)}개** (전체 ${n(total)}개의 ${pct(n(active7), n(total))})`,
        `- 최근 30일: **${n(active30)}개** (${pct(n(active30), n(total))})`,
        `- 최근 4주 중 **3주 이상** 쓴 학급: **${n(repeat)}개** — 자리를 잡은 학급`
    ];
}]);

sections.push(['동행 모드', () => {
    const [met, started, finished] = one(`
        SELECT count(*) FILTER (WHERE teacher_tour_state ? 'welcomeSeenAt'),
               count(*) FILTER (WHERE EXISTS (SELECT 1 FROM jsonb_each(COALESCE(teacher_tour_state->'tours','{}'::jsonb)) e
                    WHERE e.value->>'status' <> 'idle' OR jsonb_array_length(COALESCE(e.value->'completed','[]'))>0 OR COALESCE((e.value->>'everFinished')::boolean,false))),
               count(*) FILTER (WHERE COALESCE((teacher_tour_state->'tours'->'getting-started'->>'everFinished')::boolean,false))
        FROM public.profiles WHERE teacher_tour_state <> '{}'::jsonb`);
    const stuck = rows(`
        SELECT COALESCE(value->>'stepId','-'), count(*) FROM public.profiles p, jsonb_each(p.teacher_tour_state->'tours')
        WHERE key='getting-started' AND NOT COALESCE((value->>'everFinished')::boolean,false)
          AND (value->>'status' <> 'idle' OR jsonb_array_length(COALESCE(value->'completed','[]'))>0)
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 5`);
    const moves = rows(`
        SELECT step.value->>'how', count(*) FROM public.profiles p, jsonb_array_elements(COALESCE(p.teacher_tour_state->'trail','[]'::jsonb)) step
        GROUP BY 1 ORDER BY count(*) DESC`);
    // 한 단계에 머문 시간 — 발자국 사이의 간격이다. 20분이 넘으면 자리를 뜬 것으로 보고 뺀다.
    const dwell = rows(`
        SELECT step, round(avg(gap))::int, count(*) FROM (
          SELECT step.value->>'step' step,
                 EXTRACT(EPOCH FROM ((lead(step.value->>'at') OVER (PARTITION BY p.id ORDER BY step.ordinality))::timestamptz
                                     - (step.value->>'at')::timestamptz)) gap
          FROM public.profiles p, jsonb_array_elements(COALESCE(p.teacher_tour_state->'trail','[]'::jsonb)) WITH ORDINALITY step
        ) t WHERE gap IS NOT NULL AND gap BETWEEN 0 AND 1200 GROUP BY step ORDER BY avg(gap) DESC LIMIT 5`);
    return [
        `- 만난 교사 **${n(met)}명** · 한 걸음이라도 뗀 교사 **${n(started)}명** (${pct(n(started), n(met))}) · 첫 흐름을 끝낸 교사 **${n(finished)}명** (${pct(n(finished), n(started))})`,
        ...(stuck.length ? ['- 끝내지 못한 사람이 서 있는 자리:', ...stuck.map(([step, count]) => `    - \`${step}\` ${count}명`)] : []),
        ...(moves.length ? ['- 무엇을 눌렀나: ' + moves.map(([how, count]) => `${how} ${count}`).join(' · ')] : ['- 발자국이 아직 없습니다(9/14부터 남습니다).']),
        ...(dwell.length ? ['- 오래 붙들고 있는 단계:', ...dwell.map(([step, seconds, count]) => `    - \`${step}\` 평균 ${seconds}초 (${count}번)`)] : [])
    ];
}]);

/*
 * 동행 모드가 첫 주를 바꾸나 (2026-09-27).
 * 계정 나이를 가른다 — 오래된 계정일수록 학생이 많은 게 당연해서(2026-09-14 에 뒤집힌 결론이 나왔다), 모두
 * **가입 뒤 7일 안**에 한 일만 센다. 7일이 다 지난 사람만 넣는다.
 *   ① 동행 모드가 생기기 전(8/31~9/12) 가입과 생긴 뒤(9/13~) 가입을 견준다 — 스스로 고른 사람만 모이는 치우침을 덜어 준다.
 *   ② 생긴 뒤 가입 안에서 동행 모드를 어디까지 했는지로 가른다 — 열심인 사람이 끝까지 하기도 하므로 ①과 함께 읽는다.
 * 활용 안내서를 읽기만 한 것은 기록이 없어 셀 수 없다(동행 모드만 발자국이 남는다).
 */
const TOUR_LAUNCH = '2026-09-13';
const FIRST_WEEK_SQL = `
    WITH cohort AS (
        SELECT p.id, p.created_at,
               CASE
                   WHEN p.created_at < DATE '${TOUR_LAUNCH}' THEN '0 동행 모드 전 가입(8/31~9/12)'
                   WHEN COALESCE((p.teacher_tour_state->'tours'->'getting-started'->>'everFinished')::boolean, false) THEN '1 첫 흐름을 끝냄'
                   WHEN EXISTS (SELECT 1 FROM jsonb_each(COALESCE(p.teacher_tour_state->'tours','{}'::jsonb)) e
                                WHERE e.value->>'status' <> 'idle' OR jsonb_array_length(COALESCE(e.value->'completed','[]'))>0) THEN '2 시작만 함'
                   WHEN p.teacher_tour_state ? 'welcomeSeenAt' THEN '3 환영 창만 봄'
                   ELSE '4 만나지 않음'
               END AS grp
        FROM public.profiles p
        WHERE p.role = 'TEACHER'
          AND p.created_at >= DATE '2026-08-31'
          AND p.created_at < now() - INTERVAL '7 days'
    ), first_week AS (
        SELECT t.grp,
               EXISTS (SELECT 1 FROM public.classes c WHERE c.teacher_id = t.id AND c.created_at < t.created_at + INTERVAL '7 days') has_class,
               (SELECT count(*) FROM public.students s JOIN public.classes c ON c.id = s.class_id
                 WHERE c.teacher_id = t.id AND s.created_at < t.created_at + INTERVAL '7 days') kids,
               EXISTS (SELECT 1 FROM public.student_posts sp JOIN public.classes c ON c.id = sp.class_id
                        WHERE c.teacher_id = t.id AND sp.created_at < t.created_at + INTERVAL '7 days') has_post
        FROM cohort t
    )
    SELECT grp, count(*), count(*) FILTER (WHERE has_class), count(*) FILTER (WHERE kids > 0),
           count(*) FILTER (WHERE kids >= 10), count(*) FILTER (WHERE has_post)
    FROM first_week GROUP BY grp ORDER BY grp`;

sections.push(['동행 모드와 첫 주 (가입 뒤 7일 안)', () => {
    const table = rows(FIRST_WEEK_SQL);
    const lines = table.map(([grp, total, withClass, withKids, withTen, withPost]) => {
        const all = n(total);
        const small = all < 30 ? ' · 표본 작음' : '';
        return `- ${grp.slice(2)} **${all}명**${small}: 학급 ${pct(n(withClass), all)} · 학생 등록 **${pct(n(withKids), all)}** · 학생 10명 이상 ${pct(n(withTen), all)} · 학생 글 ${pct(n(withPost), all)}`;
    });
    const after = table.filter(([grp]) => !grp.startsWith('0'));
    const sum = (index) => after.reduce((total, row) => total + n(row.at(index)), 0);
    const afterTotal = sum(1);
    if (afterTotal) {
        lines.push(`- 동행 모드 뒤 가입 전체 **${afterTotal}명**: 학급 ${pct(sum(2), afterTotal)} · 학생 등록 **${pct(sum(3), afterTotal)}** · 학생 10명 이상 ${pct(sum(4), afterTotal)} · 학생 글 ${pct(sum(5), afterTotal)}`);
    }
    // 첫 흐름(getting-started)은 학급·학생·글쓰기 설정에서 끝나고 첫 과제는 두 번째 흐름에 있다 — 이어 갔나.
    const [firstDone, secondStarted, secondDone] = one(`
        SELECT count(*) FILTER (WHERE COALESCE((teacher_tour_state->'tours'->'getting-started'->>'everFinished')::boolean,false)),
               count(*) FILTER (WHERE COALESCE((teacher_tour_state->'tours'->'getting-started'->>'everFinished')::boolean,false)
                                  AND (teacher_tour_state->'tours'->'first-writing-class'->>'status' <> 'idle'
                                       OR jsonb_array_length(COALESCE(teacher_tour_state->'tours'->'first-writing-class'->'completed','[]'))>0
                                       OR COALESCE((teacher_tour_state->'tours'->'first-writing-class'->>'everFinished')::boolean,false))),
               count(*) FILTER (WHERE COALESCE((teacher_tour_state->'tours'->'first-writing-class'->>'everFinished')::boolean,false))
        FROM public.profiles WHERE role='TEACHER' AND teacher_tour_state <> '{}'::jsonb`);
    lines.push(`- 첫 흐름을 끝낸 **${n(firstDone)}명** 중 두 번째 흐름(첫 과제)을 시작 **${n(secondStarted)}명**(${pct(n(secondStarted), n(firstDone))}) · 끝냄 ${n(secondDone)}명`);
    const secondStuck = rows(`
        SELECT COALESCE(value->>'stepId','-'), count(*) FROM public.profiles p, jsonb_each(p.teacher_tour_state->'tours')
        WHERE key='first-writing-class' AND NOT COALESCE((value->>'everFinished')::boolean,false)
          AND (value->>'status' <> 'idle' OR jsonb_array_length(COALESCE(value->'completed','[]'))>0)
        GROUP BY 1 ORDER BY count(*) DESC LIMIT 5`);
    if (secondStuck.length) {
        lines.push('- 두 번째 흐름에서 멈춘 자리:', ...secondStuck.map(([step, count]) => `    - \`${step}\` ${count}명`));
    }
    lines.push('- 읽는 법: 전·후 비교(맨 위와 맨 아래 줄)가 효과에 가깝고, 그룹 사이 차이는 열심인 사람이 끝까지 하는 치우침이 섞인다.');
    lines.push('- 주의: 9/14 에 학생 명단 붙여넣기도 들어가 전·후 차이에 함께 섞인다(두 변화를 날짜로 가를 수 없다).');
    return lines;
}]);

sections.push([`AI 를 무엇에 쓰나 (최근 ${DAYS}일)`, () => rows(`
        SELECT scope, count(*), count(DISTINCT actor_id) FROM public.ai_request_events
        WHERE created_at > now() - INTERVAL '${DAYS} days' GROUP BY 1 ORDER BY count(*) DESC`)
    .map(([scope, count, people]) => `- ${scope}: **${count}건** · ${people}명`)]);

const report = [];
report.push(`# 사용자 분석 · ${new Date().toLocaleDateString('ko-KR')}`);
report.push('');
report.push('> 세는 기준은 `scripts/analyze-usage.mjs` 한 곳에 있습니다. 사람을 식별하는 값은 나오지 않습니다.');
for (const [title, build] of sections) {
    report.push('', `## ${title}`, '');
    try {
        report.push(...build());
    } catch (error) {
        report.push(`- (이 항목을 읽지 못했습니다: ${error.message})`);
    }
}
console.log(report.join('\n'));
