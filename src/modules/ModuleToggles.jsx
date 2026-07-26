import React, { useEffect, useState } from 'react';
import {
    getAllModules,
    getLegacyModuleFields,
    resolveEnabledModuleIds,
    CONFIGURED_MARK,
} from './registry';
import { PART_LABELS } from './types';
import { supabase } from '../lib/supabaseClient';
import { saveEnabledModules } from './useEnabledModules';

/**
 * 교사용 모듈 on/off 패널 (Stage 3a)
 *
 * 학급의 `classes.enabled_modules`를 편집한다.
 * NULL(미설정)이면 각 모듈의 defaultEnabled를 초기값으로 보여주고,
 * 저장 시 명시적 목록으로 기록된다.
 */
const ModuleToggles = ({ activeClass, isMobile }) => {
    const classId = activeClass?.id;
    const all = getAllModules();
    const [enabled, setEnabled] = useState(null); // null = 로딩 중
    const [saving, setSaving] = useState(false);
    const [loadError, setLoadError] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (!classId || !supabase) return;
        (async () => {
            const fields = ['enabled_modules', ...getLegacyModuleFields()].join(', ');
            const { data, error } = await supabase
                .from('classes').select(fields).eq('id', classId).maybeSingle();
            if (cancelled) return;
            if (error || !data) {
                setLoadError(true);
                setEnabled([]);
                return;
            }
            setLoadError(false);
            // 미설정이면 모듈 기본값 + 기존 개별 플래그로 초기화한다.
            setEnabled(resolveEnabledModuleIds(data?.enabled_modules, data)
                .filter((x) => x !== CONFIGURED_MARK));
        })();
        return () => { cancelled = true; };
    }, [classId]);

    if (!classId || all.length === 0) return null;

    const toggle = async (id) => {
        if (!enabled || saving) return;
        const next = enabled.includes(id) ? enabled.filter(x => x !== id) : [...enabled, id];
        setEnabled(next);
        setSaving(true);
        const { data, error } = await saveEnabledModules(classId, next);
        setSaving(false);
        if (error || !data) {
            setEnabled(enabled); // 실패 시 되돌리기
            alert('모듈 설정 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        }
    };

    const grouped = all.reduce((acc, m) => { (acc[m.part] ||= []).push(m); return acc; }, {});

    return (
        <div style={{ marginBottom: '2rem', background: 'white', border: '1px solid #E9ECEF', borderRadius: '16px', padding: isMobile ? '16px' : '24px' }}>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: '#2C3E50', fontWeight: '900' }}>🧩 학급 기능 켜기 / 끄기</h3>
            <p style={{ margin: '0 0 16px 0', color: '#7F8C8D', fontSize: '0.9rem' }}>
                끈 기능은 학생 화면에서 보이지 않습니다. 학급마다 따로 설정됩니다.
            </p>

            {loadError ? (
                <div style={{ color: '#C62828', fontSize: '0.9rem' }}>모듈 설정을 불러오지 못했습니다. 화면을 새로고침해 주세요.</div>
            ) : enabled === null ? (
                <div style={{ color: '#95A5A6', fontSize: '0.9rem' }}>불러오는 중…</div>
            ) : (
                Object.entries(grouped).map(([part, mods]) => (
                    <div key={part} style={{ marginBottom: '14px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#95A5A6', fontWeight: 'bold', marginBottom: '8px' }}>
                            {PART_LABELS[part] ?? part}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                            {mods.map((m) => {
                                const on = enabled.includes(m.id);
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => toggle(m.id)}
                                        disabled={saving}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                                            padding: '12px 14px', borderRadius: '12px', cursor: saving ? 'wait' : 'pointer',
                                            border: on ? '2px solid #27AE60' : '2px solid #E9ECEF',
                                            background: on ? '#F0FBF4' : '#F8F9FA',
                                        }}
                                    >
                                        <span style={{ fontSize: '1.4rem' }}>{m.icon}</span>
                                        <span style={{ flex: 1 }}>
                                            <span style={{ display: 'block', fontWeight: 'bold', color: '#2C3E50', fontSize: '0.95rem' }}>{m.name}</span>
                                            {m.description && <span style={{ display: 'block', color: '#7F8C8D', fontSize: '0.8rem' }}>{m.description}</span>}
                                        </span>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: on ? '#27AE60' : '#95A5A6' }}>{on ? 'ON' : 'OFF'}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};

export default ModuleToggles;
