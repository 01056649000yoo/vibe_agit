import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 학생 - 글쓰기 에디터 (포인트 연동 기능 포함) ✨
 */
const StudentWriting = ({ studentSession, missionId, onBack, onNavigate }) => {
    const [mission, setMission] = useState(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (missionId) {
            fetchMission();
        }
    }, [missionId]);

    const fetchMission = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('id', missionId)
                .single();

            if (error) throw error;
            setMission(data);
        } catch (err) {
            console.error('글쓰기 미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    // 통계 계산
    const charCount = content.length;
    const paragraphCount = content.split(/\n+/).filter(p => p.trim().length > 0).length;

    // 제출 전 유효성 검사 및 포인트 처리
    const handleSubmit = async () => {
        if (!title.trim()) {
            alert('멋질 글의 제목을 지어주세요! ✍️');
            return;
        }

        if (charCount < (mission.min_chars || 0)) {
            alert(`최소 ${mission.min_chars}자 이상 써야 해요! 조금 더 힘내볼까요? 💪`);
            return;
        }

        if (paragraphCount < (mission.min_paragraphs || 0)) {
            alert(`최소 ${mission.min_paragraphs}문단 이상이 필요해요! 내용을 나눠서 적어보세요. 📏`);
            return;
        }

        if (!window.confirm('정말 이대로 제출할까요? 제출 후에는 수정할 수 없어요!')) {
            return;
        }

        setSubmitting(true);
        try {
            // 1. 포인트 계산
            let totalPointsToGive = mission.base_reward || 0;
            let isBonusAchieved = false;

            if (mission.bonus_threshold && charCount >= mission.bonus_threshold) {
                totalPointsToGive += (mission.bonus_reward || 0);
                isBonusAchieved = true;
            }

            // 2. 글 저장 (student_posts)
            const { error: postError } = await supabase
                .from('student_posts')
                .insert({
                    student_id: studentSession.id,
                    mission_id: missionId,
                    title: title.trim(),
                    content: content,
                    char_count: charCount,
                    paragraph_count: paragraphCount
                });

            if (postError) throw postError;

            // 3. 학생 총점 업데이트 (students)
            // 현재 점수를 가져와서 더하는 안전한 방식 (또는 increment 사용 가능하지만 여기선 가져와서 처리)
            const { data: studentData, error: studentFetchError } = await supabase
                .from('students')
                .select('total_points')
                .eq('id', studentSession.id)
                .single();

            if (studentFetchError) throw studentFetchError;

            const newTotalPoints = (studentData.total_points || 0) + totalPointsToGive;

            const { error: pointUpdateError } = await supabase
                .from('students')
                .update({ total_points: newTotalPoints })
                .eq('id', studentSession.id);

            if (pointUpdateError) throw pointUpdateError;

            // 4. 포인트 내역 저장 (point_logs)
            const { error: logError } = await supabase
                .from('point_logs')
                .insert({
                    student_id: studentSession.id,
                    amount: totalPointsToGive,
                    reason: `글쓰기 제출 보상: ${mission.title}${isBonusAchieved ? ' (보너스 달성! 🔥)' : ''}`
                });

            if (logError) throw logError;

            // 5. 성공 피드백 (폭죽 효과)
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#FFA500', '#FF4500', '#ADFF2F', '#00BFFF']
            });

            alert(`🎉 제출 성공! ${totalPointsToGive} 포인트를 받았어요!\n${isBonusAchieved ? '와우! 보너스 조건까지 달성했네요! 대단해요! 🏆' : '정말 멋진 글이에요!'}`);

            // 6. 대시보드로 이동
            if (onNavigate) {
                onNavigate('main');
            } else {
                onBack(); // fallback
            }

        } catch (err) {
            console.error('제출 중 오류:', err.message);
            alert('글을 저장하는 중에 오류가 발생했어요. 다시 시도해볼까요? 😢');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 도구를 준비하는 중... ✍️</p></Card>;
    if (!mission) return <Card><p style={{ textAlign: 'center', padding: '40px' }}>글쓰기 미션을 찾을 수 없습니다.</p><Button onClick={onBack}>돌아가기</Button></Card>;

    return (
        <Card style={{ maxWidth: '850px', padding: '32px', border: 'none', background: '#FFFFFF', boxShadow: '0 15px 40px rgba(0,0,0,0.08)' }}>
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

            <Button
                size="lg"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                    width: '100%',
                    height: '64px',
                    fontSize: '1.3rem',
                    fontWeight: '900',
                    background: 'var(--primary-color)',
                    color: 'white',
                    border: 'none',
                    boxShadow: '0 8px 25px rgba(135, 206, 235, 0.4)',
                    transition: 'all 0.2s'
                }}
            >
                {submitting ? '제출 중...' : '멋지게 제출하고 포인트 받기! 🚀'}
            </Button>
        </Card>
    );
};

export default StudentWriting;
