const PRACTICE_DIFFICULTY_STAGES = Object.freeze([
    Object.freeze({
        minFloor: 1,
        maxFloor: 2,
        label: '낱말 발견',
        description: '뜻과 문맥을 보고 낱말과 친해져요.'
    }),
    Object.freeze({
        minFloor: 3,
        maxFloor: 4,
        label: '문맥 연결',
        description: '쓰임을 구별하고 직접 떠올리기를 시작해요.'
    }),
    Object.freeze({
        minFloor: 5,
        maxFloor: 6,
        label: '쓰임 구별',
        description: '비슷한 쓰임을 가려내고 두 낱말까지 직접 써요.'
    }),
    Object.freeze({
        minFloor: 7,
        maxFloor: 8,
        label: '직접 떠올리기',
        description: '보기보다 스스로 떠올리는 힘을 더 많이 써요.'
    }),
    Object.freeze({
        minFloor: 9,
        maxFloor: 10,
        label: '정상 수련',
        description: '구별과 직접 쓰기를 함께 사용해 정상에 다가가요.'
    })
]);

const NEXT_FLOOR_HINTS = Object.freeze({
    1: '2층에서는 쓰임 구별 문제가 처음 더해져요.',
    2: '3층부터 직접 쓰기 문제가 한 문항 열릴 수 있어요.',
    3: '4층에서는 쓰임 구별 문제가 한 문항 더 늘어요.',
    4: '5층부터 직접 쓰기가 최대 두 문항으로 늘어요.',
    5: '6층에서는 문맥을 읽는 문제가 조금 더 많아져요.',
    6: '7층부터 직접 쓰기가 최대 세 문항으로 늘어요.',
    7: '8층에서는 쓰임 구별 문제가 한 문항 더 늘어요.',
    8: '9층부터 직접 쓰기가 최대 네 문항으로 늘어요.',
    9: '10층에서는 직접 쓰기가 최대 다섯 문항으로 늘어요.',
    10: '이제 덱마스터와 어휘의 정상에 도전할 준비를 해요.'
});

export const getVocabPracticeDifficultyStage = (floor) => {
    const normalizedFloor = Number(floor);
    return PRACTICE_DIFFICULTY_STAGES.find((stage) => (
        normalizedFloor >= stage.minFloor && normalizedFloor <= stage.maxFloor
    )) || null;
};

export const getVocabPracticeNextFloorHint = (floor) => (
    Reflect.get(NEXT_FLOOR_HINTS, Number(floor)) || ''
);
