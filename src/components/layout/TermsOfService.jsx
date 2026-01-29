import React from 'react';

/**
 * 끄적끄적 아지트 서비스 이용약관 ✨
 */
const TermsOfService = () => {
    return (
        <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: '0.8rem', color: '#95A5A6', marginBottom: '20px' }}>발효일: 2026년 1월 16일</p>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>제1조 (목적)</h4>
                <p>본 약관은 운영자 유쌤이 제공하는 ‘끄적끄적 아지트’ 글쓰기 및 학급 소통 플랫폼 서비스(이하 ’서비스’) 이용과 관련하여 회원의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>제2조 (서비스의 목적 및 정의)</h4>
                <ol style={{ paddingLeft: '20px', margin: 0 }}>
                    <li>본 서비스는 학생들의 글쓰기 역량 강화와 학급 내 건전한 소통을 목적으로 하는 학급 운영 통합 플랫폼입니다.</li>
                    <li>'드래곤 키우기' 등의 게임화 요소는 글쓰기 활동을 독려하기 위한 부가적인 동기부여 수단으로 제공됩니다.</li>
                </ol>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>제3조 (이용계약의 체결 및 승인)</h4>
                <ol style={{ paddingLeft: '20px', margin: 0 }}>
                    <li>교사는 구글 계정 인증을 통해 가입을 신청하며, <strong>최종적인 서비스 이용은 관리자의 승인 절차 완료 후 가능합니다.</strong></li>
                    <li>학생은 선생님으로부터 부여받은 이름(별칭)과 접속코드를 입력하여 서비스를 이용함으로써 본 약관에 동의한 것으로 간주합니다.</li>
                </ol>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>제4조 (권리의 귀속 및 저작물)</h4>
                <ol style={{ paddingLeft: '20px', margin: 0 }}>
                    <li>서비스 내 시스템, 디자인, 캐릭터(드래곤 등)에 대한 모든 권리는 운영자에게 귀속됩니다.</li>
                    <li>회원이 작성한 게시물(글, 댓글 등)의 저작권은 작성자 본인에게 있습니다. 단, 교육적 목적을 위해 학급 내에서 공유되고 선생님의 피드백 지도를 받는 용도로 활용됨에 동의합니다.</li>
                </ol>
            </section>

            <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>제5조 (이용 제한, 승인 취소 및 면책)</h4>
            <ol style={{ paddingLeft: '20px', margin: 0 }}>
                <li><strong>관리자의 권한 및 승인 취소:</strong> 약관에 위배되는 행동을 하거나, 비정상적인 사용으로 문제가 발생할 경우, <strong>관리자는 사전 통보 없이 즉시 사용 승인을 취소하거나 회원을 강제 탈퇴시킬 수 있습니다.</strong></li>
                <li><strong>책임의 소재:</strong> 위와 같은 귀책사유로 인해 발생한 강제 탈퇴, 데이터 삭제, 서비스 이용 불가 등 <strong>모든 결과에 대한 책임은 전적으로 사용자 본인에게 있음을 명시합니다.</strong></li>
                <li>타인 비방, 욕설, 도용 등 교육 목적에 반하는 행위 시 운영자는 게시물을 삭제하거나 이용을 제한할 수 있습니다.</li>
                <li>운영자는 천재지변이나 기술적 결함으로 인한 일시적인 서비스 중단에 대해 고의가 없는 한 책임을 지지 않습니다.</li>
                <li><strong>API 서비스 이용 및 책임 제한:</strong> 본 서비스에서 제공하는 AI 피드백 기능은 회원이 직접 발급받은 외부 API 키(GPT API)를 연동하여 동작합니다. 회원은 개인 API 키의 보안 관리에 최선을 다해야 하며, 유료 API를 사용함으로써 발생하는 비용 부과 문제에 대해 서비스 제공자에게 책임을 물을 수 없습니다. 되도록 무료 제공 범위 내에서 안전하게 활용하시기를 권장합니다.</li>
            </ol>
        </div>
    );
};

export default TermsOfService;
