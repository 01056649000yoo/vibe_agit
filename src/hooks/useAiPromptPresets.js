import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

/**
 * AI 프롬프트 규칙 보관함.
 *
 * 지금 적용 중인 규칙은 예전 그대로 `profiles.ai_prompt_template` 에 있다.
 * (피드백 생성 시 useMissionManager 가 그 값을 직접 읽는다 — 그 경로는 건드리지 않는다)
 * 이 훅은 "이름 붙인 사본"을 관리하고, 프리셋을 적용할 때 profiles 로 내용을 복사한다.
 *
 * @param {'feedback'|'report'} kind
 */

export const PRESET_KIND = { FEEDBACK: 'feedback', REPORT: 'report' };

/**
 * 규칙 1개의 최대 길이.
 *
 * 200자였는데 실제로 써 보니 역할·근거·문체·금지사항을 다 적기엔 너무 짧아서
 * AI 가 규칙을 제대로 못 알아듣는 경우가 있었다(2026-08-10, 사용자 요청으로 1,000자).
 * DB(`ai_prompt_presets.content`)는 길이 제한이 없는 TEXT 라 스키마 변경은 필요 없다.
 * 화면(PromptRuleModal)도 이 값을 가져다 쓰므로 한도는 여기 한 곳에서만 고친다.
 */
export const MAX_PROMPT_LENGTH = 1000;

const validatePrompt = (content) => {
    const value = String(content || '').trim();
    if (!value) throw new Error('프롬프트 내용을 입력해주세요.');
    if (value.length > MAX_PROMPT_LENGTH) {
        throw new Error(`프롬프트는 ${MAX_PROMPT_LENGTH}자 이내로 작성해주세요.`);
    }
    return value;
};

/** profiles.ai_prompt_template 은 {feedback, report} JSON 문자열로 저장된다 */
const parsePacked = (raw) => {
    const value = (raw || '').trim();
    if (!value) return { feedback: '', report: '' };
    if (value.startsWith('{') && value.endsWith('}')) {
        try {
            const parsed = JSON.parse(value);
            return { feedback: parsed.feedback || '', report: parsed.report || '' };
        } catch {
            // JSON 이 아니면 예전 형식(피드백 원문)으로 간주
        }
    }
    return { feedback: value, report: '' };
};

