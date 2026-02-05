import React, { useEffect } from 'react';
import Button from '../common/Button';

/**
 * 서비스 특징 소개 모달 ✨
 */
const FeaturesModal = ({ isOpen, onClose }) => {
    // Esc 키 누르면 닫기
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

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
                    {/* 특징 1: AI 통합 지도 */}
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

                    {/* 특징 2: AI 보안관 */}
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

                    {/* 특징 3: 게이미피케이션 */}
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

                    {/* 특징 4: 수업-과정-평가 일원화 (추가된 내용) */}
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

                    {/* 특징 5: 출판 지원 */}
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

                <div style={{ textAlign: 'center' }}>
                    <Button
                        onClick={onClose}
                        style={{ width: '100%', borderRadius: '20px', height: '56px', fontSize: '1.1rem' }}
                    >
                        아지트 구경하러 가기 🌈
                    </Button>
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
