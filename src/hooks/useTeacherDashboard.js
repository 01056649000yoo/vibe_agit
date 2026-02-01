import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { callAI } from '../lib/openai';


export const useTeacherDashboard = (session, profile, onProfileUpdate, activeClass, setActiveClass) => {
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);

    // AI 설정 관련 상태
    const [openaiKey, setOpenaiKey] = useState('시스템 설정 활성화됨');
    const [originalKey, setOriginalKey] = useState('');
    const DEFAULT_FEEDBACK_PROMPT = `[시스템 역할 설정]
너는 초등학생의 글쓰기 성장을 돕는 다정하고 전문적인 글쓰기 코치야. 학생이 쓴 글을 읽고, 학생의 수준에 맞춰 구체적이고 격려 섞인 피드백을 제공해야 해.
[입력 데이터]
글쓰기 주제: {title}
학생이 작성한 내용: {content}
핵심질문의 답변
[피드백 작성 가이드라인]
분량: 전체 내용을 공백 포함 500자 이내로 작성할 것.
구성: 아래의 3가지 요소를 반드시 포함할 것.
🌟 칭찬해줄 점: 글의 내용이나 표현 중 창의적이거나 논리적인 부분, 혹은 주제를 잘 드러낸 부분을 구체적으로 칭찬함.
💡 보완하면 좋을 점: 주제에 맞는 근거가 부족하거나, 문장 간의 연결이 어색한 부분에 대해 '어떻게 고치면 좋을지' 제안함.
🔍 맞춤법 및 문장 교정: 틀리기 쉬운 맞춤법이나 띄어쓰기, 어색한 문장 표현 1~2가지를 친절하게 짚어줌.
말투: "했니?", "해볼까?", "정말 멋지다!"와 같이 초등학교 5학년 학생에게 친근감을 주는 부드러운 구어체를 사용할 것.`;
    const DEFAULT_REPORT_PROMPT = `너는 초등학교 담임교사야. 학생의 여러 글쓰기 활동 기록과 성취 수준을 종합하여 학교생활기록부에 기재할 수 있는 전문적인 문구로 정리해줘. 학생의 이름은 넣지 않고 학생의 글쓰기 역량과 태도, 성취도를 바탕으로 강점을 중점적으로 서술하고, 문장은 관찰 중심의 평어체(~함, ~임)를 사용하여 180자 내외로 간결하게 작성해줘. 글쓰기 활동을 통해 다양한 역량이 함양됨을 강조해줘.
[예시문장]
글쓰기 전 질문에 답하며 자신의 아이디어를 체계적으로 구조화하는 능력이 탁월함. 초기에는 단순한 주장을 나열했으나, 교사의 피드백을 바탕으로 학교 내 실태 조사 자료를 활용하여 논리적인 근거를 보강하며 퇴고함. 특히 환경 문제의 원인을 다각도로 분석하여 실천 가능한 대안을 제시하는 등 비판적 사고력과 문장 구성력이 비약적으로 성장함.`;

    const [promptTemplate, setPromptTemplate] = useState(DEFAULT_FEEDBACK_PROMPT);
    const [originalPrompt, setOriginalPrompt] = useState(""); // 초기에 저장이 가능하도록 빈값으로 설정
    const [reportPromptTemplate, setReportPromptTemplate] = useState(DEFAULT_REPORT_PROMPT);
    const [originalReportPrompt, setOriginalReportPrompt] = useState(""); // 초기에 저장이 가능하도록 빈값으로 설정
    const [isKeyVisible, setIsKeyVisible] = useState(false);
    const [savingKey, setSavingKey] = useState(false);
    const [testingKey, setTestingKey] = useState(false);

    // 선생님 인적 사항 상태
    const [teacherInfo, setTeacherInfo] = useState({ name: '', school_name: '', phone: '' });
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editSchool, setEditSchool] = useState('');
    const [editPhone, setEditPhone] = useState('');

    // AI 상태 관련
    const [aiStatus, setAiStatus] = useState('disconnected'); // 초기값은 안전하게 '연결되지 않음'으로 시작

    const fetchTeacherInfo = useCallback(async () => {
        if (!session?.user?.id) return;
        try {
            const { data, error } = await supabase
                .from('teachers')
                .select('name, school_name, phone')
                .eq('id', session.user.id)
                .single();

            if (data) {
                setTeacherInfo(data);
                setEditName(data.name || '');
                setEditSchool(data.school_name || '');
                setEditPhone(data.phone || '');
            }
        } catch (err) {
            console.log('선생님 정보 fetch 알림 (미등록 상태일 수 있음)');
        }
    }, [session?.user?.id]);

    const fetchGeminiKey = useCallback(async () => {
        if (!session?.user?.id) return;
        const { data, error } = await supabase
            .from('profiles')
            .select('*') // 특정 컬럼 지정 시 DB에 없으면 400 에러 발생하므로 전체 선택으로 변경 (안전장치)
            .eq('id', session.user.id)
            .single();

        if (data) {
            setOriginalKey(data.api_mode === 'PERSONAL' ? 'Personal Key Active' : 'System Key Active');

            // 저장된 개인 키가 있으면 상태에 반영
            if (data.personal_openai_api_key) {
                setOpenaiKey(data.personal_openai_api_key);
            } else {
                setOpenaiKey('');
            }

            // [추가] 초기 AI 연결 상태 결정 로직
            if (data.api_mode === 'PERSONAL') {
                // 개인 키 모드인데 키가 비어있으면 '연결되지 않음'
                if (!data.personal_openai_api_key || !data.personal_openai_api_key.trim()) {
                    setAiStatus('disconnected');
                } else {
                    // 키가 있으면 일단 '연결됨'으로 표시 (실제 연결 확인은 테스트 버튼 권장)
                    setAiStatus('connected');
                }
            } else {
                // 시스템 모드는 항상 '연결됨' (공용 키 사용)
                setAiStatus('connected');
            }

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
                    } catch (e) {
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
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .eq('teacher_id', session.user.id)
                .is('deleted_at', null)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setClasses(data || []);
        } catch (err) {
            console.error('❌ Hook: 학급 불러오기 실패:', err.message);
            alert('정보를 불러오지 못했습니다. 🔄');
        } finally {
            setLoadingClasses(false);
        }
    }, [session?.user?.id]);

    useEffect(() => {
        if (session?.user?.id) {
            fetchAllClasses();
            fetchGeminiKey();
            fetchTeacherInfo();
        }
    }, [session?.user?.id, fetchAllClasses, fetchGeminiKey, fetchTeacherInfo]);

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
            // 1. 학급 데이터 삭제 (연쇄 삭제가 설정되어 있지 않을 경우 대비)
            const { error: classError } = await supabase
                .from('classes')
                .delete()
                .eq('teacher_id', session.user.id);

            if (classError) console.warn("학급 삭제 중 경고:", classError.message);

            // 2. 선생님 상세 정보 삭제
            const { error: teacherError } = await supabase
                .from('teachers')
                .delete()
                .eq('id', session.user.id);

            if (teacherError) throw teacherError;

            // 3. 프로필 삭제
            const { error: profileError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', session.user.id);

            if (profileError) throw profileError;

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

    const handleSaveTeacherSettings = async (updatedProfile = {}) => {
        setSavingKey(true);
        try {
            // 여러 프롬프트를 하나의 컬럼에 JSON으로 패킹하여 저장
            const packedPrompt = JSON.stringify({
                feedback: promptTemplate.trim(),
                report: reportPromptTemplate.trim()
            });

            // 업데이트할 객체 준비 (API 키 등 포함)
            const updatePayload = {
                id: session.user.id,
                ai_prompt_template: packedPrompt,
                // [보안/에러방지] DB에 실제 존재하는 컬럼만 선별하여 업데이트 Payload 구성
                // 1. 현재 입력된 개인 API 키 상태 반영 (입력란의 값)
                personal_openai_api_key: openaiKey,
                // 2. updatedProfile에서 허용된 필드만 추출 (schoolName 등 불필요한 필드 제외하여 400 에러 방지)
                ...(updatedProfile.api_mode && { api_mode: updatedProfile.api_mode }),
            };

            const { error } = await supabase
                .from('profiles')
                .upsert(updatePayload, { onConflict: 'id' });

            if (error) throw error;

            setOriginalPrompt(promptTemplate.trim());
            setOriginalReportPrompt(reportPromptTemplate.trim());

            // 프로필 상태 갱신을 위해 콜백 호출
            if (onProfileUpdate) await onProfileUpdate();

            alert('설정이 안전하게 저장되었습니다! ✨');
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
            // [변경] 이제 모든 키 조회 로직은 Edge Function 내부에서 처리되므로 프롬프트만 보냅니다.
            const aiResponse = await callAI("정상 연결 여부 확인을 위해 '연결 성공'이라고 짧게 대답해줘.");
            setAiStatus('connected');
            alert(`✅ 연결 성공!\nAI 응답: ${aiResponse}`);
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
                .select('*')
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

    const maskKey = (key) => {
        if (!key) return '';
        if (key.length <= 4) return '****';
        return `${key.slice(0, 2)}...${key.slice(-2)}`;
    };

    return {
        classes, setClasses, loadingClasses,
        teacherInfo, isEditProfileOpen, setIsEditProfileOpen,
        editName, setEditName, editSchool, setEditSchool, editPhone, setEditPhone,
        openaiKey, setOpenaiKey, originalKey,
        promptTemplate, setPromptTemplate, originalPrompt,
        reportPromptTemplate, setReportPromptTemplate, originalReportPrompt,
        isKeyVisible, setIsKeyVisible,
        savingKey, testingKey, aiStatus,
        handleUpdateTeacherProfile, handleSaveTeacherSettings, handleTestAIConnection,
        handleWithdrawal, handleSwitchGoogleAccount, handleSetPrimaryClass, handleRestoreClass,
        fetchAllClasses, fetchDeletedClasses, maskKey
    };
};
