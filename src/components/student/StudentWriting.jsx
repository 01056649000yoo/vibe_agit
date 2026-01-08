import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';

/**
 * 역할: 학생 - 글쓰기 에디터 (상세 페이지 역할 포함)
 */
const StudentWriting = ({ studentSession, missionId, onBack }) => {
    const [mission, setMission] = useState(null);
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);

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
            console.error('미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = () => {
        alert('글이 성공적으로 제출되었습니다! (기능 구현 예정) 🎉');
        onBack();
    };

    if (loading) return <Card><p style={{ textAlign: 'center' }}>글쓰기 도구를 준비하는 중... ✍️</p></Card>;
    if (!mission) return <Card><p style={{ textAlign: 'center' }}>미션을 찾을 수 없습니다.</p><Button onClick={onBack}>돌아가기</Button></Card>;

    return (
        <Card style={{ maxWidth: '800px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 그만 쓰기</Button>
                <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.9rem', color: '#666' }}>{mission.genre}</span>
                    <h2 style={{ margin: 0, color: 'var(--primary-color)' }}>{mission.title}</h2>
                </div>
            </div>

            <div style={{ background: '#F0F4F8', padding: '20px', borderRadius: '16px', marginBottom: '24px' }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#2C3E50' }}>💡 선생님의 글쓰기 가이드</h4>
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#455A64', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>
                    {mission.guide}
                </p>
            </div>

            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <label style={{ fontWeight: 'bold' }}>나의 이야기 쓰기</label>
                    <span style={{ fontSize: '0.85rem', color: content.length >= mission.min_chars ? '#2E7D32' : '#F44336' }}>
                        {content.length} / 최소 {mission.min_chars}자
                    </span>
                </div>
                <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="여기에 자유롭게 이야기를 적어보세요..."
                    style={{
                        width: '100%',
                        minHeight: '300px',
                        padding: '20px',
                        borderRadius: '16px',
                        border: '2px solid #E0E0E0',
                        fontSize: '1.1rem',
                        lineHeight: '1.8',
                        outlineColor: 'var(--primary-color)',
                        resize: 'vertical'
                    }}
                />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.9rem', color: '#666' }}>
                    📏 최소 조건: <strong>{mission.min_paragraphs}문단</strong> 이상
                </div>
                <Button
                    size="lg"
                    onClick={handleSubmit}
                    style={{ padding: '12px 40px', fontWeight: 'bold' }}
                >
                    제출하고 포인트 받기! 🚀
                </Button>
            </div>
        </Card>
    );
};

export default StudentWriting;
