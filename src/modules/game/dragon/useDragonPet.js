import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { DRAGON_SPECIES } from './presentation';

const DEFAULT_PET_DATA = {
    name: '나의 드래곤',
    level: 1,
    exp: 0,
    lastFed: null,
    ownedItems: [],
    background: 'default',
    species: null
};

const normalizePetData = (petData) => ({
    ...DEFAULT_PET_DATA,
    ...(petData || {}),
    ownedItems: Array.isArray(petData?.ownedItems) ? petData.ownedItems : []
});

export const useDragonPet = (studentId, points, setPoints, initialPetData = null) => {
    const [petData, setPetData] = useState(() => normalizePetData());
    const [isFlashing, setIsFlashing] = useState(false);
    const [isBusy, setIsBusy] = useState(false); 
    const hasHydratedInitialDataRef = useRef(false);
    const flashTimerRef = useRef(null);

    useEffect(() => () => {
        if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    }, []);

    const shouldAcceptIncomingPetData = (currentPetData, nextPetData) => {
        if (!nextPetData) return false;
        if (!currentPetData) return true;

        const currentLevel = Number(currentPetData.level || 1);
        const nextLevel = Number(nextPetData.level || 1);
        if (nextLevel > currentLevel) return true;
        if (nextLevel < currentLevel) return false;

        const currentExp = Number(currentPetData.exp || 0);
        const nextExp = Number(nextPetData.exp || 0);
        if (nextExp > currentExp) return true;
        if (nextExp < currentExp) return false;

        const currentLastFed = currentPetData.lastFed || '';
        const nextLastFed = nextPetData.lastFed || '';
        if (nextLastFed > currentLastFed) return true;
        if (nextLastFed < currentLastFed) return false;

        return JSON.stringify(currentPetData) !== JSON.stringify(nextPetData);
    };

    // [추가] 초기 데이터 동기화
    useEffect(() => {
        if (!initialPetData) return;

        if (!hasHydratedInitialDataRef.current) {
            hasHydratedInitialDataRef.current = true;
            setPetData(() => normalizePetData(initialPetData));
            return;
        }

        setPetData((currentPetData) => (
            shouldAcceptIncomingPetData(currentPetData, initialPetData)
                ? normalizePetData(initialPetData)
                : currentPetData
        ));
    }, [initialPetData]);

    // 교감은 성장 조건이나 포인트 소비가 아닌, 내 수호룡과 만나는 가벼운 기록이다.
    const handleBond = async () => {
        if (!studentId || isBusy) return false;
        setIsBusy(true);
        const today = new Date().toISOString().split('T')[0];
        const newPetData = {
            ...petData,
            lastFed: today,
            bondCount: Number(petData.bondCount || 0) + 1
        };

        try {
            const { data: spendResult, error: updateError } = await supabase
                .rpc('spend_student_points', {
                    p_amount: 0,
                    p_reason: '작가 수호룡과 교감하기 🐉',
                    p_pet_data: newPetData
                });

            if (updateError) throw updateError;
            if (!spendResult?.success) throw new Error(spendResult?.error || '교감 기록 실패');

            setPetData(newPetData);
            setIsFlashing(true);
            if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
            flashTimerRef.current = window.setTimeout(() => setIsFlashing(false), 1400);
            return true;
        } catch (err) {
            console.error('드래곤 교감 기록 실패:', err.message);
            alert('교감 기록을 저장하지 못했어요. 다시 시도해 주세요.');
            return false;
        } finally {
            setIsBusy(false);
        }
    };

    const buyItem = async (item) => {
        if (points === undefined || points === null || isBusy) return;

        if (points < item.price) {
            alert('포인트가 부족해요! 꾸준히 글을 써 보세요. ✍️');
            return;
        }

        if (petData.ownedItems.includes(item.id)) return;

        const newOwned = [...petData.ownedItems, item.id];
        const newPetData = { ...petData, ownedItems: newOwned };

        setIsBusy(true);

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
            alert('구매에 실패했습니다. 다시 시도해 주세요.');
        } finally {
            setIsBusy(false);
        }
    };

    const equipItem = async (bgId) => {
        const newPetData = { ...petData, background: bgId };

        try {
            // [보안 수정] 직접 update 대신 포인트를 차감하지 않는(0포인트) RPC 호출로 안전하게 반영
            // students 테이블의 보호 트리거를 우회하기 위해 RPC를 사용합니다.
            const { data: spendResult, error } = await supabase
                .rpc('spend_student_points', {
                    p_amount: 0,
                    p_reason: `아지트 배경 변경: ${bgId}`,
                    p_pet_data: newPetData
                });

            if (error) throw error;
            if (!spendResult?.success) {
                throw new Error(spendResult?.error || '배경 변경 실패');
            }

            setPetData(newPetData);
        } catch (err) {
            console.error('배경 변경 실패:', err.message);
            alert('배경 변경에 실패했습니다. 다시 시도해 주세요!');
        }
    };

    const selectSpecies = async (speciesId, { isReselection = false } = {}) => {
        if (!studentId || isBusy) return false;
        if (!DRAGON_SPECIES.some((species) => species.id === speciesId)) return false;
        if (isReselection && petData.speciesReselectedAt) return false;

        setIsBusy(true);
        try {
            const { data: result, error } = await supabase.rpc('set_my_dragon_species', {
                p_species: speciesId,
                p_reselect: isReselection
            });
            if (error) throw error;
            if (!result?.success) throw new Error(result?.error || '수호룡 선택 저장 실패');
            setPetData(normalizePetData(result.pet_data));
            return true;
        } catch (error) {
            console.error('수호룡 종류 저장 실패:', error.message);
            alert('수호룡 선택을 저장하지 못했어요. 다시 시도해 주세요.');
            return false;
        } finally {
            setIsBusy(false);
        }
    };

    const acknowledgeGrowth = async () => {
        if (!studentId || isBusy) return false;
        setIsBusy(true);
        try {
            const { data: result, error } = await supabase.rpc('acknowledge_my_dragon_growth');
            if (error) throw error;
            if (!result?.success) throw new Error(result?.error || '성장 확인 저장 실패');
            setPetData(normalizePetData(result.pet_data));
            return true;
        } catch (error) {
            console.error('수호룡 성장 확인 저장 실패:', error.message);
            alert('새 모습을 기록하지 못했어요. 잠시 후 다시 눌러 주세요.');
            return false;
        } finally {
            setIsBusy(false);
        }
    };

    return {
        petData,
        setPetData,
        isFlashing,
        isBusy,
        handleBond,
        buyItem,
        equipItem,
        selectSpecies,
        acknowledgeGrowth
    };
};
