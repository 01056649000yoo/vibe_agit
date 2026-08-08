import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { dataCache } from '../lib/cache';
import confetti from 'canvas-confetti';
import { countContentChars } from '../lib/textMetrics';
import { getGenreMissionType, validateGenreMissionSubmission } from '../modules/writing/mission-types/registry';
import {
    evaluateWritingPolicy,
    getWritingPolicyError,
    writingPolicyFromMission
} from '../modules/writing/policy/writingPolicy';
import { studentHomeApi } from '../modules/home/studentHomeApi';

export const useMissionSubmit = (studentSession, missionId, params, onBack, onNavigate) => {
    const studentId = studentSession?.id || null;
    const classId = studentSession?.classId || studentSession?.class_id || null;
    const requestedPostId = params?.postId || null;
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
    const [showOriginalToFriends, setShowOriginalToFriends] = useState(false);
    const [isTeacherEdited, setIsTeacherEdited] = useState(false);
    const [teacherEditedAt, setTeacherEditedAt] = useState('');
    const [studentAnswers, setStudentAnswers] = useState([]); // [신규] 핵심 질문에 대한 답변들
    const [structuredContent, setStructuredContent] = useState(null);
    const [postUpdatedAt, setPostUpdatedAt] = useState(null); // 로컬 임시본과의 최신성 비교용
    const [loadError, setLoadError] = useState('');
    const loadRequestIdRef = useRef(0);
    const onBackRef = useRef(onBack);
    onBackRef.current = onBack;

    const getParagraphCount = (contentValue = content, structuredValue = structuredContent) => {
        const missionType = getGenreMissionType(mission?.input_template);
        const genreCount = missionType?.countParagraphs?.({
            structuredContent: structuredValue,
            content: contentValue
        });
        if (Number.isFinite(genreCount)) return genreCount;
        return contentValue.split(/\n+/).filter((paragraph) => paragraph.trim().length > 0).length;
    };

    const fetchMission = useCallback(async () => {
        const requestId = ++loadRequestIdRef.current;
        setLoading(true);
        setLoadError('');
        setMission(null);

        const applyWorkspace = (missionData, postData) => {
            if (missionData?.is_archived) {
                alert('보관된 미션입니다. 글을 수정하거나 제출할 수 없어요! 📂');
                onBackRef.current?.();
                return;
            }

            setMission(missionData || null);
            const hasTeacherEditedDraft = Boolean(postData?.is_teacher_edited && postData?.is_returned);
            setTitle(hasTeacherEditedDraft ? (postData.teacher_edited_title || postData.title || '') : (postData?.title || ''));
            setContent(hasTeacherEditedDraft ? (postData.teacher_edited_content || postData.content || '') : (postData?.content || ''));
            setIsReturned(Boolean(postData?.is_returned));
            setIsConfirmed(Boolean(postData?.is_confirmed));
            setIsSubmitted(Boolean(postData?.is_submitted));
            setAiFeedback(postData?.ai_feedback || '');
            setOriginalTitle(postData?.original_title || '');
            setOriginalContent(postData?.original_content || '');
            setShowOriginalToFriends(Boolean(postData?.show_original));
            setIsTeacherEdited(Boolean(postData?.is_teacher_edited));
            setTeacherEditedAt(postData?.teacher_edited_at || '');
            setStudentAnswers(postData?.student_answers || []);
            setStructuredContent(hasTeacherEditedDraft ? null : (postData?.structured_content || null));
            setPostId(postData?.id || null);
            setPostUpdatedAt(postData?.updated_at || null);
        };

        try {
            const { data: workspace, error: workspaceError } = await supabase.rpc(
                'get_student_assignment_workspace_v1',
                { p_mission_id: missionId, p_post_id: requestedPostId }
            );
            if (workspaceError) throw workspaceError;
            if (Number(workspace?.version) !== 1) throw new Error('지원하지 않는 글쓰기 작업공간 응답입니다.');
            if (requestId !== loadRequestIdRef.current) return;
            applyWorkspace(workspace.mission, workspace.post);
        } catch (err) {
            if (requestId !== loadRequestIdRef.current) return;
            console.error('데이터 로드 실패:', err.message);
            setLoadError('글쓰기 자료를 불러오지 못했어요. 빈 화면에서 새로 쓰지 말고 다시 불러와 주세요.');
        } finally {
            if (requestId === loadRequestIdRef.current) setLoading(false);
        }
    }, [missionId, requestedPostId]);

    // 1. 미션 및 데이터 로딩
    useEffect(() => {
        if (missionId) {
            fetchMission();
        }
        return () => {
            loadRequestIdRef.current += 1;
        };
    }, [missionId, fetchMission]);

    // 임시 저장 처리
    const handleSave = async (showMsg = true, draftOverride = null) => {
        // [보안 강화] Supabase 세션에서만 studentId 가져오기 - localStorage 폴백 제거
        const currentStudentId = studentId;
        if (!currentStudentId) {
            if (showMsg) alert('로그인 정보가 유실되었어요. 작성한 내용을 복사한 뒤 다시 로그인해 주세요. 😢');
            return false;
        }

        if (mission?.is_archived) {
            if (showMsg) alert('선생님이 보관한 미션이라 더 이상 수정하거나 제출할 수 없어요. 📂');
            return false;
        }

        // [추가] 제출 상태 확인: 이미 제출되었고 다시 쓰기 요청이 없는 경우 저장 불가
        if (isConfirmed || (isSubmitted && !isReturned)) {
            if (showMsg) alert('이미 제출된 글은 수정할 수 없어요! ✋');
            return false;
        }

        try {
            const draft = draftOverride || { title, content, studentAnswers, structuredContent };
            const missionType = getGenreMissionType(mission?.input_template);
            const { error } = await supabase
                .from('student_posts')
                .upsert({
                    student_id: currentStudentId,
                    mission_id: missionId,
                    title: draft.title.trim(),
                    content: draft.content,
                    char_count: countContentChars(draft.content),
                    paragraph_count: getParagraphCount(draft.content, draft.structuredContent),
                    awarded_base_reward: mission?.base_reward ?? null,
                    awarded_bonus_reward: mission?.bonus_reward ?? null,
                    awarded_bonus_threshold: mission?.bonus_threshold ?? null,
                    is_submitted: isSubmitted, // [수정] 기존 제출 상태 유지 (false로 고정되어 버그 발생하던 부분 해결)
                    is_returned: isReturned,
                    is_teacher_edited: false,
                    teacher_edited_title: null,
                    teacher_edited_content: null,
                    teacher_edited_at: null,
                    teacher_edited_by: null,
                    student_answers: draft.studentAnswers, // [신규] 답변 저장
                    structured_content: draft.structuredContent,
                    ...(missionType?.postStatus ? { status: missionType.postStatus } : {})
                }, { onConflict: 'student_id,mission_id' });

            if (error) throw error;
            if (showMsg) alert('안전하게 임시 저장되었습니다! 💾');
            return true;
        } catch (err) {
            console.error('임시 저장 실패:', err.message);
            if (showMsg) alert('저장 중 오류가 발생했습니다.');
            throw err;
        }
    };

    // 제출 전 유효성 검사 및 포인트 처리
    const handleSubmit = async () => {
        if (mission?.is_archived) {
            alert('선생님이 보관한 미션이라 더 이상 수정하거나 제출할 수 없어요. 📂');
            return false;
        }

        // [추가] 이미 제출된 상태인지 다시 한번 체크
        if (isConfirmed || (isSubmitted && !isReturned)) {
            alert('이미 제출되어 확인 중인 글입니다. ✨');
            return false;
        }

        if (!title.trim()) {
            const missionType = getGenreMissionType(mission?.input_template);
            alert(missionType?.studentLabels?.titleRequiredMessage || '멋질 글의 제목을 지어주세요! ✍️');
            return false;
        }

        const templateError = validateGenreMissionSubmission(
            mission?.input_template,
            { title, content, structuredContent, config: mission?.template_config || {} }
        );
        if (templateError) {
            alert(templateError);
            return false;
        }

        const charCount = countContentChars(content);
        const paragraphCount = getParagraphCount();

        const missionType = getGenreMissionType(mission?.input_template);
        const policyEvaluation = evaluateWritingPolicy(
            writingPolicyFromMission(mission),
            { charCount, paragraphCount },
            {
                skipParagraphValidation: missionType?.skipGenericParagraphValidation,
                unitLabel: missionType?.unitLabel || '문단'
            }
        );
        const policyError = getWritingPolicyError(policyEvaluation);
        if (policyError) {
            alert(policyError);
            return false;
        }

        if (!window.confirm(
            missionType?.studentLabels?.submitConfirmMessage ||
            '정말 이대로 제출할까요? 제출 후에는 수정할 수 없어요!'
        )) {
            return false;
        }

        // [보안 강화] Supabase 세션에서만 studentId 가져오기
        // localStorage를 신뢰하면 위조된 student_id로 게시글 업로드 가능
        let currentStudentId = studentId;

        if (!currentStudentId) {
            alert('로그인 정보가 유실되었습니다. 편집한 내용을 복사한 후 다시 로그인하여 제출해 주세요. 😢');
            console.error('❌ 제출 중단: studentSession.id가 없습니다.');
            return false;
        }

        console.log("🚀 글 제출 시작 - 학생 ID(UUID):", currentStudentId, "미션 ID:", missionId);

        setSubmitting(true);
        try {
            const { data: submitResult, error: submitError } = await supabase.rpc('submit_assignment_post_v1', {
                p_mission_id: missionId,
                p_title: title.trim(),
                p_content: content,
                p_student_answers: studentAnswers,
                p_structured_content: structuredContent
            });
            if (submitError) throw submitError;
            if (!submitResult?.success) throw new Error(submitResult?.error || '글을 제출하지 못했습니다.');

            const isFirstTime = Boolean(submitResult.is_first_time);
            const extensionResult = submitResult;
            setPostId(submitResult.post_id || null);

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
                studentHomeApi.invalidate(currentStudentId);
            }

            const successMessage = missionType?.getSubmitSuccessMessage?.({
                extensionResult,
                mission,
                isFirstTime
            }) || '🎉 제출 성공! 선생님이 확인하신 후 포인트가 지급될 거예요!';
            alert(successMessage);

            // 6. 대시보드로 이동
            if (onNavigate) {
                onNavigate('main');
            } else if (onBack) {
                onBack(); // fallback
            }
            return true;

        } catch (err) {
            console.error('❌ 최종 제출 실패 상세 정보:', err);
            if (err.message?.includes('foreign key')) {
                alert('로그인 정보가 유효하지 않습니다. 다시 로그인한 후 작성해 주세요. 😢');
            } else {
                alert(`글을 저장하는 중에 오류가 발생했어요. 😢\n원인: ${err.message || '알 수 없는 오류'}`);
            }
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleShowOriginalChange = async (nextValue) => {
        if (!postId || !studentId || !originalContent) return false;

        const previousValue = showOriginalToFriends;
        setShowOriginalToFriends(nextValue);
        let query = supabase
            .from('student_posts')
            .update({ show_original: nextValue })
            .eq('id', postId)
            .eq('student_id', studentId)
            .eq('writing_context', 'assignment');
        if (classId) query = query.eq('class_id', classId);
        const { data, error } = await query.select('id').maybeSingle();

        if (error || !data) {
            setShowOriginalToFriends(previousValue);
            alert('처음글 공개 설정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.');
            return false;
        }

        return true;
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
        showOriginalToFriends,
        isTeacherEdited,
        teacherEditedAt,
        studentAnswers,
        setStudentAnswers,
        structuredContent,
        setStructuredContent,
        postUpdatedAt,
        loadError,
        retryLoad: fetchMission,
        handleSave,
        handleSubmit,
        handleShowOriginalChange
    };
};
