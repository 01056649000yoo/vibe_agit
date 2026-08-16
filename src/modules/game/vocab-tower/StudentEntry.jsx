import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import VocabularyTowerGame from './VocabularyTowerGame';

const DEFAULT_SETTINGS = {
    grade: 3,
    dailyLimit: 3,
    timeLimit: 40,
    rewardPoints: 50,
    contentVersion: 'v2',
    resetDate: null,
    rankingResetDate: null
};

const VocabularyTowerStudentEntry = ({ studentSession, onBack }) => {
    const classId = studentSession?.class_id || studentSession?.classId;
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [loading, setLoading] = useState(true);
    const [errorMessage, setErrorMessage] = useState('');

    const loadSettings = useCallback(async () => {
        if (!classId) {
            setErrorMessage('학급 정보를 확인하지 못했어요.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setErrorMessage('');
        const { data, error } = await supabase
            .from('classes')
            .select('vocab_tower_grade, vocab_tower_daily_limit, vocab_tower_time_limit, vocab_tower_reward_points, vocab_tower_content_version, vocab_tower_reset_date, vocab_tower_ranking_reset_date')
            .eq('id', classId)
            .maybeSingle();

        if (error || !data) {
            console.error('어휘의 탑 설정 로드 실패:', error?.message);
            setErrorMessage('게임 설정을 불러오지 못했어요.');
        } else {
            setSettings({
                grade: data.vocab_tower_grade || DEFAULT_SETTINGS.grade,
                dailyLimit: data.vocab_tower_daily_limit ?? DEFAULT_SETTINGS.dailyLimit,
                timeLimit: data.vocab_tower_time_limit ?? DEFAULT_SETTINGS.timeLimit,
                rewardPoints: data.vocab_tower_reward_points ?? DEFAULT_SETTINGS.rewardPoints,
                contentVersion: data.vocab_tower_content_version || DEFAULT_SETTINGS.contentVersion,
                resetDate: data.vocab_tower_reset_date || null,
                rankingResetDate: data.vocab_tower_ranking_reset_date || null
            });
        }
        setLoading(false);
    }, [classId]);

    useEffect(() => {
        const timerId = window.setTimeout(loadSettings, 0);
        return () => window.clearTimeout(timerId);
    }, [loadSettings]);

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'white', color: '#1565C0', fontWeight: '900' }}>
                🗼 어휘의 탑 설정을 불러오는 중...
            </div>
        );
    }

    if (errorMessage) {
        return (
            <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#FFFDF7' }}>
                <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#B91C1C', fontWeight: '900' }}>{errorMessage}</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                        <button type="button" onClick={loadSettings}>다시 시도</button>
                        <button type="button" onClick={onBack}>놀이터로 돌아가기</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <VocabularyTowerGame
            studentSession={studentSession}
            onBack={onBack}
            forcedGrade={settings.grade}
            dailyLimit={settings.dailyLimit}
            timeLimit={settings.timeLimit}
            rewardPoints={settings.rewardPoints}
            contentVersion={settings.contentVersion}
        />
    );
};

export default VocabularyTowerStudentEntry;
