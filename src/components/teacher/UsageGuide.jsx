import React, { useState } from 'react';
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
        { id: 'playground', title: '🎢 놀이터 및 게임 설정', emoji: '🎢' },
        { id: 'points-dragon', title: '💰 포인트 및 드래곤기르기', emoji: '💰' },
        { id: 'evaluation', title: '🎯 학생 평가 및 AI쫑알이', emoji: '🎯' },
        { id: 'analysis', title: '📊 학급 분석 활용', emoji: '📊' },
        { id: 'book-publishing', title: '📚 학급 도서 출판', emoji: '📚' },
        { id: 'gpt-info', title: '🤖 GPT 인공지능 활용 안내', emoji: '🤖' },
        { id: 'realtime-guardian', title: '🛡️ 실시간 보안관 (학생 댓글 안전)', emoji: '🛡️' },
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


            </div>

            {/* 섹션 1: 학급 및 학생 관리 */}
            <section id="class-management" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[0].title}
                </h2>
                <div style={cardStyle}>
                    <p><strong>1. 학급 생성하기</strong><br />
                        [관리 설정] 탭에서 '새 학급 만들기'를 통해 학급을 생성할 수 있습니다. 학급 이름을 설정하여 나만의 교실을 만드세요!</p>
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
                <div style={cardStyle}>
                    <p><strong>4. 학생 삭제 및 복구</strong><br />
                        실수로 학생을 삭제하더라도 걱정하지 마세요! 학생 목록 우측의 <strong>쓰레기통(🗑️) 아이콘</strong>을 눌러 삭제한 학생은 바로 사라지지 않고 '복구함'으로 이동합니다. <br />
                        상단 헤더의 <strong>'♻️ 복구함'</strong> 버튼을 클릭하면 최근 3일 이내에 삭제한 학생 리스트를 확인하고 다시 명단으로 되돌릴 수 있습니다. (3일이 지나면 영구 삭제됩니다.)</p>
                </div>
            </section>

            {/* 섹션 2: 미션 및 글쓰기 */}
            <section id="mission-writing" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[1].title}
                </h2>
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#3498DB' }}>📝 미션 관리 및 핵심 질문 설계</h3>
                    <p><strong>• 미션 생성 및 태그 활용:</strong>
                        <br />'새 미션 만들기'를 통해 주제와 가이드를 설정합니다. <strong>#태그</strong>를 입력하면(예: #감사일기 #독후감) 나중에 같은 주제끼리 모아볼 수 있어 관리가 편리해집니다.
                    </p>
                    <p><strong>• 핵심 질문 설계 (Scaffolding):</strong>
                        <br />학생들이 글을 쓰기 전 생각을 정리할 수 있도록 <strong>[핵심 질문]</strong>을 3~5개 정도 미리 만들어주세요. 학생은 답변 후 내용을 본문에 바로 삽입하여 풍성한 글을 완성할 수 있습니다.
                        <br />(직접 만들기 어렵다면 <strong>'AI 질문 생성하기'</strong> 버튼을 눌러보세요! ✨)
                    </p>
                    <p><strong>• 미션 세부 설정 (통합):</strong>
                        <br />분량(글자/문단 수)과 포인트 보상(기본/보너스)을 한곳에서 조절합니다.
                        <br />- <strong>친구 댓글 허용:</strong> 켜두면 학생들이 서로 격려 댓글을 달 수 있고, 끄면 선생님만 볼 수 있습니다.
                        <br />- <strong>💾 설정값 기본으로 저장:</strong> 자주 쓰는 설정(예: 200자, 댓글 허용 등)은 우측 상단 저장 버튼을 누르세요. 다음 미션부터 자동으로 이 설정이 적용되어 매우 편리합니다!
                    </p>
                    <p><strong>• 글쓰기 평가 루브릭:</strong>
                        <br />하단의 <strong>[평가 루브릭 사용]</strong>을 체크하여 '내용의 풍부함', '표현력' 등의 기준과 배점(상/중/하)을 미리 등록해두세요. 평가 시 클릭만으로 성취도를 기록할 수 있습니다.
                    </p>
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
                    미확인 글에 대해 <strong>'AI 피드백 일괄 생성'</strong> 버튼을 누르면, 시스템이 AI를 사용하여 모든 글을 분석하고 맞춤형 조언을 댓글로 남겨줍니다.
                    <br /><br />
                    ⚠️ <strong>안정적인 서비스 운영:</strong><br />
                    현재 더욱 빠르고 정확한 AI 기반 모델이 활용되어 최적의 피드백을 제공합니다.
                    선생님은 [관리 설정]에서 피드백의 말투나 형식을 결정하는 <strong>'AI 피드백 프롬프트'</strong>를 직접 수정할 수 있습니다. ✨
                    <br /><br />
                    🛡️ <strong>실시간 글쓰기 보안관:</strong><br />
                    모든 학생의 댓글과 글은 AI 보안관이 실시간으로 분석하여 비속어나 부적절한 내용을 필터링합니다. 선생님의 개입 없이도 안전한 학급 문화를 유지할 수 있습니다.
                </div>
            </section>

            {/* 섹션 3: 놀이터 및 게임 설정 */}
            <section id="playground" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[2].title}
                </h2>
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#E74C3C' }}>⚙️ 드래곤 게임 난이도 설정</h3>
                    <p><strong>1. 먹이 주기 비용 (Feed Cost)</strong><br />
                        학생들이 드래곤에게 간식을 줄 때 차감될 포인트를 설정합니다. (기본: 50포인트) <br />
                        비용을 높이면 학생들이 포인트를 더 아껴쓰며 글쓰기 동기가 강화될 수 있습니다.</p>
                </div>
                <div style={cardStyle}>
                    <p><strong>2. 관심 필요 주기 (Degeneration Days)</strong><br />
                        학생이 며칠 동안 드래곤을 돌보지 않으면 레벨이 떨어질지 설정합니다. (기본: 7일) <br />
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
                    <p><strong>1. 즐거운 포인트 획득 및 랭킹</strong><br />
                        나만의 글을 남기는 모든 활동이 포인트가 됩니다!
                        <br />• <strong>미션 완료 보상:</strong> 선생님이 설정하신 미션의 기본 포인트와 보너스 포인트를 획득합니다.
                        <br />• <strong>활동 포인트:</strong> 정성껏 글을 쓰고 친구들의 글에 댓글을 남기는 모든 과정에서 점수가 쌓입니다.
                        <br />• 🛡️ <strong>AI 보안관 (24시간 가동):</strong> 모든 글과 댓글은 AI가 실시간으로 확인하여 부적절한 내용을 필터링하고 안전한 아지트 문화를 지켜줍니다.
                        <br />• <strong>활동지수랭킹:</strong> 우리 반에서 누가 가장 많은 포인트를 획득했는지 실시간 랭킹 확인이 가능하여 건강한 경쟁심을 유도합니다.
                        <br />(활동지수(XP)는 학생이 지금까지 획득한 총 누적 포인트로 계산됩니다. 포인트 사용(차감) 내역은 랭킹에 영향을 주지 않으므로, 학생들은 마음껏 포인트를 사용하여 드래곤을 꾸밀 수 있습니다. 💎)
                    </p>
                </div>
                <div style={highlightStyle}>
                    💰 <strong>선생님의 포인트 선물 & 관리 (활동지수랭킹 화면):</strong>
                    <br />
                    포인트 선물과 관리는 <strong>[활동지수랭킹]</strong> 대시보드에서 효율적으로 하실 수 있습니다.
                    <br />• <strong>지급 및 차감:</strong> 랭킹 리스트 우측의 <strong>번개(⚡) 아이콘</strong>을 클릭하면 해당 학생에게 포인트를 바로 지급하거나 차감할 수 있습니다.
                    <br />• <strong>실시간 피드백:</strong> 선생님이 활동지수랭킹 화면에서 포인트를 조절하는 순간 학생에게 <strong>즉시 알림</strong>이 전송되어, 칭찬과 지도의 효과가 극대화됩니다. ✨
                </div>
                <div style={cardStyle}>
                    <p><strong>2. 드래곤 성장 시스템</strong><br />
                        성실하게 글을 쓸수록 학생들의 드래곤은 더 멋진 모습으로 진화합니다(총 5단계).
                        모은 포인트로 드래곤에게 먹이를 주며 아지트를 멋지게 꾸며보세요! 친구들의 아지트를 방문해 서로의 성장을 응원할 수도 있습니다.</p>
                </div>
            </section>

            {/* 섹션 5: 학생 평가 및 AI쫑알이 */}
            <section id="evaluation" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[4].title}
                </h2>

                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#16A085' }}>1단계: 성취도 평가 및 루브릭 활용</h3>
                    <p><strong>• 루브릭 기반 평가:</strong>
                        <br />미션 생성 시 등록해둔 <strong>평가 기준(루브릭)</strong>이 평가 화면에 그대로 나타납니다.
                        <br />선생님은 학생 글을 읽으며 <strong>[우수 - 보통 - 노력]</strong> 버튼을 클릭하기만 하면 됩니다. 점수가 자동 합산되어 평가가 훨씬 객관적이고 간편해집니다. (기본 루브릭을 저장해두면 매번 입력할 필요도 없어요!)
                    </p>
                    <p><strong>• 학생별 성장 피드백:</strong>
                        <br />[글쓰기 미션 현황]에서 학생 글을 클릭해 <strong>'📊 성장 평가하기'</strong>를 열어보세요.
                        <br />루브릭 점수뿐만 아니라, 학생의 변화된 점을 구체적인 텍스트로(관찰 의견) 남길 수 있습니다. 이 기록은 나중에 <strong>'AI 쫑알이'</strong>가 생활기록부 문구를 만들 때 아주 중요한 기초 자료가 됩니다! 🌟
                    </p>
                </div>

                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#E67E22' }}>2단계: AI쫑알이를 활용한 종합 분석</h3>
                    <p><strong>• AI쫑알이란?</strong> 학기 말이나 단원 종료 후, 여러 미션에 흩어진 학생의 활동 기록과 선생님의 평가 데이터를 하나로 모아 <strong>학교생활기록부용 종합 의견</strong>을 초안으로 작성해주는 똑똑한 도우미입니다. 🐥</p>
                    <p><strong>• 생성 과정:</strong>
                        <br />1. 상단 <strong>[AI쫑알이]</strong> 탭으로 이동합니다.
                        <br />2. 분석하고자 하는 미션들을 여러 개 선택합니다. (예: 1학기 일기 미션 전체)
                        <br />3. 명단에서 학생을 선택하거나 <strong>'일괄 생성'</strong> 버튼을 클릭합니다.
                        <br />4. AI가 해당 학생의 모든 글 내용, 핵심 질문 답변, 그리고 선생님이 남긴 <strong>성취도 평가 결과</strong>를 종합 분석하여 리포트를 생성합니다.
                    </p>
                </div>

                <div style={highlightStyle}>
                    ✨ <strong>전문적인 프롬프트 관리:</strong>
                    <br />
                    [관리 설정] 대시보드에서 <strong>'AI쫑알이 생성 프롬프트'</strong>를 직접 수정해보세요.
                    "교사 관점의 평어체(~함)로 작성해줘", "학생의 강점을 위주로 서술해줘"와 같은 구체적인 지침을 입력해두면 훨씬 더 만족스러운 생기부 문구를 얻을 수 있습니다.
                </div>

                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#2980B9' }}>3단계: 데이터 내보내기 및 활용</h3>
                    <p><strong>• 엑셀 다운로드:</strong> 생성된 종합 리포트 내용은 엑셀 파일로 한꺼번에 내려받을 수 있습니다. 나이스(NEIS) 입력 시 기초 자료로 활용하거나 학부모 상담 자료로 사용해보세요!</p>
                </div>
            </section>

            {/* 섹션 6: 학습 분석 활용 */}
            <section id="analysis" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[5].title}
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

            {/* 섹션 7: 학급 도서 출판 */}
            <section id="book-publishing" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[6].title}
                </h2>
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#27AE60' }}>📚 학급 도서 출판 (NEW)</h3>
                    <p><strong>• 미션 보관:</strong> 학기가 끝나거나 완료된 미션은 '보관함으로 이동'을 선택하세요. 보관된 미션은 <strong>[글 보관함]</strong> 탭에서 언제든지 확인할 수 있습니다.</p>
                    <p><strong>• 일괄 내보내기 & 순서 지정:</strong>
                        <br />보관함에 저장된 여러 개의 글쓰기 미션을 원하는 대로 선택할 수 있습니다.
                        <br />선택한 순서대로 번호가 매겨지며, 이 순서 그대로 하나의 파일로 통합되어 내보내집니다. (예: 1단원 에세이 → 2단원 독후감 순서로 책 구성 가능)
                    </p>
                    <p><strong>• 엑셀(Excel) 및 구글 문서(Google Docs) 활용:</strong>
                        <br />- <strong>엑셀 내보내기:</strong> 학생들의 모든 글 통계 및 내용을 표 형태로 깔끔하게 정리하여 백업할 수 있습니다.
                        <br />- <strong>구글 문서로 책 만들기:</strong> 모든 글을 구글 문서로 전송하여 <strong>나만의 학급 문집</strong>을 만들 수 있습니다. 표지, 목차, 학생별 글이 자동으로 정렬되어 편집 수고를 덜어줍니다. ✨
                    </p>
                </div>
            </section>

            {/* 섹션 7: GPT 인공지능 활용 안내 (신규) */}
            <section id="gpt-info" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[7].title}
                </h2>
                <div style={cardStyle}>
                    <p style={{ marginBottom: '20px' }}>
                        끄적끄적 아지트는 교육적 활용도와 보안을 위해 각 기능별로 최적화된 최신 <strong>OpenAI GPT 모델</strong>을 구분하여 사용하고 있습니다.
                    </p>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            fontSize: '0.95rem',
                            minWidth: '600px',
                            background: 'white',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            border: '1px solid #E9ECEF'
                        }}>
                            <thead>
                                <tr style={{ background: '#3498DB', color: 'white' }}>
                                    <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid #DEE2E6', width: '35%' }}>서비스 영역 / 적용 모델</th>
                                    <th style={{ padding: '16px', textAlign: 'left', borderBottom: '1px solid #DEE2E6' }}>선정 및 활용 이유</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td style={{ padding: '16px', borderBottom: '1px solid #F1F3F5' }}>
                                        <div style={{ fontWeight: '800', color: '#E74C3C', marginBottom: '4px' }}>🛡️ 실시간 보안관</div>
                                        <div style={{ fontSize: '0.85rem', color: '#2C3E50', opacity: 0.8 }}>모델: OpenAI GPT-5-Nano</div>
                                    </td>
                                    <td style={{ padding: '16px', borderBottom: '1px solid #F1F3F5', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                        1. 최신 차세대 나노 엔진을 통해 비속어 및 부적절한 표현을 더욱 정교하고 빠르게 감지합니다.<br />
                                        2. 학생들의 안전한 글쓰기 환경을 보장하기 위해 고도화된 교육 윤리 가이드라인이 적용되었습니다.
                                    </td>
                                </tr>
                                <tr style={{ background: '#FDFEFE' }}>
                                    <td style={{ padding: '16px', borderBottom: '1px solid #F1F3F5' }}>
                                        <div style={{ fontWeight: '800', color: '#3498DB', marginBottom: '4px' }}>✍️ 피드백 & 질문 설계</div>
                                        <div style={{ fontSize: '0.85rem', color: '#2C3E50', opacity: 0.8 }}>모델: OpenAI GPT-4o-Mini</div>
                                    </td>
                                    <td style={{ padding: '16px', borderBottom: '1px solid #F1F3F5', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                        1. 글 주제에 대한 깊은 이해를 바탕으로 정교하고 다정한 맞춤형 피드백을 즉시 생성합니다.<br />
                                        2. 학생의 사고 수준을 고려한 창의적 질문을 설계하여 자기주도적 글쓰기 역량을 강화합니다.
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ padding: '16px', borderBottom: '1px solid #F1F3F5' }}>
                                        <div style={{ fontWeight: '800', color: '#9B59B6', marginBottom: '4px' }}>🐥 AI 쫑알이 (종합 분석)</div>
                                        <div style={{ fontSize: '0.85rem', color: '#2C3E50', opacity: 0.8 }}>모델: OpenAI GPT-5-Nano</div>
                                    </td>
                                    <td style={{ padding: '16px', borderBottom: '1px solid #F1F3F5', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                        1. 수개월간 축적된 방대한 활동 데이터를 논리적으로 요약하고 핵심 성취를 정확히 포착합니다.<br />
                                        2. 실제 교육 현장에서 활용 가능한 신뢰도 높은 학교생활기록부용 관찰 의견 초안을 제작합니다.
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div style={{ marginTop: '24px', fontSize: '0.9rem', color: '#7F8C8D' }}>
                        ※ 모든 AI 기능은 선생님이 직접 성능과 말투를 제어할 수 있도록 [관리 설정]에서 프롬프트 수정을 지원합니다.
                    </div>
                </div>
            </section>

            {/* 섹션 8: 실시간 보안관 (신규 추가) */}
            <section id="realtime-guardian" style={sectionStyle}>
                <h2 style={{ fontSize: '1.8rem', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    {sections[8].title}
                </h2>
                <div style={cardStyle}>
                    <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', color: '#E74C3C' }}>🛡️ 학생 댓글 2단계 안전 그물망</h3>
                    <p>끄적끄적 아지트는 학생들이 서로 격려하는 따뜻한 공간이 되도록, <strong>'실시간 보안관'</strong>이 24시간 댓글을 점검합니다. 선생님이 일일이 확인하지 않아도 안전합니다! </p>

                    <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #EEE', margin: '16px 0' }}>
                        <p style={{ margin: '0 0 8px 0' }}><strong>🔍 1단계: 금지어 차단 (즉시 차단)</strong></p>
                        <p style={{ fontSize: '0.9rem', color: '#555' }}>
                            욕설이나 비속어 등 명백히 나쁜 단어가 포함되면 시스템이 즉시 감지하여 등록을 막습니다.
                        </p>
                    </div>

                    <div style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #EEE', margin: '16px 0' }}>
                        <p style={{ margin: '0 0 8px 0' }}><strong>🤖 2단계: AI 문맥 점검 및 순화 (스마트 케어)</strong></p>
                        <p style={{ fontSize: '0.9rem', color: '#555' }}>
                            단어는 문제가 없더라도 비꼬거나 상처를 주는 문장이 있을 수 있죠? <br />
                            1단계를 통과하더라도 <strong>AI가 다시 한번 문맥을 읽어보고</strong>, 친구에게 상처가 될 수 있는 표현이라면 <strong>"이렇게 말해보는 건 어때?"</strong>라고 부드럽게 순화된 표현을 제안합니다.
                        </p>
                    </div>

                    <div style={highlightStyle}>
                        🔑 <strong>주의사항:</strong><br />
                        AI(GPT) API 키가 입력되지 않으면 <strong>2단계(문맥 점검 및 순화)는 작동하지 않고 건너뜁니다.</strong><br />
                        (이 경우에도 1단계 금지어 차단은 정상적으로 작동하여 욕설은 막아줍니다.)
                    </div>
                </div>
            </section>

            <footer style={{ textAlign: 'center', padding: '40px 0', borderTop: '1px solid #EEE', color: '#ADB5BD', fontSize: '0.9rem' }}>
                &copy; 끄적끄적아지트-선생님의 행복한 글쓰기 교실을 응원합니다.
            </footer>
        </motion.div >
    );
};

export default UsageGuide;
