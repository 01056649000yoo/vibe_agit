import React from 'react';

/**
 * 끄적끄적 아지트 개인정보 처리방침 ✨
 */
const PrivacyPolicy = () => {
    return (
        <div style={{ textAlign: 'left', lineHeight: '1.6', color: '#444' }}>
            <p style={{ fontSize: '0.9rem', color: '#95A5A6', marginBottom: '30px', borderBottom: '1px solid #eee', paddingBottom: '10px' }}>
                최종 수정일: 2026년 1월 29일
            </p>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제1조 (총칙)</h4>
                <p>'끄적끄적 아지트'는 이용자의 동의를 기반으로 개인정보를 수집·이용 및 제공하고 있으며, 『개인정보 보호법』 등 관련 법령을 준수하여 정보주체의 개인정보를 안전하게 처리하고 있습니다. '끄적끄적 아지트'는 본 개인정보 처리방침을 통해 이용자가 제공하는 개인정보가 어떠한 용도와 방식으로 이용되고 있으며, 개인정보 보호를 위해 어떠한 조치가 취해지고 있는지 알려드립니다.</p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제2조 (14세 미만 아동의 개인정보 보호)</h4>
                <p>본 서비스는 14세 미만 아동의 개인정보 보호를 위해 직접 가입을 허용하지 않으며, 교사를 통한 간접 계정발급 및 가명 정보 활용을 원칙으로 합니다.</p>
                <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                    <li>'끄적끄적 아지트'는 만 14세 미만 아동의 회원가입을 직접 받지 않습니다.</li>
                    <li>서비스 이용이 필요한 만 14세 미만 아동(학생)의 경우, 법정대리인 또는 교사가 생성한 계정(접속 코드)을 통해 서비스를 이용할 수 있습니다.</li>
                    <li>교사가 학생 계정을 생성할 때에는 학생의 실명 등 민감한 개인정보 대신 개인식별이 어려운 닉네임 등 가명 정보를 활용하는 것을 원칙으로 합니다.</li>
                    <li>'끄적끄적 아지트'는 아동의 개인정보를 수집하지 않기 위해 학생으로부터 별도의 이메일, 전화번호 등을 요구하지 않습니다.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제3조 (개인정보의 수집 항목 및 이용 목적)</h4>
                <p>서비스 제공에 필요한 최소한의 정보만을 수집하며, 민감정보는 수집하지 않습니다.</p>
                <div style={{ marginTop: '10px', padding: '15px', backgroundColor: '#F8F9FA', borderRadius: '8px' }}>
                    <p><strong>1. 수집 항목</strong></p>
                    <ul style={{ paddingLeft: '20px', marginBottom: '10px' }}>
                        <li><strong>교사 (관리자):</strong> 필수항목 - 이메일 주소(아이디), 성명(또는 닉네임), <strong>GPT API 키(선택 저장 시)</strong></li>
                        <li><strong>학생 (이용자):</strong> 필수항목 - 닉네임, 출석 번호 (모두 가명 처리, 개인식별 어려운 가상 번호 사용 필수, 교사가 생성)</li>
                        <li><strong>선택 항목:</strong> 포인트 정보, 퀘스트 정보, 학급 활동 데이터 등 서비스 이용 과정에서 생성되는 정보</li>
                    </ul>
                    <p><strong>2. 이용 목적</strong></p>
                    <ul style={{ paddingLeft: '20px' }}>
                        <li>회원 가입 의사 확인 및 본인 식별</li>
                        <li>서비스 제공(학급 관리, 글쓰기 활동, 포인트 부여 등) 및 운영</li>
                        <li>서비스 부정이용 방지 및 비인가 사용 방지</li>
                        <li>문의사항 처리 및 공지사항 전달</li>
                    </ul>
                </div>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제4조 (개인정보의 보유 및 이용 기간)</h4>
                <p>이용 목적 달성 시 즉시 파기 원칙을 준수하며, 특히 교사의 학급 운영 종료 시 학생 정보는 서버에서 영구 삭제됩니다.</p>
                <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                    <li><strong>교사 계정 정보:</strong> 회원 탈퇴 시까지</li>
                    <li><strong>학생 활동 정보 및 계정:</strong> 교사가 해당 클래스를 '초기화' 또는 '삭제'하거나 '회원 탈퇴'를 하는 즉시 영구 삭제</li>
                    <li><strong>서비스 이용 기록:</strong> 3개월 (통신비밀보호법에 따름)</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제5조 (개인정보의 제3자 제공 및 처리 위탁)</h4>
                <p>'끄적끄적 아지트'는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 이용자가 사전에 동의한 경우나 법령의 규정에 의거한 경우는 예외로 합니다.</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#F1F3F5' }}>
                            <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>수탁업체</th>
                            <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>위탁 업무 내용</th>
                            <th style={{ border: '1px solid #dee2e6', padding: '8px' }}>보유 기간</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>Supabase (Google Cloud Infrastructure)</td>
                            <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>서비스 데이터베이스 호스팅 및 데이터 저장, 인증 관리</td>
                            <td style={{ border: '1px solid #dee2e6', padding: '8px' }}>회원 탈퇴 및 클래스 삭제 시 즉시 파기</td>
                        </tr>
                    </tbody>
                </table>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제6조 (정보주체의 권리·의무 및 행사 방법)</h4>
                <p>이용자는 언제든지 자신의 정보를 열람, 정정, 삭제할 수 있는 권리를 보장받습니다.</p>
                <ul style={{ paddingLeft: '20px', marginTop: '8px' }}>
                    <li>이용자(교사)는 서비스 내 설정을 통해 개인정보를 직접 관리하거나 탈퇴를 요청할 수 있습니다.</li>
                    <li>교사는 자신이 개설한 학급의 학생 정보를 수정하거나 학급 초기화를 통해 데이터를 즉시 삭제할 수 있는 권한을 가집니다.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제7조 (개인정보의 파기 절차 및 방법)</h4>
                <p>이용자가 입력한 정보는 목적 달성 후 즉시 DB에서 삭제되며, 별도의 DB로 옮겨져 보관되지 않습니다. 전자적 파일 형태의 정보는 기록을 재생할 수 없도록 기술적 방법을 사용하여 영구 삭제합니다.</p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제8조 (개인정보의 안전성 확보 조치)</h4>
                <ul style={{ paddingLeft: '20px' }}>
                    <li><strong>개인정보의 암호화:</strong> 이용자의 비밀번호는 단방향 암호화되어 저장됩니다.</li>
                    <li><strong>GPT API 키 보안:</strong> 입력된 API 키는 서버측(Edge Functions)에서만 처리되며, RLS 정책을 통해 본인 외 접근이 불가능하도록 격리 보호됩니다.</li>
                    <li><strong>기술적 대책:</strong> SSL(HTTPS) 인증서를 통한 구간 암호화 통신을 의무화하고 있습니다.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제9조 (개인정보 보호책임자)</h4>
                <div style={{ padding: '15px', backgroundColor: '#F8F9FA', borderRadius: '8px' }}>
                    <p><strong>[개인정보 보호책임자]</strong></p>
                    <p>성명: 유승현</p>
                    <p>연락처: yshgg@naver.com</p>
                    <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#7F8C8D' }}>※ 개인정보 침해에 대한 상담은 개인정보침해신고센터(국번없이 118)를 통해 받을 수 있습니다.</p>
                </div>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제10조 (가명정보의 처리에 관한 사항)</h4>
                <p>교사 사용자가 등록한 학생 관련 가명정보의 해석, 비교, 교육적 판단 및 활용의 주체는 교사 사용자이며, 본 서비스는 해당 정보를 독자적으로 활용하지 않습니다.</p>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제11조 (사용자의 의무 및 책임)</h4>
                <p style={{ fontWeight: 'bold', color: '#E74C3C', marginBottom: '8px' }}>[중요: 서비스 사용자 필독]</p>
                <ul style={{ paddingLeft: '20px', fontSize: '0.95rem' }}>
                    <li>교사(사용자)는 학생 계정 생성 시 실명, 주소 등 식별 가능한 개인정보를 입력하지 않아야 하며, 반드시 가명 정보를 활용해야 합니다.</li>
                    <li>교사(사용자)는 본인이 수집한 민감 정보에 대한 관리 책임을 지며, 계정 보안 관리에 철저를 기해야 합니다.</li>
                    <li>학급 운영 종료 시 반드시 '클래스 삭제' 기능을 사용하여 불필요한 데이터가 남지 않도록 해야 합니다.</li>
                </ul>
            </section>

            <section style={{ marginBottom: '30px' }}>
                <h4 style={{ color: '#2C3E50', marginBottom: '12px', borderLeft: '4px solid var(--primary-color)', paddingLeft: '10px' }}>제12조 (개인정보처리방침의 변경)</h4>
                <p>이 개인정보처리방침은 2026년 1월 29일부터 적용됩니다. 변경사항이 있는 경우 시행 7일 전부터 공지사항을 통해 고지할 것입니다.</p>
            </section>

            <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#EBF5FB', borderRadius: '8px', fontSize: '0.9rem' }}>
                <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>「초·중등교육법」 제29조의2 기준 충족 안내</p>
                <p>본 개인정보처리방침은 「초·중등교육법」 제29조의2에 따른 학습지원 소프트웨어 선정 기준 및 가이드라인을 준수합니다.</p>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
