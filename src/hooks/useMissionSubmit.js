import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import confetti from 'canvas-confetti';

export const useMissionSubmit = (studentSession, missionId, params, onBack, onNavigate) => {
    const [mission, setMission] = useState(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [isReturned, setIsReturned] = useState(false); // 선생님이 다시 쓰기를 요청했는지 여부
    const [isConfirmed, setIsConfirmed] = useState(false); // 선생님이 승인하여 포인트가 지급되었는지 여부
    const [isSubmitted, setIsSubmitted] = useState(false); // 제출 여부
    const [aiFeedback, setAiFeedback] = useState(''); // 상시 피드백 내용
    const [originalTitle, setOriginalTitle] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [studentAnswers, setStudentAnswers] = useState([]); // [신규] 핵심 질문에 대한 답변들

    const fetchMission = useCallback(async () => {
        setLoading(true);
        try {
            // 1. 미션 정보 가져오기
            const { data: missionData, error: missionError } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('id', missionId)
                .maybeSingle();

            if (missionError) throw missionError;

            if (missionData && missionData.is_archived) {
                alert('보관된 미션입니다. 글을 수정하거나 제출할 수 없어요! 📂');
                if (onBack) onBack();
                return;
            }

            setMission(missionData);

            // 2. 이미 작성 중인 글 확인 (postId가 있으면 id로 우선 조회, 없으면 missionId+studentId로 조회)
            const currentStudentId = studentSession?.id || JSON.parse(localStorage.getItem('student_session'))?.id;
            if (currentStudentId) {
                let query = supabase.from('student_posts').select('*');

                if (params?.postId) {
                    query = query.eq('id', params.postId);
                } else {
                    query = query.eq('mission_id', missionId).eq('student_id', currentStudentId);
                }

                const { data: postData, error: postError } = await query.maybeSingle();

                if (!postError && postData) {
                    console.log(`[useMissionSubmit] 기존 글 로드 성공 (ID: ${postData.id}, Title: ${postData.title})`);
                    setTitle(postData.title || '');
                    setContent(postData.content || '');
                    setIsReturned(postData.is_returned || false);
                    setIsConfirmed(postData.is_confirmed || false);
                    setIsSubmitted(postData.is_submitted || false);
                    setAiFeedback(postData.ai_feedback || '');
                    setOriginalTitle(postData.original_title || '');
                    setOriginalContent(postData.original_content || '');
                    setStudentAnswers(postData.student_answers || []);
                } else if (params?.postId) {
                    console.warn(`[useMissionSubmit] postId(${params.postId})에 해당하는 글을 찾을 수 없습니다.`);
                }
            }
        } catch (err) {
            console.error('데이터 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    }, [missionId, params, studentSession?.id, onBack]);

    useEffect(() => {
        if (missionId) {
            fetchMission();

            // [실시간 연동] 선생님이 미션 수정 시 즉시 반영
            const channel = supabase
                .channel(`mission_updates_${missionId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'writing_missions',
                        filter: `id=eq.${missionId}`
                    },
                    (payload) => {
                        console.log('🔔 실시간 미션 정보 업데이트됨:', payload.new);
                        setMission(prev => ({ ...prev, ...payload.new }));
                        alert('📢 선생님이 미션 내용을 수정하셨어요! 바뀐 기준을 확인해주세요.');
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [missionId, fetchMission]);

    // 임시 저장 처리
    const handleSave = async (showMsg = true) => {
        let currentStudentId = studentSession?.id || JSON.parse(localStorage.getItem('student_session'))?.id;
        if (!currentStudentId) return;

        // [추가] 제출 상태 확인: 이미 제출되었고 다시 쓰기 요청이 없는 경우 저장 불가
        if (isConfirmed || (isSubmitted && !isReturned)) {
            if (showMsg) alert('이미 제출된 글은 수정할 수 없어요! ✋');
            return;
        }

        try {
            const { error } = await supabase
                .from('student_posts')
                .upsert({
                    student_id: currentStudentId,
                    mission_id: missionId,
                    title: title.trim(),
                    content: content,
                    char_count: content.length,
                    paragraph_count: content.split(/\n+/).filter(p => p.trim().length > 0).length,
                    is_submitted: isSubmitted, // [수정] 기존 제출 상태 유지 (false로 고정되어 버그 발생하던 부분 해결)
                    is_returned: isReturned,
                    student_answers: studentAnswers // [신규] 답변 저장
                }, { onConflict: 'student_id,mission_id' });

            if (error) throw error;
            if (showMsg) alert('안전하게 임시 저장되었습니다! 💾');
        } catch (err) {
            console.error('임시 저장 실패:', err.message);
            if (showMsg) alert('저장 중 오류가 발생했습니다.');
        }
    };

    // 제출 전 유효성 검사 및 포인트 처리
    const handleSubmit = async () => {
        // [추가] 이미 제출된 상태인지 다시 한번 체크
        if (isConfirmed || (isSubmitted && !isReturned)) {
            alert('이미 제출되어 확인 중인 글입니다. ✨');
            return;
        }

        if (!title.trim()) {
            alert('멋질 글의 제목을 지어주세요! ✍️');
            return;
        }

        const charCount = content.length;
        const paragraphCount = content.split(/\n+/).filter(p => p.trim().length > 0).length;

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

        // [방어 코드] 세션 데이터 최종 점검
        let currentStudentId = studentSession?.id;

        // 만약 prop으로 받은 세션이 유실되었다면 로컬 스토리지에서 다시 시도
        if (!currentStudentId) {
            const saved = localStorage.getItem('student_session');
            if (saved) {
                const parsed = JSON.parse(saved);
                currentStudentId = parsed.id;
            }
        }

        if (!currentStudentId) {
            alert('로그인 정보가 유실되었습니다. 😢\n다시 로그인한 후에 제출을 시도해 주세요.');
            console.error('❌ 제출 중단: studentSession.id가 없습니다.');
            return;
        }

        console.log("🚀 글 제출 시작 - 학생 ID(UUID):", currentStudentId, "미션 ID:", missionId);

        setSubmitting(true);
        try {
            // 제출 전 최신 데이터로 다시 계산 (동기화 보장)
            const finalCharCount = content.length;
            const finalParagraphCount = content.split('\n').filter(p => p.trim().length > 0).length;

            // 2. 글 저장 (student_posts) - upsert 사용
            // 최초 제출 시의 데이터를 보존하기 위해 original_title, original_content를 조건부로 업데이트합니다.
            const { data: existingPost } = await supabase
                .from('student_posts')
                .select('original_content')
                .eq('student_id', currentStudentId)
                .eq('mission_id', missionId)
                .maybeSingle();

            const isFirstTime = !existingPost || !existingPost.original_content;

            const updateData = {
                student_id: currentStudentId,
                mission_id: missionId,
                title: title.trim(),
                content: content,
                char_count: finalCharCount,
                paragraph_count: finalParagraphCount,
                is_submitted: true,
                is_returned: false,
                is_confirmed: false,
                student_answers: studentAnswers // [신규] 답변 저장
            };

            // 최초 제출인 경우 원본 데이터 기록
            if (isFirstTime) {
                updateData.original_title = title.trim();
                updateData.original_content = content;
                updateData.first_submitted_at = new Date().toISOString();
            }

            const { error: postError } = await supabase
                .from('student_posts')
                .upsert(updateData, { onConflict: 'student_id,mission_id' });

            if (postError) {
                console.error('❌ student_posts 저장 실패:', postError.message, postError.details);
                throw postError;
            }

            // 5. 성공 피드백 (폭죽 효과)
            confetti({
                particleCount: 150,
                spread: 70,
                origin: { y: 0.6 },
                colors: ['#FFD700', '#FFA500', '#FF4500', '#ADFF2F', '#00BFFF']
            });

            alert(`🎉 제출 성공! 선생님이 확인하신 후 포인트가 지급될 거예요!`);

            // 6. 대시보드로 이동
            if (onNavigate) {
                onNavigate('main');
            } else if (onBack) {
                onBack(); // fallback
            }

        } catch (err) {
            console.error('❌ 최종 제출 실패 상세 정보:', err);
            if (err.message?.includes('foreign key')) {
                alert('로그인 정보가 유효하지 않습니다. 다시 로그인한 후 작성해 주세요. 😢');
            } else {
                alert(`글을 저장하는 중에 오류가 발생했어요. 😢\n원인: ${err.message || '알 수 없는 오류'}`);
            }
        } finally {
            setSubmitting(false);
        }
    };

    return {
        mission,
        title, setTitle,
        content, setContent,
        loading,
        submitting,
        isReturned,
        isConfirmed,
        isSubmitted,
        aiFeedback,
        originalTitle,
        originalContent,
        studentAnswers,
        setStudentAnswers,
        handleSave,
        handleSubmit
    };
};
