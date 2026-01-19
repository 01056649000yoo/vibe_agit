import React, { useState } from 'react';
import { motion } from 'framer-motion';
import GeminiGuideModal from './GeminiGuideModal';

const UsageGuide = ({ isMobile }) => {
    const [showGeminiGuide, setShowGeminiGuide] = useState(false);

    const scrollToSection = (id) => {
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const sections = [
        { id: 'class-management', title: '🏫 학급 및 학생 관리', emoji: '🏫' },
        { id: 'mission-writing', title: '✍️ 미션 및 글쓰기', emoji: '✍️' },
        { id: 'playground', title: '🎢 놀이터 및 게임 설정', emoji: '🎢' },
        { id: 'points-dragon', title: '💰 포인트 및 드래곤', emoji: '💰' },
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
                    끄적끄적 아지트와 함께 즐거운 글쓰기 교실, 지금 시작해보세요! ✨
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

                {/* [추가] AI 피드백 섹션으로 바로가기 버튼 */}
                <button
                    onClick={() => scrollToSection('ai-feedback')}
                    style={{
                        textAlign: 'left',
                        padding: '12px 20px',
                        background: '#E8F0FE', // 구별되는 배경색
                        border: '1px solid #4285F4',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        fontSize: '0.95rem',
                        fontWeight: '700',
                        color: '#4285F4', // 구글 블루
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-2px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(66, 133, 244, 0.2)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                >
                    🔑 Gemini API 키 발급 방법
                </button>
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
                <div style={cardStyle}>
                    <p><strong>3. 포인트 직접 지급 및 내역 확인</strong><br />
                        특정 학생을 칭찬하거나 격려하고 싶다면, 학생 목록에서 <strong>번개(⚡) 버튼</strong>을 눌러 포인트를 직접 지급할 수 있습니다. <br />
                        학생 이름을 클릭하여 여러 명을 선택한 후 <strong>'포인트 일괄 지급'</strong>을 할 수도 있습니다. <br />
                        <strong>두루마리(📜) 아이콘</strong>을 누르면 해당 학생의 포인트 획득/차감 내역을 상세하게 조회할 수 있습니다.</p>
                </div>
            </section>

            {/* 섹션 2: 미션 및 글쓰기 */}
            <section id="mission-writing" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[1].title}
                </h2>
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#3498DB' }}>📝 미션 관리</h3>
                    <p><strong>• 미션 생성:</strong> '새 미션 만들기' 버튼을 눌러 주제, 가이드 사진, 최소 글자 수, 보상 포인트를 설정합니다.</p>
                    <p><strong>• 수정 및 삭제:</strong> 만들어진 미션 카드의 우측 상단 메뉴(⋮)를 눌러 내용을 수정하거나 삭제할 수 있습니다.</p>
                    <p><strong>• 미션 보관(아카이빙):</strong>
                        <br />학기가 끝나거나 완료된 미션은 '보관함으로 이동'을 선택하세요.
                        보관된 미션은 학생들 화면에서 사라지며, 선생님의 <strong>[글 보관함]</strong> 탭에 안전하게 저장됩니다. 나중에 언제든지 다시 꺼내볼 수 있습니다.</p>
                </div>

                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#9B59B6' }}>🧐 글 검토 및 피드백</h3>
                    <p><strong>1. 제출된 글 확인:</strong> 미션 카드를 클릭하면 제출된 글 목록이 나타납니다. 아직 제출하지 않은 학생 명단도 함께 확인할 수 있습니다.</p>
                    <p><strong>2. 승인 및 회수:</strong>
                        <br />- <strong>승인(✅):</strong> 잘 쓴 글은 승인을 눌러 완료 처리합니다.
                        <br />- <strong>재작성 요청(↩️):</strong> 내용 보완이 필요하다면 '다시 쓰기'를 요청하여 포인트를 회수하고 글을 돌려보낼 수 있습니다.
                    </p>
                    <p><strong>3. 일괄 처리 기능:</strong> 글이 너무 많을 때는 '전체 선택' 후 <strong>'일괄 승인'</strong>을 하여 시간을 절약하세요.</p>
                </div>

                <div id="ai-feedback" style={{ ...highlightStyle, scrollMarginTop: '100px' }}>
                    🤖 <strong>AI 피드백 활용 (PRO):</strong>
                    <br />
                    미확인 글에 대해 <strong>'AI 피드백 일괄 생성'</strong> 버튼을 누르면, 선생님이 설정한 API 키를 사용하여 AI가 모든 글을 분석하고 맞춤형 조언을 댓글로 남겨줍니다.
                    <br /><br />
                    ⚠️ <strong>주의사항 (사용량 제한 안내):</strong><br />
                    현재 적용된 모델은 <strong>Gemini 2.5 Flash Lite</strong>입니다. <br />
                    구글 정책에 따라 <strong>분당 최대 10회, 하루 최대 20회</strong>의 무료 사용량 제한이 있습니다. <br />
                    한 번에 너무 많은 글을 처리하면 오류가 발생할 수 있으니, <strong>조금씩 나누어 진행</strong>해주세요.
                    <br /><br />
                    <button
                        onClick={() => setShowGeminiGuide(true)}
                        style={{
                            background: '#4285F4',
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '8px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            marginTop: '8px',
                            fontSize: '0.9rem'
                        }}
                    >
                        🔑 Gemini API 키 발급 방법 자세히 보기
                    </button>
                </div>
            </section>

            <GeminiGuideModal isOpen={showGeminiGuide} onClose={() => setShowGeminiGuide(false)} />

            {/* 섹션 3: 놀이터 및 게임 설정 */}
            <section id="playground" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[2].title}
                </h2>
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#E74C3C' }}>⚙️ 드래곤 게임 난이도 설정</h3>
                    <p><strong>1. 먹이 주기 비용 (Feed Cost)</strong><br />
                        학생들이 드래곤에게 간식을 줄 때 차감될 포인트를 설정합니다. (기본: 7포인트) <br />
                        비용을 높이면 학생들이 포인트를 더 아껴쓰며 글쓰기 동기가 강화될 수 있습니다.</p>
                </div>
                <div style={cardStyle}>
                    <p><strong>2. 관심 필요 주기 (Degeneration Days)</strong><br />
                        학생이 며칠 동안 드래곤을 돌보지 않으면 레벨이 떨어질지 설정합니다. (기본: 3일) <br />
                        이 기간을 짧게 설정하면 학생들이 더 자주 접속하여 활동하게 유도할 수 있습니다.</p>
                </div>
                <div style={highlightStyle}>
                    🎮 <strong>게임 밸런스 팁:</strong> 학급 분위기에 맞춰 난이도를 조절해보세요. 너무 어렵지 않게 시작하는 것이 학생들의 흥미 유발에 좋습니다!
                </div>
            </section>

            {/* 섹션 4: 포인트 및 드래곤 */}
            <section id="points-dragon" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[3].title}
                </h2>
                <div style={cardStyle}>
                    <p><strong>1. 포인트 시스템</strong><br />
                        글을 1자 쓸 때마다 1포인트가 적립(최대 1000P)되며, 미션 완료 시 추가 보너스 점수가 부여됩니다. 이 포인트는 성실함의 척도가 됩니다.</p>
                </div>
                <div style={highlightStyle}>
                    🐉 <strong>드래곤 키우기:</strong>
                    <br />
                    학생들은 글쓰기로 모은 포인트로 먹이를 주어 드래곤을 레벨업시킬 수 있습니다.
                    레벨이 오르면 드래곤의 외형이 멋지게 변하며(알 ➜ 해츨링 ➜ 성체), <strong>'상점'</strong>에서 가구와 배경을 구매해 아지트를 꾸밀 수도 있습니다.
                </div>
                <div style={cardStyle}>
                    <p><strong>2. 드래곤 성장 시스템</strong><br />
                        글을 꾸준히 쓰고 포인트를 모을수록 학생들의 드래곤은 더 멋진 모습으로 레벨업합니다. 친구들의 아지트에 방문하여 서로의 드래곤을 구경할 수도 있습니다.</p>
                </div>
            </section>

            {/* 섹션 5: 학습 분석 활용 */}
            <section id="analysis" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[4].title}
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
