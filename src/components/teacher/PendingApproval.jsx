import React from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';

const PendingApproval = ({ onLogout }) => {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh',
            background: '#F0F2F5'
        }}>
            <Card style={{ maxWidth: '500px', width: '90%', padding: '40px', textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '20px' }}>⏳</div>
                <h2 style={{ color: '#2C3E50', marginBottom: '16px', fontWeight: '900' }}>가입 승인 대기 중</h2>
                <p style={{ color: '#546E7A', lineHeight: '1.6', marginBottom: '30px', fontSize: '1.1rem' }}>
                    선생님, 가입 신청이 완료되었습니다.<br />
                    <strong>관리자 승인 후</strong> 서비스를 이용하실 수 있습니다.<br />
                    승인이 완료되면 다시 로그인해 주세요. 💫
                </p>

                <div style={{
                    background: '#E3F2FD',
                    padding: '16px',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    color: '#1565C0',
                    marginBottom: '30px',
                    textAlign: 'left'
                }}>
                    <strong>💡 안내</strong><br />
                    승인이 늦어질 경우 아래 메일로 문의해 주세요.<br />
                    <span style={{ fontWeight: 'bold', display: 'block', marginTop: '4px' }}>📧 yshgg@naver.com</span>
                </div>

                <Button
                    onClick={onLogout}
                    size="lg"
                    style={{ width: '100%', background: '#78909C' }}
                >
                    로그아웃 및 홈으로
                </Button>
            </Card>
        </div>
    );
};

export default PendingApproval;
