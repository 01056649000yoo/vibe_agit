import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';

const NeighborAgitTeacherEntry = ({ activeClass, isMobile }) => (
    <section style={{
        minHeight: '280px', padding: isMobile ? '24px 18px' : '38px', boxSizing: 'border-box',
        display: 'grid', placeItems: 'center', border: '1px solid #DCE6EE', borderRadius: '22px',
        background: 'linear-gradient(145deg,#FFFFFF,#F0FDFA)', textAlign: 'center'
    }}>
        <div style={{ maxWidth: '560px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{
                    display: 'inline-block', padding: '7px 11px', borderRadius: '10px',
                    background: '#CCFBF1', color: '#0F766E', fontSize: 'var(--ui-text-sm)', fontWeight: 900
                }}>
                    Beta · 운영 기능 준비 중
                </span>
                <TeacherGuideButton tabId="neighbor-agit" variant="help" />
            </div>
            <div aria-hidden="true" style={{ marginTop: '18px', fontSize: '3rem' }}>🤝</div>
            <h1 style={{ margin: '10px 0 0', color: '#164E63', fontSize: 'var(--ui-text-2xl)', fontWeight: 950 }}>
                이웃 아지트
            </h1>
            <p style={{ margin: '12px 0 0', color: '#52706D', fontSize: 'var(--ui-text-md)', lineHeight: 1.7 }}>
                {activeClass?.name ? `${activeClass.name}과 ` : '우리 학급과 '}연결한 다른 학급의 글을 읽고 나누는 독립 공간을 준비하고 있습니다.
                학급 생성·삭제 같은 기본 관리는 설정의 학급 관리에서 계속합니다.
            </p>
        </div>
    </section>
);

export default NeighborAgitTeacherEntry;
