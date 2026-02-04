import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

const DEFAULT_SETTINGS = {
    isEnabled: false,
    targetScore: 100,
    activityGoals: { post: 1, comment: 5, reaction: 5 }
};

/**
 * useClassAgitClass - 우리반 아지트의 온도와 성장 단계를 관리하는 훅
 * 초등학생들이 자기 효능감을 느낄 수 있도록 '우리들의 노력으로 아지트가 자라난다'는 컨셉
 */
export const useClassAgitClass = (classId, currentStudentId) => {
    console.log("🏫 [useClassAgitClass 훅 호출됨]", { classId, currentStudentId });

    const [loading, setLoading] = useState(true);
    const [temperature, setTemperature] = useState(0);
    const [stageLevel, setStageLevel] = useState(1);
    const [counts, setCounts] = useState({ posts: 0, feedbacks: 0 });
    const [unlockedContent, setUnlockedContent] = useState({
        thermometer: true, // 1단계: 기본 제공
        relayNovel: false, // 2단계
        classAlbum: false, // 3단계
        secretGarden: false, // 4단계
        legendaryBase: false  // 5단계
    });
    const [boardMessages, setBoardMessages] = useState([]); // 실시간 전광판 메시지
    const [dailyStats, setDailyStats] = useState({ totalAddedTemp: 0 });
    const [myMissionStatus, setMyMissionStatus] = useState({ post: 0, comment: 0, reaction: 0, achieved: false });
    const [agitSettingsState, setAgitSettingsState] = useState(DEFAULT_SETTINGS);
    const [achievedStudentsList, setAchievedStudentsList] = useState([]); // 오늘의 미션 완료자 목록

    const agitSettings = useMemo(() => agitSettingsState, [agitSettingsState]);

    // 단계별 메시지 및 설명 (초등학생 눈높이)
    const stageInfo = {
        1: {
            title: "아지트의 시작 🌱",
            description: "우리들의 첫 발걸음! 글을 쓰고 친구의 글에 반응하면 아지트의 마법이 시작돼요.",
            tip: "친구의 글에 예쁜 피드백을 남기면 온도가 쑥쑥 올라가요! (피드백은 +5도, 글쓰기는 +2도)"
        },
        2: {
            title: "쑥쑥 자라는 씨앗 🌿",
            description: "아지트에 생기가 돌고 있어요! 우리들의 목소리가 모여 작은 숲이 되었네요.",
            tip: "이제 '릴레이 소설' 기능이 열렸어요! 친구와 함께 이야기를 이어가 볼까요?"
        },
        3: {
            title: "꽃피는 아지트 🌸",
            description: "우와! 우리 반 친구들의 열정이 가득해요. 이제 아지트가 환하게 빛나고 있어요.",
            tip: "와아! '우리들의 사진첩'이 열렸어요. 즐거운 추억을 사진으로 남겨보세요!"
        },
        4: {
            title: "신비한 마법 정원 ✨",
            description: "우리들의 마음이 하나로 모여 마법 같은 공간이 탄생했어요! 정말 대단해요.",
            tip: "이제 '비밀의 정원'에서 우리 반만의 특별한 미션을 수행할 수 있어요!"
        },
        5: {
            title: "전설의 공중 아지트 🏰",
            description: "최고예요! 우리 반은 이제 전설이 되었어요. 세계에서 가장 멋진 아지트예요!",
            tip: "전설의 아지트 보상을 확인해 보세요. 우리 모두가 만들어낸 기적이에요!"
        }
    };

    const calculateStage = (temp, target) => {
        const t = target || 100;
        if (temp >= t) return 5;
        if (temp >= t * 0.75) return 4;
        if (temp >= t * 0.5) return 3;
        if (temp >= t * 0.25) return 2;
        return 1;
    };

    const updateUnlockedContent = (level) => {
        setUnlockedContent({
            thermometer: true,
            relayNovel: level >= 2,
            classAlbum: level >= 3,
            secretGarden: level >= 4,
            legendaryBase: level >= 5
        });
    };

    const fetchData = useCallback(async (isInitial = false) => {
        if (!classId) {
            setLoading(false);
            return;
        }

        try {
            if (isInitial) setLoading(true);

            console.log("🔍 [아지트 데이터 조회 시작] classId:", classId);

            // 0. 학급 설정 조회 (목표 온도 및 점수 정책)
            const { data: classData, error: classError } = await supabase
                .from('classes')
                .select('agit_settings')
                .eq('id', classId)
                .single();

            console.log("📦 [DB 조회 결과]", { classData, classError });

            if (classError) console.warn("⚠️ 학급 설정을 가져오는데 실패했거나 설정이 없습니다:", classError);

            // DB 설정을 최우선으로, 없으면 기본값 사용
            // 0이 입력될 경우 || 연산자는 false로 처리하므로 ?? (Nullish coalescing) 사용
            const dbSettings = classData?.agit_settings || {};
            const currentSettings = {
                isEnabled: dbSettings.isEnabled ?? false,
                currentTemperature: dbSettings.currentTemperature ?? 0,
                targetScore: dbSettings.targetScore ?? DEFAULT_SETTINGS.targetScore,
                lastResetAt: dbSettings.lastResetAt ?? null,
                surpriseGift: dbSettings.surpriseGift ?? '',
                activityGoals: {
                    post: dbSettings.activityGoals?.post ?? DEFAULT_SETTINGS.activityGoals.post,
                    comment: dbSettings.activityGoals?.comment ?? DEFAULT_SETTINGS.activityGoals.comment,
                    reaction: dbSettings.activityGoals?.reaction ?? DEFAULT_SETTINGS.activityGoals.reaction
                }
            };

            console.log("✅ [동기화된 아지트 설정]", currentSettings);

            // 상태 업데이트 최적화 (값이 실제로 변했을 때만 업데이트)
            setAgitSettingsState(prev => {
                if (JSON.stringify(prev) !== JSON.stringify(currentSettings)) {
                    return currentSettings;
                }
                return prev;
            });

            // 1. 집계 시작 시점 결정 (오늘 또는 마지막 초기화 시점)
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const tomorrow = new Date(todayStart);
            tomorrow.setDate(tomorrow.getDate() + 1);

            let calculationStart = todayStart;
            if (currentSettings.lastResetAt) {
                const resetTime = new Date(currentSettings.lastResetAt);
                // 밀리초 단위 비교로 더 정확하게 판단 (오늘 시작보다 초기화 시점이 늦으면 초기화 시점부터)
                if (resetTime.getTime() > todayStart.getTime()) {
                    calculationStart = resetTime;
                    console.log("🕒 [초기화 시점 기준 집계 시작]", resetTime.toISOString());
                }
            }

            const startDate = calculationStart.toISOString();
            const endDate = tomorrow.toISOString();

            console.log("📅 [아지트 집계 시작 시각(ISO)]:", startDate);
            console.log("📅 [아지트 집계 종료 시각(ISO)]:", endDate);
            console.log("🏠 [현재 설정상의 마지막 초기화 시각]:", currentSettings.lastResetAt);
            // 1. 전체 게시글 수 조회 (초기화 시점 이후만)
            const { count: postCount } = await supabase
                .from('student_posts')
                .select('student_id, students!inner(class_id)', { count: 'exact', head: true })
                .eq('students.class_id', classId)
                .gte('created_at', startDate);

            // 2. 전체 반응 및 댓글 수 조회 (초기화 시점 이후만)
            const { count: reactionCount } = await supabase
                .from('post_reactions')
                .select('student_id, students!inner(class_id)', { count: 'exact', head: true })
                .eq('students.class_id', classId)
                .gte('created_at', startDate);

            const { count: commentCount } = await supabase
                .from('post_comments')
                .select('student_id, students!inner(class_id)', { count: 'exact', head: true })
                .eq('students.class_id', classId)
                .gte('created_at', startDate);

            const totalFeedbacks = (reactionCount || 0) + (commentCount || 0);

            // 3. 오늘의 활동 집계 (일일 미션 시스템용 - 시간 범위 적용)
            console.log("📅 [아지트 활동 집계 기간]", { startDate, endDate });

            const { data: dailyPosts } = await supabase
                .from('student_posts')
                .select('student_id, students!inner(name, class_id)')
                .eq('students.class_id', classId)
                .gte('created_at', startDate)
                .lt('created_at', endDate);

            const { data: dailyReactions } = await supabase
                .from('post_reactions')
                .select('student_id, students!inner(name, class_id)')
                .eq('students.class_id', classId)
                .gte('created_at', startDate)
                .lt('created_at', endDate);

            const { data: dailyComments } = await supabase
                .from('post_comments')
                .select('student_id, students!inner(name, class_id)')
                .eq('students.class_id', classId)
                .gte('created_at', startDate)
                .lt('created_at', endDate);

            // 점수 계산 정책 (교사 설정 반영 - 미션 달성형)
            const goals = currentSettings.activityGoals || { post: 1, comment: 5, reaction: 5 };
            const studentMap = {};

            const process = (items, type) => {
                items?.forEach(item => {
                    const sid = item.student_id;
                    const studentName = item.students?.name;
                    if (!sid || !studentName) return;

                    if (!studentMap[sid]) {
                        studentMap[sid] = {
                            student_id: sid, // ID 보존
                            name: studentName,
                            counts: { post: 0, comment: 0, reaction: 0 },
                            isAchieved: false
                        };
                    }
                    studentMap[sid].counts[type] += 1;
                });
            };

            process(dailyPosts, 'post');
            process(dailyReactions, 'reaction');
            process(dailyComments, 'comment');

            const achievedStudents = [];
            Object.values(studentMap).forEach(s => {
                if (
                    s.counts.post >= goals.post &&
                    s.counts.comment >= goals.comment &&
                    s.counts.reaction >= goals.reaction
                ) {
                    s.isAchieved = true;
                    achievedStudents.push(s);
                }
            });

            const messages = achievedStudents.map(s => {
                return `🏆 [오늘의 주인공] ${s.name}님이 일일 미션을 모두 달성하여 온도를 1도 올렸습니다! ✨`;
            });

            // 누적 온도 계산 (DB에 저장된 누적값 + 오늘 달성한 미션 수)
            const baseTemperature = currentSettings.currentTemperature || 0;
            const todayMissionTemp = achievedStudents.length;
            const currentTemp = Math.min(currentSettings.targetScore, baseTemperature + todayMissionTemp);

            console.log("🌡️ [온도 계산]", {
                baseTemperature,
                todayMissionTemp,
                currentTemp,
                achievedStudents: achievedStudents.map(s => s.name)
            });

            const level = calculateStage(currentTemp, currentSettings.targetScore);

            setBoardMessages(messages.length > 0 ? messages : ["오늘의 아지트 미션(글 쓰기, 댓글 달기, 반응하기)을 모두 달성하면 전광판에 이름이 올라와요! 😊"]);
            setCounts({ posts: postCount || 0, feedbacks: totalFeedbacks });
            setTemperature(currentTemp);

            if (currentStudentId && studentMap[currentStudentId]) {
                const s = studentMap[currentStudentId];
                setMyMissionStatus({
                    ...s.counts,
                    achieved: s.isAchieved
                });
            } else {
                setMyMissionStatus({ post: 0, comment: 0, reaction: 0, achieved: false });
            }

            setDailyStats({ totalAddedTemp: todayMissionTemp });
            setStageLevel(level);
            updateUnlockedContent(level);

            // 훅 내부 상태에 저장하여 외부로 노출
            setAchievedStudentsList(achievedStudents);

            // [신규] 명예의 전당 DB 기록 (백그라운드 동기화)
            if (achievedStudents.length > 0) {
                const records = achievedStudents.map(s => ({
                    student_id: s.student_id, // sid를 student_id로 매핑했던 process 함수 확인 필요
                    class_id: classId,
                    // achieved_date는 DB에서 DEFAULT CURRENT_DATE로 처리
                }));

                // 실제 insert (unique 제약조건 때문에 중복은 무시됨)
                // Note: process 함수에서 student_id 필드가 확보되어 있어야 함.
                // fetchData 내부의 process 함수를 확인해보니 item.student_id를 sid로 사용함.
                const recordsToInsert = achievedStudents.map(s => {
                    // achievedStudents 객체 구조: { name, counts, isAchieved, student_id }
                    // student_id를 확보하기 위해 process 함수 수정 필요 (아래에서 수정)
                    return {
                        student_id: s.student_id,
                        class_id: classId
                    };
                }).filter(r => r.student_id);

                if (recordsToInsert.length > 0) {
                    supabase
                        .from('agit_honor_roll')
                        .upsert(recordsToInsert, { onConflict: 'student_id,achieved_date' })
                        .then(({ error }) => {
                            if (error && error.code !== '23505') console.error("명예의 전당 기록 실패:", error);
                        });
                }
            }

        } catch (error) {
            console.error("Error fetching agit data:", error);
        } finally {
            if (isInitial) setLoading(false);
        }
    }, [classId, currentStudentId]);

    useEffect(() => {
        fetchData(true);

        // 실시간 업데이트 설정 (student_posts & comments, reactions 감시)
        const postSubscription = supabase
            .channel(`agit-posts-${classId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'student_posts'
            }, () => fetchData(false))
            .subscribe();

        const commentSubscription = supabase
            .channel(`agit-comments-${classId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'post_comments'
            }, () => fetchData(false))
            .subscribe();

        const reactionSubscription = supabase
            .channel(`agit-reactions-${classId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'post_reactions'
            }, () => fetchData(false))
            .subscribe();

        const classSubscription = supabase
            .channel(`agit-settings-${classId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'classes',
                filter: `id=eq.${classId}`
            }, () => fetchData(false))
            .subscribe();

        // 1. 자정이 지나 날짜가 바뀌었는지 1분마다 체크하여 자동 갱신
        let lastCheckDate = new Date().getDate();
        const dateCheckInterval = setInterval(() => {
            const currentDay = new Date().getDate();
            if (currentDay !== lastCheckDate) {
                console.log("🕛 [자정 경과] 날짜 변경 감지 -> 데이터 갱신");
                lastCheckDate = currentDay;
                fetchData(false);
            }
        }, 60000); // 1분 간격

        // 2. 브라우저 탭 활성화 시 데이터 갱신 (오래 켜뒀다가 다시 볼 때 대비)
        const handleFocus = () => {
            console.log("👀 [윈도우 포커스] 최신 데이터 확인");
            fetchData(false);
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            supabase.removeChannel(postSubscription);
            supabase.removeChannel(commentSubscription);
            supabase.removeChannel(reactionSubscription);
            supabase.removeChannel(classSubscription);
            clearInterval(dateCheckInterval); // 인터벌 정리
            window.removeEventListener('focus', handleFocus); // 이벤트 리스너 정리
        };
    }, [classId, fetchData]);

    return {
        loading,
        temperature,
        stageLevel,
        stageInfo: stageInfo[stageLevel],
        unlockedContent,
        counts,
        boardMessages,
        dailyStats,
        myMissionStatus,
        agitSettings,
        refresh: fetchData,
        achievedStudents: achievedStudentsList
    };
};
