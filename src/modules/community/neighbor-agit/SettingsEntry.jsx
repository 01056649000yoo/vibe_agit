const NeighborAgitSettingsEntry = ({ activeClass, isMobile }) => (
    <section style={{
        minHeight: '280px', padding: isMobile ? '24px 18px' : '38px', boxSizing: 'border-box',
        display: 'grid', placeItems: 'center', border: '1px solid #DCE6EE', borderRadius: '22px',
        background: 'linear-gradient(145deg,#FFFFFF,#F0FDFA)', textAlign: 'center'
    }}>
        <div style={{ maxWidth: '560px' }}>
            <div aria-hidden="true" style={{ fontSize: '3rem' }}>🤝</div>
            <h3 style={{ margin: '12px 0 8px', color: '#134E4A', fontSize: '1.25rem' }}>이웃 아지트</h3>
            <p style={{ margin: 0, color: '#52706D', fontSize: '.88rem', lineHeight: 1.7 }}>
                {activeClass?.name ? `${activeClass.name}과 ` : '우리 학급과 '}연결한 다른 학급의 글을 읽고 나누는 독립 공간을 준비하고 있습니다.
                학급 생성·삭제 같은 기본 관리는 왼쪽의 학급 관리에서 계속합니다.
            </p>
            <span style={{ display: 'inline-block', marginTop: '18px', padding: '7px 11px', borderRadius: '10px', background: '#CCFBF1', color: '#0F766E', fontSize: '.76rem', fontWeight: 900 }}>
                운영 기능 준비 중
            </span>
        </div>
    </section>
);

export default NeighborAgitSettingsEntry;
