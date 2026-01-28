import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Card from '../common/Card';
import Button from '../common/Button';

const FeedbackModal = ({ isOpen, onClose, userId }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!title.trim() || !content.trim()) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. DB에 저장
            const { error: dbError } = await supabase
                .from('feedback_reports')
                .insert({
                    teacher_id: userId,
                    title: title,
                    content: content,
                    status: 'open'
                });

            if (dbError) throw dbError;

            // 2. 이메일 전송 (Edge Function 호출)
            // 성공/실패 여부와 관계없이 사용자에게는 "전송 완료" 처리
            // 실제 구현 시에는 Supabase Edge Function URL을 호출합니다.
            supabase.functions.invoke('send-feedback-email', {
                body: { title, content, teacherId: userId }
            }).then(({ error }) => {
                if (error) console.error('이메일 전송 실패:', error);
            });

            alert('소중한 의견 감사합니다! 💌\n관리자에게 성공적으로 전달되었습니다.');
            onClose();
            setTitle('');
            setContent('');
        } catch (error) {
            console.error('피드백 전송 실패:', error);
            alert('전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.5)', zIndex: 9999,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                backdropFilter: 'blur(5px)'
            }} onClick={onClose}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Card style={{ width: '90%', maxWidth: '500px', padding: '32px', borderRadius: '24px' }}>
                        <h3 style={{ margin: '0 0 24px 0', fontSize: '1.5rem', fontWeight: '900', color: '#2C3E50', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            📢 의견 보내기
                        </h3>
                        <p style={{ color: '#7F8C8D', fontSize: '0.95rem', marginBottom: '24px', lineHeight: '1.5' }}>
                            앱을 사용하면서 느낀 개선점이나 발견하신 버그를 알려주세요.<br />
                            선생님의 소중한 의견은 더 좋은 서비스를 만드는 데 큰 힘이 됩니다!
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#495057' }}>제목</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="예: 학생 등록 시 오류가 발생해요 / 이런 기능이 있으면 좋겠어요"
                                    style={{
                                        width: '100%', padding: '12px', borderRadius: '12px',
                                        border: '1px solid #DEE2E6', boxSizing: 'border-box',
                                        fontSize: '0.95rem'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', color: '#495057' }}>내용</label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    placeholder="상세 내용을 입력해주세요."
                                    rows={6}
                                    style={{
                                        width: '100%', padding: '12px', borderRadius: '12px',
                                        border: '1px solid #DEE2E6', boxSizing: 'border-box',
                                        fontSize: '0.95rem', resize: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                            <Button variant="ghost" onClick={onClose}>취소</Button>
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                style={{ background: '#3498DB', color: 'white', fontWeight: 'bold', minWidth: '100px' }}
                            >
                                {isSubmitting ? '전송 중...' : '보내기'}
                            </Button>
                        </div>
                    </Card>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default FeedbackModal;
