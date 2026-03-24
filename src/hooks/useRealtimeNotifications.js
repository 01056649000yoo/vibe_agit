import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useRealtimeNotifications = (studentSession, setPoints, refetchDataControls) => {
    const [teacherNotify, setTeacherNotify] = useState(null);

    // [최적화] 디바운싱 처리를 위한 타이머 컨테이너
    const pointTimerRef = useRef(null);
    const fetchTimerRef = useRef(null);
    const notifyTimerRef = useRef(null);
    const accumulatedPointsRef = useRef(0);

    // [최적화] 공통 fetch 디바운스 함수 (동시다발적인 refetch 방지)
    const debouncedFetch = (type) => {
        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = setTimeout(() => {
            if (type === 'points') {
                refetchDataControls?.fetchMyPoints?.();
                refetchDataControls?.fetchStats?.();
            } else if (type === 'activity') {
                refetchDataControls?.checkActivity?.();
            }
        }, 800);
    };

    // [최적화] 공통 notify 디바운스 함수 (연속된 알림을 마지막 1개만 노출)
    const debouncedNotify = (notifyObj) => {
        if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
        notifyTimerRef.current = setTimeout(() => {
            setTeacherNotify(notifyObj);
        }, 300);
    };

    useEffect(() => {
        if (!studentSession?.id) return;

        console.log(`📡 [Realtime] 알림 채널 구독 시작 (Student ID: ${studentSession.id})`);

        const notificationChannel = supabase
            .channel(`student_realtime_v3_${studentSession.id}`)
            // 1. 포인트 변동 감지 (point_logs)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'point_logs',
                    filter: `student_id=eq.${studentSession.id}`
                },
                (payload) => {
                    const newLog = payload.new;
                    console.log(`📡 [Realtime] 포인트 알림 수신! (Amount: ${newLog.amount}, Reason: ${newLog.reason})`, newLog);

                    if (newLog.amount !== 0) {
                        // [최적화] 여러 포인트 알림이 동시에 올 경우 모아서 한 번에 업데이트 (디바운싱)
                        accumulatedPointsRef.current += newLog.amount;
                        if (pointTimerRef.current) clearTimeout(pointTimerRef.current);
                        
                        pointTimerRef.current = setTimeout(() => {
                            const totalAmount = accumulatedPointsRef.current;
                            accumulatedPointsRef.current = 0; // 초기화
                            
                            if (totalAmount !== 0) {
                                setPoints(prev => {
                                    const updated = (prev || 0) + totalAmount;
                                    console.log(`💰 [Realtime Debounced] 포인트 UI 갱신됨: ${prev} -> ${updated}`);
                                    return updated;
                                });
                            }
                        }, 500);
                    }

                    let bannerMsg = "";
                    let bannerIcon = "🎁";

                    if (newLog.amount !== 0) {
                        const cleanReason = (newLog.reason || '').replace(/\(PostID:[^)]+\)/, '').trim();
                        if (newLog.amount < 0) {
                            if (newLog.reason?.includes('승인 취소')) bannerMsg = `⚠️ 앗! 글 승인이 취소되어 ${newLog.amount}P가 회수되었습니다.`;
                            else bannerMsg = `⚠️ ${cleanReason} (${newLog.amount}P)`;
                            bannerIcon = "⚠️";
                        } else if (newLog.reason?.includes('아이디어 마켓') && newLog.reason?.includes('결정')) {
                            bannerMsg = `🏛️✅ 아이디어가 최종 결정되었습니다! (+${newLog.amount}P)`;
                            bannerIcon = "🏛️";
                        } else if (newLog.reason?.includes('승인')) {
                            bannerMsg = `🎉 글이 승인되어 +${newLog.amount}P를 얻었습니다!`;
                            bannerIcon = "🎉";
                        } else if (newLog.reason?.includes('어휘의 탑')) {
                            bannerMsg = `🏰 어휘탑 등반 성공! (+${newLog.amount}P)`;
                            bannerIcon = "🏆";
                        } else {
                            bannerMsg = `🎁 ${cleanReason} (+${newLog.amount}P)`;
                            bannerIcon = "🎁";
                        }
                    }

                    if (bannerMsg) {
                        debouncedNotify({
                            type: 'point',
                            message: bannerMsg,
                            icon: bannerIcon,
                            amount: newLog.amount,
                            timestamp: Date.now()
                        });
                    }
                }
            )
            // 2. 글 승인/반려 감지 (student_posts)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'student_posts',
                    filter: `student_id=eq.${studentSession.id}`
                },
                (payload) => {
                    const updatedPost = payload.new;
                    const oldPost = payload.old;

                    // 1. 반려(다시 쓰기) 요청
                    if (updatedPost.is_returned && !oldPost.is_returned) {
                        debouncedNotify({
                            type: 'rewrite', message: "♻️ 선생님의 다시 쓰기 요청이 있습니다.", icon: "♻️", timestamp: Date.now()
                        });
                        debouncedFetch('activity');
                    }
                    // 2. 승인 완료
                    else if (updatedPost.is_confirmed && !oldPost.is_confirmed) {
                        debouncedNotify({
                            type: 'approve', message: `🎉 글이 승인되었습니다! 축하해요!`, icon: "🎉", timestamp: Date.now()
                        });
                        debouncedFetch('points');
                    }
                    // 3. 승인 취소/회수
                    else if (!updatedPost.is_confirmed && oldPost.is_confirmed) {
                        debouncedNotify({
                            type: 'recovery', message: "⚠️ 글의 승인이 취소되거나 회수되었습니다.", icon: "⚠️", timestamp: Date.now()
                        });
                        debouncedFetch('points');
                    }
                }
            )
            .subscribe();

        return () => {
            console.log(`📡 [Realtime] 알림 채널 구독 해제 (Student ID: ${studentSession.id})`);
            supabase.removeChannel(notificationChannel);
            // 언마운트 시 타이머 클리어
            if (pointTimerRef.current) clearTimeout(pointTimerRef.current);
            if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
            if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
        };
    }, [studentSession?.id, setPoints, refetchDataControls]);

    return {
        teacherNotify,
        setTeacherNotify
    };
};
