import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useRealtimeNotifications = (studentSession, setPoints, refetchDataControls) => {
    const [teacherNotify, setTeacherNotify] = useState(null);

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
                        // 즉시 콜백을 통해 포인트 갱신
                        setPoints(prev => {
                            const updated = (prev || 0) + newLog.amount;
                            console.log(`💰 [Realtime] 포인트 UI 갱신됨: ${prev} -> ${updated}`);
                            return updated;
                        });
                    }

                    let bannerMsg = "";
                    let bannerIcon = "🎁";

                    if (newLog.amount !== 0) {
                        const cleanReason = (newLog.reason || '').replace(/\(PostID:[^)]+\)/, '').trim();
                        console.log(`🔔 [Realtime] 알림 배너 생성 시도 (Clean Reason: ${cleanReason})`);

                        if (newLog.amount < 0) {
                            if (newLog.reason?.includes('승인 취소')) {
                                bannerMsg = `⚠️ 앗! 글 승인이 취소되어 ${newLog.amount}P가 회수되었습니다.`;
                            } else {
                                bannerMsg = `⚠️ ${cleanReason} (${newLog.amount}P)`;
                            }
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
                            // 일반적인 보상 (댓글 등)
                            bannerMsg = `🎁 ${cleanReason} (+${newLog.amount}P)`;
                            bannerIcon = "🎁";
                        }
                    }

                    if (bannerMsg) {
                        console.log(`✅ [Realtime] 배너 출력 대기: ${bannerMsg}`);
                        setTeacherNotify({
                            type: 'point',
                            message: bannerMsg,
                            icon: bannerIcon,
                            amount: newLog.amount, // 상세 수치 정보 명시
                            timestamp: Date.now()
                        });
                    } else {
                        console.log(`⏭️ [Realtime] 배너 조건 미충족 혹은 이미 처리됨 (Amount: ${newLog.amount})`);
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

                    console.log(`[Realtime] 포스트 업데이트 알림 수신:`, { old: oldPost, new: updatedPost });

                    // 1. 반려(다시 쓰기) 요청
                    if (updatedPost.is_returned && !oldPost.is_returned) {
                        setTeacherNotify({
                            type: 'rewrite',
                            message: "♻️ 선생님의 다시 쓰기 요청이 있습니다.",
                            icon: "♻️",
                            timestamp: Date.now()
                        });
                        refetchDataControls?.checkActivity?.();
                    }
                    // 2. 승인 완료
                    else if (updatedPost.is_confirmed && !oldPost.is_confirmed) {
                        // 포인트 로그 알림이 곧이어 오겠지만, 확실한 피드백을 위해 기본 알림도 병행하거나 
                        // 이미 포인트 알림이 왔다면 덮어쓰지 않도록 체크할 수 있습니다.
                        setTeacherNotify(prev => {
                            // 이미 상세 포인트 정보가 담긴 알림이 떠 있다면 유지
                            if (prev?.type === 'point' && prev?.message?.includes('승인')) return prev;

                            return {
                                type: 'approve',
                                message: `🎉 글이 승인되었습니다! 축하해요!`,
                                icon: "🎉",
                                timestamp: Date.now()
                            };
                        });
                        refetchDataControls?.fetchMyPoints?.();
                        refetchDataControls?.fetchStats?.();
                    }
                    // 3. 승인 취소/회수
                    else if (!updatedPost.is_confirmed && oldPost.is_confirmed) {
                        setTeacherNotify(prev => {
                            // 이미 상세 포인트 회수 정보가 담긴 알림이 떠 있다면 유지
                            if (prev?.type === 'point' && prev?.message?.includes('회수')) return prev;

                            return {
                                type: 'recovery',
                                message: "⚠️ 글의 승인이 취소되거나 회수되었습니다.",
                                icon: "⚠️",
                                timestamp: Date.now()
                            };
                        });
                        refetchDataControls?.fetchMyPoints?.();
                        refetchDataControls?.fetchStats?.();
                    }
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] 채널 상태:`, status);
            });

        return () => {
            console.log(`📡 [Realtime] 알림 채널 구독 해제 (Student ID: ${studentSession.id})`);
            supabase.removeChannel(notificationChannel);
        };
    }, [studentSession?.id, setPoints, refetchDataControls]);

    return {
        teacherNotify,
        setTeacherNotify
    };
};
