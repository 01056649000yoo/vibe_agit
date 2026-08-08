import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { callAI } from '../lib/openai';
import { dataCache } from '../lib/cache';
import { DEFAULT_FEEDBACK_PROMPT, DEFAULT_REPORT_PROMPT } from '../constants/aiPrompts';

const parsePromptTemplates = (storedPrompt) => {
    const rawPrompt = storedPrompt?.trim();
    if (!rawPrompt) return { feedback: DEFAULT_FEEDBACK_PROMPT, report: DEFAULT_REPORT_PROMPT };
    if (rawPrompt.startsWith('{') && rawPrompt.endsWith('}')) {
        try {
            const parsed = JSON.parse(rawPrompt);
            return {
                feedback: parsed.feedback || DEFAULT_FEEDBACK_PROMPT,
                report: parsed.report || DEFAULT_REPORT_PROMPT
            };
        } catch {
            return { feedback: rawPrompt, report: DEFAULT_REPORT_PROMPT };
        }
    }
    return { feedback: rawPrompt, report: DEFAULT_REPORT_PROMPT };
};

export const useTeacherDashboard = (session, profile, onProfileUpdate, activeClass, setActiveClass, teacherBootstrap = null) => {
    const initialPrompts = parsePromptTemplates(teacherBootstrap?.profile?.ai_prompt_template);
    const initialTeacher = teacherBootstrap?.teacher || { name: '', school_name: '', phone: '' };
    const [classes, setClasses] = useState(() => teacherBootstrap?.classes || []);
    const [loadingClasses, setLoadingClasses] = useState(() => !teacherBootstrap);

    // AI 설정 관련 상태
    const [promptTemplate, setPromptTemplate] = useState(initialPrompts.feedback);
    const [originalPrompt, setOriginalPrompt] = useState(initialPrompts.feedback);
    const [reportPromptTemplate, setReportPromptTemplate] = useState(initialPrompts.report);
    const [originalReportPrompt, setOriginalReportPrompt] = useState(initialPrompts.report);
    const [savingKey, setSavingKey] = useState(false);
    const [testingKey, setTestingKey] = useState(false);

    // 선생님 인적 사항 상태
    const [teacherInfo, setTeacherInfo] = useState(initialTeacher);
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [editName, setEditName] = useState(initialTeacher.name || '');
    const [editSchool, setEditSchool] = useState(initialTeacher.school_name || '');
    const [editPhone, setEditPhone] = useState(initialTeacher.phone || '');

    // AI 상태 관련
    const [aiStatus, setAiStatus] = useState(teacherBootstrap ? 'connected' : 'disconnected');

    const fetchTeacherInfo = useCallback(async () => {
        if (!session?.user?.id) return;
        try {
            const data = await dataCache.get(`teacher_info_${session.user.id}`, async () => {
                const { data, error } = await supabase
                    .from('teachers')
                    .select('name, school_name, phone')
                    .eq('id', session.user.id)
                    .single();
                if (error) throw error;
                return data;
            }, 600000, true); // 10분 캐시, 영속성 부여

            if (data) {
                setTeacherInfo(data);
                setEditName(data.name || '');
                setEditSchool(data.school_name || '');
                setEditPhone(data.phone || '');
            }
        } catch {
            console.log('선생님 정보 fetch 알림 (미등록 상태일 수 있음)');
        }
    }, [session?.user?.id]);

    const fetchApiSettings = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data } = await supabase
            .from('profiles')
            .select('ai_prompt_template')
            .eq('id', session.user.id)
            .single();

        if (data) {
            setAiStatus('connected');

            if (data.ai_prompt_template) {
                const rawPrompt = data.ai_prompt_template.trim();
                // JSON 형식인지 확인하여 피드백/리포트 프롬프트 분리 추출
                if (rawPrompt.startsWith('{') && rawPrompt.endsWith('}')) {
                    try {
                        const parsed = JSON.parse(rawPrompt);
                        const fVal = parsed.feedback || DEFAULT_FEEDBACK_PROMPT;
                        const rVal = parsed.report || DEFAULT_REPORT_PROMPT;

                        setOriginalPrompt(fVal);
                        setPromptTemplate(fVal);
                        setOriginalReportPrompt(rVal);
                        setReportPromptTemplate(rVal);
                    } catch {
                        // 파싱 실패 시 일반 텍스트로 처리
                        setOriginalPrompt(rawPrompt);
                        setPromptTemplate(rawPrompt);
                    }
                } else {
                    // 일반 텍스트일 경우 피드백 프롬프트로만 설정
                    setOriginalPrompt(rawPrompt);
                    setPromptTemplate(rawPrompt);
                }
            }
        }
    }, [session?.user?.id]);

    const fetchAllClasses = useCallback(async () => {
        if (!session?.user?.id) return;
        setLoadingClasses(true);
        try {
            const data = await dataCache.get(`classes_${session.user.id}`, async () => {
                const { data, error } = await supabase
                    .from('classes')
                    // 학급 목록 표시를 위해 식별값, 이름, 생성일시 정보만 선택
                    .select('id, name, created_at, teacher_id')
                    .eq('teacher_id', session.user.id)
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return data || [];
            }, 300000, true); // 5분 캐시, 영속성 부여

            setClasses(data || []);
        } catch (err) {
            console.error('❌ Hook: 학급 불러오기 실패:', err.message);
            alert('정보를 불러오지 못했습니다. 🔄');
        } finally {
            setLoadingClasses(false);
        }
    }, [session?.user?.id]);

    useEffect(() => {
        if (teacherBootstrap) return;
        if (session?.user?.id) {
            // [async-parallel] 초기 데이터 로딩을 병렬로 처리하여 첫 로딩 속도 향상
            Promise.all([
                fetchAllClasses(),
                fetchApiSettings(),
                fetchTeacherInfo()
            ]).catch(err => console.error("초기 로딩 중 오류:", err));
        }
    }, [session?.user?.id, fetchAllClasses, fetchApiSettings, fetchTeacherInfo, teacherBootstrap]);

    // 활성 학급 자동 선택 로직
    useEffect(() => {
        if (!loadingClasses && classes.length > 0 && !activeClass) {
            const primaryId = profile?.primary_class_id;
            const primary = classes.find(c => c.id === primaryId);
            setActiveClass(primary || classes[0]);
        }
    }, [loadingClasses, classes, activeClass, profile?.primary_class_id, setActiveClass]);

    const handleUpdateTeacherProfile = async () => {
        if (!editName.trim()) {
            alert('이름(별칭)을 입력해주세요! 😊');
            return;
        }
        try {
            const { error } = await supabase
                .from('teachers')
                .upsert({
                    id: session.user.id,
                    name: editName.trim(),
                    school_name: editSchool.trim(),
                    phone: editPhone.trim(),
                    email: session.user.email
                });

            if (error) throw error;
            setTeacherInfo({ name: editName.trim(), school_name: editSchool.trim(), phone: editPhone.trim() });
            alert('프로필 정보가 업데이트되었습니다! ✨');
            setIsEditProfileOpen(false);
            if (onProfileUpdate) onProfileUpdate();
        } catch (err) {
            console.error('프로필 저장 실패:', err.message);
            alert('저장 중 오류가 발생했습니다.');
        }
    };

    const handleWithdrawal = async () => {
        if (!window.confirm('정말로 탈퇴하시겠습니까?\n\n탈퇴 시 모든 학급 데이터, 미션, 학생 정보가 영구적으로 삭제되며 복구할 수 없습니다.')) {
            return;
        }

        try {
            // 학급 데이터부터 인증 계정까지 DB 트랜잭션 하나에서 삭제한다.
            const { error } = await supabase.rpc('withdraw_my_teacher_account');
            if (error) throw error;

            // 4. 브라우저 저장 데이터 완전 초기화
            localStorage.clear();
            sessionStorage.clear();

            // 5. 로그아웃 처리
            try {
                await supabase.auth.signOut();
            } catch (e) {
                console.warn("Withdrawal signout failed:", e);
            }

            alert('탈퇴가 완료되었습니다. 모든 데이터가 안전하게 삭제되었습니다.');
            window.location.href = '/';
        } catch (err) {
            console.error('탈퇴 처리 실패:', err.message);
            alert('탈퇴 처리 중 오류가 발생했습니다: ' + err.message);
        }
    };

    const handleSwitchGoogleAccount = async () => {
        if (!confirm('현재 계정에서 로그아웃하고 다른 구글 계정으로 로그인하시겠습니까?')) return;
        try {
            await supabase.auth.signOut();
        } catch (e) {
            console.warn("Account switch signout failed:", e);
        }
        await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin,
                queryParams: { prompt: 'select_account' }
            }
        });
    };

    const handleSaveTeacherSettings = async () => {
        setSavingKey(true);
        try {
            // 여러 프롬프트를 하나의 컬럼에 JSON으로 패킹하여 저장
            const packedPrompt = JSON.stringify({
                feedback: promptTemplate.trim(),
                report: reportPromptTemplate.trim()
            });

            const profileUpdatePayload = {
                id: session.user.id,
                ai_prompt_template: packedPrompt,
            };

            const profileResult = await supabase.from('profiles').upsert(profileUpdatePayload, { onConflict: 'id' });

            if (profileResult.error) throw profileResult.error;

            setOriginalPrompt(promptTemplate.trim());
            setOriginalReportPrompt(reportPromptTemplate.trim());

            // 프로필 상태 갱신을 위해 콜백 호출
            if (onProfileUpdate) {
                await onProfileUpdate();
            }

            alert('AI 규칙이 저장되었습니다! ✨');
        } catch (err) {
            console.error('설정 저장 실패:', err.message);
            alert('저장 중 오류가 발생했습니다: ' + err.message);
        } finally {
            setSavingKey(false);
        }
    };

    const handleTestAIConnection = async () => {
        setTestingKey(true);
        setAiStatus('testing');
        try {
            const aiResponse = await callAI({
                prompt: "정상 연결 여부 확인을 위해 '연결 성공'이라고 짧게 대답해줘.",
                type: 'CONNECTION_TEST'
            });
            alert(`✅ 연결 성공!\nAI 응답: ${aiResponse}`);
            setAiStatus('connected');
        } catch (err) {
            console.error('API 테스트 실패:', err.message);
            setAiStatus('disconnected');
            alert(`❌ 연결 실패: ${err.message}`);
        } finally {
            setTestingKey(false);
        }
    };

    const handleSetPrimaryClass = async (classId) => {
        if (!classId) return;
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ primary_class_id: classId })
                .eq('id', session.user.id);

            if (error) throw error;
            if (onProfileUpdate) await onProfileUpdate();
            alert('이 학급이 주 학급(기본)으로 설정되었습니다! ⭐');
        } catch (err) {
            console.error('주 학급 설정 실패:', err.message);
            alert('주 학급 설정 중 오류가 발생했습니다.');
        }
    };

    const handleRestoreClass = async (classId) => {
        if (!classId) return;
        try {
            const { error } = await supabase
                .from('classes')
                .update({ deleted_at: null })
                .eq('id', classId);

            if (error) throw error;
            await fetchAllClasses();
            alert('학급이 성공적으로 복구되었습니다! ♻️');
        } catch (err) {
            console.error('학급 복구 실패:', err.message);
            alert('복구 중 오류가 발생했습니다.');
        }
    };

    const fetchDeletedClasses = async () => {
        if (!session?.user?.id) return [];
        try {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            // 1. 3일이 지난 학급은 완전히 삭제 (자동 정리 ✨)
            await supabase
                .from('classes')
                .delete()
                .eq('teacher_id', session.user.id)
                .not('deleted_at', 'is', null)
                .lt('deleted_at', threeDaysAgo.toISOString());

            // 2. 복구 가능한 학급 (3일 이내) 조회
            const { data, error } = await supabase
                .from('classes')
                // 삭제된 학급 복구 목록을 위해 이름과 삭제일시 선택
                .select('id, name, deleted_at, teacher_id')
                .eq('teacher_id', session.user.id)
                .not('deleted_at', 'is', null)
                .gte('deleted_at', threeDaysAgo.toISOString())
                .order('deleted_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (err) {
            console.error('삭제된 학급 조회 실패:', err.message);
            return [];
        }
    };

    return {
        classes, setClasses, loadingClasses,
        teacherInfo, isEditProfileOpen, setIsEditProfileOpen,
        editName, setEditName, editSchool, setEditSchool, editPhone, setEditPhone,
        promptTemplate, setPromptTemplate, originalPrompt,
        reportPromptTemplate, setReportPromptTemplate, originalReportPrompt,
        savingKey, testingKey, aiStatus,
        handleUpdateTeacherProfile, handleSaveTeacherSettings, handleTestAIConnection,
        handleWithdrawal, handleSwitchGoogleAccount, handleSetPrimaryClass, handleRestoreClass,
        fetchAllClasses, fetchDeletedClasses
    };
};
