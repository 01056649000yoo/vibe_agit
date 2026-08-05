import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

const FETCH_DEBOUNCE_MS = 800;

export const useRealtimeNotifications = (studentSession, setPoints, refetchDataControls) => {
    const [teacherNotify, setTeacherNotify] = useState(null);

    // [최적화] 디바운싱 처리를 위한 타이머 컨테이너
    const pointTimerRef = useRef(null);
    const fetchTimerRef = useRef(null);
    const notifyTimerRef = useRef(null);
    const accumulatedPointsRef = useRef(0);
    const pendingFetchTypesRef = useRef({ points: false, activity: false });
    const visibilityQueuedFetchRef = useRef(false);

    // [최적화] 공통 fetch 디바운스 함수 (동시다발적인 refetch 방지)
    const debouncedFetch = (type) => {
        if (type === 'points') {
            pendingFetchTypesRef.current.points = true;
        } else if (type === 'activity') {
            pendingFetchTypesRef.current.activity = true;
        }

        if (typeof document !== 'undefined' && document.hidden) {
            visibilityQueuedFetchRef.current = true;
            return;
        }

        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = setTimeout(() => {
            const { points, activity } = pendingFetchTypesRef.current;
            pendingFetchTypesRef.current = { points: false, activity: false };
            visibilityQueuedFetchRef.current = false;

            if (points) {
                callbacksRef.current.refetchDataControls?.fetchMyPoints?.();
                // 작가·독자 칭호는 공용 모듈의 단일 캐시를 무효화한다.
                callbacksRef.current.refetchDataControls?.refreshMyTitleStatus?.();
            }

            if (activity) {
                callbacksRef.current.refetchDataControls?.checkActivity?.();
                callbacksRef.current.refetchDataControls?.fetchReturnedCount?.(true);
            }
        }, FETCH_DEBOUNCE_MS);
    };

    // [최적화] 공통 notify 디바운스 함수 (연속된 알림을 마지막 1개만 노출)
    //
    // 한 가지 일에 알림이 **두 곳에서** 온다. 예를 들어 안건이 결정되면
    //   ① 글 상태 변경(`student_posts`) → "회의 안건이 최종 결정되었습니다!"  (금액 없음)
    //   ② 포인트 지급(`point_logs`)      → "... (+50P)"                      (금액 있음)
    // 둘 다 300ms 안에 들어오는데 예전에는 **나중에 온 것이 무조건 이겨서**, 도착 순서에 따라
    // 금액이 안 보이는 일이 생겼다. 그래서 금액이 담긴 알림에 높은 우선순위를 주고,
    // 같은 창 안에서는 낮은 것이 높은 것을 덮지 못하게 한다.
    const notifyPriorityRef = useRef(-1);
    const debouncedNotify = (notifyObj, priority = 0) => {
        if (notifyTimerRef.current && priority < notifyPriorityRef.current) return;

        notifyPriorityRef.current = priority;
        if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
        notifyTimerRef.current = setTimeout(() => {
            notifyTimerRef.current = null;
            notifyPriorityRef.current = -1;
            setTeacherNotify(notifyObj);
        }, 300);
    };

    // [최적화] 콜백 안정화 (부모 리렌더링 시 구독 유지)
    const callbacksRef = useRef({ setPoints, refetchDataControls });
    useEffect(() => {
        callbacksRef.current = { setPoints, refetchDataControls };
    }, [setPoints, refetchDataControls]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden || !visibilityQueuedFetchRef.current) return;

            const { points, activity } = pendingFetchTypesRef.current;
            if (points) debouncedFetch('points');
            if (activity) debouncedFetch('activity');
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    useEffect(() => {
        if (!studentSession?.id) return;

        const channelName = `student_realtime_v3_${studentSession.id}`;
        console.log(`📡 [Realtime] 알림 채널 구독 시작: ${channelName}`);

        // [방어막] 기존 동일 이름의 채널이 있다면 명시적으로 제거하여 중복 구독 방지
        const duplicate = supabase.getChannels().find(c => c.name === channelName);
        if (duplicate) {
            console.log(`♻️ [Realtime] 중복 채널 감지 및 제거: ${channelName}`);
            supabase.removeChannel(duplicate);
        }

        const notificationChannel = supabase
            .channel(channelName)
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
                    console.log(`📡 [Realtime] 포인트 알림 수신! (Amount: ${newLog.amount})`);

                    if (newLog.amount !== 0) {
                        // 드래곤 꾸미기 구매는 해당 훅(useDragonPet)에서
                        // 이미 서버 응답을 통해 포인트를 동기화하므로 리얼타임 합산에서 제외합니다.
                        const isDragonAction = newLog.reason?.includes('드래곤') || newLog.reason?.includes('아지트 배경');
                        
                        if (!isDragonAction) {
                            accumulatedPointsRef.current += newLog.amount;
                        }

                        if (pointTimerRef.current) clearTimeout(pointTimerRef.current);
                        
                        pointTimerRef.current = setTimeout(() => {
                            const totalAmount = accumulatedPointsRef.current;
                            accumulatedPointsRef.current = 0; 
                            
                            if (totalAmount !== 0) {
                                callbacksRef.current.setPoints(prev => (prev || 0) + totalAmount);
                            }
                        }, 500);
                    }
                    
                    // ... (알림 배너 로직 생략 가능하나 원본 유지)
                    let bannerMsg = "";
                    let bannerIcon = "🎁";
                    if (newLog.amount !== 0) {
                        const cleanReason = (newLog.reason || '').replace(/\((Post|Mission)ID:[^)]+\)/g, '').trim();
                        if (newLog.amount < 0) {
                            // 회수 금액은 절댓값으로 보여 준다. `-50P가 회수` 처럼 읽히지 않게.
                            const recovered = Math.abs(newLog.amount);
                            if (newLog.reason?.includes('안건 결정 취소')) {
                                bannerMsg = `🏛️ 회의 안건 결정이 취소되어 ${recovered}P가 회수되었습니다.`;
                                bannerIcon = "🏛️";
                            } else if (newLog.reason?.includes('승인 취소')) {
                                bannerMsg = `⚠️ 앗! 글 승인이 취소되어 ${recovered}P가 회수되었습니다.`;
                                bannerIcon = "⚠️";
                            } else {
                                bannerMsg = `⚠️ ${cleanReason} (-${recovered}P)`;
                                bannerIcon = "⚠️";
                            }
                        } else if ((newLog.reason?.includes('아이디어 마켓') || newLog.reason?.includes('회의 안건')) && newLog.reason?.includes('결정')) {
                            bannerMsg = `🏛️✅ 회의 안건이 최종 결정되어 ${newLog.amount}P를 받았어요!`;
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
                        // 금액이 담긴 알림 — 같은 일로 온 상태 변경 알림보다 우선한다.
                        debouncedNotify({
                            type: 'point', message: bannerMsg, icon: bannerIcon, amount: newLog.amount, timestamp: Date.now()
                        }, 2);
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

                    // 아래 알림들은 **금액을 모른다**(포인트는 별도 기록으로 온다).
                    // 그래서 우선순위 1 로 보내, 금액이 담긴 포인트 알림(우선순위 2)이 함께 오면
                    // 그쪽이 화면에 남게 한다. 보상이 없는 경우(기준 미달 등)에는 이 문구가 그대로 뜬다.
                    if (updatedPost.is_returned && !oldPost.is_returned) {
                        debouncedNotify({ type: 'rewrite', message: "♻️ 선생님의 다시 쓰기 요청이 있습니다.", icon: "♻️", timestamp: Date.now() }, 1);
                        debouncedFetch('activity');
                    } else if (updatedPost.is_confirmed && !oldPost.is_confirmed) {
                        // 회의 안건 결정 시 전용 문구 노출
                        const isIdea = updatedPost.status === '결정됨';
                        const message = isIdea ? "🏛️✅ 회의 안건이 최종 결정되었습니다!" : "🎉 글이 승인되었습니다! 축하해요!";
                        const icon = isIdea ? "🏛️" : "🎉";

                        debouncedNotify({ type: isIdea ? 'idea_decided' : 'approve', message, icon, timestamp: Date.now() }, 1);
                        debouncedFetch('points');
                    } else if (!updatedPost.is_confirmed && oldPost.is_confirmed) {
                        const wasIdea = oldPost.status === '결정됨';
                        const message = wasIdea
                            ? "🏛️ 회의 안건 결정이 취소되었습니다."
                            : "⚠️ 글의 승인이 취소되거나 회수되었습니다.";

                        debouncedNotify({ type: 'recovery', message, icon: wasIdea ? "🏛️" : "⚠️", timestamp: Date.now() }, 1);
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
    }, [studentSession?.id]);

    return {
        teacherNotify,
        setTeacherNotify
    };
};
