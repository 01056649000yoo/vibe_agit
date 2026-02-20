import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import confetti from 'canvas-confetti';

export const useDragonPet = (studentId, points, setPoints, feedCost = 80, degenDays = 14, initialPetData = null) => {
    const [petData, setPetData] = useState({
        name: '나의 드래곤',
        level: 1,
        exp: 0,
        lastFed: new Date().toISOString().split('T')[0],
        ownedItems: [],
        background: 'default'
    });
    const [isEvolving, setIsEvolving] = useState(false);
    const [isFlashing, setIsFlashing] = useState(false);

    // [추가] 초기 데이터 동기화
    useEffect(() => {
        if (initialPetData) {
            setPetData(initialPetData);
        }
    }, [initialPetData]);

    // [정밀 동기화] props로 전달된 설정값이 비동기로 업데이트될 때 훅 내부에서도 즉시 반영되도록 ref 사용
    const feedCostRef = useRef(feedCost);
    const degenDaysRef = useRef(degenDays);

    useEffect(() => {
        feedCostRef.current = feedCost;
        degenDaysRef.current = degenDays;
        console.log(`🔄 드래곤 설정 업데이트됨 (Hook): 먹이비용=${feedCost}, 퇴화기간=${degenDays}`);
    }, [feedCost, degenDays]);

    // 진화 사운드 (구조 제공)
    const playEvolutionSound = () => {
        console.log('🎵 진화 사운드 재생: 두구두구두구~ 짠!');
    };

    // 드래곤 퇴화 로직 (14일 미접속/미관리 시)
    const checkPetDegeneration = async (currentPetData, overrideDegenDays = null) => {
        if (!currentPetData?.lastFed) return;

        const parseLocalrDate = (dateStr) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d);
        };

        const lastFedDate = parseLocalrDate(currentPetData.lastFed);
        const now = new Date();
        const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        const diffTime = todayDate - lastFedDate;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        console.log(`🐉 드래곤 상태 점검: 마지막 식사 ${diffDays}일 전 (${currentPetData.lastFed})`);

        // [기준 강화] 설정값(degenDays) 이상 경과 시 퇴화 (오버라이드 우선 -> ref값 -> 기본값)
        const threshold = overrideDegenDays !== null ? overrideDegenDays : degenDaysRef.current;

        if (diffDays >= threshold) {
            let newLevel = currentPetData.level;

            if (newLevel > 1) {
                newLevel -= 1;
            }

            const newPetData = {
                ...currentPetData,
                level: newLevel,
                exp: 0,
                lastFed: now.toISOString().split('T')[0]
            };

            try {
                const { error } = await supabase
                    .from('students')
                    .update({
                        pet_data: newPetData
                    })
                    .eq('id', studentId);

                if (error) throw error;

                console.warn('📉 드래곤 퇴화 페널티 적용됨:', newPetData);

                setPetData(newPetData);
                alert(`드래곤을 ${threshold}일 동안 돌보지 않아 기운이 다 빠졌어요! 레벨이 내려가거나 초기화되었으니 다시 사랑으로 키워주세요! 😢`);

            } catch (err) {
                console.error('❌ 드래곤 퇴화 정보 저장 실패:', err.message);
            }
        }
    };

    // 먹이 주기 기능
    const handleFeed = async () => {
        if (points === undefined || points === null) return;

        const FEED_COST = feedCostRef.current;
        if (points < FEED_COST) {
            alert(`먹이를 주려면 ${FEED_COST}포인트가 필요해요! 글을 써서 포인트를 더 모아보세요. 💪`);
            return;
        }

        const newPoints = points - FEED_COST;
        if (newPoints < 0) {
            alert('작업을 완료할 수 없습니다. 포인트가 유효하지 않습니다.');
            return;
        }

        let newExp = petData.exp + 20;
        let newLevel = petData.level;

        if (newExp >= 100) {
            if (newLevel < 5) {
                newLevel += 1;
                newExp = newExp % 100;
            } else {
                newExp = 100;
            }
        }

        const today = new Date().toISOString().split('T')[0];
        const isLevelUp = newLevel > petData.level;

        try {
            if (isLevelUp) {
                setIsEvolving(true);
                playEvolutionSound();
            }

            const newPetData = {
                ...petData,
                level: newLevel,
                exp: newExp,
                lastFed: today
            };

            // [보안 수정] RPC를 통한 안전한 포인트 차감 + 펫 데이터 동시 업데이트
            // total_points를 직접 UPDATE하지 않음 (GRANT 제한 + 서버 검증)
            const { data: spendResult, error: updateError } = await supabase
                .rpc('spend_student_points', {
                    p_amount: FEED_COST,
                    p_reason: '드래곤 먹이주기 🍖',
                    p_pet_data: newPetData
                });

            if (updateError) throw updateError;
            if (!spendResult?.success) {
                throw new Error(spendResult?.error || '포인트 차감 실패');
            }

            const confirmedNewPoints = spendResult.new_points;

            if (isLevelUp) {
                setTimeout(() => {
                    setIsFlashing(true);

                    setPetData(newPetData);
                    setPoints(confirmedNewPoints);

                    confetti({
                        particleCount: 150,
                        spread: 70,
                        origin: { y: 0.6 },
                        colors: ['#FFD700', '#FFA500', '#FF4500']
                    });

                    setTimeout(() => {
                        setIsFlashing(false);
                        setIsEvolving(false);
                    }, 500);
                }, 1500);
            } else {
                setPoints(confirmedNewPoints);
                setPetData(newPetData);
            }
        } catch (err) {
            console.error('포인트 업데이트 실패:', err.message);
            alert('포인트 사용에 실패했습니다. 다시 시도해 주세요!');
            setIsEvolving(false);
        }
    };

    const buyItem = async (item) => {
        if (points === undefined || points === null) return;

        if (points < item.price) {
            alert('포인트가 부족해요! 꾸준히 글을 써 보세요. ✍️');
            return;
        }

        if (petData.ownedItems.includes(item.id)) return;

        const newPoints = points - item.price;
        const newOwned = [...petData.ownedItems, item.id];
        const newPetData = { ...petData, ownedItems: newOwned };

        try {
            // [보안 수정] RPC를 통한 안전한 포인트 차감 + 펫 데이터 동시 업데이트
            const { data: spendResult, error } = await supabase
                .rpc('spend_student_points', {
                    p_amount: item.price,
                    p_reason: `아지트 배경 구매: ${item.name}`,
                    p_pet_data: newPetData
                });

            if (error) throw error;
            if (!spendResult?.success) {
                throw new Error(spendResult?.error || '포인트 차감 실패');
            }

            setPoints(spendResult.new_points);
            setPetData(newPetData);
            alert(`[${item.name}] 구매 성공! 리스트에서 '적용하기'를 눌러보세요. ✨`);
        } catch (err) {
            console.error('배경 구매 실패:', err.message);
        }
    };

    const equipItem = async (bgId) => {
        const newPetData = { ...petData, background: bgId };

        try {
            const { error } = await supabase
                .from('students')
                .update({ pet_data: newPetData })
                .eq('id', studentId);

            if (error) throw error;
            setPetData(newPetData);
        } catch (err) {
            console.error('배경 변경 실패:', err.message);
        }
    };

    return {
        petData,
        setPetData,
        isEvolving,
        isFlashing,
        handleFeed,
        checkPetDegeneration,
        buyItem,
        equipItem
    };
};
