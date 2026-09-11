import React, { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { POLICY_VERSION } from '../../constants/policyVersion';

/*
 * 로그인 관문: 약관 추가 동의 + 학생 개인정보 동의서 확인 (2026-09-11).
 *
 * 두 가지를 한 화면에서 받는다. 각각은 필요할 때만 보인다.
 *
 *   ① 약관·처리방침 추가 동의
 *      기존 교사의 첫 동의는 가입일로 소급돼 있다. 2026-09-14 개정판(학생 실명 처리 근거 정정)에는
 *      한 번 더 동의를 받고 kind=reconsent 로 **따로** 남긴다 — 첫 동의는 그대로다.
 *
 *   ② 학생 개인정보 동의서 확인
 *      처리방침은 "학생 가명 사용이 원칙"이라 적혀 있었지만 실제로는 학생 86%가 실명이다.
 *      실명을 쓰려면 학교가 학기초에 법정대리인 동의서를 받아야 하고, 이 서비스는 그 동의를
 *      받았는지 담당 교사에게 확인받아야 한다. 학급 단위로 기록한다 — 동의서도 학년·학기마다
 *      새로 받기 때문이다. 기존 학급 591개는 모두 비어 있어 다음 로그인 때 한 번씩 본다.
 *
 * 시각은 서버가 찍는다. 본인 학급만 기록된다. 건너뛰기는 없다 — 나가려면 로그아웃뿐이다.
 */
export const STUDENT_CONSENT_STATEMENT =
    '학기초 학교에서 학생 개인정보 수집·이용에 대한 법정대리인(보호자) 동의서를 받았으며, '
    + '위 학급 학생의 이름과 학생이 작성한 글을 이 서비스에서 처리하는 것이 그 동의 범위에 포함됨을 확인합니다.';

const linkStyle = { color: '#1D4ED8', textDecoration: 'underline', fontWeight: 700 };

const StudentConsentGate = ({ classes = [], needsPolicyConsent = false, onConfirmed, onLogout }) => {
    const [terms, setTerms] = useState(false);
    const [privacy, setPrivacy] = useState(false);
    const [students, setStudents] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const needStudents = classes.length > 0;
    const ready = (!needsPolicyConsent || (terms && privacy)) && (!needStudents || students);

    const confirm = async () => {
        if (!ready || saving) return;
        setSaving(true);
        setError('');
        try {
            if (needsPolicyConsent) {
                const { error: policyError } = await supabase.rpc('record_policy_consent_v1', {
                    p_version: POLICY_VERSION, p_kind: 'reconsent',
                });
                if (policyError) throw policyError;
            }
            if (needStudents) {
                const { data, error: rpcError } = await supabase.rpc('confirm_class_student_consent_v1', {
                    p_class_ids: classes.map((item) => item.id),
                });
                if (rpcError) throw rpcError;
                if (Number(data?.confirmed) !== classes.length) {
                    throw new Error(`학급 ${classes.length}개 중 ${Number(data?.confirmed) || 0}개만 기록됐습니다.`);
                }
            }
            onConfirmed?.();
        } catch (confirmError) {
            setError(confirmError.message || '확인을 저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.');
            setSaving(false);
        }
    };

    const checkbox = (checked, set, label) => (
        <label style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} disabled={saving} onChange={(event) => set(event.target.checked)}
                style={{ width: '20px', height: '20px', marginTop: '3px', flexShrink: 0 }} />
            <span style={{ color: '#2C3E50', lineHeight: 1.7, fontSize: 'var(--ui-text-md)' }}>{label}</span>
        </label>
    );

    return (
        <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            minHeight: '100vh', background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)', padding: '20px',
        }}>
            <Card style={{ maxWidth: '640px', width: '100%', padding: '40px', borderRadius: '24px' }}>
                <h2 style={{ margin: '0 0 8px', fontSize: 'var(--ui-text-2xl)', color: '#2C3E50', fontWeight: '900' }}>
                    시작하기 전에 확인해 주세요
                </h2>
                <p style={{ margin: '0 0 24px', color: '#546E7A', lineHeight: 1.7, fontSize: 'var(--ui-text-md)' }}>
                    개인정보 처리방침이 {POLICY_VERSION.replace(/-/g, '.')}부터 바뀌었습니다. 학생의 이름과 글을 처리하는 근거를
                    학교의 법정대리인 동의로 분명히 했습니다. 아래를 한 번만 확인하시면 됩니다.
                </p>

                {needsPolicyConsent ? (
                    <section style={{ marginBottom: '24px', display: 'grid', gap: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: 'var(--ui-text-lg)', color: '#37474F', fontWeight: 800 }}>1. 바뀐 약관·처리방침</h3>
                        {checkbox(terms, setTerms, <>
                            <a href="/terms" target="_blank" rel="noreferrer" style={linkStyle}>서비스 이용약관</a>을 읽었고 동의합니다. (필수)
                        </>)}
                        {checkbox(privacy, setPrivacy, <>
                            <a href="/privacy" target="_blank" rel="noreferrer" style={linkStyle}>개인정보 처리방침</a>을 읽었고 동의합니다. (필수)
                        </>)}
                    </section>
                ) : null}

                {needStudents ? (
                    <section style={{ marginBottom: '24px', display: 'grid', gap: '12px' }}>
                        <h3 style={{ margin: 0, fontSize: 'var(--ui-text-lg)', color: '#37474F', fontWeight: 800 }}>
                            {needsPolicyConsent ? '2. ' : ''}학생 개인정보 동의서 확인
                        </h3>
                        <div style={{ background: '#F5F7FA', borderRadius: '14px', padding: '14px 18px' }}>
                            <div style={{ fontSize: 'var(--ui-text-xs)', color: '#78909C', fontWeight: '800', marginBottom: '6px' }}>
                                확인할 학급 {classes.length}개
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '18px', color: '#37474F', lineHeight: 1.8 }}>
                                {classes.map((item) => <li key={item.id}>{item.name}</li>)}
                            </ul>
                        </div>
                        {checkbox(students, setStudents, STUDENT_CONSENT_STATEMENT)}
                    </section>
                ) : null}

                {error ? <p style={{ color: '#C62828', margin: '0 0 14px', fontSize: 'var(--ui-text-sm)' }}>{error}</p> : null}

                <div style={{ display: 'flex', gap: '10px' }}>
                    <Button variant="ghost" type="button" style={{ flex: 1 }} disabled={saving} onClick={onLogout}>로그아웃</Button>
                    <Button variant="primary" type="button" style={{ flex: 2 }} disabled={!ready || saving} onClick={confirm}>
                        {saving ? '기록 중…' : '확인하고 시작하기'}
                    </Button>
                </div>

                <p style={{ margin: '18px 0 0', color: '#90A4AE', fontSize: 'var(--ui-text-xs)', lineHeight: 1.6 }}>
                    확인한 시각은 기록에 남습니다. 아직 학생 동의서를 받지 않았다면 로그아웃한 뒤 학교 절차를 먼저 진행해 주세요.
                </p>
            </Card>
        </div>
    );
};

export default StudentConsentGate;
