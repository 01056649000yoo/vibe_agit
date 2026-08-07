import React, { useEffect, useState } from 'react';
import Button from '../../../components/common/Button';
import { supabase } from '../../../lib/supabaseClient';
import WritingPolicyFields from './WritingPolicyFields';
import { normalizeWritingPolicy } from './writingPolicy';
import './writingPolicy.css';

const WritingPolicySettings = ({
    classId, writingType, defaults, title, description,
    kicker = '글쓰기 동기부여 설정', availabilityEnabled, onDirtyChange
}) => {
    const [policy, setPolicy] = useState(() => normalizeWritingPolicy(defaults));
    const [savedPolicy, setSavedPolicy] = useState(() => normalizeWritingPolicy(defaults));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!classId) return;
            setLoading(true);
            setMessage('');
            const { data, error } = await supabase
                .from('class_writing_policies')
                .select('is_enabled, min_chars, min_paragraphs, base_reward, bonus_enabled, bonus_threshold, bonus_reward, daily_reward_limit')
                .eq('class_id', classId)
                .eq('writing_type', writingType)
                .maybeSingle();
            if (!active) return;
            if (error) {
                console.error('글쓰기 정책 불러오기 실패:', error.message);
                setMessage('설정을 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.');
            } else {
                const loadedPolicy = normalizeWritingPolicy(data || defaults, defaults);
                setPolicy(loadedPolicy);
                setSavedPolicy(loadedPolicy);
            }
            setLoading(false);
        };
        load();
        return () => { active = false; };
    }, [classId, defaults, writingType]);

    useEffect(() => {
        const isDirty = JSON.stringify(policy) !== JSON.stringify(savedPolicy);
        onDirtyChange?.(isDirty);
        return () => onDirtyChange?.(false);
    }, [onDirtyChange, policy, savedPolicy]);

    const save = async () => {
        setSaving(true);
        setMessage('');
        const normalized = normalizeWritingPolicy(policy, defaults);
        // 사용 ON/OFF는 화면 머리의 전용 스위치가 맡는다. 설정 폼을 오래 열어 둔 뒤 저장해도
        // 과거 is_enabled 값이 스위치를 되돌리지 않도록 저장 직전 최신 값을 사용한다.
        const policyToSave = typeof availabilityEnabled === 'boolean'
            ? { ...normalized, is_enabled: availabilityEnabled }
            : normalized;
        const { data, error } = await supabase
            .from('class_writing_policies')
            .upsert({ class_id: classId, writing_type: writingType, ...policyToSave }, { onConflict: 'class_id,writing_type' })
            .select('is_enabled, min_chars, min_paragraphs, base_reward, bonus_enabled, bonus_threshold, bonus_reward, daily_reward_limit')
            .single();
        setSaving(false);
        if (error) {
            console.error('글쓰기 정책 저장 실패:', error.message);
            setMessage('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            return;
        }
        const saved = normalizeWritingPolicy(data, defaults);
        setPolicy(saved);
        setSavedPolicy(saved);
        setMessage('이 학급의 새 독서록부터 적용됩니다.');
    };

    return (
        <section className="writing-policy-settings">
            <header>
                <div>
                    <span>{kicker}</span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                </div>
                <Button size="sm" onClick={save} disabled={loading || saving || !classId}>
                    {saving ? '저장 중...' : '설정 저장'}
                </Button>
            </header>
            {loading ? <p className="writing-policy-settings__loading">설정을 불러오는 중...</p> : (
                <WritingPolicyFields value={policy} onChange={setPolicy} showDailyLimit showBonus />
            )}
            {message && <p className="writing-policy-settings__message" role="status">{message}</p>}
        </section>
    );
};

export default WritingPolicySettings;