const useAiPromptPresets = (kind = PRESET_KIND.FEEDBACK) => {
    const [presets, setPresets] = useState([]);
    const [appliedContent, setAppliedContent] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const [presetResult, profileResult] = await Promise.all([
                supabase
                    .from('ai_prompt_presets')
                    .select('id, name, content, is_active, updated_at')
                    .eq('teacher_id', user.id)
                    .eq('kind', kind)
                    .order('is_active', { ascending: false })
                    .order('updated_at', { ascending: false }),
                supabase
                    .from('profiles')
                    .select('ai_prompt_template')
                    .eq('id', user.id)
                    .maybeSingle()
            ]);

            if (presetResult.error) throw presetResult.error;
            if (profileResult.error) throw profileResult.error;

            setPresets(presetResult.data || []);
            const packed = parsePacked(profileResult.data?.ai_prompt_template);
            setAppliedContent(kind === PRESET_KIND.REPORT ? packed.report : packed.feedback);
        } catch (err) {
            setError(err.message || '규칙을 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [kind]);

    useEffect(() => {
        load();
    }, [load]);

    /** 실제로 실행에 쓰이는 값(profiles) 갱신 — 다른 종류의 프롬프트는 보존한다 */
    const writeAppliedContent = useCallback(async (content) => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('로그인이 필요합니다.');

        const { data: current } = await supabase
            .from('profiles')
            .select('ai_prompt_template')
            .eq('id', user.id)
            .maybeSingle();

        const packed = parsePacked(current?.ai_prompt_template);
        const next = kind === PRESET_KIND.REPORT
            ? { ...packed, report: content }
            : { ...packed, feedback: content };

        const { error: updateError } = await supabase
            .from('profiles')
            .update({ ai_prompt_template: JSON.stringify(next) })
            .eq('id', user.id);

        if (updateError) throw updateError;
        setAppliedContent(content);
        return user.id;
    }, [kind]);

    /** 편집한 내용을 이름 없이 바로 적용 (프리셋으로 저장하지 않음) */
    const applyContent = useCallback(async (content) => {
        setSaving(true);
        setError(null);
        try {
            const validated = validatePrompt(content);
            const teacherId = await writeAppliedContent(validated);
            // 어떤 프리셋과도 일치하지 않으므로 활성 표시를 해제한다
            await supabase
                .from('ai_prompt_presets')
                .update({ is_active: false })
                .eq('teacher_id', teacherId)
                .eq('kind', kind)
                .eq('is_active', true);
            await load();
            return true;
        } catch (err) {
            setError(err.message || '적용에 실패했습니다.');
            return false;
        } finally {
            setSaving(false);
        }
    }, [kind, load, writeAppliedContent]);

    /** 프리셋을 골라 적용 */
    const applyPreset = useCallback(async (presetId) => {
        setSaving(true);
        setError(null);
        try {
            const target = presets.find(p => p.id === presetId);
            if (!target) throw new Error('규칙을 찾을 수 없습니다.');

            const teacherId = await writeAppliedContent(target.content);

            // 활성 프리셋은 종류당 하나 (부분 유니크 인덱스가 있으므로 먼저 해제)
            await supabase
                .from('ai_prompt_presets')
                .update({ is_active: false })
                .eq('teacher_id', teacherId)
                .eq('kind', kind)
                .eq('is_active', true);

            const { error: activateError } = await supabase
                .from('ai_prompt_presets')
                .update({ is_active: true })
                .eq('id', presetId);

            if (activateError) throw activateError;
            await load();
            return true;
        } catch (err) {
            setError(err.message || '규칙 적용에 실패했습니다.');
            return false;
        } finally {
            setSaving(false);
        }
    }, [kind, presets, load, writeAppliedContent]);

    /** 새 이름으로 저장 (이미 있는 이름이면 내용 덮어쓰기) */
    const savePreset = useCallback(async (name, content) => {
        setSaving(true);
        setError(null);
        try {
            const validated = validatePrompt(content);
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('로그인이 필요합니다.');

            const trimmed = name.trim();
            const existing = presets.find(
                p => p.name.trim().toLowerCase() === trimmed.toLowerCase()
            );

            if (existing) {
                const { error: updateError } = await supabase
                    .from('ai_prompt_presets')
                    .update({ content: validated })
                    .eq('id', existing.id);
                if (updateError) throw updateError;
            } else {
                const { error: insertError } = await supabase
                    .from('ai_prompt_presets')
                    .insert({ teacher_id: user.id, kind, name: trimmed, content: validated });
                if (insertError) throw insertError;
            }

            await load();
            return true;
        } catch (err) {
            setError(err.message || '규칙 저장에 실패했습니다.');
            return false;
        } finally {
            setSaving(false);
        }
    }, [kind, presets, load]);

    const renamePreset = useCallback(async (presetId, name) => {
        setSaving(true);
        setError(null);
        try {
            const { error: updateError } = await supabase
                .from('ai_prompt_presets')
                .update({ name: name.trim() })
                .eq('id', presetId);
            if (updateError) throw updateError;
            await load();
            return true;
        } catch (err) {
            setError(err.message || '이름 변경에 실패했습니다.');
            return false;
        } finally {
            setSaving(false);
        }
    }, [load]);

    const deletePreset = useCallback(async (presetId) => {
        setSaving(true);
        setError(null);
        try {
            const { error: deleteError } = await supabase
                .from('ai_prompt_presets')
                .delete()
                .eq('id', presetId);
            if (deleteError) throw deleteError;
            await load();
            return true;
        } catch (err) {
            setError(err.message || '삭제에 실패했습니다.');
            return false;
        } finally {
            setSaving(false);
        }
    }, [load]);

    const activePreset = presets.find(p => p.is_active) || null;

    return {
        presets,
        activePreset,
        appliedContent,
        loading,
        saving,
        error,
        reload: load,
        applyContent,
        applyPreset,
        savePreset,
        renamePreset,
        deletePreset
    };
};

export default useAiPromptPresets;
