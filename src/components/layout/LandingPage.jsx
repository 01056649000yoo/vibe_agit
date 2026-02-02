import React, { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
const LandingPage = ({ onStudentLoginClick }) => {
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

            <div style={{ marginTop: '2rem' }}>
                <p style={{ fontSize: '0.9rem', color: '#999', fontWeight: '500', marginBottom: '1rem' }}>
                    나만의 글쓰기 아지트로 입장해요 🏠
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', fontSize: '0.85rem' }}>
                    <a
                        href="https://moduai.notion.site/_-2fb79937a97380148743fa935dfa768c?source=copy_link"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#6366F1', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        📚 교사용 가이드
                    </a>
                    <span style={{ color: '#DDD' }}>|</span>
                    <a
                        href="https://moduai.notion.site/_-2fb79937a97380c99dacd9fe11182473?source=copy_link"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#F59E0B', textDecoration: 'none', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        📖 학생용 가이드
                    </a>
                </div>
            </div>
        </Card>
    );
};

export default LandingPage;
