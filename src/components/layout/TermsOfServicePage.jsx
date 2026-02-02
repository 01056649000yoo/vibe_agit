import React from 'react';
import TermsOfService from './TermsOfService';
import Button from '../common/Button';
import { useNavigate } from 'react-router-dom';

/**
 * 서비스 이용약관 독립 페이지 (URL 접근용)
 */
const TermsOfServicePage = () => {
    const navigate = useNavigate();

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, var(--bg-primary) 0%, var(--bg-secondary) 100%)',
            padding: '2rem',
            boxSizing: 'border-box'
        }}>
            <div style={{
                maxWidth: '1200px',
                margin: '0 auto',
                background: 'white',
                borderRadius: '16px',
                padding: '2.5rem',
                boxShadow: '0 4px 20px rgba(0,0,0,0.08)'
            }}>
                {/* 헤더 */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '2rem',
                    paddingBottom: '1rem',
                    borderBottom: '2px solid var(--primary-color)'
                }}>
                    <h1 style={{
                        fontSize: '2rem',
                        color: 'var(--primary-color)',
                        margin: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        📜 서비스 이용약관
                    </h1>
                    <Button
                        variant="secondary"
                        onClick={() => navigate('/')}
                        style={{ minWidth: '100px' }}
                    >
                        ← 홈으로
                    </Button>
                </div>

                {/* 본문 */}
                <TermsOfService />

                {/* 하단 버튼 */}
                <div style={{
                    marginTop: '3rem',
                    paddingTop: '2rem',
                    borderTop: '1px solid #eee',
                    textAlign: 'center'
                }}>
                    <Button
                        onClick={() => navigate('/')}
                        style={{ minWidth: '200px' }}
                    >
                        홈으로 돌아가기
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default TermsOfServicePage;
