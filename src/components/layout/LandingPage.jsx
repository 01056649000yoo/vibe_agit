import React, { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import Modal from '../common/Modal';
import PrivacyPolicy from './PrivacyPolicy';
import TermsOfService from './TermsOfService';

/**
 * 역할: 로그인 전 초기 랜딩 페이지
 * props: 
 *  - onStudentLoginClick: 학생 로그인 모드로 전환하는 함수
 */
const LandingPage = ({ onStudentLoginClick }) => {
    const [policyModal, setPolicyModal] = useState({ open: false, type: null });

    const openModal = (type) => setPolicyModal({ open: true, type });
    const closeModal = () => setPolicyModal({ open: false, type: null });

    return (
        <Card style={{
            textAlign: 'center',
            padding: '2.5rem',
            maxWidth: '500px',
            animation: 'fadeIn 0.8s ease-out'
        }}>
            {/* 메인 비주얼 이미지 */}
            <div style={{
                marginBottom: '2rem',
                borderRadius: '24px',
                overflow: 'hidden',
                boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
                border: '4px solid white'
            }}>
                <img
                    src="/assets/og-image.webp"
                    alt="끄적끄적 아지트"
                    style={{ width: '100%', display: 'block' }}
                />
            </div>

            <p style={{
                color: 'var(--text-secondary)',
                fontSize: '1.2rem',
                marginBottom: '2.5rem',
                lineHeight: '1.7',
                wordBreak: 'keep-all'
            }}>
                우리의 소중한 생각들이 무럭무럭 자라나는<br />
                <strong style={{ color: 'var(--primary-color)' }}>따뜻한 글쓰기 공간</strong>에 오신 걸 환영해요!
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <Button
                    onClick={() => supabase.auth.signInWithOAuth({
                        provider: 'google',
                        options: { redirectTo: window.location.origin }
                    })}
                    style={{
                        width: '100%',
                        background: '#FFFFFF',
                        color: '#757575',
                        border: '1px solid #ddd',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                        height: '56px',
                        fontSize: '1.05rem'
                    }}
                >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="G" style={{ width: '18px', marginRight: '12px' }} />
                    선생님 구글 로그인
                </Button>

                <Button
                    variant="secondary"
                    size="lg"
                    style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, #FBC02D 0%, #F9A825 100%)',
                        color: 'white',
                        height: '56px',
                        fontSize: '1.1rem',
                        fontWeight: '600',
                        boxShadow: '0 4px 15px rgba(251, 192, 45, 0.3)'
                    }}
                    onClick={onStudentLoginClick}
                >
                    🎒 학생 로그인 (코드 입력)
                </Button>
            </div>

            <p style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#999', fontWeight: '500' }}>
                나만의 글쓰기 아지트로 입장해요 🏠
            </p>

            {/* 구글 브랜딩용 Footer 링크 추가 */}
            <div style={{
                marginTop: '1.5rem',
                paddingTop: '1.5rem',
                borderTop: '1px solid #F1F3F5',
                display: 'flex',
                justifyContent: 'center',
                gap: '20px'
            }}>
                <button
                    onClick={() => openModal('privacy')}
                    style={{ background: 'none', border: 'none', color: '#ADB5BD', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }}
                >
                    개인정보처리방침
                </button>
                <button
                    onClick={() => openModal('terms')}
                    style={{ background: 'none', border: 'none', color: '#ADB5BD', fontSize: '0.8rem', cursor: 'pointer', outline: 'none' }}
                >
                    이용약관
                </button>
            </div>

            {/* 정책 모달 */}
            <Modal
                isOpen={policyModal.open}
                onClose={closeModal}
                title={policyModal.type === 'privacy' ? '개인정보 처리방침 🛡️' : '서비스 이용약관 📜'}
                maxWidth="600px"
            >
                {policyModal.type === 'privacy' ? <PrivacyPolicy /> : <TermsOfService />}
            </Modal>
        </Card>
    );
};

export default LandingPage;
