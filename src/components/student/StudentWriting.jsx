import React from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useMissionSubmit } from '../../hooks/useMissionSubmit';

/**
 * 역할: 학생 - 글쓰기 에디터 (포인트 연동 기능 포함) ✨
 */
const StudentWriting = ({ studentSession, missionId, onBack, onNavigate, params }) => {
    const {
        mission,
        title, setTitle,
        content, setContent,
        loading,
        submitting,
        isReturned,
        isConfirmed,
        isSubmitted,
        aiFeedback,
        handleSave,
        handleSubmit
    } = useMissionSubmit(studentSession, missionId, params, onBack, onNavigate);

    // 통계 계산
    const charCount = content.length;
    const paragraphCount = content.split(/\n+/).filter(p => p.trim().length > 0).length;

    if (loading) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 도구를 준비하는 중... ✍️</p></Card>;
    if (!mission) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 미션을 찾을 수 없습니다.</p><Button onClick={onBack}>돌아가기</Button></Card>;

    return (
        <Card style={{ maxWidth: '850px', padding: '32px', border: 'none', background: '#FFFFFF', boxShadow: '0 15px 40px rgba(0,0,0,0.08)', margin: '20px auto 40px auto' }}>
            {/* 상단 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
                <Button variant="ghost" size="sm" onClick={onBack} disabled={submitting}>
                    ⬅️ 나가기
                </Button>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        display: 'inline-block',
                        padding: '4px 12px',
                        background: '#E3F2FD',
                        color: '#1976D2',
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        fontWeight: '900',
                        marginBottom: '8px'
                    }}>
                        {mission.genre}
                    </div>
                    <h2 style={{ margin: 0, color: '#263238', fontSize: '1.8rem', fontWeight: '900' }}>{mission.title}</h2>
                </div>
            </div>

            {/* 선생님 피드백/다시쓰기 안내 및 상태 표시 */}
            <AnimatePresence>
                {isConfirmed ? (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        style={{
                            background: '#E8F5E9',
                            padding: '16px 20px',
                            borderRadius: '16px',
                            marginBottom: '24px',
                            border: '1px solid #C8E6C9',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            overflow: 'hidden'
                        }}
                    >
                        <span style={{ fontSize: '1.5rem' }}>✅</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#2E7D32', fontSize: '1rem' }}>포인트 지급 완료!</div>
                            <div style={{ fontSize: '0.85rem', color: '#388E3C' }}>선생님이 글을 승인하고 포인트를 선물하셨어요. 축하해요! 🌟</div>
                        </div>
                    </motion.div>
                ) : isSubmitted ? (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        style={{
                            background: '#E3F2FD',
                            padding: '16px 20px',
                            borderRadius: '16px',
                            marginBottom: '24px',
                            border: '1px solid #BBDEFB',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            overflow: 'hidden'
                        }}
                    >
                        <span style={{ fontSize: '1.5rem' }}>⏳</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#1565C0', fontSize: '1rem' }}>선생님이 확인 중이에요</div>
                            <div style={{ fontSize: '0.85rem', color: '#1976D2' }}>글을 멋지게 제출했어요! 조금만 기다려주세요. ✨</div>
                        </div>
                    </motion.div>
                ) : isReturned && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        style={{
                            background: '#FFF3E0',
                            padding: '16px 20px',
                            borderRadius: '16px',
                            marginBottom: '24px',
                            border: '1px solid #FFE0B2',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            overflow: 'hidden'
                        }}
                    >
                        <span style={{ fontSize: '1.5rem' }}>♻️</span>
                        <div>
                            <div style={{ fontWeight: '900', color: '#E65100', fontSize: '1rem' }}>선생님이 다시 쓰기를 요청하셨습니다.</div>
                            <div style={{ fontSize: '0.85rem', color: '#EF6C00', marginBottom: aiFeedback ? '8px' : '0' }}>내용을 보완해서 다시 한번 멋진 글을 완성해볼까요?</div>
                            {aiFeedback && (
                                <div style={{
                                    background: 'rgba(255,255,255,0.7)',
                                    padding: '20px',
                                    borderRadius: '16px',
                                    fontSize: '1rem',
                                    color: '#444',
                                    whiteSpace: 'pre-wrap',
                                    lineHeight: '1.8',
                                    border: '1px solid rgba(230, 81, 0, 0.2)',
                                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.03)'
                                }}>
                                    {aiFeedback}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 가이드 박스 */}
            <div style={{
                background: '#F8F9FA',
                padding: '24px',
                borderRadius: '20px',
                marginBottom: '32px',
                border: '1px solid #E9ECEF',
                position: 'relative'
            }}>
                <div style={{
                    position: 'absolute',
                    top: '-12px',
                    left: '24px',
                    background: '#FFFFFF',
                    padding: '2px 12px',
                    borderRadius: '10px',
                    fontSize: '0.85rem',
                    fontWeight: '900',
                    color: '#607D8B',
                    border: '1px solid #E9ECEF'
                }}>
                    선생님의 가이드 💡
                </div>
                <p style={{ margin: 10, fontSize: '1.05rem', color: '#455A64', lineHeight: '1.8', whiteSpace: 'pre-wrap' }}>
                    {mission.guide}
                </p>
            </div>

            {/* 글쓰기 영역 */}
            <div style={{ marginBottom: '32px' }}>
                <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="글의 제목을 적어주세요..."
                    style={{
                        width: '100%',
                        padding: '16px 0',
                        fontSize: '1.6rem',
                        fontWeight: '800',
                        border: 'none',
                        borderBottom: '3px solid #F1F3F5',
                        marginBottom: '24px',
                        outline: 'none',
                        color: '#2C3E50'
                    }}
                    disabled={submitting}
                    spellCheck="true"
                />

                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="여기에 자유롭게 이야기를 시작해보세요..."
                    style={{
                        width: '100%',
                        minHeight: '400px',
                        padding: '10px 0',
                        border: 'none',
                        fontSize: '1.2rem',
                        lineHeight: '2',
                        outline: 'none',
                        color: '#34495E',
                        resize: 'none',
                        background: 'transparent'
                    }}
                    disabled={submitting}
                    spellCheck="true"
                />
            </div>

            {/* 실시간 정보 및 보너스 현황 */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '20px',
                background: '#FFFDE7',
                borderRadius: '20px',
                marginBottom: '32px',
                border: '1px solid #FFF59D'
            }}>
                <div style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: '#8D6E63', marginBottom: '4px' }}>글자수</div>
                        <div style={{
                            fontSize: '1.2rem',
                            fontWeight: '900',
                            color: charCount >= mission.min_chars ? '#2E7D32' : '#F44336'
                        }}>
                            {charCount} / {mission.min_chars}
                        </div>
                    </div>
                    <div style={{ width: '1px', background: '#FFE082' }} />
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '0.8rem', color: '#8D6E63', marginBottom: '4px' }}>문단수</div>
                        <div style={{
                            fontSize: '1.2rem',
                            fontWeight: '900',
                            color: paragraphCount >= mission.min_paragraphs ? '#2E7D32' : '#F44336'
                        }}>
                            {paragraphCount} / {mission.min_paragraphs}
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    {charCount >= mission.bonus_threshold ? (
                        <div style={{ color: '#E65100', fontWeight: '900', fontSize: '1rem' }}>
                            🔥 보너스 달성 완료! (+{mission.bonus_reward}P)
                        </div>
                    ) : (
                        <div style={{ color: '#795548', fontSize: '0.9rem' }}>
                            <strong style={{ color: '#E65100' }}>{mission.bonus_threshold}자</strong>를 넘기면 보너스 점수가 있어요!
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
                <Button
                    size="lg"
                    onClick={() => handleSave(true)}
                    disabled={submitting}
                    style={{
                        flex: 1,
                        height: '64px',
                        fontSize: '1.2rem',
                        fontWeight: '800',
                        background: '#ECEFF1',
                        color: '#455A64',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                    }}
                >
                    임시 저장 💾
                </Button>
                <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={submitting || isConfirmed || (isSubmitted && !isReturned)}
                    style={{
                        flex: 2,
                        height: '64px',
                        fontSize: '1.3rem',
                        fontWeight: '900',
                        background: 'var(--primary-color)',
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 8px 25px rgba(135, 206, 235, 0.4)',
                        transition: 'all 0.2s',
                        opacity: (isConfirmed || (isSubmitted && !isReturned)) ? 0.6 : 1
                    }}
                >
                    {submitting
                        ? '제출 중...'
                        : isConfirmed
                            ? '승인 완료 ✨'
                            : (params?.mode === 'edit' || (isSubmitted && isReturned))
                                ? '수정 완료! ✨'
                                : (isSubmitted && !isReturned)
                                    ? '확인 대기 중...'
                                    : '멋지게 제출하기! 🚀'
                    }
                </Button>
            </div>
        </Card>
    );
};

export default StudentWriting;
