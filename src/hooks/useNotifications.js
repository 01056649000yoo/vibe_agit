import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * 역할: 학생 전용 실시간 알림 훅 ⚡
 * 교사의 포인트 지급/회수, 다시 쓰기 요청 등을 즉각 감지합니다.
 * 
 * @param {string} studentId - 모니터링할 학생 ID (UUID)
 * @param {function} onPointChange - 포인트 변경 시 실행할 콜백 (선택)
 * @returns {object} { teacherNotify, clearNotify }
 */
export const useNotifications = (studentId, onPointChange = null) => {
    const [teacherNotify, setTeacherNotify] = useState(null);
    const onPointChangeRef = useRef(onPointChange);

    // 콜백이 바뀌어도 ref를 통해 최신 버전 유지
    useEffect(() => {
        onPointChangeRef.current = onPointChange;
    }, [onPointChange]);

    const handleNewLog = useCallback((log) => {
        const isRewrite = log.reason?.includes('다시 쓰기') || log.reason?.includes('♻️');

        let bannerMsg = "";
        let bannerIcon = "🎁";
        let type = 'point';

        if (isRewrite) {
            bannerMsg = "♻️ 선생님의 다시 쓰기 요청이 있습니다.";
            bannerIcon = "♻️";
            type = 'rewrite';
        } else if (log.amount < 0) {
            bannerMsg = `⚠️ ${log.reason} (${log.amount}P)`;
            bannerIcon = "⚠️";
        } else if (log.reason?.includes('승인')) {
            bannerMsg = `🎉 글이 승인되어 +${log.amount}P를 받았어요!`;
            bannerIcon = "🎉";
        } else if (log.amount > 0) {
            bannerMsg = `🎁 ${log.reason} (+${log.amount}P)`;
            bannerIcon = "🎁";
        }

        if (bannerMsg) {
            setTeacherNotify({
                type,
                message: bannerMsg,
                icon: bannerIcon,
                timestamp: Date.now()
            });
        }
    }, []);

    useEffect(() => {
        if (!studentId) return;

        console.log(`🔌 [useNotifications] Connecting to point_logs for student: ${studentId}`);

        const channel = supabase
            .channel(`notify_${studentId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'point_logs',
                    filter: `student_id=eq.${studentId}`
                },
                (payload) => {
                    const newLog = payload.new;
                    console.log('⚡ [Realtime] 알림 수신:', newLog);

                    // Ref를 통해 최신 콜백 안전하게 호출
                    if (onPointChangeRef.current && newLog.amount !== 0) {
                        onPointChangeRef.current(newLog.amount);
                    }

                    handleNewLog(newLog);
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ [useNotifications] Realtime Connected!');
                }
            });

        return () => {
            console.log('🔌 [useNotifications] Disconnecting...');
            supabase.removeChannel(channel);
        };
    }, [studentId, handleNewLog]);

    const clearNotify = () => setTeacherNotify(null);

    return { teacherNotify, clearNotify };
};
