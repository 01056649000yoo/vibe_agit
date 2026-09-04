import { useState, useEffect, useRef } from 'react';
import useConfirmDialog from '../../../components/common/useConfirmDialog';
import useNotice from '../../../components/common/useNotice';
import { supabase } from '../../../lib/supabaseClient';
import { DRAGON_SPECIES } from './presentation';
import { DEFAULT_EQUIPPED_DECOR } from './decorCatalog';

const DEFAULT_PET_DATA = {
    name: '나의 드래곤',
    level: 1,
    exp: 0,
    lastFed: null,
    ownedItems: [],
    ownedDecorItems: [],
    equippedDecor: DEFAULT_EQUIPPED_DECOR,
    background: 'default',
    species: null
};

const normalizePetData = (petData) => ({
    ...DEFAULT_PET_DATA,
    ...(petData || {}),
    ownedItems: Array.isArray(petData?.ownedItems) ? petData.ownedItems : [],
    ownedDecorItems: Array.isArray(petData?.ownedDecorItems) ? petData.ownedDecorItems : [],
    equippedDecor: {
        ...DEFAULT_EQUIPPED_DECOR,
        ...(petData?.equippedDecor || {}),
        wallpaper: petData?.equippedDecor?.wallpaper || petData?.background || 'default'
    }
});

export const useDragonPet = (studentId, points, setPoints, initialPetData = null) => {
    // 앱 안 창은 여기서 만들고 학생 화면(StudentDashboard)이 그린다.
    const { ask, confirmDialog } = useConfirmDialog();
    const { notify, notice } = useNotice();
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

    // 교감은 성장 조건이나 포인트 소비가 아니라, 오늘 쓴 글을 수호룡에게 들려주는 자리다.
    // 오늘 날짜·교감 횟수·오늘의 글은 모두 서버가 계산한다 — 예전처럼 클라이언트가 만든
    // pet_data 를 그대로 저장하지 않는다. 성공하면 그날의 이야기 상태를 돌려준다.
    const handleBond = async () => {
        if (!studentId || isBusy) return null;
        setIsBusy(true);

        try {
            const { data: result, error } = await supabase.rpc('bond_with_my_dragon');

            if (error) throw error;
            if (!result?.success) throw new Error(result?.error || '교감 기록 실패');

            setPetData(normalizePetData(result.pet_data));
            setIsFlashing(true);
            if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
            flashTimerRef.current = window.setTimeout(() => setIsFlashing(false), 1400);
            return {
                storyState: result.story_state || 'none',
                storyTitle: result.story_title || null,
                storyKind: result.story_kind || null,
                alreadyBondedToday: Boolean(result.already_bonded_today)
            };
        } catch (err) {
            console.error('드래곤 교감 기록 실패:', err.message);
            await ask({
                title: '교감 기록을 저장하지 못했어요',
                body: `잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return null;
        } finally {
            setIsBusy(false);
        }
    };

    const buyDecorItem = async (item) => {
        if (points === undefined || points === null || isBusy) return;

        if (points < item.price) {
            notify('포인트가 모자라요. 꾸준히 글을 써 보세요. ✍️');
            return;
        }

        setIsBusy(true);

        try {
            const { data: spendResult, error } = await supabase.rpc('buy_my_dragon_decor', {
                p_item_id: item.id
            });

            if (error) throw error;
            if (!spendResult?.success) {
                throw new Error(spendResult?.error || '포인트 차감 실패');
            }

            setPoints(spendResult.new_points);
            setPetData(normalizePetData(spendResult.pet_data));
            return true;
        } catch (err) {
            console.error('아지트 소품 구매 실패:', err.message);
            await ask({
                title: '사지 못했어요',
                body: `포인트는 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return false;
        } finally {
            setIsBusy(false);
        }
    };

    const equipDecorItem = async (slotId, itemId) => {
        if (isBusy) return false;
        setIsBusy(true);
        try {
            const { data: result, error } = await supabase.rpc('equip_my_dragon_decor', {
                p_slot: slotId,
                p_item_id: itemId
            });

            if (error) throw error;
            if (!result?.success) throw new Error(result?.error || '장식 변경 실패');

            setPetData(normalizePetData(result.pet_data));
            return true;
        } catch (err) {
            console.error('아지트 장식 변경 실패:', err.message);
            await ask({
                title: '장식을 바꾸지 못했어요',
                body: `잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return false;
        } finally {
            setIsBusy(false);
        }
    };

    const claimLegendaryReward = async () => {
        if (!studentId || isBusy) return false;
        setIsBusy(true);
        try {
            const { data: result, error } = await supabase.rpc('claim_my_dragon_legendary_decor_reward');
            if (error) throw error;
            if (!result?.success) throw new Error(result?.error || '전설 세트 개봉 실패');

            setPetData(normalizePetData(result.pet_data));
            return true;
        } catch (error) {
            console.error('전설 아지트 세트 개봉 실패:', error.message);
            await ask({
                title: '전설 세트를 열지 못했어요',
                body: `${error.message || '잠시 뒤 다시 시도해 주세요.'}`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return false;
        } finally {
            setIsBusy(false);
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
            await ask({
                title: '수호룡 선택을 저장하지 못했어요',
                body: `잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
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
            const nextPetData = normalizePetData(result.pet_data);
            setPetData(nextPetData);
            return {
                level: Number(result.level || nextPetData.level || 1),
                petData: nextPetData
            };
        } catch (error) {
            console.error('수호룡 성장 확인 저장 실패:', error.message);
            await ask({
                title: '새 모습을 기록하지 못했어요',
                body: `잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
            return false;
        } finally {
            setIsBusy(false);
        }
    };

    return {
        confirmDialog, notice,
        petData,
        setPetData,
        isFlashing,
        isBusy,
        handleBond,
        buyDecorItem,
        claimLegendaryReward,
        equipDecorItem,
        selectSpecies,
        acknowledgeGrowth
    };
};
