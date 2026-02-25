import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useClassAgitClass } from '../../hooks/useClassAgitClass';
import IdeaMarketManager from './IdeaMarketManager';

const DEFAULT_AGIT_SETTINGS = {
    isMenuEnabled: false,
    isIdeaMarketEnabled: false,
    isEnabled: false,
    targetScore: 100,
    surpriseGift: '',
    activityGoals: {
        post: 1,      // 1도를 올리기 위해 필요한 글쓰기 횟수
        comment: 5,   // 1도를 올리기 위해 필요한 댓글 횟수
        reaction: 5   // 1도를 올리기 위해 필요한 반응 횟수
    }
};

const AgitManager = ({ activeClass, isMobile }) => {
    const [loading, setLoading] = useState(true);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [showIdeaMarket, setShowIdeaMarket] = useState(false);

    // 학생 화면과 동일한 온도 및 설정 실시간 동기화
    const { temperature: liveTemperature, agitSettings: liveSettings, refresh } = useClassAgitClass(activeClass?.id, null);

    const [honorRollStats, setHonorRollStats] = useState([]);
    const [statsLoading, setStatsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('settings'); // 'settings' | 'history'
    const [seasonHistory, setSeasonHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const [settings, setSettings] = useState(DEFAULT_AGIT_SETTINGS);

    // liveSettings가 로드되면 로컬 settings도 업데이트 (초기 로딩 시)
    useEffect(() => {
        if (liveSettings) {
            setSettings(prev => ({
                ...prev,
                ...liveSettings
            }));
            setLoading(false);
        }
    }, [liveSettings]);

    const fetchHonorRollStats = useCallback(async (overrideResetAt = null) => {
        if (!activeClass?.id) return;
        try {
            setStatsLoading(true);
            const resetAt = overrideResetAt || liveSettings?.lastResetAt || '2000-01-01';
            const { data, error } = await supabase
                .from('agit_honor_roll')
                .select(`
                    student_id,
                    students (name)
                `)
                .eq('class_id', activeClass.id)
                .gte('created_at', resetAt); // 초기화 이후 시점 데이터만 조회

            if (error) throw error;

            const statsMap = {};
            data.forEach(row => {
                const sid = row.student_id;
                const name = row.students?.name || '알 수 없는 학생';
                if (!statsMap[sid]) {
                    statsMap[sid] = { name, count: 0 };
                }
                statsMap[sid].count += 1;
            });

            const sortedStats = Object.values(statsMap).sort((a, b) => b.count - a.count);
            setHonorRollStats(sortedStats);
        } catch (err) {
            console.error("통계 조회 실패:", err);
        } finally {
            setStatsLoading(false);
        }
    }, [activeClass?.id, liveSettings]);

    // 명예의 전당 통계 불러오기
    useEffect(() => {
        fetchHonorRollStats();
    }, [fetchHonorRollStats, liveSettings]);

    const fetchSeasonHistory = useCallback(async () => {
        if (!activeClass?.id) return;
        try {
            setHistoryLoading(true);
            const { data, error } = await supabase
                .from('agit_season_history')
                .select('*')
                .eq('class_id', activeClass.id)
                .order('ended_at', { ascending: false });

            if (error) throw error;
            setSeasonHistory(data || []);
        } catch (err) {
            console.error("시즌 기록 조회 실패:", err);
        } finally {
            setHistoryLoading(false);
        }
    }, [activeClass?.id]);

    useEffect(() => {
        if (isSettingsModalOpen && activeTab === 'history') {
            fetchSeasonHistory();
        }
    }, [isSettingsModalOpen, activeTab, fetchSeasonHistory]);

    // 모달 열 때 최신 설정값으로 동기화
    const openSettingsModal = () => {
        if (liveSettings) {
            setSettings(liveSettings);
        }
        setIsSettingsModalOpen(true);
    };

    const handleSaveSettings = async () => {
        try {
            setLoading(true);
            const { error } = await supabase
                .from('classes')
                .update({ agit_settings: settings })
                .eq('id', activeClass.id);

            if (error) throw error;

            alert('설정 정보가 저장되었습니다! 🏠✨');

            // 즉시 데이터 갱신 요청
            refresh(true);
            fetchHonorRollStats();

        } catch (error) {
            console.error("Error saving agit settings:", error);
            alert('설정 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleStartNewSeason = async () => {
        if (!window.confirm("🚀 새로운 시즌을 시작하시겠습니까?\n\n[주의] 이전 시즌 기록은 보관되며, 현재 명예의 전당 누적 현황은 초기화됩니다.\n명예의 전당 누적은 시즌 시작 이후부터 새롭게 적용됩니다.")) {
            return;
        }

        try {
            setLoading(true);

            // 0. 현재 시즌 명칭 (기존 기록 수 + 1)
            const { count: historyCount } = await supabase
                .from('agit_season_history')
                .select('*', { count: 'exact', head: true })
                .eq('class_id', activeClass.id);

            const seasonName = `${(historyCount || 0) + 1}번째 시즌`;

            // 1. 기존 기록이 있는 경우에만 아카이빙 진행
            if (historyCount > 0 || liveTemperature > 0) {
                const { error: archiveError } = await supabase
                    .from('agit_season_history')
                    .insert({
                        class_id: activeClass.id,
                        season_name: seasonName,
                        target_score: liveSettings?.targetScore || settings.targetScore,
                        achieved_score: liveTemperature || 0,
                        surprise_gift: liveSettings?.surpriseGift || settings.surpriseGift,
                        started_at: liveSettings?.lastResetAt || new Date().toISOString(),
                        ended_at: new Date().toISOString(),
                        rankings: honorRollStats.slice(0, 5) // 상위 5명 보관
                    });

                if (archiveError) throw archiveError;
            }

            // 2. 아지트 설정 공장 초기화 (isEnabled: false 등)
            const resetSettings = {
                ...DEFAULT_AGIT_SETTINGS,
                lastResetAt: new Date().toISOString()
            };

            const { error: updateError } = await supabase
                .from('classes')
                .update({ agit_settings: resetSettings })
                .eq('id', activeClass.id);

            if (updateError) throw updateError;

            // 3. 현재 명예의 전당 점수 초기화는 lastResetAt 기준으로 필터링되므로
            // DB 자체를 비울 필요는 없으나, 즉각적인 체감을 위해 refresh 호출

            const successMsg = (historyCount || 0) === 0
                ? "아지트 설정이 초기화되었습니다. 🌱"
                : `${seasonName} 기록을 보관하고 시즌을 강제 종료했습니다. 🚀`;

            alert(successMsg);
            setSettings(resetSettings);
            refresh(true); // 강제 새로고침
            setIsSettingsModalOpen(false);
            setHonorRollStats([]); // 로컬 상태 즉시 초기화
            fetchHonorRollStats(resetSettings.lastResetAt); // 변경된 시점 즉시 반영
            fetchSeasonHistory();

        } catch (error) {
            console.error("Error starting new season:", error);
            alert('시즌 처리 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSeasonStart = async () => {
        try {
            setLoading(true);
            // 아지트 온 클래스가 활성화되면 상위 메뉴 활성화(isMenuEnabled)도 자동으로 true로 동기화
            // 동시에 실질적인 시작 시점(lastResetAt)을 현재로 갱신하여 이전 기록과 분리
            const updatedSettings = {
                ...settings,
                isEnabled: true,
                isMenuEnabled: true,
                lastResetAt: new Date().toISOString()
            };
            const { error } = await supabase
                .from('classes')
                .update({ agit_settings: updatedSettings })
                .eq('id', activeClass.id);

            if (error) throw error;

            alert('🚀 아지트 온 클래스 시즌을 시작합니다! 학생들의 입장이 허용되었습니다.');
            setSettings(updatedSettings);
            refresh(true); // 강제 새로고침
            fetchHonorRollStats(updatedSettings.lastResetAt); // 변경된 시점 즉시 반영
        } catch (error) {
            console.error("Error starting season:", error);
            alert('시즌 시작 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteSeasonHistory = async (historyId, seasonName) => {
        if (!window.confirm(`🚨 [주의] ${seasonName} 기록을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
            return;
        }

        try {
            setLoading(true);
            const { error } = await supabase
                .from('agit_season_history')
                .delete()
                .eq('id', historyId);

            if (error) throw error;

            alert('시즌 기록이 삭제되었습니다.');
            fetchSeasonHistory();
        } catch (error) {
            console.error("Error deleting season history:", error);
            alert('기록 삭제 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleMenuEnable = async () => {
        try {
            setLoading(true);
            const updatedSettings = { ...settings, isMenuEnabled: !settings.isMenuEnabled };
            const { error } = await supabase
                .from('classes')
                .update({ agit_settings: updatedSettings })
                .eq('id', activeClass.id);

            if (error) throw error;
            setSettings(updatedSettings);
            refresh(true);
        } catch (error) {
            console.error("Error toggling menu:", error);
            alert('메뉴 활성화 변경 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleIdeaMarketEnable = async () => {
        try {
            setLoading(true);
            const updatedSettings = { ...settings, isIdeaMarketEnabled: !settings.isIdeaMarketEnabled };
            const { error } = await supabase
                .from('classes')
                .update({ agit_settings: updatedSettings })
                .eq('id', activeClass.id);

            if (error) throw error;
            setSettings(updatedSettings);
            refresh(true);
        } catch (error) {
            console.error("Error toggling idea market:", error);
            alert('아이디어 마켓 활성화 변경 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const displayTargetScore = liveSettings?.targetScore || settings.targetScore || 100;
    const displaySurpriseGift = liveSettings?.surpriseGift || settings.surpriseGift;

    const isGoalReached = liveTemperature >= displayTargetScore;
    const isSeasonLocked = !isGoalReached && (liveSettings?.targetScore > 0) && (liveTemperature > 0);

    // 아이디어 마켓 관리 화면
    if (showIdeaMarket) {
        return (
            <IdeaMarketManager
                activeClass={activeClass}
                onBack={() => setShowIdeaMarket(false)}
                isMobile={isMobile}
            />
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <h2 style={{ margin: 0, color: '#1E1B4B', fontWeight: '900' }}>🏠 아지트 관리</h2>

                {/* [신규] 기능별 활성화 토글 그룹 */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    {/* [신규] 전체 아지트 메뉴 활성화 토글 */}
                    <div style={{
                        background: settings.isMenuEnabled ? '#EEF2FF' : '#F8FAFC',
                        padding: '12px 20px', borderRadius: '16px', border: `2px solid ${settings.isMenuEnabled ? '#6366F1' : '#E2E8F0'}`,
                        display: 'flex', alignItems: 'center', gap: '16px', transition: 'all 0.3s'
                    }}>
                        <div>
                            <div style={{ margin: 0, color: '#1E1B4B', fontSize: '0.95rem', fontWeight: '900' }}>
                                두근두근 우리반 아지트 (전체 메뉴)
                            </div>
                            <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '2px' }}>
                                {settings.isMenuEnabled ? '메인 입장 배너 활성화됨' : '메인 입장 배너 잠김'}
                            </div>
                        </div>
                        <div
                            onClick={handleToggleMenuEnable}
                            style={{
                                width: '50px', height: '28px', background: settings.isMenuEnabled ? '#6366F1' : '#CBD5E1',
                                borderRadius: '14px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0
                            }}
                        >
                            <motion.div
                                animate={{ x: settings.isMenuEnabled ? 24 : 2 }}
                                style={{
                                    width: '24px', height: '24px', background: 'white',
                                    borderRadius: '50%', position: 'absolute', top: '2px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                            />
                        </div>
                    </div>

                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))', gap: '32px' }}>

                {/* 1. 아지트 관리 카드 */}
                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    style={{ height: '100%' }}
                >
                    <div style={{
                        height: '100%',
                        background: 'white',
                        borderRadius: '24px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
                            padding: '24px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start'
                        }}>
                            <div>
                                <div style={{
                                    background: 'rgba(255,255,255,0.2)',
                                    backdropFilter: 'blur(8px)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    marginBottom: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}>
                                    <span style={{ fontSize: '1.2rem' }}>🌡️</span>
                                    <span style={{ color: 'white', fontWeight: '800', fontSize: '0.8rem', letterSpacing: '0.05em' }}>AGIT TEMPERATURE</span>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: 'white', letterSpacing: '-0.02em' }}>아지트 溫 클래스</h3>
                            </div>
                        </div>

                        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: '16px', borderBottom: '1px solid #F1F5F9' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', fontWeight: '600', marginBottom: '4px' }}>현재 온도</p>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                        <span style={{ fontSize: '2.2rem', fontWeight: '900', color: '#4F46E5' }}>{liveTemperature || 0}</span>
                                        <span style={{ fontSize: '1rem', color: '#64748B', fontWeight: '700' }}>도</span>
                                    </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8', fontWeight: '600', marginBottom: '4px' }}>목표 온도</p>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', justifyContent: 'flex-end' }}>
                                        <span style={{ fontSize: '1.4rem', fontWeight: '800', color: '#64748B' }}>{displayTargetScore}</span>
                                        <span style={{ fontSize: '0.9rem', color: '#94A3B8', fontWeight: '600' }}>도</span>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#6366F1' }}>진행률</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748B' }}>
                                        {Math.round(((liveTemperature || 0) / displayTargetScore) * 100)}%
                                    </span>
                                </div>
                                <div style={{ width: '100%', height: '10px', background: '#F1F5F9', borderRadius: '5px', overflow: 'hidden' }}>
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(100, ((liveTemperature || 0) / displayTargetScore) * 100)}%` }}
                                        transition={{ duration: 1, ease: 'easeOut' }}
                                        style={{ height: '100%', background: 'linear-gradient(90deg, #6366F1, #EC4899)' }}
                                    />
                                </div>
                            </div>

                            <div style={{ background: '#FFFBEB', borderRadius: '12px', padding: '16px', border: '1px solid #FCD34D' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '1rem' }}>🎁</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '800', color: '#92400E' }}>준비된 선물</span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#B45309', fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {displaySurpriseGift ? displaySurpriseGift : '설정된 선물이 없습니다.'}
                                </p>
                            </div>
                        </div>

                        <div
                            onClick={openSettingsModal}
                            style={{
                                padding: '16px 24px',
                                background: '#F8FAFC',
                                borderTop: '1px solid #F1F5F9',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                cursor: 'pointer'
                            }}
                        >
                            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: '600' }}>설정 및 미션 관리</span>
                            <span style={{ color: '#6366F1', fontWeight: '800', fontSize: '0.9rem' }}>관리하기 →</span>
                        </div>
                    </div>
                </motion.div>

                {/* 2. 아지트 아이디어 마켓 */}
                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    style={{ height: '100%', cursor: 'pointer' }}
                    onClick={() => setShowIdeaMarket(true)}
                >
                    <div style={{
                        height: '100%',
                        background: 'white',
                        borderRadius: '24px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        opacity: 1
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #A18CD1 0%, #FBC2EB 100%)',
                            padding: '24px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start'
                        }}>
                            <div>
                                <div style={{
                                    background: 'rgba(255,255,255,0.3)',
                                    backdropFilter: 'blur(8px)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    marginBottom: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}>
                                    <span style={{ fontSize: '1.2rem' }}>💡</span>
                                    <span style={{ color: '#4C1D95', fontWeight: '800', fontSize: '0.75rem', letterSpacing: '0.05em' }}>IDEA MARKET</span>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#4C1D95', letterSpacing: '-0.02em' }}>아지트 아이디어 마켓</h3>
                            </div>
                            <div style={{
                                background: '#7C3AED',
                                color: 'white',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: '900'
                            }}>OPEN</div>
                        </div>

                        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>🏛️</div>
                            <p style={{ margin: 0, fontSize: '1rem', color: '#1E1B4B', fontWeight: '800', lineHeight: '1.5' }}>
                                우리 반 민주주의 광장!<br />더 즐거운 학급을 위한 제안을 모아요.
                            </p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', fontWeight: '500' }}>
                                학생들의 창의적인 건의사항을 확인하고 소통하는 공간입니다.
                            </p>
                        </div>

                        {/* 활성화 토글 (카드 내부) */}
                        <div
                            onClick={e => e.stopPropagation()}
                            style={{
                                padding: '14px 24px',
                                borderTop: '1px solid #EDE9FE',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                background: settings.isIdeaMarketEnabled ? '#F5F3FF' : '#F8FAFC',
                                transition: 'background 0.3s'
                            }}
                        >
                            <div>
                                <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#4C1D95' }}>
                                    {settings.isIdeaMarketEnabled ? '🟣 학생 메뉴 활성화됨' : '⚪ 학생 메뉴 잠김'}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#7C3AED', marginTop: '2px' }}>
                                    {settings.isIdeaMarketEnabled ? '학생들이 아이디어 마켓에 입장할 수 있습니다' : '학생들에게는 잠금 표시가 보입니다'}
                                </div>
                            </div>
                            <div
                                onClick={handleToggleIdeaMarketEnable}
                                style={{
                                    width: '50px', height: '28px',
                                    background: settings.isIdeaMarketEnabled ? '#8B5CF6' : '#CBD5E1',
                                    borderRadius: '14px', position: 'relative',
                                    cursor: 'pointer', transition: 'background 0.3s', flexShrink: 0
                                }}
                            >
                                <motion.div
                                    animate={{ x: settings.isIdeaMarketEnabled ? 24 : 2 }}
                                    style={{
                                        width: '24px', height: '24px', background: 'white',
                                        borderRadius: '50%', position: 'absolute', top: '2px',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{
                            padding: '16px 24px',
                            background: '#F5F3FF',
                            borderTop: '1px solid #EDE9FE',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'pointer'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: '#7C3AED', fontWeight: '700' }}>회의 안건 관리하기 →</span>
                        </div>
                    </div>
                </motion.div>

                {/* 3. 아지트 비밀 우체통 */}
                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    style={{ height: '100%' }}
                >
                    <div style={{
                        height: '100%',
                        background: 'white',
                        borderRadius: '24px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        opacity: 0.8
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #84FAB0 0%, #8FD3F4 100%)',
                            padding: '24px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start'
                        }}>
                            <div>
                                <div style={{
                                    background: 'rgba(255,255,255,0.3)',
                                    backdropFilter: 'blur(8px)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    marginBottom: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}>
                                    <span style={{ fontSize: '1.2rem' }}>📬</span>
                                    <span style={{ color: '#064E3B', fontWeight: '800', fontSize: '0.75rem', letterSpacing: '0.05em' }}>SECRET MAILBOX</span>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#064E3B', letterSpacing: '-0.02em' }}>아지트 비밀 우체통</h3>
                            </div>
                            <div style={{
                                background: '#064E3B',
                                color: 'white',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: '900'
                            }}>준비중</div>
                        </div>

                        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>💌</div>
                            <p style={{ margin: 0, fontSize: '1rem', color: '#1E1B4B', fontWeight: '800', lineHeight: '1.5' }}>
                                친구에게 전하고 싶은 따뜻한 마음을<br />비밀 편지로 보내보아요.
                            </p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', fontWeight: '500' }}>
                                익명 혹은 기명으로 따뜻함을 나누는 공간입니다.
                            </p>
                        </div>

                        <div style={{
                            padding: '16px 24px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'default'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: '700' }}>기능 개발 중... 🛠️</span>
                        </div>
                    </div>
                </motion.div>

                {/* 4. 북적북적 아지트 한줄 릴레이 */}
                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    style={{ height: '100%' }}
                >
                    <div style={{
                        height: '100%',
                        background: 'white',
                        borderRadius: '24px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        opacity: 0.8
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #FF9A9E 0%, #FAD0C4 100%)',
                            padding: '24px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start'
                        }}>
                            <div>
                                <div style={{
                                    background: 'rgba(255,255,255,0.3)',
                                    backdropFilter: 'blur(8px)',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    marginBottom: '8px',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }}>
                                    <span style={{ fontSize: '1.2rem' }}>✍️</span>
                                    <span style={{ color: '#721c24', fontWeight: '800', fontSize: '0.75rem', letterSpacing: '0.05em' }}>STORY RELAY</span>
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#721c24', letterSpacing: '-0.02em' }}>북적북적 한줄 릴레이</h3>
                            </div>
                            <div style={{
                                background: '#721c24',
                                color: 'white',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: '900'
                            }}>준비중</div>
                        </div>

                        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px', justifyContent: 'center', textAlign: 'center' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📚</div>
                            <p style={{ margin: 0, fontSize: '1rem', color: '#1E1B4B', fontWeight: '800', lineHeight: '1.5' }}>
                                한 문장씩 이어가며<br />우리 반만의 소설을 지어보아요!
                            </p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748B', fontWeight: '500' }}>
                                친구들과 함께 상상력을 나누는 공간입니다.
                            </p>
                        </div>

                        <div style={{
                            padding: '16px 24px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            cursor: 'default'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: '#94A3B8', fontWeight: '700' }}>기능 개발 중... 🛠️</span>
                        </div>
                    </div>
                </motion.div>

            </div>

            <AnimatePresence>
                {isSettingsModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                            background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center',
                            padding: isMobile ? '20px' : '40px', backdropFilter: 'blur(4px)'
                        }}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20, opacity: 0 }}
                            animate={{ scale: 1, y: 0, opacity: 1 }}
                            exit={{ scale: 0.9, y: 20, opacity: 0 }}
                            style={{
                                background: 'white', width: '100%', maxWidth: '750px', maxHeight: '90vh',
                                borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                            }}
                        >
                            <header style={{ padding: '0 24px', borderBottom: '1px solid #F1F5F9' }}>
                                <div style={{ padding: '24px 0 16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#1E1B4B' }}>🛠️ 아지트 세부 관리</h3>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#64748B' }}>학급의 온도를 올리는 규칙을 설정합니다.</p>
                                    </div>
                                    <button onClick={() => setIsSettingsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', color: '#94A3B8' }}>×</button>
                                </div>
                                <div style={{ display: 'flex', gap: '20px' }}>
                                    {['settings', 'history'].map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveTab(tab)}
                                            style={{
                                                padding: '8px 12px 16px 12px',
                                                background: 'none',
                                                border: 'none',
                                                borderBottom: activeTab === tab ? '3px solid #6366F1' : '3px solid transparent',
                                                color: activeTab === tab ? '#1E1B4B' : '#94A3B8',
                                                fontWeight: '800',
                                                fontSize: '0.95rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {tab === 'settings' ? '⚙️ 현재 설정' : '📜 시즌 기록'}
                                        </button>
                                    ))}
                                </div>
                            </header>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                {activeTab === 'settings' ? (
                                    <>
                                        <section style={{ marginBottom: '20px' }}>
                                            <div style={{
                                                background: settings.isEnabled ? '#EEF2FF' : '#F8FAFC',
                                                padding: '20px', borderRadius: '16px', border: `2px solid ${settings.isEnabled ? '#6366F1' : '#E2E8F0'}`,
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                transition: 'all 0.3s'
                                            }}>
                                                <div>
                                                    <h4 style={{ margin: 0, color: '#1E1B4B', fontSize: '1rem', fontWeight: '900' }}>
                                                        {settings.isEnabled ? '✅ 아지트 활성화됨' : '🔒 아지트 비활성화됨'}
                                                    </h4>
                                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                                                        {settings.isEnabled ? '학생들이 아지트 온 클래스에 입장하여 활동할 수 있습니다.' : '학생들에게는 "준비 중" 문구가 표시되며 입장이 제한됩니다.'}
                                                    </p>
                                                </div>
                                                <div
                                                    onClick={() => setSettings({ ...settings, isEnabled: !settings.isEnabled })}
                                                    style={{
                                                        width: '60px', height: '32px', background: settings.isEnabled ? '#6366F1' : '#CBD5E1',
                                                        borderRadius: '20px', position: 'relative', cursor: 'pointer', transition: 'background 0.3s'
                                                    }}
                                                >
                                                    <motion.div
                                                        animate={{ x: settings.isEnabled ? 30 : 2 }}
                                                        style={{
                                                            width: '28px', height: '28px', background: 'white',
                                                            borderRadius: '50%', position: 'absolute', top: '2px',
                                                            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </section>

                                        <section>
                                            <h4 style={{ margin: '0 0 16px 0', color: '#1E1B4B', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: '800' }}>
                                                🎯 시즌 목표 및 일일 미션
                                            </h4>

                                            <div style={{ background: '#F8FAFC', padding: '24px', borderRadius: '16px', border: '2px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
                                                    <div style={{ flex: 1, minWidth: '200px' }}>
                                                        <label style={{ fontSize: '0.9rem', color: '#1E1B4B', fontWeight: '800', display: 'block', marginBottom: '4px' }}>시즌 목표 온도</label>
                                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>달성 시 깜짝 선물이 공개됩니다.</p>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <input
                                                            type="number"
                                                            value={settings.targetScore}
                                                            disabled={isSeasonLocked}
                                                            onChange={(e) => setSettings({ ...settings, targetScore: parseInt(e.target.value) || 0 })}
                                                            style={{
                                                                width: '120px', padding: '12px', borderRadius: '12px',
                                                                border: isSeasonLocked ? '2px solid #E2E8F0' : '2px solid #CBD5E1',
                                                                background: isSeasonLocked ? '#F8FAFC' : 'white',
                                                                outline: 'none', fontSize: '1.4rem', fontWeight: '800',
                                                                color: isSeasonLocked ? '#94A3B8' : '#1E1B4B', textAlign: 'center',
                                                                cursor: isSeasonLocked ? 'not-allowed' : 'text'
                                                            }}
                                                        />
                                                        <span style={{ fontWeight: '800', color: isSeasonLocked ? '#94A3B8' : '#1E1B4B', fontSize: '1.4rem' }}>도</span>
                                                    </div>
                                                </div>
                                                {isSeasonLocked && (
                                                    <p style={{ margin: '-12px 0 0 0', fontSize: '0.8rem', color: '#6366F1', fontWeight: '600' }}>
                                                        🔒 목표 온도가 설정되어 시즌이 진행 중입니다. 달성 후 초기화가 가능합니다.
                                                    </p>
                                                )}

                                                <div>
                                                    <div style={{ marginBottom: '16px' }}>
                                                        <label style={{ fontSize: '0.9rem', color: '#1E1B4B', fontWeight: '800', display: 'block', marginBottom: '4px' }}>일일 미션 달성 조건</label>
                                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>
                                                            학생 1명이 하루에 <strong style={{ color: '#4338CA' }}>세 가지 모두 달성 시 +1도</strong>
                                                        </p>
                                                    </div>

                                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px' }}>
                                                        {[
                                                            { id: 'post', label: '글쓰기', icon: '✏️', color: '#EF4444' },
                                                            { id: 'comment', label: '댓글', icon: '💬', color: '#3B82F6' },
                                                            { id: 'reaction', label: '반응', icon: '❤️', color: '#EC4899' }
                                                        ].map(act => (
                                                            <div key={act.id} style={{
                                                                background: 'white', padding: '16px', borderRadius: '12px', border: '2px solid #E2E8F0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                                                            }}>
                                                                <div style={{ fontSize: '1.5rem' }}>{act.icon}</div>
                                                                <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#64748B' }}>{act.label}</div>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <input
                                                                        type="number"
                                                                        value={settings.activityGoals[act.id]}
                                                                        onChange={(e) => setSettings({
                                                                            ...settings,
                                                                            activityGoals: { ...settings.activityGoals, [act.id]: parseInt(e.target.value) || 0 }
                                                                        })}
                                                                        style={{
                                                                            width: '60px', padding: '6px', border: `2px solid ${act.color}`, borderRadius: '8px', textAlign: 'center', fontWeight: '800', fontSize: '1rem', color: act.color, outline: 'none'
                                                                        }}
                                                                    />
                                                                    <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: '700' }}>회</span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </section>

                                        <section>
                                            <h4 style={{ margin: '0 0 16px 0', color: '#1E1B4B', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: '800' }}>
                                                🎁 깜짝 선물 설정
                                            </h4>

                                            <div style={{ background: '#FFFBEB', padding: '24px', borderRadius: '16px', border: '2px solid #FCD34D' }}>
                                                <textarea
                                                    value={settings.surpriseGift}
                                                    onChange={(e) => setSettings({ ...settings, surpriseGift: e.target.value })}
                                                    placeholder="예시:&#10;🎉 우리 반 모두 함께 영화 관람!&#10;🏆 반 전체 자유 시간 30분 추가!&#10;🍕 피자 파티!"
                                                    style={{
                                                        width: '100%', padding: '14px', borderRadius: '12px', border: '2px solid #FCD34D', outline: 'none', fontSize: '0.95rem', fontWeight: '500', color: '#78350F', minHeight: '100px', resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.6', background: 'white'
                                                    }}
                                                />
                                                <p style={{ margin: '12px 0 0 0', fontSize: '0.85rem', color: '#92400E', lineHeight: 1.5 }}>
                                                    💡 목표 온도 달성 시 학생들에게 공개될 특별한 선물이나 보상을 입력하세요.
                                                </p>
                                            </div>
                                        </section>

                                        {/* C. 명예의 전당 누적 현황 (모달 안으로 이동) */}
                                        <section>
                                            <h4 style={{ margin: '0 0 16px 0', color: '#1E1B4B', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: '800' }}>
                                                🏆 명예의 전당 누적 현황
                                            </h4>

                                            <div style={{ background: '#F0FDF4', padding: '24px', borderRadius: '16px', border: '2px solid #BBF7D0' }}>
                                                <div style={{ maxHeight: '250px', overflowY: 'auto', paddingRight: '10px' }}>
                                                    {statsLoading ? (
                                                        <div style={{ textAlign: 'center', padding: '20px', color: '#059669', fontWeight: '600' }}>데이터 로딩 중...</div>
                                                    ) : honorRollStats.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                            {honorRollStats.map((student, idx) => (
                                                                <div key={idx} style={{
                                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                                    padding: '12px 16px', background: 'white',
                                                                    borderRadius: '12px', border: idx < 3 ? '2px solid #10B981' : '1px solid #E2E8F0',
                                                                    boxShadow: idx < 3 ? '0 4px 6px -1px rgba(16, 185, 129, 0.1)' : 'none'
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                        <div style={{
                                                                            width: '32px', height: '32px', borderRadius: '50%',
                                                                            background: idx < 3 ? '#F0FDF4' : '#F8FAFC',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                            fontSize: '0.9rem', fontWeight: '900', color: idx < 3 ? '#10B981' : '#64748B',
                                                                            border: `1px solid ${idx < 3 ? '#BBF7D0' : '#E2E8F0'}`
                                                                        }}>
                                                                            {idx < 3 ? ['🥇', '🥈', '🥉'][idx] : idx + 1}
                                                                        </div>
                                                                        <span style={{ fontWeight: '800', color: '#1E293B', fontSize: '1rem' }}>{student.name}</span>
                                                                    </div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                        <span style={{ fontSize: '1.2rem', fontWeight: '900', color: '#059669' }}>{student.count}</span>
                                                                        <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: '700' }}>회 달성</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div style={{ textAlign: 'center', padding: '30px', color: '#059669' }}>
                                                            <p style={{ margin: 0, fontSize: '1.5rem', marginBottom: '10px' }}>🍃</p>
                                                            <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700' }}>아직 달성 기록이 없습니다.</p>
                                                        </div>
                                                    )}
                                                </div>
                                                <p style={{ margin: '16px 0 0 0', fontSize: '0.85rem', color: '#059669', lineHeight: 1.5, fontWeight: '600' }}>
                                                    💡 학급 명예의 전당은 일일 미션을 모두 완료한 학생들의 누적 기록입니다.
                                                </p>
                                            </div>
                                        </section>
                                    </>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                        {historyLoading ? (
                                            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>시즌 기록을 불러오는 중...</div>
                                        ) : seasonHistory.length > 0 ? (
                                            seasonHistory.map((history, idx) => (
                                                <div key={history.id} style={{
                                                    background: 'white', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
                                                }}>
                                                    <div style={{ background: '#F8FAFC', padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: '900', color: '#1E1B4B', fontSize: '1.1rem' }}>🎉 {history.season_name}</span>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '600' }}>
                                                                {new Date(history.started_at).toLocaleDateString()} ~ {new Date(history.ended_at).toLocaleDateString()}
                                                            </span>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleDeleteSeasonHistory(history.id, history.season_name);
                                                                }}
                                                                style={{
                                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                                    color: '#EF4444',
                                                                    border: 'none',
                                                                    padding: '4px 8px',
                                                                    borderRadius: '6px',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: '800',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s'
                                                                }}
                                                                onMouseOver={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.2)'}
                                                                onMouseOut={(e) => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
                                                            >
                                                                삭제
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '20px' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                                            <div style={{ display: 'flex', gap: '12px' }}>
                                                                <div style={{ background: '#EEF2FF', padding: '10px 16px', borderRadius: '10px', flex: 1 }}>
                                                                    <div style={{ fontSize: '0.75rem', color: '#6366F1', fontWeight: '800', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}>
                                                                        <span>최종 온도 / 목표</span>
                                                                    </div>
                                                                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: (history.achieved_score !== null && history.achieved_score !== undefined && history.achieved_score < history.target_score) ? '#EF4444' : '#1E1B4B' }}>
                                                                        {history.achieved_score ?? history.target_score}도
                                                                        <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: '600', marginLeft: '6px' }}>
                                                                            / {history.target_score}도 {(history.achieved_score !== null && history.achieved_score !== undefined && history.achieved_score < history.target_score) ? '(미달성)' : '달성!'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div style={{ background: '#F0FDF4', padding: '10px 16px', borderRadius: '10px', flex: 1 }}>
                                                                    <div style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: '800', marginBottom: '2px' }}>달성 기간</div>
                                                                    <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#1E1B4B' }}>
                                                                        {Math.max(1, Math.ceil((new Date(history.ended_at) - new Date(history.started_at)) / (1000 * 60 * 60 * 24)))}일 소요
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ background: '#FFFBEB', padding: '12px 16px', borderRadius: '10px', border: '1px solid #FCD34D' }}>
                                                                <div style={{ fontSize: '0.75rem', color: '#92400E', fontWeight: '800', marginBottom: '4px' }}>🎁 깜짝 선물</div>
                                                                <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#78350F' }}>{history.surprise_gift || '없음'}</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ background: '#F1F5F9', padding: '16px', borderRadius: '12px' }}>
                                                            <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#475569', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>🏆 명예의 전당 TOP 5</div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                {history.rankings?.map((r, i) => (
                                                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                                                                        <span style={{ fontWeight: '700', color: '#334155' }}>{i + 1}. {r.name}</span>
                                                                        <span style={{ fontWeight: '800', color: '#059669' }}>{r.count}회</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '60px', color: '#94A3B8' }}>
                                                <div style={{ fontSize: '3rem', marginBottom: '10px' }}>📜</div>
                                                <div style={{ fontWeight: '700' }}>아직 종료된 시즌 기록이 없습니다.</div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <footer style={{ padding: '24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '12px', background: '#F8FAFC', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                                <Button
                                    onClick={handleSaveSettings}
                                    style={{ flex: 1, background: '#64748B', fontWeight: 'bold', padding: '16px', fontSize: '0.95rem', minWidth: isMobile ? '100% ' : 'auto' }}
                                >
                                    💾 설정 저장
                                </Button>

                                {!liveSettings?.isEnabled ? (
                                    <Button
                                        onClick={handleSeasonStart}
                                        style={{
                                            flex: 2,
                                            background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
                                            fontWeight: '900', padding: '16px', fontSize: '1rem',
                                            minWidth: isMobile ? '100%' : 'auto',
                                            boxShadow: '0 4px 15px rgba(99, 102, 241, 0.3)'
                                        }}
                                    >
                                        🚀 {seasonHistory.length === 0 ? '첫 번째 시즌 시작하기' : '새로운 시즌 시작하기'}
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleStartNewSeason}
                                        style={{
                                            flex: 2,
                                            background: isGoalReached ? 'linear-gradient(135deg, #EC4899 0%, #6366F1 100%)' : '#EF4444',
                                            fontWeight: '900', padding: '16px', fontSize: '1rem',
                                            minWidth: isMobile ? '100%' : 'auto',
                                            boxShadow: isGoalReached ? '0 4px 15px rgba(236, 72, 153, 0.3)' : 'none',
                                            opacity: isGoalReached ? 1 : 0.8
                                        }}
                                    >
                                        {isGoalReached ? '🎉 목표 달성! 시즌 종료 및 기록 보관' : '⚠️ 현재 시즌 강제 종료 및 초기화'}
                                    </Button>
                                )}

                                <Button
                                    onClick={() => setIsSettingsModalOpen(false)}
                                    variant="ghost"
                                    style={{ flex: 0.7, padding: '16px', minWidth: isMobile ? '100%' : 'auto' }}
                                >
                                    닫기
                                </Button>
                            </footer>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AgitManager;
