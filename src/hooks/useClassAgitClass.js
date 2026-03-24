import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { dataCache } from '../lib/cache';

const DEFAULT_SETTINGS = {
    isMenuEnabled: false,
    isIdeaMarketEnabled: false,
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

    const [loading, setLoading] = useState(false); // [최적화] 즉시 렌더링을 위해 초기 로딩을 false로 변경
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

    // [신규] 어휘의 탑 게임 설정 상태
    const [vocabTowerSettings, setVocabTowerSettings] = useState({
        enabled: false,
        grade: 3,
        dailyLimit: 3,
        timeLimit: 40,
        rewardPoints: 80,
        resetDate: null,
        rankingResetDate: null
    });

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

    const fetchData = useCallback(async (isInitial = false, forceRefresh = false) => {
        if (!classId) {
            setLoading(false);
            return;
        }

        try {
            if (isInitial) setLoading(false); // [최적화] 로딩 화면으로 블로킹하지 않고, 빈 데이터(0점/초기상태)부터 바로 진입 + 데이터 들어오면 애니메이션으로 차오르게 유도

            console.log("🔍 [아지트 데이터 조회 시작] classId:", classId);

            // 0. 학급 설정 조회 (목표 온도 및 점수 정책) — dataCache 사용하여 중복 호출 방지
            const cacheKey = `class_settings_full_${classId}`;
            if (forceRefresh) {
                dataCache.invalidate(cacheKey);
            }
            const { classData, classError } = await dataCache.get(cacheKey, async () => {
                const { data, error } = await supabase
                    .from('classes')
                    .select('agit_settings, vocab_tower_enabled, vocab_tower_grade, vocab_tower_daily_limit, vocab_tower_reset_date, vocab_tower_time_limit, vocab_tower_reward_points, vocab_tower_ranking_reset_date')
                    .eq('id', classId)
                    .single();
                return { classData: data, classError: error };
            }, 60000); // 1분 캐시 유지

            console.log("📦 [DB 조회 결과]", { classData, classError });

            if (classError) console.warn("⚠️ 학급 설정을 가져오는데 실패했거나 설정이 없습니다:", classError);

            const dbSettings = classData?.agit_settings || {};
            const currentSettings = {
                isMenuEnabled: typeof dbSettings.isMenuEnabled === 'boolean' ? dbSettings.isMenuEnabled : (dbSettings.isEnabled ?? false),
                isIdeaMarketEnabled: typeof dbSettings.isIdeaMarketEnabled === 'boolean' ? dbSettings.isIdeaMarketEnabled : false,
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

            setAgitSettingsState(prev => {
                if (JSON.stringify(prev) !== JSON.stringify(currentSettings)) {
                    return currentSettings;
                }
                return prev;
            });

            // [신규] 어휘의 탑 설정 동기화
            setVocabTowerSettings({
                enabled: classData?.vocab_tower_enabled ?? false,
                grade: classData?.vocab_tower_grade || 3,
                dailyLimit: classData?.vocab_tower_daily_limit ?? 3,
                timeLimit: classData?.vocab_tower_time_limit ?? 40,
                rewardPoints: classData?.vocab_tower_reward_points ?? 80,
                resetDate: classData?.vocab_tower_reset_date || null,
                rankingResetDate: classData?.vocab_tower_ranking_reset_date || null
            });

            // 1. 집계 시작 시점 결정 (오늘 하루 단위로 달성 여부 판단)
            // 명예의 전당과 일일 활동은 '오늘 00시' 기준으로 초기화되어 재집계됨
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            const tomorrow = new Date(todayStart);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // [수정] 오늘 활동이더라도 "시즌 시작 시점(lastResetAt)"보다 이전의 활동은 포함하지 않음
            // (오늘 시즌을 초기화하고 다시 시작했을 때 이전 시즌의 오늘 활동이 합산되는 현상 방지)
            const seasonStartStr = currentSettings.lastResetAt || '2000-01-01T00:00:00.000Z';
            const seasonStartDate = new Date(seasonStartStr);

            // 실제 집계 시작 시점은 (오늘 00시)와 (시즌 시작 시점) 중 더 늦은 시간
            const effectiveStartDate = seasonStartDate > todayStart ? seasonStartDate : todayStart;

            const startDate = effectiveStartDate.toISOString();
            const endDate = tomorrow.toISOString();

            console.log("📅 [아지트 일일 활동 집계 기간]", { startDate, endDate, seasonStartStr });

            // ★ [성능 최적화] count 전용 쿼리 제거 및 4개 쿼리 병렬 실행으로 로딩 속도 대폭 개선
            const [
                { data: dailyPosts },
                { data: dailyReactions },
                { data: dailyComments },
                { data: pastHonorRolls }
            ] = await Promise.all([
                supabase
                    .from('student_posts')
                    .select('student_id, students!inner(name, class_id)')
                    .eq('students.class_id', classId)
                    .gte('created_at', startDate)
                    .lt('created_at', endDate),
                supabase
                    .from('post_reactions')
                    .select('student_id, students!inner(name, class_id)')
                    .eq('students.class_id', classId)
                    .gte('created_at', startDate)
                    .lt('created_at', endDate),
                supabase
                    .from('post_comments')
                    .select('student_id, students!inner(name, class_id)')
                    .eq('students.class_id', classId)
                    .gte('created_at', startDate)
                    .lt('created_at', endDate),
                supabase
                    .from('agit_honor_roll')
                    .select('id')
                    .eq('class_id', classId)
                    .gte('created_at', currentSettings.lastResetAt || '2000-01-01T00:00:00.000Z')
                    .lt('created_at', startDate)
            ]);

            // count는 data.length로 대체 (별도 쿼리 불필요)
            const postCount = dailyPosts?.length || 0;
            const totalFeedbacks = (dailyReactions?.length || 0) + (dailyComments?.length || 0);

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

            // 누적 온도 계산 (명예의 전당 과거 누적 달성 횟수 + 오늘 달성한 미션 수)
            const pastHonorRollCount = pastHonorRolls?.length || 0;
            const todayMissionTemp = achievedStudents.length;
            const currentTemp = Math.min(currentSettings.targetScore, pastHonorRollCount + todayMissionTemp);

            console.log("🌡️ [온도 계산]", {
                pastHonorRollCount,
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
                // 실제 insert (unique 제약조건 때문에 중복은 무시됨)
                const recordsToInsert = achievedStudents
                    .filter(s => {
                        // 학생(currentStudentId가 있는 경우)은 본인의 기록만 전송
                        // 교사(null인 경우)는 학급 전체의 기록을 동기화 가능
                        if (!currentStudentId) return true;
                        return s.student_id === currentStudentId;
                    })
                    .map(s => ({
                        student_id: s.student_id,
                        class_id: classId
                    }));

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
            // if (isInitial) setLoading(false); (이미 최상단에서 해제했으므로 생략)
        }
    }, [classId, currentStudentId]);

    useEffect(() => {
        // 딜레이 없이 즉각 로드 (체감 속도 향상)
        fetchData(true);

        // [최적화] 디바운싱: 여러 실시간 이벤트가 동시에 들어올 때 최후 1초 뒤에 한 번만 실행
        let timeoutId;
        const debouncedFetch = () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                fetchData(false, true);
            }, 1000);
        };

        // [최적화] 단일 채널 다중화 (Multiplexing): 4개의 개별 커넥션을 1개로 통합
        const agitChannel = supabase
            .channel(`agit-realtime-events-${classId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'student_posts' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reactions' }, debouncedFetch)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'classes', filter: `id=eq.${classId}` }, debouncedFetch)
            .subscribe();

        // 1. 자정이 지나 날짜가 바뀌었는지 1분마다 체크하여 자동 갱신
        let lastCheckDate = new Date().getDate();
        const dateCheckInterval = setInterval(() => {
            const currentDay = new Date().getDate();
            if (currentDay !== lastCheckDate) {
                console.log("🕛 [자정 경과] 날짜 변경 감지 -> 데이터 갱신");
                lastCheckDate = currentDay;
                fetchData(false, true);
            }
        }, 60000); // 1분 간격

        // 2. 브라우저 탭 활성화 시 데이터 갱신 (오래 켜뒀다가 다시 볼 때 대비)
        const handleFocus = () => {
            console.log("👀 [윈도우 포커스] 최신 데이터 확인");
            fetchData(false, true);
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            supabase.removeChannel(agitChannel);
            if (timeoutId) clearTimeout(timeoutId);
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
        refresh: (force = true) => fetchData(false, force === true),
        achievedStudents: achievedStudentsList,
        // [신규] 어휘의 탑 설정 노출
        vocabTowerSettings
    };
};
