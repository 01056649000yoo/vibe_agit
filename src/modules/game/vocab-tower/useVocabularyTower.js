import { useCallback, useEffect, useRef, useState } from 'react';
import { buildRoomQuiz } from './vocabTowerEngine';

const useVocabularyTower = (selectedGrade, loadStaticVocabulary = true) => {
    const [vocabulary, setVocabulary] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [currentQuiz, setCurrentQuiz] = useState(null);
    const [reviewWords, setReviewWords] = useState([]);
    const usedWordsRef = useRef(new Set());

    useEffect(() => {
        if (!loadStaticVocabulary) {
            setVocabulary([]);
            setCurrentQuiz(null);
            setReviewWords([]);
            setError('');
            setIsLoading(false);
            usedWordsRef.current = new Set();
            return undefined;
        }
        const controller = new AbortController();
        const loadVocabulary = async () => {
            if (selectedGrade < 3 || selectedGrade > 6) {
                setError('출제 학년은 3~6학년이어야 해요.');
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            setError('');
            try {
                const response = await fetch(`/data/grade${selectedGrade}_vocab.json`, { signal: controller.signal });
                if (!response.ok) throw new Error(`어휘 자료를 불러오지 못했어요. (${response.status})`);
                const data = await response.json();
                setVocabulary(data);
                setCurrentQuiz(null);
                setReviewWords([]);
                usedWordsRef.current = new Set();
            } catch (loadError) {
                if (loadError.name !== 'AbortError') {
                    console.error('어휘 자료 로드 실패:', loadError);
                    setError(loadError.message || '어휘 자료를 불러오지 못했어요.');
                    setVocabulary([]);
                }
            } finally {
                if (!controller.signal.aborted) setIsLoading(false);
            }
        };
        loadVocabulary();
        return () => controller.abort();
    }, [loadStaticVocabulary, selectedGrade]);

    const createQuiz = useCallback(({ floor, roomIndex, reduceOptions = false }) => {
        const quiz = buildRoomQuiz({
            vocabulary,
            floor,
            roomIndex,
            reviewWords,
            usedWords: usedWordsRef.current,
            reduceOptions
        });
        if (quiz) {
            usedWordsRef.current.add(quiz.word.word);
            setCurrentQuiz(quiz);
        }
        return quiz;
    }, [reviewWords, vocabulary]);

    const recordAnswer = useCallback(({ quiz, isCorrect }) => {
        if (!quiz) return { learnedFromReview: false };
        const learnedFromReview = Boolean(isCorrect && quiz.isReview);
        setReviewWords((current) => {
            if (learnedFromReview) return current.filter((word) => word !== quiz.word.word);
            if (!isCorrect && !current.includes(quiz.word.word)) return [...current, quiz.word.word];
            return current;
        });
        return { learnedFromReview };
    }, []);

    const resetJourney = useCallback((initialReviewWords = []) => {
        usedWordsRef.current = new Set();
        setCurrentQuiz(null);
        setReviewWords(Array.isArray(initialReviewWords) ? initialReviewWords : []);
    }, []);

    const setServerQuiz = useCallback((quiz) => {
        setCurrentQuiz(quiz);
    }, []);

    return {
        vocabulary,
        currentQuiz,
        reviewWords,
        isLoading,
        error,
        createQuiz,
        recordAnswer,
        resetJourney,
        setServerQuiz
    };
};

export default useVocabularyTower;
