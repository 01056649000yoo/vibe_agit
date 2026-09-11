import React, { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';

/*
 * 학생 개인정보 동의서 확인 관문 (2026-09-11).
 *
 * 왜 있나:
 *   처리방침은 "학생 가명 사용이 원칙"이라 적혀 있었지만 실제로는 학생 86%가 실명이다.
 *   실명을 쓰려면 학교가 학기초에 법정대리인 동의서를 받아야 하고, 이 서비스는 **그 동의를
 *   받았는지 담당 교사에게 확인**받아야 한다. 학급 단위로 기록한다 — 동의서도 학년·학기마다
 *   새로 받기 때문이다.
 *
 * 언제 뜨나:
 *   담당 학급 중 `student_consent_confirmed_at` 이 빈 것이 하나라도 있으면 로그인 직후 뜬다.
 *   기존 학급 591개는 모두 비어 있어 다음 로그인 때 한 번씩 본다(사용자 결정).
 *   새 학급은 만들 때 확인하므로 다시 뜨지 않는다.
 *
 * 확인 시각은 서버가 찍는다(`confirm_class_student_consent_v1`). 본인 학급만 기록된다.
 */
export const STUDENT_CONSENT_STATEMENT =
    '학기초 학교에서 학생 개인정보 수집·이용에 대한 법정대리인(보호자) 동의서를 받았으며, '
    + '위 학급 학생의 이름과 학생이 작성한 글을 이 서비스에서 처리하는 것이 그 동의 범위에 포함됨을 확인합니다.';

const StudentConsentGate = ({ classes, onConfirmed, onLogout }) => {
    const [checked, setChecked] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const confirm = async () => {
        if (!checked || saving) return;
        setSaving(true);
        setError('');
        try {
            const { data, error: rpcError } = await supabase.rpc('confirm_class_student_consent_v1', {
                p_class_ids: classes.map((item) => item.id),
            });
            if (rpcError) throw rpcError;
            if (Number(data?.confirmed) !== classes.length) {
                throw new Error(`학급 ${classes.length}개 중 ${Number(data?.confirmed) || 0}개만 기록됐습니다.`);
            }
            onConfirmed?.();
        } catch (confirmError) {
            setError(confirmError.message || '확인을 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
            setSaving(false);
        }
    };

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            minHeight: '100vh', background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)', padding: '20px',
        }}>
            <Card style={{ maxWidth: '620px', width: '100%', padding: '40px', borderRadius: '24px' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 'var(--ui-text-2xl)', color: '#2C3E50', fontWeight: '900' }}>
                    학생 개인정보 동의서 확인
                </h2>
                <p style={{ margin: '0 0 20px', color: '#546E7A', lineHeight: 1.7, fontSize: 'var(--ui-text-md)' }}>
                    이 서비스는 학생의 이름과 학생이 쓴 글을 저장합니다. 「개인정보 보호법」에 따라 학교에서
                    학기초에 받는 법정대리인 동의서에 이 이용이 포함되어 있는지 <strong>담당 선생님이 한 번 확인</strong>해 주세요.
                    학급마다 한 번이며, 새 학년에 학급을 새로 만들면 다시 확인합니다.
                </p>

                <div style={{ background: '#F5F7FA', borderRadius: '14px', padding: '14px 18px', marginBottom: '18px' }}>
                    <div style={{ fontSize: 'var(--ui-text-xs)', color: '#78909C', fontWeight: '800', marginBottom: '6px' }}>
                        확인할 학급 {classes.length}개
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', color: '#37474F', lineHeight: 1.8 }}>
                        {classes.map((item) => <li key={item.id}>{item.name}</li>)}
                    </ul>
                </div>

                <label style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', marginBottom: '20px' }}>
                    <input
                        type="checkbox"
                        checked={checked}
                        disabled={saving}
                        onChange={(event) => setChecked(event.target.checked)}
                        style={{ width: '20px', height: '20px', marginTop: '3px', flexShrink: 0 }}
                    />
                    <span style={{ color: '#2C3E50', lineHeight: 1.7, fontSize: 'var(--ui-text-md)' }}>{STUDENT_CONSENT_STATEMENT}</span>
                </label>

                {error ? <p style={{ color: '#C62828', margin: '0 0 14px', fontSize: 'var(--ui-text-sm)' }}>{error}</p> : null}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <Button variant="ghost" type="button" style={{ flex: 1 }} disabled={saving} onClick={onLogout}>로그아웃</Button>
                    <Button variant="primary" type="button" style={{ flex: 2 }} disabled={!checked || saving} onClick={confirm}>
                        {saving ? '기록 중…' : '확인하고 시작하기'}
                    </Button>
                </div>

                <p style={{ margin: '18px 0 0', color: '#90A4AE', fontSize: 'var(--ui-text-xs)', lineHeight: 1.6 }}>
                    아직 동의서를 받지 않았다면 로그아웃한 뒤 학교 절차를 먼저 진행해 주세요.
                    확인한 시각은 학급 기록에 남습니다.
                </p>
            </Card>
        </div>
    );
};

export default StudentConsentGate;
