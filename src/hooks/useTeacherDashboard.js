import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export const useTeacherDashboard = (session, profile, onProfileUpdate, activeClass, setActiveClass) => {
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);

    // Gemini API Key 및 AI 프롬프트 관련 상태
    const [geminiKey, setGeminiKey] = useState('');
    const [originalKey, setOriginalKey] = useState('');
    const [promptTemplate, setPromptTemplate] = useState('');
    const [originalPrompt, setOriginalPrompt] = useState('');
    const [isKeyVisible, setIsKeyVisible] = useState(false);
    const [savingKey, setSavingKey] = useState(false);
    const [testingKey, setTestingKey] = useState(false);

    // 선생님 인적 사항 상태
    const [teacherInfo, setTeacherInfo] = useState({ name: '', school_name: '', phone: '' });
    const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
    const [editName, setEditName] = useState('');
    const [editSchool, setEditSchool] = useState('');
    const [editPhone, setEditPhone] = useState('');

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
            .select('gemini_api_key, ai_prompt_template')
            .eq('id', session.user.id)
            .single();

        if (data) {
            if (data.gemini_api_key) {
                setOriginalKey(data.gemini_api_key);
                setGeminiKey(data.gemini_api_key);
            }
            if (data.ai_prompt_template) {
                setOriginalPrompt(data.ai_prompt_template);
                setPromptTemplate(data.ai_prompt_template);
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
        if (!window.confirm('정말로 탈퇴하시겠습니까?\n\n탈퇴 시 모든 학급 데이터, 미션, 학생 정보가 영구적으로 삭제되며 복구할 수 없습니다.\n또한 Google 로그인 정보도 삭제됩니다.')) {
            return;
        }

        try {
            const { error: teacherError } = await supabase
                .from('teachers')
                .delete()
                .eq('id', session.user.id);

            if (teacherError) throw teacherError;

            const { error: profileError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', session.user.id);

            if (profileError) throw profileError;

            await supabase.auth.signOut();
            alert('탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다.');
            window.location.reload();
        } catch (err) {
            console.error('탈퇴 처리 실패:', err.message);
            alert('탈퇴 처리 중 오류가 발생했습니다: ' + err.message);
        }
    };

    const handleSwitchGoogleAccount = async () => {
        if (!confirm('현재 계정에서 로그아웃하고 다른 구글 계정으로 로그인하시겠습니까?')) return;
        await supabase.auth.signOut();
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
            const { error } = await supabase
                .from('profiles')
                .update({
                    gemini_api_key: geminiKey.trim(),
                    ai_prompt_template: promptTemplate.trim()
                })
                .eq('id', session.user.id);

            if (error) throw error;
            setOriginalKey(geminiKey.trim());
            setOriginalPrompt(promptTemplate.trim());
            alert('설정이 안전하게 저장되었습니다! ✨');
        } catch (err) {
            console.error('설정 저장 실패:', err.message);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setSavingKey(false);
        }
    };

    const handleTestGeminiKey = async () => {
        if (!geminiKey.trim()) {
            alert('테스트할 API 키를 먼저 입력해주세요! 🔑');
            return;
        }
        setTestingKey(true);
        try {
            const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent";
            const response = await fetch(`${baseUrl}?key=${geminiKey.trim()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: "정상 연결 여부 확인을 위해 '연결 성공'이라고 짧게 대답해줘."
                        }]
                    }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답 없음';
                alert(`✅ 연결 성공!\nAI 응답: ${aiResponse}`);
            } else {
                const errorData = await response.json();
                const msg = errorData?.error?.message || '알 수 없는 오류';
                throw new Error(msg);
            }
        } catch (err) {
            console.error('API 테스트 실패:', err.message);
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

    const maskKey = (key) => {
        if (!key) return '';
        if (key.length <= 4) return '****';
        return `${key.slice(0, 2)}...${key.slice(-2)}`;
    };

    return {
        classes, setClasses, loadingClasses,
        teacherInfo, isEditProfileOpen, setIsEditProfileOpen,
        editName, setEditName, editSchool, setEditSchool, editPhone, setEditPhone,
        geminiKey, setGeminiKey, originalKey,
        promptTemplate, setPromptTemplate, originalPrompt,
        isKeyVisible, setIsKeyVisible,
        savingKey, testingKey,
        handleUpdateTeacherProfile, handleSaveTeacherSettings, handleTestGeminiKey,
        handleWithdrawal, handleSwitchGoogleAccount, handleSetPrimaryClass,
        fetchAllClasses, maskKey
    };
};
