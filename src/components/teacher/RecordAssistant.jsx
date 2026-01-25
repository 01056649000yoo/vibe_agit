import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import Card from '../common/Card';
import { useEvaluation } from '../../hooks/useEvaluation';

/**
 * 역할: 선생님 - 생기부 도우미 (태그 기반 성취도 추출 및 나이스 입력형 에디터) ✏️
 */
const RecordAssistant = ({ student, activeClass, isMobile, onClose }) => {
    const [allTags, setAllTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState([]);
    const [evaluationData, setEvaluationData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [recordContent, setRecordContent] = useState('');

    const { getEvaluationDataByTag } = useEvaluation();

    // 1. 초기 태그 로드 (학급 내 전체 태그)
    useEffect(() => {
        const fetchTags = async () => {
            if (!activeClass?.id) return;
            const { data } = await supabase
                .from('writing_missions')
                .select('tags')
                .eq('class_id', activeClass.id);

            const tagsSet = new Set();
            data?.forEach(m => m.tags?.forEach(t => tagsSet.add(t)));
            setAllTags(Array.from(tagsSet).sort());
        };
        fetchTags();
    }, [activeClass?.id]);

    // 2. 태그 선택 시 데이터 취합
    useEffect(() => {
        const loadEvaluationData = async () => {
            if (selectedTags.length === 0) {
                setEvaluationData([]);
                return;
            }
            const result = await getEvaluationDataByTag(student.id, selectedTags);
            if (result.success) {
                setEvaluationData(result.data || []);
            }
        };
        loadEvaluationData();
    }, [selectedTags, student.id, getEvaluationDataByTag]);

    // 3. AI 생기부 문구 생성
    const generateRecord = async () => {
        if (evaluationData.length === 0) {
            alert('분석할 활동 데이터가 없습니다. 태그를 선택해주세요.');
            return;
        }

        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            alert('API 키가 설정되지 않았습니다.');
            return;
        }

        setIsGenerating(true);
        try {
            const activitiesInfo = evaluationData.map(d => `
                [활동명]: ${d.writing_missions.title}
                [핵심 질문 답변]: ${d.student_answers?.join(' / ') || '없음'}
                [최종 글 제목]: ${d.title || d.writing_missions.title}
                [최종 글 내용]: ${d.content}
                [선생님 평가 코멘트]: ${d.eval_comment || '없음'}
                [평가 점수]: ${d.final_eval || d.initial_eval || '없음'}
            `).join('\n---\n');

            const prompt = `
            다음은 학생 '${student.name}'이 선택한 태그(#${selectedTags.join(', #')}) 활동에서 수행한 글쓰기 활동 및 평가 데이터입니다.
            
            [활동 데이터 정보]
            ${activitiesInfo}
            
            [지시 사항]
            1. 위 활동들에서 나타난 학생의 공통적인 성장 패턴과 구체적인 성취 사례를 조합하여 학교생활기록부(생기부) 행동특성 및 종합의견 또는 교과세특 문구를 작성하라.
            2. 학생의 문장력, 사고의 깊이, 주제에 대한 통찰력 등을 중심으로 작성하라.
            3. 분량은 300~500자 내외로 작성하라.
            4. 정중하고 객관적인 평어체(~함, ~함.)를 사용하라.
            5. 활동의 단순 나열이 아닌, 학생만의 고유한 특성이 드러나도록 유기적으로 구성하라.
            `;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) throw new Error('AI 서비스 통신 오류');
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) setRecordContent(text);
        } catch (err) {
            console.error('생기부 생성 실패:', err.message);
            alert('AI 문구 생성 중 오류가 발생했습니다.');
        } finally {
            setIsGenerating(false);
        }
    };

    // 4. 나이스 글자 수 계산 (UTF-8 기준 한글 3바이트, 공백 1바이트 등 변환은 복잡하므로 일반적으로 나이스는 1500바이트 기준)
    // 여기서는 간단히 한글 3, 영어/숫자/공백 1로 계산하는 시뮬레이션
    const getByteSize = (str) => {
        let size = 0;
        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            if (charCode <= 127) size += 1;
            else size += 3;
        }
        return size;
    };

    const byteSize = getByteSize(recordContent);
    const byteLimit = 1500;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 5000,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            padding: '20px', backdropFilter: 'blur(8px)'
        }} onClick={onClose}>
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                style={{
                    background: '#F8F9FF', borderRadius: '32px', width: '100%', maxWidth: '900px',
                    maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', border: '1px solid white'
                }} onClick={e => e.stopPropagation()}
            >
                <header style={{ padding: '32px', background: 'white', borderBottom: '1px solid #E0E7FF', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '1.5rem' }}>✏️</span>
                            <h3 style={{ margin: 0, color: '#1E1B4B', fontWeight: '900', fontSize: '1.4rem' }}>
                                {student.name} 학생 생기부 도우미
                            </h3>
                        </div>
                        <p style={{ margin: 0, color: '#6366F1', fontSize: '0.9rem', fontWeight: 'bold' }}>학습 활동 데이터를 기반으로 생기부 초안을 생성합니다.</p>
                    </div>
                    <button onClick={onClose} style={{ background: '#F1F5F9', border: 'none', padding: '10px 16px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold', color: '#64748B' }}>닫기</button>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '300px 1fr', flex: 1, overflow: 'hidden' }}>
                    {/* 왼쪽: 태그 및 활동 정보 */}
                    <div style={{ padding: '24px', background: 'white', borderRight: '1px solid #E0E7FF', overflowY: 'auto' }}>
                        <div style={{ marginBottom: '24px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#4338CA', display: 'block', marginBottom: '12px' }}>🏷️ 활동 태그 선택 (중복)</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {allTags.map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                                        style={{
                                            padding: '6px 14px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 'bold', border: 'none',
                                            background: selectedTags.includes(tag) ? '#6366F1' : '#F1F5F9',
                                            color: selectedTags.includes(tag) ? 'white' : '#64748B',
                                            cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                    >
                                        #{tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#4338CA', display: 'block', marginBottom: '12px' }}>📋 수집된 활동 ({evaluationData.length}건)</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {evaluationData.map(d => (
                                    <div key={d.id} style={{ padding: '12px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #F1F5F9' }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#1E293B', marginBottom: '4px' }}>{d.writing_missions.title}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>점수: {d.final_eval || d.initial_eval || '-'} / {d.eval_comment ? '평가 완료' : '평가 전'}</div>
                                    </div>
                                ))}
                                {selectedTags.length > 0 && evaluationData.length === 0 && (
                                    <div style={{ fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center', padding: '20px' }}>해당 태그의 활동 데이터가 없습니다.</div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 오른쪽: AI 에디터 영역 */}
                    <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontWeight: 'bold', color: '#1E1B4B' }}>✨ AI 초안 에디터</div>
                            <Button
                                onClick={generateRecord}
                                disabled={isGenerating || evaluationData.length === 0}
                                style={{ background: '#6366F1', padding: '10px 24px', borderRadius: '14px', fontSize: '0.95rem', fontWeight: 'bold' }}
                            >
                                {isGenerating ? 'AI가 분석하는 중...' : '활동 기반 문구 생성 🪄'}
                            </Button>
                        </div>

                        <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <div style={{
                                position: 'absolute', top: '16px', right: '16px', zIndex: 10,
                                background: byteSize > byteLimit ? '#FEE2E2' : '#F1F5F9',
                                padding: '4px 12px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 'bold',
                                color: byteSize > byteLimit ? '#EF4444' : '#64748B', border: '1px solid' + (byteSize > byteLimit ? '#FCA5A5' : '#E2E8F0')
                            }}>
                                {byteSize.toLocaleString()} / {byteLimit.toLocaleString()} Bytes (나이스 기준)
                            </div>
                            <textarea
                                value={recordContent}
                                onChange={(e) => setRecordContent(e.target.value)}
                                placeholder="태그를 선택하고 버튼을 누르면 AI가 생기부 문구를 제안해줍니다. 생성된 내용을 직접 수정할 수도 있습니다."
                                style={{
                                    width: '100%', flex: 1, minHeight: '350px', padding: '60px 24px 24px 24px',
                                    borderRadius: '24px', border: '2px solid #E0E7FF', fontSize: '1.05rem',
                                    lineHeight: '1.8', color: '#1E293B', resize: 'none', background: 'white',
                                    outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <Button
                                onClick={() => {
                                    navigator.clipboard.writeText(recordContent);
                                    alert('클립보드에 복사되었습니다. 나이스에 붙여넣기 하세요!');
                                }}
                                style={{ flex: 1, background: 'white', color: '#6366F1', border: '2px solid #6366F1', fontWeight: 'bold' }}
                            >
                                📋 내용 복사하기
                            </Button>
                            <Button
                                onClick={() => {
                                    if (confirm('모든 내용을 삭제할까요?')) setRecordContent('');
                                }}
                                variant="ghost"
                                style={{ flex: 0.3 }}
                            >
                                초기화
                            </Button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', background: '#FFFBEB', borderRadius: '16px', border: '1px solid #FEF3C7' }}>
                            <span style={{ fontSize: '1.2rem' }}>💡</span>
                            <span style={{ fontSize: '0.85rem', color: '#92400E', lineHeight: '1.5' }}>
                                AI가 생성한 문구는 초안이므로, 반드시 선생님의 검토와 수정 후에 나이스에 입력해 주세요.
                            </span>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default RecordAssistant;
