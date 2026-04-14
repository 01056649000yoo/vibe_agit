import React, { useEffect } from 'react';
import Button from '../common/Button';

/**
 * 서비스 특징 소개 모달 ✨
 */
const GUIDE_HELPER_URL = 'https://helper.xn--vz0ba242ncqcba79xhwx.site/';

const GUIDE_FEATURES = [
    {
        icon: '🤖',
        title: 'AI 질문 생성',
        description: '주제에 맞는 질문 카드와 입력창을 AI가 자동으로 구성합니다.'
    },
    {
        icon: '🧱',
        title: '글감 빌드업',
        description: '아이들은 질문에 답하며 자연스럽게 글의 재료를 모읍니다.'
    },
    {
        icon: '💬',
        title: '교사 실시간 피드백',
        description: '선생님은 아이들이 모은 글감을 확인하고 바로 조언해 줄 수 있습니다.'
    },
    {
        icon: '📝',
        title: '글쓰기 완성',
        description: '모아진 글감을 바탕으로 끄적끄적아지트에서 한편의 글을 완성합니다.'
    }
];

const FeaturesModal = ({ isOpen, onClose, mode = 'features' }) => {
    // Esc 키 누르면 닫기
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    const isGuideMode = mode === 'guide';

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
            animation: 'fadeIn 0.3s ease-out'
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'white',
                borderRadius: '32px',
                width: '100%',
                maxWidth: '720px', // 600px에서 20% 늘림
                maxHeight: '90vh',
                overflowY: 'auto',
                position: 'relative',
                padding: '40px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                animation: 'slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }} onClick={e => e.stopPropagation()}>

                {/* 닫기 버튼 */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '20px',
                        right: '25px',
                        background: 'none',
                        border: 'none',
                        fontSize: '1.5rem',
                        cursor: 'pointer',
                        color: '#94A3B8'
                    }}
                >✕</button>

                {isGuideMode ? (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                            <div style={{ fontSize: '3.5rem', marginBottom: '15px' }}>✍️</div>
                            <h2 style={{
                                fontSize: '2rem',
                                fontWeight: '900',
                                color: '#1E293B',
                                marginBottom: '10px',
                                lineHeight: '1.35'
                            }}>
                                글쓰기 어려워 , 끄적끄적아지트 길잡이
                            </h2>
                            <p style={{ color: '#C2410C', fontSize: '1.05rem', fontWeight: '700', margin: '0 0 14px 0' }}>
                                "글쓰기가 막막한 아이들에게 AI가 질문을 건넵니다."
                            </p>
                            <p style={{ color: '#64748B', fontSize: '1rem', lineHeight: '1.7', wordBreak: 'keep-all', margin: 0 }}>
                                교사가 주제를 던지면, AI가 맞춤형 질문 카드를 생성하여 아이들이 풍성한 글감을 찾도록 도와주는 스마트 글쓰기 도우미입니다.
                            </p>
                        </div>

                        <div style={{ marginBottom: '16px', color: '#7C2D12', fontSize: '1.05rem', fontWeight: '900' }}>
                            🌟 핵심 기능
                        </div>

                        <div style={{ display: 'grid', gap: '18px', marginBottom: '35px' }}>
                            {GUIDE_FEATURES.map((section) => (
                                <div
                                    key={section.title}
                                    style={{
                                        padding: '24px',
                                        borderRadius: '24px',
                                        background: '#FFF9F2',
                                        border: '1px solid #FED7AA'
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                        <div style={{ fontSize: '2rem', lineHeight: 1 }}>{section.icon}</div>
                                        <div>
                                            <h4 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: '#7C2D12', fontWeight: '800' }}>
                                                {section.title}
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.96rem', color: '#9A3412', lineHeight: '1.7', wordBreak: 'keep-all' }}>
                                                {section.description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                            <div style={{ fontSize: '3.5rem', marginBottom: '15px' }}>🏠</div>
                            <h2 style={{
                                fontSize: '2rem',
                                fontWeight: '900',
                                color: '#1E293B',
                                marginBottom: '10px'
                            }}>
                                끄적끄적 아지트는?
                            </h2>
                            <p style={{ color: '#64748B', fontSize: '1.1rem' }}>
                                아이들의 생각이 글이 되고, 글이 성장판이 되는 공간
                            </p>
                        </div>

                        <div style={{ display: 'grid', gap: '20px', marginBottom: '35px' }}>
                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                padding: '24px',
                                borderRadius: '24px',
                                background: 'linear-gradient(135deg, #F0F7FF 0%, #E0EFFF 100%)',
                                alignItems: 'center',
                                border: '1px solid #BAE0FF'
                            }}>
                                <div style={{ fontSize: '2.8rem' }}>🤖</div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#0050B3', fontWeight: '800' }}>
                                        AI 맞춤형 글쓰기 통합 플랫폼
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#003A8C', lineHeight: '1.6', wordBreak: 'keep-all' }}>
                                        AI를 활용한 <strong>핵심 질문 설계</strong>를 통해 글쓰기를 지원하고, <strong>지도교사의 AI 맞춤 피드백 설정</strong>에 따라 글쓰기의 시작부터 완성까지 AI와 함께 체계적으로 지도합니다.
                                    </p>
                                </div>
                            </div>

                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                padding: '24px',
                                borderRadius: '24px',
                                background: 'linear-gradient(135deg, #F6FFED 0%, #D9F7BE 100%)',
                                alignItems: 'center',
                                border: '1px solid #B7EB8F'
                            }}>
                                <div style={{ fontSize: '2.8rem' }}>🛡️</div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#237804', fontWeight: '800' }}>
                                        든든한 AI 보안관과 전용 소셜 공간
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#135200', lineHeight: '1.6', wordBreak: 'keep-all' }}>
                                        <strong>AI 보안관</strong>이 학생 상호간의 댓글을 실시간으로 필터링하여 친구들과 안심하고 의견을 나눌 수 있는 건강하고 따뜻한 소통 문화를 보장합니다.
                                    </p>
                                </div>
                            </div>

                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                padding: '24px',
                                borderRadius: '24px',
                                background: 'linear-gradient(135deg, #FFF0F6 0%, #FFD6E7 100%)',
                                alignItems: 'center',
                                border: '1px solid #FFADD2'
                            }}>
                                <div style={{ fontSize: '2.8rem' }}>🐲</div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#C41D7F', fontWeight: '800' }}>
                                        즐거움이 가득한 게이미피케이션
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#9E1068', lineHeight: '1.6', wordBreak: 'keep-all' }}>
                                        <strong>드래곤 아지트</strong>, <strong>아지트 온 클래스</strong> 등 흥미진진한 게이미피케이션 콘텐츠가 학생들의 글쓰기 여정을 더욱 즐겁고 활기차게 만들어 줍니다. (다양한 콘텐츠 추가 예정 🚀)
                                    </p>
                                </div>
                            </div>

                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                padding: '24px',
                                borderRadius: '24px',
                                background: 'linear-gradient(135deg, #F9F0FF 0%, #F3E0FF 100%)',
                                alignItems: 'center',
                                border: '1px solid #D3ADF7'
                            }}>
                                <div style={{ fontSize: '2.8rem' }}>📝</div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#531DAB', fontWeight: '800' }}>
                                        수업-과정-평가가 일원화된 전문 교육 모델
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#391085', lineHeight: '1.6', wordBreak: 'keep-all' }}>
                                        처음 글과 고쳐 쓴 글의 <strong>성장 비교</strong>부터 <strong>평가 루브릭</strong>을 활용한 전문적인 분석까지, 축적된 데이터를 기반으로 <strong>학교 생활기록부 도움 자료</strong>를 자동 생성하여 교수 학습의 전 과정을 완벽히 지원합니다.
                                    </p>
                                </div>
                            </div>

                            <div style={{
                                display: 'flex',
                                gap: '20px',
                                padding: '24px',
                                borderRadius: '24px',
                                background: 'linear-gradient(135deg, #FFF7E6 0%, #FFE7BA 100%)',
                                alignItems: 'center',
                                border: '1px solid #FFD591'
                            }}>
                                <div style={{ fontSize: '2.8rem' }}>📚</div>
                                <div>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', color: '#874D00', fontWeight: '800' }}>
                                        데이터 기반의 학급 문집 출판 지원
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.95rem', color: '#613400', lineHeight: '1.6', wordBreak: 'keep-all' }}>
                                        학생들의 소중한 글을 모아 <strong>엑셀이나 구글 문서</strong>로 완벽하게 정리해 드립니다. 학급 문집이나 개인 책 출판이 클릭 몇 번으로 현실이 됩니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                <div style={{ textAlign: 'center' }}>
                    {isGuideMode ? (
                        <div>
                            <a
                                href={GUIDE_HELPER_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ textDecoration: 'none' }}
                            >
                                <Button
                                    style={{ width: '100%', borderRadius: '20px', height: '56px', fontSize: '1.1rem' }}
                                >
                                    끄적끄적아지트 길잡이 바로가기
                                </Button>
                            </a>
                        </div>
                    ) : (
                        <Button
                            onClick={onClose}
                            style={{ width: '100%', borderRadius: '20px', height: '56px', fontSize: '1.1rem' }}
                        >
                            아지트 구경하러 가기 🌈
                        </Button>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateY(30px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
};

export default FeaturesModal;
