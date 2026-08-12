import './LearningSupportSoftwareGuide.css';

const criteriaGroups = [
  {
    criterion: '1. 최소처리 원칙 준수',
    items: [
      {
        id: '1-1',
        detail: '개인정보가 최소한으로 수집되는가?',
        evidence: '개인정보 처리방침 제3조',
      },
      {
        id: '1-2',
        detail: '개인정보 수집·이용 목적이 기재되어 있는가?',
        evidence: '개인정보 처리방침 제3조',
      },
      {
        id: '1-3',
        detail: '개인정보 수집항목, 보유기간 등이 기재되어 있는가?',
        evidence: '개인정보 처리방침 제3조, 제4조',
      },
    ],
  },
  {
    criterion: '2. 개인정보 안전조치 의무',
    items: [
      {
        id: '2-1',
        detail: '개인정보 안전성 확보에 필요한 조치 사항이 기재되어 있는가?',
        evidence: '개인정보 처리방침 제8조',
      },
    ],
  },
  {
    criterion: '3. 열람·정정·삭제·처리정지 절차',
    items: [
      {
        id: '3-1',
        detail: '이용자에게 언제든지 자신의 정보를 열람·정정·삭제·처리정지를 요구할 수 있는 절차가 안내되어 있는가?',
        evidence: '개인정보 처리방침 제6조',
      },
    ],
  },
  {
    criterion: '4. 만 14세 미만 아동의 개인정보 보호',
    items: [
      {
        id: '4-1',
        detail: '만 14세 미만 아동의 경우 법정대리인 동의 등 아동의 개인정보 보호를 위한 절차가 마련되어 있는가?',
        evidence: '개인정보 처리방침 제2조',
      },
    ],
  },
  {
    criterion: '5. 보호책임자·제3자 제공·위탁 등',
    items: [
      {
        id: '5-1',
        detail: '개인정보 보호책임자 관련 정보가 안내되어 있는가?',
        evidence: '개인정보 처리방침 제9조',
      },
      {
        id: '5-2',
        detail: '개인정보 제3자 제공에 관한 정보가 기재되어 있는가? (필요시)',
        evidence: '개인정보 처리방침 제5조',
      },
      {
        id: '5-3',
        detail: '개인정보 위·수탁관계에 관한 정보가 기재되어 있는가? (필요시)',
        evidence: '개인정보 처리방침 제5조',
      },
    ],
  },
];

