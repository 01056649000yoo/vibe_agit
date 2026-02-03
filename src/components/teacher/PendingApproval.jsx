import React, { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';

const PendingApproval = ({ onLogout }) => {
    const [copiedEmail, setCopiedEmail] = useState(false);
    const [copiedForm, setCopiedForm] = useState(false);

    const handleCopyEmail = () => {
        navigator.clipboard.writeText('yshgg@naver.com');
        setCopiedEmail(true);
        setTimeout(() => setCopiedEmail(false), 2000);
    };

    const handleCopyForm = () => {
        const formText = `[끄적끄적아지트 가입 승인 신청]
1. 성함: 
2. 재직학교: 
3. 지도학년: 
4. 하고싶은말: `;
        navigator.clipboard.writeText(formText);
        setCopiedForm(true);
        setTimeout(() => setCopiedForm(false), 2000);
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
            padding: '20px'
        }}>
            <Card style={{
                maxWidth: '550px',
                width: '100%',
                padding: '40px',
                textAlign: 'center',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                borderRadius: '32px'
            }}>
                <div style={{ fontSize: '4.5rem', marginBottom: '24px' }}>🏠</div>
                <h2 style={{ color: '#1E1B4B', marginBottom: '16px', fontWeight: '900', fontSize: '1.8rem' }}>
                    끄적끄적아지트에 오신 것을 환영합니다!
                </h2>

                <p style={{ color: '#4338CA', lineHeight: '1.7', marginBottom: '32px', fontSize: '1.05rem' }}>
                    선생님, 반가워요! 아지트를 이용하시려면<br />
                    <strong>관리자의 계정 승인</strong>이 필요합니다.<br /><br />
                    아래 정보를 복사하여 메일로 보내주시면<br />
                    확인 후 신속하게 승인해 드릴게요! 🗝️
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
                    {/* 메일 주소 복사 */}
                    <div
                        onClick={handleCopyEmail}
                        style={{
                            background: '#FFFFFF',
                            padding: '20px',
                            borderRadius: '20px',
                            border: copiedEmail ? '2px solid #10B981' : '1px solid #E0E7FF',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'left',
                            position: 'relative',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                        }}
                    >
                        <span style={{ fontSize: '0.8rem', color: '#6366F1', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                            1. 보낼 메일 주소
                        </span>
                        <div style={{ fontSize: '1.2rem', color: '#1E293B', fontWeight: 'bold' }}>
                            yshgg@naver.com
                        </div>
                        <div style={{
                            position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.8rem', color: copiedEmail ? '#10B981' : '#94A3B8', fontWeight: 'bold'
                        }}>
                            {copiedEmail ? '복사 완료! ✅' : '복사하기 📋'}
                        </div>
                    </div>

                    {/* 양식 복사 */}
                    <div
                        onClick={handleCopyForm}
                        style={{
                            background: '#FFFFFF',
                            padding: '20px',
                            borderRadius: '20px',
                            border: copiedForm ? '2px solid #10B981' : '1px solid #E0E7FF',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            textAlign: 'left',
                            position: 'relative',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
                        }}
                    >
                        <span style={{ fontSize: '0.8rem', color: '#6366F1', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                            2. 신청 양식 (복사 후 메일에 붙여넣기)
                        </span>
                        <div style={{ fontSize: '0.95rem', color: '#64748B', lineHeight: '1.5', fontWeight: '500' }}>
                            • 성함 / 재직학교<br />
                            • 지도학년 / 하고싶은말
                        </div>
                        <div style={{
                            position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)',
                            fontSize: '0.8rem', color: copiedForm ? '#10B981' : '#94A3B8', fontWeight: 'bold'
                        }}>
                            {copiedForm ? '양식 복사 완료! ✅' : '양식 복사하기 📋'}
                        </div>
                    </div>
                </div>

                <Button
                    onClick={onLogout}
                    size="lg"
                    style={{
                        width: '100%',
                        background: '#6366F1',
                        padding: '18px',
                        fontWeight: 'bold',
                        borderRadius: '20px',
                        boxShadow: '0 10px 15px -3px rgba(99, 102, 241, 0.3)',
                        fontSize: '1.1rem'
                    }}
                >
                    홈으로 돌아가기
                </Button>
            </Card>

            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(-5px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                `}
            </style>
        </div>
    );
};

export default PendingApproval;
