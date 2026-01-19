import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';

const GeminiGuideModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const steps = [
        {
            title: "1. Google AI Studio 접속",
            desc: "아래 버튼을 눌러 Google AI Studio의 API 키 관리 페이지로 이동합니다.",
            action: (
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-block', textDecoration: 'none' }}>
                    <Button style={{ background: '#4285F4', color: 'white', fontWeight: 'bold' }}>
                        🔗 Google AI Studio 바로가기
                    </Button>
                </a>
            )
        },
        {
            title: "2. 구글 계정 로그인 및 약관 동의",
            desc: "사용하시는 구글 계정으로 로그인하고, 처음 접속하셨다면 이용 약관에 동의해주세요."
        },
        {
            title: "3. API 키 생성 버튼 클릭",
            desc: "화면 좌측 Dashboard 클릭 후 우측상단 'Create API key' 버튼을 클릭합니다.",
            emoji: "👆"
        },
        {
            title: "4. 새 프로젝트로 키 만들기",
            desc: "팝업이 뜨면 'Create API key in a new project'를 선택합니다. (이미 프로젝트가 있다면 기존 프로젝트를 선택해도 됩니다.)",
            emoji: "🆕"
        },
        {
            title: "5. API 키 복사",
            desc: "생성된 키(AIza...로 시작하는 긴 문자열)를 복사합니다. ⚠️ 이 키는 타인에게 노출되지 않도록 주의하세요!",
            emoji: "📋"
        },
        {
            title: "6. 앱에 등록",
            desc: "복사한 키를 우리 앱의 [설정] 메뉴 > [기본 설정] > [Gemini API 키] 입력칸에 붙여넣고 저장하면 끝!",
            emoji: "✅"
        }
    ];

    return (
        <AnimatePresence>
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                zIndex: 9999, backdropFilter: 'blur(4px)'
            }} onClick={onClose}>
                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    style={{
                        background: 'white',
                        width: '90%',
                        maxWidth: '600px',
                        maxHeight: '90vh',
                        borderRadius: '24px',
                        padding: '32px',
                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        textAlign: 'left'
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid #eee', paddingBottom: '16px' }}>
                        <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#2C3E50', fontWeight: '800' }}>
                            🔑 Gemini API 키 무료 발급 가이드
                        </h2>
                        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>✖</button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {steps.map((step, index) => (
                            <div key={index} style={{
                                background: '#F8F9FA',
                                padding: '20px',
                                borderRadius: '16px',
                                border: '1px solid #E9ECEF'
                            }}>
                                <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem', color: '#3498DB' }}>
                                    {step.emoji} {step.title}
                                </h3>
                                <p style={{ margin: '0 0 12px 0', color: '#495057', lineHeight: '1.5' }}>
                                    {step.desc}
                                </p>
                                {step.action && <div style={{ marginTop: '10px' }}>{step.action}</div>}
                            </div>
                        ))}
                    </div>

                    <div style={{ marginTop: '32px', textAlign: 'center' }}>
                        <Button
                            onClick={onClose}
                            style={{
                                background: '#3498DB',
                                color: 'white',
                                padding: '12px 32px',
                                fontSize: '1rem',
                                borderRadius: '50px',
                                fontWeight: 'bold'
                            }}
                        >
                            확인했습니다! 👌
                        </Button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default GeminiGuideModal;