const LearningSupportSoftwareGuide = () => (
  <article className="learning-support-guide">
    <section className="learning-support-guide__intro" aria-labelledby="learning-support-intro-title">
      <span className="learning-support-guide__eyebrow">학교 검토 참고자료</span>
      <h2 id="learning-support-intro-title">학교 도입 검토에 필요한 정보를 한곳에서 확인하세요</h2>
      <p>
        ‘끄적끄적아지트’는 교과 콘텐츠가 담겨 있지 않은 비교과용 에듀테크 서비스이며,
        학교의 판단에 따라 교육부에서 마련된 지침에 맞춰 학교운영위원회 심의를 받을 수 있습니다.
      </p>
      <p>
        본 서비스는 현직 교사가 수업에 직접 적용하기 위해 만든 서비스입니다. 학교에서 개별 심의를
        진행하는 경우, 아래 내용과 첨부 문서에서 제공하는 「초·중등교육법」 제29조의2에 따른 교육지원
        소프트웨어 도입 필수 개인정보보호 기준 충족 여부를 참고하시기 바랍니다.
      </p>
    </section>

    <section className="learning-support-guide__section" aria-labelledby="learning-support-product-title">
      <div className="learning-support-guide__section-heading">
        <span aria-hidden="true">01</span>
        <div>
          <p>PRODUCT</p>
          <h3 id="learning-support-product-title">제품·서비스 개요</h3>
        </div>
      </div>

      <dl className="learning-support-guide__summary">
        <div>
          <dt>제품·서비스명</dt>
          <dd>끄적끄적아지트</dd>
        </div>
        <div>
          <dt>공급자</dt>
          <dd>끄적끄적아지트</dd>
        </div>
        <div className="learning-support-guide__summary-wide">
          <dt>접속 경로</dt>
          <dd><a href="/">끄적끄적아지트.site</a></dd>
        </div>
        <div className="learning-support-guide__summary-wide">
          <dt>주요 내용 및 기능·특장점</dt>
          <dd>
            글쓰기 활동을 기반으로 한 학급 경영 및 게이미피케이션 플랫폼입니다. 학생들의 꾸준한 글쓰기와
            긍정적인 행동 강화, 퀘스트 수행, 포인트 관리 등을 통해 학급 경영을 지원하는 비교과용 에듀테크
            서비스입니다.
          </dd>
        </div>
      </dl>
    </section>

    <section className="learning-support-guide__section" aria-labelledby="learning-support-privacy-title">
      <div className="learning-support-guide__section-heading">
        <span aria-hidden="true">02</span>
        <div>
          <p>PRIVACY</p>
          <h3 id="learning-support-privacy-title">개인정보보호 기준 충족 여부</h3>
        </div>
      </div>

      <div className="learning-support-guide__table-wrap" tabIndex="0" role="region" aria-label="개인정보보호 기준 충족 여부 표">
        <table>
          <caption>교육지원 소프트웨어 도입에 필요한 개인정보보호 선정기준 확인표</caption>
          <thead>
            <tr>
              <th scope="col">선정기준</th>
              <th scope="col">세부 내용</th>
              <th scope="col">충족</th>
              <th scope="col">미충족</th>
              <th scope="col">해당 없음</th>
              <th scope="col">증빙</th>
            </tr>
          </thead>
          <tbody>
            {criteriaGroups.flatMap((group) => group.items.map((item, itemIndex) => (
              <tr key={item.id}>
                {itemIndex === 0 && (
                  <th scope="rowgroup" rowSpan={group.items.length}>{group.criterion}</th>
                )}
                <td>{item.id}. {item.detail}</td>
                <td className="learning-support-guide__status learning-support-guide__status-met">
                  <span aria-hidden="true">☑</span><span className="learning-support-guide__sr-only">충족</span>
                </td>
                <td className="learning-support-guide__status" aria-label="미충족 아님">□</td>
                <td className="learning-support-guide__status" aria-label="해당 없음 아님">□</td>
                <td><a href="/privacy">{item.evidence}</a></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <p className="learning-support-guide__privacy-link">
        세부 내용은 <a href="/privacy">끄적끄적아지트 개인정보 처리방침</a>에서 확인할 수 있습니다.
      </p>
    </section>

    <section className="learning-support-guide__section" aria-labelledby="learning-support-download-title">
      <div className="learning-support-guide__section-heading">
        <span aria-hidden="true">03</span>
        <div>
          <p>DOWNLOAD</p>
          <h3 id="learning-support-download-title">운영위 심의를 위한 제출 양식</h3>
        </div>
      </div>

      <div className="learning-support-guide__download-card">
        <div className="learning-support-guide__download-copy">
          <span className="learning-support-guide__file-mark" aria-hidden="true">HWPX</span>
          <div>
            <strong>학교운영위원회 안건 상정 자료</strong>
            <p>
              본 서비스는 교과 콘텐츠를 담지 않는 비교과용 에듀테크 서비스입니다. 학교에서 심의를
              진행하고자 할 때 학교 상황에 맞게 아래 양식을 내려받아 사용하시기 바랍니다.
            </p>
          </div>
        </div>
        <a
          className="learning-support-guide__download-button"
          href="/downloads/school-operations-committee-agenda.hwpx"
          download="학교운영위원회_안건_상정_자료.hwpx"
        >
          제출 양식 내려받기
          <span aria-hidden="true">↓</span>
        </a>
      </div>
      <p className="learning-support-guide__notice">
        이 자료는 학교 검토를 돕기 위한 참고자료입니다. 최종 심의 필요 여부와 제출 내용은 학교 및 관할
        교육청의 최신 지침에 따라 확인해 주세요.
      </p>
    </section>
  </article>
);

export default LearningSupportSoftwareGuide;
