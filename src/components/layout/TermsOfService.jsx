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
                <br />작품 저작권 안내 보완: 2026년 9월 5일 · 개인 API 키 관련 문구 삭제: 2026년 9월 13일 · 서비스 종료 시 통지·백업 조항 신설(제7조): 2026년 9월 18일
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
                <p><strong>(1) 일시 중단</strong> — 점검, 장애 복구, 설비 교체를 위해 서비스의 일부 또는 전체를 일시적으로 중단할 수 있습니다. 미리 정해진 점검은 가능한 한 사전에 서비스 내 공지로 알리며, 갑작스러운 장애는 복구한 뒤 지체 없이 알립니다.</p>
                <p style={{ marginTop: '10px' }}><strong>(2) 기능 변경</strong> — 개별 기능은 개선 과정에서 바뀌거나 없어질 수 있습니다. 학급 운영에 영향을 주는 변경은 서비스 내 공지로 알립니다.</p>
                <p style={{ marginTop: '10px' }}><strong>(3) 서비스 전체 종료</strong> — 운영자가 서비스 전체를 영구적으로 종료할 때는 다음을 지킵니다.</p>
                <ul style={{ paddingLeft: '20px', marginTop: '5px' }}>
                    <li><strong>종료일로부터 최소 30일 전</strong>에 서비스 내 공지로 알립니다.</li>
                    <li><strong>종료일 이후에도 약 3개월 동안</strong> 교사가 학급의 글을 내보낼 수 있도록 서비스를 열어 둡니다. 이 기간에는 자료를 가져가는 데 필요하지 않은 일부 기능이 제한될 수 있습니다.</li>
                    <li>공지 시점부터 이 기간이 끝날 때까지 교사는 학급의 글을 <strong>선생님 본인의 구글 계정에 구글 문서로 저장</strong>할 수 있습니다. 이 문서는 선생님의 구글 드라이브에 만들어지고 소유자도 선생님이므로, <strong>서비스가 완전히 문을 닫은 뒤에도 그대로 남습니다.</strong> 과제는 '보관함'에서, 일기와 독서록은 각 관리 화면에서 내보낼 수 있으며, 같은 자리에서 엑셀·PDF 파일로 내려받을 수도 있습니다.</li>
                    <li>가능한 한 <strong>학기 중 종료를 피하고 학년말에 맞추도록</strong> 노력합니다.</li>
                    <li>위 기간이 끝나면 운영자 서버에 남은 학생·교사의 개인정보와 작성물은 개인정보처리방침에 따라 파기하며, 파기한 자료는 복구할 수 없습니다. <strong>미리 내보내 두신 구글 문서와 파일은 영향을 받지 않습니다.</strong></li>
                </ul>
                <p style={{ marginTop: '10px' }}><strong>(4) 내보낸 자료의 관리</strong> — 내보낸 구글 문서와 파일에는 학생의 이름과 글이 담깁니다. <strong>이 자료의 보관·공유·파기에 대한 책임은 이용자(교사)에게 있으며</strong>, 운영자는 이미 내보낸 자료를 회수하거나 삭제할 수 없습니다. 학교의 개인정보 관리 기준에 맞게 보관해 주세요.</p>
                <p style={{ marginTop: '10px' }}><strong>(5) 사전 통지·자료 회수 기간을 지킬 수 없는 경우</strong> — 천재지변, 운영 설비의 상실 등 운영자가 통제할 수 없는 사유가 있으면 (3)의 통지 기간과 3개월의 자료 회수 기간이 짧아지거나 지켜지지 못할 수 있습니다. 이 경우에도 가능해지는 즉시 알리고, 가능한 범위에서 자료를 내보낼 시간을 두도록 노력합니다.</p>
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
