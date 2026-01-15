import React from 'react';
import { motion } from 'framer-motion';

const UsageGuide = ({ isMobile }) => {
    const scrollToSection = (id) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const sections = [
        { id: 'class-management', title: '🏫 학급 및 학생 관리', emoji: '🏫' },
        { id: 'mission-writing', title: '✍️ 미션 및 글쓰기', emoji: '✍️' },
        { id: 'points-dragon', title: '💰 포인트 및 드래곤 키우기', emoji: '💰' },
        { id: 'analysis', title: '📊 학습 분석 활용', emoji: '📊' },
    ];

    const containerStyle = {
        maxWidth: '900px',
        margin: '0 auto',
        padding: isMobile ? '20px' : '40px',
        background: 'white',
        borderRadius: '32px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.05)',
        color: '#2C3E50',
        lineHeight: '1.8',
        fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, Roboto, sans-serif"
    };

    const sectionStyle = {
        marginBottom: '60px',
        scrollMarginTop: '100px'
    };

    const cardStyle = {
        background: '#F8F9FA',
        padding: '24px',
        borderRadius: '20px',
        border: '1px solid #E9ECEF',
        marginTop: '16px'
    };

    const highlightStyle = {
        background: '#E3F2FD',
        padding: '16px 20px',
        borderRadius: '16px',
        borderLeft: '5px solid #3498DB',
        margin: '20px 0',
        fontWeight: '500'
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={containerStyle}
        >
            <div style={{ textAlign: 'center', marginBottom: '50px' }}>
                <h1 style={{ fontSize: isMobile ? '2rem' : '2.5rem', fontWeight: '900', marginBottom: '16px', color: '#2C3E50' }}>
                    📖 앱 사용법 가이드
                </h1>
                <p style={{ fontSize: '1.1rem', color: '#7F8C8D' }}>
                    바이브(VIBE)를 통한 즐거운 글쓰기 교실, 지금 시작해보세요! ✨
                </p>
            </div>

            {/* 목차 (Index) */}
            <div style={{
                background: '#F1F3F5',
                padding: '24px',
                borderRadius: '24px',
                marginBottom: '50px',
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '12px'
            }}>
                {sections.map(section => (
                    <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        style={{
                            textAlign: 'left',
                            padding: '12px 20px',
                            background: 'white',
                            border: '1px solid #DEE2E6',
                            borderRadius: '12px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '0.95rem',
                            fontWeight: '700',
                            color: '#495057',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.borderColor = '#3498DB';
                            e.currentTarget.style.color = '#3498DB';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.borderColor = '#DEE2E6';
                            e.currentTarget.style.color = '#495057';
                            e.currentTarget.style.transform = 'translateY(0)';
                        }}
                    >
                        {section.title}
                    </button>
                ))}
            </div>

            {/* 섹션 1: 학급 및 학생 관리 */}
            <section id="class-management" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[0].title}
                </h2>
                <div style={cardStyle}>
                    <p><strong>1. 학급 생성하기</strong><br />
                        [관리 설정] 탭에서 '새 학급 만들기'를 통해 학급을 생성할 수 있습니다. 학급 이름과 학년 등을 설정하여 나만의 교실을 만드세요!</p>
                </div>
                <div style={highlightStyle}>
                    💡 <strong>초대 코드 크게 보기:</strong> 학생들에게 가입을 안내할 때 [관리 설정]의 학급 카드에서 '초대 코드'를 클릭하면 화면에 크게 띄울 수 있어요.
                </div>
                <div style={cardStyle}>
                    <p><strong>2. 학생 등록 및 계정 관리</strong><br />
                        학생 명단에 이름을 입력하여 일괄 등록할 수 있습니다. 각 학생에게는 고유한 <strong>8자리 접속코드</strong>가 발급되며, 학생들은 이 코드로 별도의 비밀번호 없이 로그인합니다.</p>
                </div>
            </section>

            {/* 섹션 2: 미션 및 글쓰기 */}
            <section id="mission-writing" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[1].title}
                </h2>
                <div style={cardStyle}>
                    <p><strong>1. 미션 출제하기</strong><br />
                        [학급 현황] 탭의 '미션 관리'에서 새로운 글쓰기 미션을 만들 수 있습니다.
                        주제, 사진 가이드, 최소 글자 수, 그리고 보상 포인트를 설정해보세요.</p>
                </div>
                <div style={highlightStyle}>
                    🤖 <strong>AI 피드백 활용:</strong> [관리 설정]에서 Gemini API 키를 등록하면, 학생들이 글을 제출하자마자 AI가 선생님이 설정한 기준에 맞춰 실시간 피드백을 제공합니다.
                </div>
                <div style={cardStyle}>
                    <p><strong>2. 학생들의 글쓰기</strong><br />
                        학생들은 자신의 대시보드에서 활성화된 미션을 확인하고 글을 씁니다. 글자 수 달성 여부를 실시간으로 확인하며 성취감을 느낄 수 있습니다.</p>
                </div>
                <div style={cardStyle}>
                    <p><strong>3. 승인 및 재제출 요청</strong><br />
                        제출된 글은 선생님이 검토할 수 있습니다. <strong>일괄 승인</strong> 기능으로 모든 글을 빠르게 확인 처리하거나, 부족한 글은 <strong>다시 제출</strong>하도록 요청하여 학생들이 글을 다듬을 수 있게 지도할 수 있습니다.</p>
                </div>
            </section>

            {/* 섹션 3: 포인트 및 드래곤 키우기 */}
            <section id="points-dragon" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[2].title}
                </h2>
                <div style={cardStyle}>
                    <p><strong>1. 포인트 획득 및 지급</strong><br />
                        글을 제출하면 설정된 기본 포인트가 지급되며, 글자 수를 초과하면 보너스 포인트가 추가됩니다. 선생님이 '학생 관리' 메뉴에서 직접 칭찬 포인트를 주거나 차감할 수도 있습니다.</p>
                </div>
                <div style={highlightStyle}>
                    🐉 <strong>드래곤 아지트 꾸미기:</strong> 학생들은 모은 포인트로 '상점'에서 가구와 배경을 구매하여 자신만의 드래곤 아지트를 꾸밀 수 있습니다.
                </div>
                <div style={cardStyle}>
                    <p><strong>2. 드래곤 성장 시스템</strong><br />
                        글을 꾸준히 쓰고 포인트를 모을수록 학생들의 드래곤은 더 멋진 모습으로 성장하며 글쓰기 동기를 부여합니다.</p>
                </div>
            </section>

            {/* 섹션 4: 학습 분석 활용 */}
            <section id="analysis" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[3].title}
                </h2>
                <div style={cardStyle}>
                    <p><strong>1. 학급 종합 분석판</strong><br />
                        [학급 현황] 상단에서 우리 학급의 평균 글자 수와 오늘 미션 완료율을 한눈에 확인하세요.</p>
                </div>
                <div style={highlightStyle}>
                    📈 <strong>열정 작가 TOP 5:</strong> 가장 많은 글을 쓴 학생들의 랭킹이 표시되어 자연스러운 경쟁과 동기부여를 유도합니다.
                </div>
                <div style={cardStyle}>
                    <p><strong>2. 미제출자 확인</strong><br />
                        '미제출 알림' 섹션을 통해 아직 미션을 수행하지 않은 학생들을 빠르게 파악하고 지도할 수 있습니다.</p>
                </div>
            </section>

            <footer style={{ textAlign: 'center', padding: '40px 0', borderTop: '1px solid #EEE', color: '#ADB5BD', fontSize: '0.9rem' }}>
                &copy; 2026 VIBE - 선생님의 행복한 글쓰기 교실을 응원합니다.
            </footer>
        </motion.div>
    );
};

export default UsageGuide;
