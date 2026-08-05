import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { classKey, dataCache } from '../../lib/cache';
import { supabase } from '../../lib/supabaseClient';
import { isPendingRewrite } from '../../lib/writingStatus';
import './StudentTodoCard.css';

/**
 * 홈 맨 위 "오늘 할 일".
 *
 * 학생이 홈에서 가장 먼저 알고 싶은 것은 "나 뭐 해야 하지?" 인데, 그동안 홈은
 * 쓴 글자 수·완료 미션 같은 **지나간 실적**만 보여 줬다. 새 과제는 NEW 점 하나로만
 * 표시돼 몇 개인지 알 수 없었다.
 *
 * 여기서는 지금 해야 할 것만 세어서 바로 갈 수 있게 한다. 할 게 없으면 칭찬으로 끝낸다.
 */
const CACHE_TTL_MS = 20000;

const TodoRow = ({ icon, label, count, actionLabel, onClick, tone }) => (
    <button
        type="button"
        onClick={onClick}
        className="student-todo-row"
        style={{ '--todo-border': tone.border, '--todo-bg': tone.bg, '--todo-text': tone.text, '--todo-chip': tone.chip }}
    >
        <span className="student-todo-row__icon" aria-hidden="true">{icon}</span>
        <span className="student-todo-row__label">{label} <strong>{count}개</strong></span>
        <span className="student-todo-row__action">{actionLabel}</span>
    </button>
);

const TONES = {
    mission: { border: '#FFCC80', bg: '#FFF8E1', text: '#E65100', chip: '#FB8C00' },
    rewrite: { border: '#FFAB91', bg: '#FBE9E7', text: '#D84315', chip: '#F4511E' },
    news: { border: '#B39DDB', bg: '#F3E5F5', text: '#5E35B1', chip: '#7E57C2' }
};

const StudentTodoCard = ({ studentSession, returnedCount = 0, hasActivity, onNavigate, onOpenFeedback, onGoRewrite }) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const studentId = studentSession?.id;
    const [pendingMissions, setPendingMissions] = useState(null);

    const load = useCallback(async () => {
        if (!classId || !studentId) return;
        const key = classKey(classId, 'student-todo', { student: studentId });
        try {
            const count = await dataCache.get(key, async () => {
                const [missionResult, mineResult] = await Promise.all([
                    supabase
                        .from('writing_missions')
                        .select('id')
                        .eq('class_id', classId)
                        .eq('is_archived', false)
                        .order('created_at', { ascending: false })
                        .limit(500),
                    supabase
                        .from('student_posts')
                        .select('mission_id, is_submitted, is_confirmed, is_returned, recalled_at')
                        .eq('class_id', classId)
                        .eq('student_id', studentId)
                        .not('mission_id', 'is', null)
                        .limit(500)
                ]);
                if (missionResult.error) throw missionResult.error;
                if (mineResult.error) throw mineResult.error;
                const done = new Set(
                    (mineResult.data || [])
                        .filter((row) => row.is_submitted || row.is_confirmed)
                        .map((row) => row.mission_id)
                );
                const rewrites = new Set(
                    (mineResult.data || [])
                        .filter(isPendingRewrite)
                        .map((row) => row.mission_id)
                );
                return (missionResult.data || []).filter((m) => (
                    !done.has(m.id) && !rewrites.has(m.id)
                )).length;
            }, CACHE_TTL_MS);
            setPendingMissions(count);
        } catch (error) {
            console.error('할 일 계산 실패:', error.message);
            setPendingMissions(0);
        }
    }, [classId, studentId]);

    useEffect(() => {
        const timerId = window.setTimeout(load, 0);
        return () => window.clearTimeout(timerId);
    }, [load]);

    // 아직 세는 중이면 자리만 잡아 둔다. 숫자가 늦게 튀어나와 화면이 밀리지 않게.
    if (pendingMissions === null) {
        return <div className="student-todo-loading" aria-hidden="true" />;
    }

    const rows = [];
    if (pendingMissions > 0) {
        rows.push(
            <TodoRow
                key="mission" icon="✏️" label="아직 안 쓴 과제" count={pendingMissions}
                actionLabel="쓰러 가기" tone={TONES.mission}
                onClick={() => onNavigate('mission_list')}
            />
        );
    }
    if (returnedCount > 0) {
        rows.push(
            <TodoRow
                key="rewrite" icon="♻️" label="다시 쓸 글" count={returnedCount}
                actionLabel="고치러 가기" tone={TONES.rewrite}
                onClick={onGoRewrite}
            />
        );
    }
    if (hasActivity) {
        rows.push(
            <TodoRow
                key="news" icon="💬" label="새 소식" count={1}
                actionLabel="확인하기" tone={TONES.news}
                onClick={onOpenFeedback}
            />
        );
    }

    return (
        <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            aria-label="오늘 할 일"
            className="student-todo-card"
        >
            <header className="student-todo-card__header">
                <div><span>먼저 확인해요</span><h2>📌 오늘 할 일</h2></div>
                {rows.length > 0 && <strong>{rows.reduce((sum, row) => sum + Number(row.props.count || 0), 0)}개 남음</strong>}
            </header>

            {rows.length === 0 ? (
                <div className="student-todo-done">
                    <span aria-hidden="true">🎉</span>
                    <div><strong>할 일을 모두 끝냈어요!</strong><small>읽고 싶은 책 이야기를 독서록에 남겨 볼까요?</small></div>
                </div>
            ) : (
                <div className="student-todo-card__rows">{rows}</div>
            )}
        </motion.section>
    );
};

export default StudentTodoCard;
