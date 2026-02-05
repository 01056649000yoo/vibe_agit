import { useState, useEffect, useCallback, useMemo } from 'react';

/**
 * 어휘 탑 게임을 위한 커스텀 훅
 * @param {number} selectedGrade - 선택된 학년 (3~6)
 * @returns {Object} - currentQuiz, stats, actions, isLoading, error
 */
const useVocabularyTower = (selectedGrade) => {
    // 상태 관리
    const [vocabulary, setVocabulary] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // 게임 상태
    const [currentFloor, setCurrentFloor] = useState(1);
    const [experience, setExperience] = useState(0);
    const [currentQuiz, setCurrentQuiz] = useState(null);

    // 퀴즈 기록 (같은 문제 반복 방지)
    const [usedWordIds, setUsedWordIds] = useState(new Set());

    // 마지막 정답 결과
    const [lastResult, setLastResult] = useState(null);

    /**
     * 학년에 따라 어휘 데이터를 로드
     */
    useEffect(() => {
        const loadVocabulary = async () => {
            // 유효한 학년 범위 체크
            if (selectedGrade < 3 || selectedGrade > 6) {
                setError('학년은 3~6 사이여야 합니다.');
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(`/data/grade${selectedGrade}_vocab.json`);

                if (!response.ok) {
                    throw new Error(`어휘 데이터를 불러오는데 실패했습니다. (${response.status})`);
                }

                const data = await response.json();
                setVocabulary(data);

                // 학년 변경 시 게임 상태 초기화
                setCurrentFloor(1);
                setExperience(0);
                setUsedWordIds(new Set());
                setCurrentQuiz(null);
                setLastResult(null);
            } catch (err) {
                setError(err.message || '어휘 데이터를 불러오는 중 오류가 발생했습니다.');
                setVocabulary([]);
            } finally {
                setIsLoading(false);
            }
        };

        loadVocabulary();
    }, [selectedGrade]);

    /**
     * 배열을 랜덤하게 섞는 Fisher-Yates 알고리즘
     */
    const shuffleArray = useCallback((array) => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }, []);

    /**
     * 현재 층수에 맞는 단어 필터링
     */
    const getWordsForCurrentFloor = useCallback(() => {
        // 현재 층수에 해당하는 레벨의 단어들과, 
        // 상위 레벨(더 어려운) 단어들도 일부 포함
        const targetLevel = Math.min(currentFloor, 5); // 최대 레벨 5

        return vocabulary.filter(word => {
            // 현재 레벨 또는 그보다 낮은 레벨의 단어
            if (word.level <= targetLevel) return true;
            // 층이 높아지면 더 어려운 단어도 등장할 확률
            if (word.level === targetLevel + 1 && currentFloor >= 3) return true;
            return false;
        });
    }, [vocabulary, currentFloor]);

    /**
     * 새로운 퀴즈 생성
     */
    const generateQuiz = useCallback(() => {
        if (vocabulary.length < 4) {
            setError('충분한 어휘 데이터가 없습니다. 최소 4개의 단어가 필요합니다.');
            return null;
        }

        const availableWords = getWordsForCurrentFloor();

        // 사용하지 않은 단어 필터링
        const unusedWords = availableWords.filter(
            (_, index) => !usedWordIds.has(index)
        );

        // 모든 단어를 사용했다면 초기화
        const wordsToUse = unusedWords.length > 0 ? unusedWords : availableWords;

        if (unusedWords.length === 0) {
            setUsedWordIds(new Set());
        }

        // 정답 단어 선택 (현재 층수와 레벨이 맞는 단어 우선)
        const targetLevel = Math.min(currentFloor, 5);
        const sameLevelWords = wordsToUse.filter(w => w.level === targetLevel);
        const correctWordPool = sameLevelWords.length > 0 ? sameLevelWords : wordsToUse;

        const randomIndex = Math.floor(Math.random() * correctWordPool.length);
        const correctWord = correctWordPool[randomIndex];

        // 오답 단어 3개 선택 (정답과 다른 단어들 중에서)
        const wrongWordPool = vocabulary.filter(w => w.word !== correctWord.word);
        const shuffledWrong = shuffleArray(wrongWordPool);
        const wrongWords = shuffledWrong.slice(0, 3);

        // 보기 생성 (정답 + 오답 3개 섞기)
        const options = shuffleArray([
            correctWord.word,
            ...wrongWords.map(w => w.word)
        ]);

        // 사용된 단어 기록
        const wordIndex = vocabulary.findIndex(w => w.word === correctWord.word);
        setUsedWordIds(prev => new Set([...prev, wordIndex]));

        const quiz = {
            question: correctWord.definition,
            example: correctWord.example,
            category: correctWord.category,
            level: correctWord.level,
            options,
            correctAnswer: correctWord.word,
            word: correctWord
        };

        setCurrentQuiz(quiz);
        setLastResult(null);

        return quiz;
    }, [vocabulary, currentFloor, usedWordIds, getWordsForCurrentFloor, shuffleArray]);

    /**
     * 다음 레벨까지 필요한 경험치 계산
     */
    const requiredExpForNextFloor = useMemo(() => {
        return currentFloor * 100;
    }, [currentFloor]);

    /**
     * 정답 체크 및 경험치 계산
     */
    const handleAnswer = useCallback((selectedAnswer) => {
        if (!currentQuiz) return null;

        const isCorrect = selectedAnswer === currentQuiz.correctAnswer;

        let earnedExp = 0;
        let leveledUp = false;
        let newFloor = currentFloor;
        let newExp = experience;

        if (isCorrect) {
            // 단어 레벨에 비례하는 경험치 지급
            // 기본 10점 + (레벨 * 10점) = 레벨 1: 20점, 레벨 5: 60점
            earnedExp = 10 + (currentQuiz.level * 10);
            newExp = experience + earnedExp;

            // 레벨업 체크
            if (newExp >= requiredExpForNextFloor) {
                leveledUp = true;
                newFloor = currentFloor + 1;
                newExp = 0; // 경험치 초기화

                setCurrentFloor(newFloor);
            }

            setExperience(newExp);
        }

        const result = {
            isCorrect,
            selectedAnswer,
            correctAnswer: currentQuiz.correctAnswer,
            earnedExp,
            leveledUp,
            newFloor,
            newExp,
            word: currentQuiz.word
        };

        setLastResult(result);

        return result;
    }, [currentQuiz, currentFloor, experience, requiredExpForNextFloor]);

    /**
     * 다음 문제로 넘어가기
     */
    const nextQuiz = useCallback(() => {
        return generateQuiz();
    }, [generateQuiz]);

    /**
     * 게임 리셋
     */
    const resetGame = useCallback(() => {
        setCurrentFloor(1);
        setExperience(0);
        setUsedWordIds(new Set());
        setCurrentQuiz(null);
        setLastResult(null);
    }, []);

    /**
     * 게임 시작 (첫 퀴즈 생성)
     */
    const startGame = useCallback(() => {
        resetGame();
        return generateQuiz();
    }, [resetGame, generateQuiz]);

    // 데이터 로드 완료 후 자동으로 첫 퀴즈 생성
    useEffect(() => {
        if (!isLoading && vocabulary.length >= 4 && !currentQuiz) {
            generateQuiz();
        }
    }, [isLoading, vocabulary.length, currentQuiz, generateQuiz]);

    // 통계 정보
    const stats = useMemo(() => ({
        currentFloor,
        experience,
        requiredExp: requiredExpForNextFloor,
        expProgress: Math.round((experience / requiredExpForNextFloor) * 100),
        totalWords: vocabulary.length,
        usedWords: usedWordIds.size,
        remainingWords: vocabulary.length - usedWordIds.size
    }), [currentFloor, experience, requiredExpForNextFloor, vocabulary.length, usedWordIds.size]);

    // 액션 함수들
    const actions = useMemo(() => ({
        handleAnswer,
        nextQuiz,
        startGame,
        resetGame,
        generateQuiz
    }), [handleAnswer, nextQuiz, startGame, resetGame, generateQuiz]);

    return {
        currentQuiz,
        stats,
        actions,
        isLoading,
        error,
        lastResult,
        vocabulary
    };
};

export default useVocabularyTower;
