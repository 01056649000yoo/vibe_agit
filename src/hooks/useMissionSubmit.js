import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { dataCache } from '../lib/cache';
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
    const [postId, setPostId] = useState(null); // [신규] 포스트 ID
    const [aiFeedback, setAiFeedback] = useState(''); // 상시 피드백 내용
    const [originalTitle, setOriginalTitle] = useState('');
    const [originalContent, setOriginalContent] = useState('');
    const [isTeacherEdited, setIsTeacherEdited] = useState(false);
    const [teacherEditedAt, setTeacherEditedAt] = useState('');
    const [studentAnswers, setStudentAnswers] = useState([]); // [신규] 핵심 질문에 대한 답변들

    const fetchMission = useCallback(async () => {
        setLoading(true);
        try {
            // 1. 미션 정보 가져오기
            const { data: missionData, error: missionError } = await supabase
                .from('writing_missions')
                // 미션 식별, 제목, 설명, 타입, 최소 글자/문단수 및 가이드 질문 등 필수 데이터만 로드
                .select('id, title, guide, mission_type, min_chars, min_paragraphs, guide_questions, is_archived')
                .eq('id', missionId)
                .maybeSingle();

            if (missionError) throw missionError;

            if (missionData && missionData.is_archived) {
                alert('보관된 미션입니다. 글을 수정하거나 제출할 수 없어요! 📂');
                if (onBack) onBack();
                return;
            }

            setMission(missionData);

            // 2. 이미 작성 중인 글 확인
            // [보안 강화] localStorage 폴백 제거 - Supabase 세션에서만 studentId 가져오기
            const currentStudentId = studentSession?.id;
            if (currentStudentId) {
                // 학생이 기존에 작성하던 글의 제목, 내용, 제출 및 승인 상태, 피드백 정보만 로드
                let query = supabase.from('student_posts').select('id, title, content, is_returned, is_confirmed, is_submitted, ai_feedback, original_title, original_content, teacher_edited_title, teacher_edited_content, teacher_edited_at, is_teacher_edited, student_answers, student_id, mission_id');

                if (params?.postId) {
                    query = query.eq('id', params.postId);
                } else {
                    query = query.eq('mission_id', missionId).eq('student_id', currentStudentId);
                }

                const { data: postData, error: postError } = await query.maybeSingle();

                if (!postError && postData) {
                    console.log(`[useMissionSubmit] 기존 글 로드 성공 (ID: ${postData.id}, Title: ${postData.title})`);
                    const hasTeacherEditedDraft = postData.is_teacher_edited && postData.is_returned;
                    setTitle(hasTeacherEditedDraft ? (postData.teacher_edited_title || postData.title || '') : (postData.title || ''));
                    setContent(hasTeacherEditedDraft ? (postData.teacher_edited_content || postData.content || '') : (postData.content || ''));
                    setIsReturned(postData.is_returned || false);
                    setIsConfirmed(postData.is_confirmed || false);
                    setIsSubmitted(postData.is_submitted || false);
                    setAiFeedback(postData.ai_feedback || '');
                    setOriginalTitle(postData.original_title || '');
                    setOriginalContent(postData.original_content || '');
                    setIsTeacherEdited(!!postData.is_teacher_edited);
                    setTeacherEditedAt(postData.teacher_edited_at || '');
                    setStudentAnswers(postData.student_answers || []);
                    setPostId(postData.id);
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

    // 1. 미션 및 데이터 로딩
    useEffect(() => {
        if (missionId) {
            fetchMission();
        }
    }, [missionId, fetchMission]);

    // 2. 선생님의 미션 수정 실시간 감지 (의존성 최소화로 웹소켓 폭탄 방지)
    useEffect(() => {
        if (!missionId) return;

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
    }, [missionId]);

    // 임시 저장 처리
    const handleSave = async (showMsg = true) => {
        // [보안 강화] Supabase 세션에서만 studentId 가져오기 - localStorage 폴백 제거
        const currentStudentId = studentSession?.id;
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
                    is_teacher_edited: false,
                    teacher_edited_title: null,
                    teacher_edited_content: null,
                    teacher_edited_at: null,
                    teacher_edited_by: null,
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

        // [보안 강화] Supabase 세션에서만 studentId 가져오기
        // localStorage를 신뢰하면 위조된 student_id로 게시글 업로드 가능
        let currentStudentId = studentSession?.id;

        if (!currentStudentId) {
            alert('로그인 정보가 유실되었습니다. 편집한 내용을 복사한 후 다시 로그인하여 제출해 주세요. 😢');
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
                is_teacher_edited: false,
                teacher_edited_title: null,
                teacher_edited_content: null,
                teacher_edited_at: null,
                teacher_edited_by: null,
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

            // 대시보드 통계 불일치 방지를 위한 캐시 무효화
            if (currentStudentId) {
                dataCache.invalidate(`stats_${currentStudentId}`);
            }

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
        postId,
        aiFeedback,
        originalTitle,
        originalContent,
        isTeacherEdited,
        teacherEditedAt,
        studentAnswers,
        setStudentAnswers,
        handleSave,
        handleSubmit
    };
};
