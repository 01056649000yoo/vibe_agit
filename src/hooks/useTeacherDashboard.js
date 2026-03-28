import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { callAI } from '../lib/openai';
import { dataCache } from '../lib/cache';


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
    const [hasApiKey, setHasApiKey] = useState(false); // [보안] 키 존재 여부만 추적 (실제 키 값은 저장 안 함)

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
        } catch (err) {
            console.log('선생님 정보 fetch 알림 (미등록 상태일 수 있음)');
        }
    }, [session?.user?.id]);

    const fetchApiSettings = useCallback(async () => {
        if (!session?.user?.id) return;
        // [보안] API 키 원본을 클라이언트에 로드하지 않음
        // [최적화] 두 DB 요청을 병렬로 실행하여 순차 대기 제거
        const [{ data, error }, { data: keyCheck }] = await Promise.all([
            supabase
                .from('profiles')
                .select('api_mode, ai_prompt_template')
                .eq('id', session.user.id)
                .single(),
            supabase.rpc('check_my_api_key_exists')
        ]);

        if (data) {
            setOriginalKey(data.api_mode === 'PERSONAL' ? 'Personal Key Active' : 'System Key Active');

            // [보안 강화] API 키 원본을 state에 저장하지 않음
            // 입력란은 항상 빈 상태로 시작 (새 키 입력 시에만 변경)
            setOpenaiKey('');

            // [보안] 키 존재 여부(boolean)만으로 AI 연결 상태 판단
            const hasKey = keyCheck?.has_key === true;
            setHasApiKey(hasKey);

            if (data.api_mode === 'PERSONAL') {
                if (!hasKey) {
                    setAiStatus('disconnected');
                } else {
                    setAiStatus('connected');
                }
            } else {
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
        if (session?.user?.id) {
            // [async-parallel] 초기 데이터 로딩을 병렬로 처리하여 첫 로딩 속도 향상
            Promise.all([
                fetchAllClasses(),
                fetchApiSettings(),
                fetchTeacherInfo()
            ]).catch(err => console.error("초기 로딩 중 오류:", err));
        }
    }, [session?.user?.id, fetchAllClasses, fetchApiSettings, fetchTeacherInfo]);

    // [Performance] 활성 학급 변경 시 미션/학생 데이터 백그라운드 프리페칭
    useEffect(() => {
        if (!activeClass?.id) return;

        // 1. 미션 목록 프리페칭
        dataCache.get(`missions_${activeClass.id}`, async () => {
            const { data, error } = await supabase
                .from('writing_missions')
                // 대시보드 미션 요약 표시를 위해 ID, 제목, 타입, 보관여부 등 선택
                .select('id, title, mission_type, is_archived, created_at')
                .eq('class_id', activeClass.id)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return (data || []).filter(m => !m.is_archived && m.mission_type !== 'meeting');
        }, 120000); // 2분 캐시

        // 2. 학생 목록 프리페칭
        dataCache.get(`students_${activeClass.id}`, async () => {
            const { data, error } = await supabase
                .from('students')
                // 학생 요약 정보(ID, 이름)만 프리페칭
                .select('id, name, class_id')
                .eq('class_id', activeClass.id)
                .is('deleted_at', null)
                .order('name');
            if (error) throw error;
            return data || [];
        }, 120000);

    }, [activeClass?.id]);

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
            // [최적화] 학급, 교사 상세, 프로필 데이터 병렬 삭제 (Promise.all)
            const [classResult, teacherResult, profileResult] = await Promise.all([
                supabase.from('classes').delete().eq('teacher_id', session.user.id),
                supabase.from('teachers').delete().eq('id', session.user.id),
                supabase.from('profiles').delete().eq('id', session.user.id)
            ]);

            if (classResult.error) console.warn("학급 삭제 중 경고:", classResult.error.message);
            if (teacherResult.error) throw teacherResult.error;
            if (profileResult.error) throw profileResult.error;

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

            // [보안 강화] API 키는 별도의 보안 테이블(profile_secrets)에 저장
            const profileUpdatePayload = {
                id: session.user.id,
                ai_prompt_template: packedPrompt,
                ...(updatedProfile.api_mode && { api_mode: updatedProfile.api_mode }),
            };

            // API 키 정제: 줄바꿈, 유니코드 특수문자 등 HTTP 헤더 불허 문자 제거
            const cleanedKey = openaiKey.replace(/[^\x20-\x7E]/g, '').trim();

            const secretsUpdatePayload = {
                id: session.user.id,
                ...(cleanedKey && { personal_openai_api_key: cleanedKey }),
            };

            const [profileResult, secretsResult] = await Promise.all([
                supabase.from('profiles').upsert(profileUpdatePayload, { onConflict: 'id' }),
                cleanedKey
                    ? supabase.from('profile_secrets').upsert(secretsUpdatePayload, { onConflict: 'id' })
                    : Promise.resolve({ error: null })
            ]);

            if (profileResult.error) throw profileResult.error;
            if (secretsResult.error) throw secretsResult.error;

            setOriginalPrompt(promptTemplate.trim());
            setOriginalReportPrompt(reportPromptTemplate.trim());

            // 프로필 상태 갱신을 위해 콜백 호출
            if (onProfileUpdate) {
                await onProfileUpdate();
            }

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
            // [변경] 현재 UI상의 모드와 키를 함께 전달하여, 저장 전이라도 정확한 테스트가 가능하게 합니다.
            const aiResponse = await callAI({
                prompt: "정상 연결 여부 확인을 위해 '연결 성공'이라고 짧게 대답해줘.",
                overrideApiMode: profile?.api_mode,
                overrideApiKey: openaiKey,
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

    const runAIDiagnosis = async () => {
        console.log("🛠️ AI 진단 시작...");
        try {
            const diagData = await callAI({
                type: 'DIAG',
                overrideApiMode: profile?.api_mode,
                overrideApiKey: openaiKey
            });
            console.log("📋 서버측 AI 진단 결과:", diagData);
            alert("콘솔(F12)에서 진단 결과를 확인해주세요.");
        } catch (err) {
            console.error("진단 실패:", err.message);
            alert(`❌ 진단 실패: ${err.message}\n(브라우저 콘솔을 확인해주세요)`);
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

    const maskKey = (key) => {
        if (!key) return '';
        if (key.length <= 4) return '****';
        return `${key.slice(0, 2)}...${key.slice(-2)}`;
    };

    return {
        classes, setClasses, loadingClasses,
        teacherInfo, isEditProfileOpen, setIsEditProfileOpen,
        editName, setEditName, editSchool, setEditSchool, editPhone, setEditPhone,
        openaiKey, setOpenaiKey, originalKey, hasApiKey,
        promptTemplate, setPromptTemplate, originalPrompt,
        reportPromptTemplate, setReportPromptTemplate, originalReportPrompt,
        isKeyVisible, setIsKeyVisible,
        savingKey, testingKey, aiStatus,
        handleUpdateTeacherProfile, handleSaveTeacherSettings, handleTestAIConnection, runAIDiagnosis,
        handleWithdrawal, handleSwitchGoogleAccount, handleSetPrimaryClass, handleRestoreClass,
        fetchAllClasses, fetchDeletedClasses, maskKey
    };
};
