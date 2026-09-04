import { useState, useEffect, useCallback } from 'react';
import useConfirmDialog from '../components/common/useConfirmDialog';
import useNotice from '../components/common/useNotice';
import { supabase } from '../lib/supabaseClient';
import { callAI } from '../lib/openai';
import { dataCache } from '../lib/cache';
import { DEFAULT_FEEDBACK_PROMPT, DEFAULT_REPORT_PROMPT } from '../constants/aiPrompts';
import { teacherSchoolToSelection, toTeacherSchoolColumns } from '../utils/schoolApi';

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
    // 앱 안 창은 여기서 만들고 화면(TeacherDashboard)이 그린다 — 훅에는 그릴 자리가 없다.
    const { ask, confirmDialog } = useConfirmDialog();
    const { notify, notice } = useNotice();
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
    const [editSchoolSelection, setEditSchoolSelection] = useState(() => teacherSchoolToSelection(initialTeacher));
    const [editPhone, setEditPhone] = useState(initialTeacher.phone || '');

    const fetchTeacherInfo = useCallback(async () => {
        if (!session?.user?.id) return;
        try {
            const data = await dataCache.get(`teacher_info_${session.user.id}`, async () => {
                const { data, error } = await supabase
                    .from('teachers')
                    .select('name, school_name, school_office_code, school_code, school_address, school_verified_at, phone')
                    .eq('id', session.user.id)
                    .single();
                if (error) throw error;
                return data;
            }, 600000, true); // 10분 캐시, 영속성 부여

            if (data) {
                setTeacherInfo(data);
                setEditName(data.name || '');
                setEditSchool(data.school_name || '');
                setEditSchoolSelection(teacherSchoolToSelection(data));
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
            await ask({
                title: '정보를 불러오지 못했습니다',
                body: `잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
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
            notify('이름(별칭)을 적어 주세요. 😊');
            return;
        }
        if (!editSchoolSelection) {
            notify('학교를 검색한 뒤 목록에서 골라 주세요. 🏫');
            return;
        }
        try {
            const schoolColumns = toTeacherSchoolColumns(editSchoolSelection);
            const { error } = await supabase
                .from('teachers')
                .upsert({
                    id: session.user.id,
                    name: editName.trim(),
                    ...schoolColumns,
                    phone: editPhone.trim(),
                    email: session.user.email
                });

            if (error) throw error;
            setTeacherInfo({ name: editName.trim(), ...schoolColumns, phone: editPhone.trim() });
            notify('✨ 프로필을 저장했어요.');
            setIsEditProfileOpen(false);
            if (onProfileUpdate) onProfileUpdate();
        } catch (err) {
            console.error('프로필 저장 실패:', err.message);
            await ask({
                title: '프로필을 저장하지 못했습니다',
                body: `적어 둔 내용은 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        }
    };

    const handleTeacherSchoolChanged = useCallback((school) => {
        if (!school?.schoolCode || !school?.officeCode) return;
        const schoolColumns = toTeacherSchoolColumns(school);
        setTeacherInfo((current) => ({ ...current, ...schoolColumns }));
        setEditSchool(school.schoolName || '');
        setEditSchoolSelection(school);
        if (session?.user?.id) dataCache.invalidate(`teacher_info_${session.user.id}`);
    }, [session?.user?.id]);

    const handleWithdrawal = async () => {
        // 계정 전체가 사라지는 일이라 붉은 단추로 묻는다.
        if (!await ask({
            title: '정말 탈퇴할까요?',
            body: '모든 학급·과제·학생 자료가 영구히 사라지고, 되돌릴 수 없습니다.',
            confirmLabel: '탈퇴하기 ⚠️',
            tone: 'danger'
        })) {
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

            notify('탈퇴가 끝났어요. 모든 자료를 삭제했습니다.');
            window.location.href = '/';
        } catch (err) {
            console.error('탈퇴 처리 실패:', err.message);
            await ask({
                title: '탈퇴를 마치지 못했습니다',
                body: `${err.message}

잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        }
    };

    const handleSwitchGoogleAccount = async () => {
        if (!await ask({
            title: '다른 구글 계정으로 로그인할까요?',
            body: '지금 계정에서 로그아웃한 뒤 로그인 창이 열립니다.',
            confirmLabel: '계정 바꾸기'
        })) return;
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

            const profileResult = await supabase.from('profiles')
                .update({ ai_prompt_template: profileUpdatePayload.ai_prompt_template })
                .eq('id', session.user.id);

            if (profileResult.error) throw profileResult.error;

            setOriginalPrompt(promptTemplate.trim());
            setOriginalReportPrompt(reportPromptTemplate.trim());

            // 프로필 상태 갱신을 위해 콜백 호출
            if (onProfileUpdate) {
                await onProfileUpdate();
            }

            notify('✨ AI 규칙을 저장했어요.');
        } catch (err) {
            console.error('설정 저장 실패:', err.message);
            await ask({
                title: 'AI 규칙을 저장하지 못했습니다',
                body: `${err.message}

적어 둔 내용은 그대로 있습니다. 잠시 뒤 다시 눌러 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } finally {
            setSavingKey(false);
        }
    };

    const handleTestAIConnection = async () => {
        setTestingKey(true);
        try {
            const aiResponse = await callAI({
                prompt: "정상 연결 여부 확인을 위해 '연결 성공'이라고 짧게 대답해줘.",
                type: 'CONNECTION_TEST'
            });
            await ask({
                title: '✅ AI 연결에 성공했습니다',
                body: `AI 응답: ${aiResponse}`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
        } catch (err) {
            console.error('API 테스트 실패:', err.message);
            await ask({
                title: 'AI에 연결하지 못했습니다',
                body: `${err.message}`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
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
            notify('⭐ 이 학급을 주 학급으로 정했어요.');
        } catch (err) {
            console.error('주 학급 설정 실패:', err.message);
            await ask({
                title: '주 학급을 정하지 못했습니다',
                body: `잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
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
            notify('♻️ 학급을 되살렸어요.');
        } catch (err) {
            console.error('학급 복구 실패:', err.message);
            await ask({
                title: '학급을 되살리지 못했습니다',
                body: `잠시 뒤 다시 시도해 주세요.`,
                confirmLabel: '알겠어요',
                acknowledgeOnly: true
            });
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
        confirmDialog, notice, ask, notify,
        classes, setClasses, loadingClasses,
        teacherInfo, isEditProfileOpen, setIsEditProfileOpen,
        editName, setEditName, editSchool, setEditSchool, editSchoolSelection, setEditSchoolSelection,
        editPhone, setEditPhone,
        promptTemplate, setPromptTemplate, originalPrompt,
        reportPromptTemplate, setReportPromptTemplate, originalReportPrompt,
        savingKey, testingKey,
        handleUpdateTeacherProfile, handleTeacherSchoolChanged, handleSaveTeacherSettings, handleTestAIConnection,
        handleWithdrawal, handleSwitchGoogleAccount, handleSetPrimaryClass, handleRestoreClass,
        fetchAllClasses, fetchDeletedClasses
    };
};
