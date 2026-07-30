import React, { lazy, Suspense } from 'react';
import { getWritingToolManifests } from './registry';

const WRITING_TOOLS = getWritingToolManifests().map((manifest) => ({
    ...manifest,
    Component: lazy(manifest.studentEntry)
}));

class WritingToolErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error(`[글쓰기 도구] ${this.props.toolLabel} 표시 오류:`, error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <span style={{ color: '#8D6E63', fontSize: '0.8rem', fontWeight: 750 }}>
                    {this.props.toolLabel} 도구를 잠시 불러오지 못했어요. 글쓰기는 그대로 계속할 수 있어요.
                </span>
            );
        }
        return this.props.children;
    }
}

const WritingToolHost = ({ disabled = false }) => (
    <aside
        aria-label="글쓰기 도움 도구"
        style={{
            margin: '0 0 22px',
            padding: '12px 14px',
            border: '1px solid #DDEBE6',
            borderRadius: '16px',
            background: '#FBFEFD'
        }}
    >
        {WRITING_TOOLS.map(({ id, label, Component }) => (
            <WritingToolErrorBoundary key={id} toolLabel={label}>
                <Suspense
                    fallback={<span style={{ color: '#71817C', fontSize: '0.82rem' }}>글쓰기 도구를 준비하는 중...</span>}
                >
                    <Component disabled={disabled} />
                </Suspense>
            </WritingToolErrorBoundary>
        ))}
    </aside>
);

export default WritingToolHost;
