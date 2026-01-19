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
                    <li><strong>교사:</strong> 구글 로그인을 통한 이메일 및 기본 프로필 정보. 관리자 식별을 위해 교사가 직접 입력한 실명 및 학교명, <strong>API 활용을 위해 교사가 직접 저장한 Gemini API 키</strong>.</li>
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
                <p style={{ marginTop: '10px' }}><strong>Gemini API 키 보호:</strong> 교사가 입력한 API 키는 본인 계정에만 종속되어 암호화 수준의 보안 정책(RLS)으로 보호되며, 제3자가 조회하거나 접근할 수 없습니다. 또한 서비스 탈퇴 시 해당 데이터는 시스템에서 즉시 영구 삭제됩니다.</p>
            </section>
        </div>
    );
};

export default PrivacyPolicy;
