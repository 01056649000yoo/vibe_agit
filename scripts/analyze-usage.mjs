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

sections.push([`학교를 어떻게 적었나 (가입 주차별, 최근 ${WEEKS}주)`, () => {
    /*
     * 가입에서 학교는 필수인데, 목록에서 못 찾으면 넘어갈 길이 없었다(2026-09-14).
     * 직접 적고 넘어간 사람이 얼마나 되는지가 그대로 답이다 — 많으면 검색이 문제고,
     * 없으면 막힌 원인은 다른 데 있다.
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
        .map(([week, total, manual]) => `- ${week} 주 가입 ${total}명 · 이름을 직접 적은 교사 **${manual}명** (${pct(n(manual), n(total))})`);
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
