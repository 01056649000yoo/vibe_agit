import React from 'react';

class FriendProfileCardBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error(`[FriendProfile:${this.props.cardId}] 카드 오류:`, error, errorInfo);
    }

    componentDidUpdate(previousProps) {
        if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (this.state.hasError) {
            return (
                <section style={{ marginTop: '24px', padding: '28px 20px', borderRadius: '22px', border: '1px solid #FFCDD2', background: '#FFF8F8', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.6rem', marginBottom: '8px' }}>🧩</div>
                    <strong style={{ display: 'block', color: '#B71C1C' }}>{this.props.title}만 잠시 열지 못했어요.</strong>
                    <p style={{ margin: '7px 0 12px', color: '#8D6E63', fontSize: '.82rem' }}>다른 아지트 정보는 계속 구경할 수 있어요.</p>
                    <button type="button" onClick={() => this.setState({ hasError: false })} style={{ border: 0, borderRadius: '10px', padding: '8px 13px', background: '#FFEBEE', color: '#C62828', fontWeight: 850, cursor: 'pointer' }}>이 카드 다시 열기</button>
                </section>
            );
        }

        return this.props.children;
    }
}

export default FriendProfileCardBoundary;
