import React from 'react';
import { EXHIBITION_RIGHTS } from '../../modules/class-agit/gallery/rightsNotice.js';

/**
 * 끄적끄적 아지트 서비스 이용약관 ✨
 */
const TermsOfService = () => {
    return (
        <div style={{ textAlign: 'left' }}>
            <p style={{ fontSize: '0.8rem', color: '#95A5A6', marginBottom: '20px' }}>
                최초 시행일: 2026년 1월 16일 · 개정일: 2026년 9월 11일 · 개정 시행일: 2026년 9월 21일
                <br />작품 저작권 안내 보완: 2026년 9월 5일 · 개인 API 키 관련 문구 삭제: 2026년 9월 13일
            </p>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>1. 서비스 이용약관</h4>
                <p>본 이용약관은 이용자와 '끄적끄적 아지트' 간의 법적 계약을 구성합니다. 서비스 가입은 귀하가 본 약관에 동의함을 의미합니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>2. 서비스 설명</h4>
                <p><strong>'끄적끄적 아지트'</strong>는 <strong>글쓰기 활동을 기반으로 한 학급 경영 및 게이미피케이션 플랫폼</strong>입니다. 학생들의 꾸준한 글쓰기와 긍정적인 행동 강화, 퀘스트 수행, 포인트 관리 등을 통해 학급 경영을 지원하는 비교과용 에듀테크 서비스입니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>3. 계정 등록 및 보안</h4>
                <p>서비스 이용을 위해 이용자는 계정을 등록해야 할 수 있습니다. 이용자는 개인 계정 정보의 정확성과 보안을 유지할 책임이 있으며, 본인의 직접적인 계정 활동에 대한 모든 책임을 집니다.</p>
                <p style={{ marginTop: '10px', color: '#E74C3C' }}><strong>학생은 본 서비스에 직접 가입할 수 없으며, 담당 교사가 만든 계정으로만 이용합니다. 서비스는 학생의 이름과 학생이 작성한 글 외에 주민등록번호, 이메일 주소, 연락처 등 어떠한 개인정보도 수집하지 않습니다. 이용자(교사)는 학생의 이름과 글을 이 서비스에서 처리하기 전에 학교가 법정대리인(보호자)으로부터 학생 개인정보 수집·이용 동의를 받았는지 확인하고, 학급을 만들 때 그 확인을 서비스에 기록해야 합니다. 동의를 받지 않은 학생의 정보는 입력하지 않아야 합니다.</strong></p>
                <p>식별 가능한 학생 민감 정보에 입력에 대한 모든 책임은 이용자에게 있습니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>4. 장기 미접속 및 휴면계정</h4>
                <p>마지막 로그인 후 90일 이상 1년 미만인 교사 계정은 '장기 미접속', 1년 이상인 교사 계정은 '휴면계정'으로 분류할 수 있습니다.</p>
                <p style={{ marginTop: '8px' }}>이 분류는 계정 상태를 확인하기 위한 논리적 표시이며, 개인정보를 별도 데이터베이스로 옮기거나 계정·학급·학생·활동 데이터를 자동 삭제하지 않습니다. 이용자가 다시 로그인하면 장기 미접속 또는 휴면 분류는 자동으로 해제됩니다. 계정과 개인정보의 보유기간은 개인정보처리방침에 따릅니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>5. 사용자 행동 및 콘텐츠</h4>
                <p>서비스를 사용할 때 귀하는 다음 사항에 동의합니다:</p>
                <ul style={{ paddingLeft: '20px', marginTop: '5px' }}>
                    <li>부적절하거나 불법적인 콘텐츠를 게시하지 않을 것</li>
                    <li>서비스의 정상적인 운영을 방해하지 않을 것</li>
                </ul>
                <p style={{ marginTop: '10px' }}><strong>AI 기능은 '끄적끄적 아지트'가 서비스 계정으로 직접 운영하며, 이용자가 별도의 API 키를 등록하거나 AI 이용 요금을 부담하지 않습니다.</strong> 다만 AI가 만든 문장은 제안일 뿐이므로, 학생에게 전달하기 전에 교사가 확인하고 필요한 부분을 고쳐 사용해 주세요.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>6. 지적 재산권</h4>
                <p>서비스의 소프트웨어와 운영자가 제공하는 콘텐츠에 대한 지적 재산권은 '끄적끄적 아지트' 또는 해당 권리자에게 있습니다. 학생 등 이용자가 작성한 작품의 저작권은 작성자 등 해당 저작자에게 있으며 서비스 이용이나 전시 발행으로 운영자에게 이전되지 않습니다.</p>
                <p>{EXHIBITION_RIGHTS.notice} {EXHIBITION_RIGHTS.exception}</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>7. 서비스 변경 및 종료</h4>
                <p>본 서비스는 언제든지 서비스의 일부 또는 전체를 임시적으로 또는 영구적으로 수정하거나 중단할 권리가 있습니다. 본 서비스는 서비스 변경이나 중단에 대해 가능한 한 사전 통지를 제공하기 위해 노력할 것이나, 모든 상황에서 이를 보장할 수는 없습니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>8. 면책 조항</h4>
                <p>서비스는 "있는 그대로" 제공되며, 본 서비스는 상품성, 특정 목적에의 적합성, 비침해성에 대한 묵시적 보증을 포함하여 모든 종류의 명시적 또는 묵시적 보증을 부인합니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>9. 책임 제한</h4>
                <p>법률이 허용하는 최대 범위 내에서, 본 서비스는 귀하 또는 제3자에 대해 이익 손실, 데이터 손실, 영업 중단 또는 기타 특별, 간접, 결과적 손해를 포함한 어떠한 직접적, 간접적, 부수적, 특별, 결과적 또는 징벌적 손해에 대해서도 책임을 지지 않습니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>10. 약관 변경</h4>
                <p>본 서비스는 언제든지 본 이용약관을 수정할 권리가 있습니다. 중대한 변경이 있는 경우, 본 서비스는 서비스 내 공지를 통해 변경 사실을 고지하며, 변경 사항이 발효된 후 계속해서 서비스를 사용하는 것은 수정된 약관에 동의하는 것으로 간주됩니다.</p>
            </section>

            <section style={{ marginBottom: '20px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '8px' }}>11. 문의 및 불만 처리</h4>
                <p>본 이용약관에 관한 질문이나 의견이 있으시면 <a href="mailto:yshgg@naver.com">yshgg@naver.com</a>으로 연락해 주시기 바랍니다.</p>
            </section>
        </div>
    );
};

export default TermsOfService;
