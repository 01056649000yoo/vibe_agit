import { useEffect, useState } from 'react';
import { STUDENT_HOME_SYNC_EVENT } from '../modules/home/studentHomeApi';

/**
 * 공용 홈 스냅샷이 갱신됐을 때 이전 값과 비교해 학생에게 변화만 알려 준다.
 * DB나 Realtime 연결을 직접 만들지 않으므로 학생 수가 늘어도 연결 수를 소비하지 않는다.
 */
export const useStudentSyncNotifications = (studentSession) => {
    const [teacherNotify, setTeacherNotify] = useState(null);

    useEffect(() => {
        if (!studentSession?.id) return undefined;
        const handleSync = (event) => {
            if (event.detail?.studentId !== studentSession.id) return;
            const previous = event.detail.previous;
            const current = event.detail.current;
            const previousPoints = Number(previous?.student?.total_points || 0);
            const currentPoints = Number(current?.student?.total_points || 0);
            const previousReturned = Number(previous?.home?.returned_count || 0);
            const currentReturned = Number(current?.home?.returned_count || 0);
            const pointDelta = currentPoints - previousPoints;

            if (currentReturned > previousReturned) {
                setTeacherNotify({
                    type: 'rewrite',
                    message: '♻️ 선생님의 다시 쓰기 요청이 있습니다.',
                    icon: '♻️',
                    timestamp: Date.now()
                });
            } else if (pointDelta !== 0) {
                const increased = pointDelta > 0;
                setTeacherNotify({
                    type: 'point',
                    message: increased
                        ? `🎁 새로운 활동으로 +${pointDelta}P를 받았어요!`
                        : `⚠️ 활동 변경으로 ${Math.abs(pointDelta)}P가 조정되었어요.`,
                    icon: increased ? '🎁' : '⚠️',
                    amount: pointDelta,
                    timestamp: Date.now()
                });
            }
        };
        window.addEventListener(STUDENT_HOME_SYNC_EVENT, handleSync);
        return () => window.removeEventListener(STUDENT_HOME_SYNC_EVENT, handleSync);
    }, [studentSession?.id]);

    return { teacherNotify, setTeacherNotify };
};

export default useStudentSyncNotifications;
