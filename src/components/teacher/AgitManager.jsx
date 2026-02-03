import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useClassAgitStage } from '../../hooks/useClassAgitStage';

const AgitManager = ({ activeClass, isMobile }) => {
    const [loading, setLoading] = useState(true);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    // 학생 화면과 동일한 온도 및 설정 실시간 동기화
    const { temperature: liveTemperature, agitSettings: liveSettings, refresh } = useClassAgitStage(activeClass?.id, null);

    const [settings, setSettings] = useState({
        targetScore: 100,
        surpriseGift: '',
        activityGoals: {
            post: 1,      // 1도를 올리기 위해 필요한 글쓰기 횟수
            comment: 5,   // 1도를 올리기 위해 필요한 댓글 횟수
            reaction: 5   // 1도를 올리기 위해 필요한 반응 횟수
        }
    });

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

            setIsSettingsModalOpen(false);
            alert('아지트 설정이 저장되었습니다! 🏠✨');

            // 즉시 데이터 갱신 요청
            refresh();

        } catch (error) {
            console.error("Error saving agit settings:", error);
            alert('설정 저장 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    // UI 표시용 타겟 점수 (실시간 데이터와 로컬 데이터 중 최신값 반영 노력)
    // 저장 직후에는 liveSettings가 갱신되기 전일 수 있으므로 로컬 settings도 고려
    // 하지만 결국 liveSettings가 source of truth여야 함. refresh 호출로 해결 기대.
    const displayTargetScore = liveSettings?.targetScore || settings.targetScore || 100;
    const displaySurpriseGift = liveSettings?.surpriseGift || settings.surpriseGift;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <h2 style={{ margin: 0, color: '#1E1B4B', fontWeight: '900' }}>🏠 우리반 아지트 관리</h2>

            {/* [메인 허브] 카드 레이아웃 - 현재는 아지트 관리 카드 하나만 배치 */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px' }}>

                {/* 1. 아지트 溫 스테이지 관리 카드 */}
                <motion.div
                    whileHover={{ scale: 1.02, y: -5 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={openSettingsModal}
                    style={{ cursor: 'pointer', height: '100%' }}
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
                        transition: 'all 0.3s ease'
                    }}>
                        {/* 헤더 영역 - 그라데이션 & 타이틀 */}
                        <div style={{
                            background: 'linear-gradient(135deg, #6366F1 0%, #4338CA 100%)',
                            padding: '24px',
                            position: 'relative',
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
                                <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: 'white', letterSpacing: '-0.02em' }}>아지트 溫 스테이지</h3>
                            </div>
                            <div style={{
                                background: 'white',
                                width: '40px',
                                height: '40px',
                                borderRadius: '50%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                            }}>
                                <span style={{ color: '#4338CA', fontSize: '1.2rem' }}>⚙️</span>
                            </div>
                        </div>

                        {/* 본문 영역 - 통계 및 상태 */}
                        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {/* 온도 현황 */}
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

                            {/* 진행률 바 */}
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

                            {/* 깜짝 선물 미리보기 */}
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

                        {/* 푸터 - 액션 */}
                        <div style={{
                            padding: '16px 24px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #F1F5F9',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.85rem', color: '#64748B', fontWeight: '600' }}>설정 및 미션 관리</span>
                            <span style={{ color: '#6366F1', fontWeight: '800', fontSize: '0.9rem' }}>관리하기 →</span>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* [상세 설정 모달창] */}
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
                            <header style={{ padding: '24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#1E1B4B' }}>🛠️ 아지트 溫 스테이지 세부 관리</h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#64748B' }}>학급의 온도를 올리는 규칙을 설정합니다.</p>
                                </div>
                                <button onClick={() => setIsSettingsModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.6rem', cursor: 'pointer', color: '#94A3B8' }}>×</button>
                            </header>

                            <div style={{ flex: 1, overflowY: 'auto', padding: '30px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                {/* A. 목표 온도 및 일일 미션 설정 (통합) */}
                                <section>
                                    <h4 style={{ margin: '0 0 16px 0', color: '#1E1B4B', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem', fontWeight: '800' }}>
                                        🎯 시즌 목표 및 일일 미션
                                    </h4>

                                    <div style={{ background: '#F8FAFC', padding: '24px', borderRadius: '16px', border: '2px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '24px' }}>

                                        {/* 1. 시즌 목표 온도 */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', borderBottom: '1px solid #E2E8F0', paddingBottom: '24px' }}>
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <label style={{ fontSize: '0.9rem', color: '#1E1B4B', fontWeight: '800', display: 'block', marginBottom: '4px' }}>시즌 목표 온도</label>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>달성 시 깜짝 선물이 공개됩니다.</p>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <input
                                                    type="number"
                                                    value={settings.targetScore}
                                                    onChange={(e) => setSettings({ ...settings, targetScore: parseInt(e.target.value) || 0 })}
                                                    style={{
                                                        width: '120px',
                                                        padding: '12px',
                                                        borderRadius: '12px',
                                                        border: '2px solid #CBD5E1',
                                                        outline: 'none',
                                                        fontSize: '1.4rem',
                                                        fontWeight: '800',
                                                        color: '#1E1B4B',
                                                        textAlign: 'center'
                                                    }}
                                                />
                                                <span style={{ fontWeight: '800', color: '#1E1B4B', fontSize: '1.4rem' }}>도</span>
                                            </div>
                                        </div>

                                        {/* 2. 일일 미션 달성 조건 */}
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
                                                        background: 'white',
                                                        padding: '16px',
                                                        borderRadius: '12px',
                                                        border: '2px solid #E2E8F0',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        gap: '8px'
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
                                                                    width: '60px',
                                                                    padding: '6px',
                                                                    border: `2px solid ${act.color}`,
                                                                    borderRadius: '8px',
                                                                    textAlign: 'center',
                                                                    fontWeight: '800',
                                                                    fontSize: '1rem',
                                                                    color: act.color,
                                                                    outline: 'none'
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

                                {/* B. 깜짝 선물 설정 (별도 유지) */}
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
                                                width: '100%',
                                                padding: '14px',
                                                borderRadius: '12px',
                                                border: '2px solid #FCD34D',
                                                outline: 'none',
                                                fontSize: '0.95rem',
                                                fontWeight: '500',
                                                color: '#78350F',
                                                minHeight: '100px',
                                                resize: 'vertical',
                                                fontFamily: 'inherit',
                                                lineHeight: '1.6',
                                                background: 'white'
                                            }}
                                        />
                                        <p style={{ margin: '12px 0 0 0', fontSize: '0.85rem', color: '#92400E', lineHeight: 1.5 }}>
                                            💡 목표 온도 달성 시 학생들에게 공개될 특별한 선물이나 보상을 입력하세요.
                                        </p>
                                    </div>
                                </section>

                            </div>

                            <footer style={{ padding: '24px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '12px', background: '#F8FAFC' }}>
                                <Button onClick={handleSaveSettings} style={{ flex: 1, background: '#6366F1', fontWeight: 'bold', padding: '16px', fontSize: '1rem' }}>설정 저장 및 우리 반 아지트에 즉시 적용</Button>
                                <Button onClick={() => setIsSettingsModalOpen(false)} variant="ghost" style={{ flex: 0.3, padding: '16px' }}>취소</Button>
                            </footer>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default AgitManager;
