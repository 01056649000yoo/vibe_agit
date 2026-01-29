import React from 'react';

/**
 * 끄적끄적 아지트 개인정보 처리방침 ✨
 */
const PrivacyPolicy = () => {
    return (
        <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: '0.8rem', color: '#95A5A6', marginBottom: '20px' }}>발효일: 2026년 1월 16일</p>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>1. 개인정보 수집 항목 및 방법</h4>
                <ul style={{ paddingLeft: '20px', margin: 0 }}>
                    <li><strong>교사:</strong> 구글 로그인을 통한 이메일 및 기본 프로필 정보. 관리자 식별을 위해 교사가 직접 입력한 실명 및 학교명, <strong>API 활용을 위해 교사가 직접 저장한 GPT API 키</strong>.</li>
                    <li><strong>학생:</strong> 선생님이 등록한 학생의 실명(또는 별칭) 및 접속용 코드. 본 서비스는 학생의 전화번호, 주소, 보호자 연락처 등 추가적인 개인정보를 수집하지 않습니다.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>2. 수집 및 이용 목적</h4>
                <ul style={{ paddingLeft: '20px', margin: 0 }}>
                    <li>학급 내 글쓰기 활동 관리 및 피드백 제공.</li>
                    <li>접속코드 기반의 안전한 로그인 환경 제공.</li>
                    <li>포인트 시스템을 통한 활동 보상 및 게임의 진행 상태 유지.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>3. 학교 개인정보 지침의 준수</h4>
                <p>본 서비스 내 학생 데이터(이름 및 활동 기록)의 수집과 보관에 관한 모든 동의 절차는 해당 학생이 소속된 학교의 ‘개인정보 처리지침’ 및 학교장의 결정에 따릅니다. 운영자는 학교 측의 요청이 있을 경우 보관 중인 데이터를 즉시 파기하거나 수정할 의무를 가집니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>4. 개인정보의 보유 및 파기</h4>
                <p>수집된 정보는 해당 학년도 학급 운영 기간 동안 보관되며, 교사가 학급을 삭제하거나 서비스 이용을 종료할 경우 해당 데이터는 안전하게 파기됩니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>5. 개인정보 보호 노력 및 API 키 보안</h4>
                <p>운영자는 학생의 실명 외에 민감한 정보는 일절 수집하지 않음으로써 데이터 유출 위험을 최소화합니다.</p>
                <div style={{ marginTop: '10px', padding: '15px', backgroundColor: '#F8F9FA', borderRadius: '8px', borderLeft: '4px solid #3498DB' }}>
                    <p style={{ marginBottom: '8px' }}><strong>GPT API 키 보안 관리 (중요):</strong></p>
                    <ul style={{ paddingLeft: '20px', margin: 0, fontSize: '0.9rem', lineHeight: '1.6' }}>
                        <li><strong>서버사이드 처리:</strong> 교사가 입력한 API 키는 클라이언트(브라우저)에서 절대 직접 노출되지 않으며, 암호화된 통신을 통해 서버(Supabase Edge Functions)에서만 안전하게 처리됩니다.</li>
                        <li><strong>데이터베이스 보안:</strong> 저장된 키는 Supabase의 RLS(Row Level Security) 정책을 통해 해당 교사 본인 외에는 관리자를 포함한 그 누구도 접근하거나 조회할 수 없도록 격리되어 보호됩니다.</li>
                        <li><strong>영구 삭제:</strong> 서비스 탈퇴 또는 학급 삭제 시 저장된 모든 API 키 데이터는 시스템에서 즉시 영구적으로 파기됩니다.</li>
                    </ul>
                </div>
            </section>
        </div>
    );
};

export default PrivacyPolicy;
