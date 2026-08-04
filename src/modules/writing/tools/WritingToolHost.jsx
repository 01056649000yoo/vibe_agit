import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getWritingToolManifests } from './registry';
import './writingToolTrigger.css';

/**
 * 글쓰기 도우미 도구들의 공통 자리.
 *
 * 도구 본체는 **학생이 열어야** 내려받는다. 버튼만 먼저 그려 두고, 누르거나
 * (밑줄 칩처럼) 다른 곳에서 열어 달라는 신호가 오면 그때 본체를 받는다.
 * 그래서 글쓰기 창을 열기만 한 학생은 도구 본체를 받지 않는다.
 */
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

const WritingToolHost = ({ disabled = false }) => {
    // 열어 달라는 요청이 온 도구만 담는다. { [도구id]: { query, correction, at } }
    const [openRequests, setOpenRequests] = useState({});

    const requestOpen = useCallback((toolId, detail = {}) => {
        setOpenRequests((previous) => ({
            ...previous,
            [toolId]: {
                query: String(detail.query || ''),
                correction: detail.correction || null,
                // 같은 낱말을 다시 눌러도 수첩이 새로 열리도록 매번 값을 바꾼다.
                at: Date.now()
            }
        }));
    }, []);

    const closeTool = useCallback((toolId) => {
        setOpenRequests((previous) => {
            if (!(toolId in previous)) return previous;
            const next = { ...previous };
            Reflect.deleteProperty(next, toolId);
            return next;
        });
    }, []);

    // 닫기 함수가 렌더마다 새로 만들어지면 도구 쪽 useEffect 가 매번 다시 돌아
    // 배경 스크롤 잠금이 풀리지 않는다. 도구별로 한 번만 만들어 둔다.
    const closeHandlers = useMemo(() => Object.fromEntries(
        WRITING_TOOLS.map((tool) => [tool.id, () => closeTool(tool.id)])
    ), [closeTool]);

    // 밑줄 칩처럼 도구 바깥에서 "이 낱말로 열어 줘" 하고 보내는 신호를 받는다.
    // 본체를 아직 안 받았어도 여기서 먼저 잡아 두므로 신호를 놓치지 않는다.
    const openEvents = useMemo(
        () => WRITING_TOOLS.filter((tool) => tool.openEventName),
        []
    );
    useEffect(() => {
        const listeners = openEvents.map((tool) => {
            const handler = (event) => requestOpen(tool.id, event.detail || {});
            window.addEventListener(tool.openEventName, handler);
            return () => window.removeEventListener(tool.openEventName, handler);
        });
        return () => listeners.forEach((remove) => remove());
    }, [openEvents, requestOpen]);

    return (
        <aside
            aria-label="글쓰기 도움 도구"
            className="writing-tool-host"
        >
            {WRITING_TOOLS.map(({ id, label, triggerLabel, triggerHelp, Component }) => {
                const request = Reflect.get(openRequests, id);
                return (
                    <WritingToolErrorBoundary key={id} toolLabel={label}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                className="spelling-lookup-trigger"
                                onClick={() => requestOpen(id)}
                                disabled={disabled}
                                aria-haspopup="dialog"
                            >
                                <Search size={19} aria-hidden="true" />
                                <span>{triggerLabel || label}</span>
                            </button>
                            {triggerHelp && <span className="spelling-lookup-trigger-help">{triggerHelp}</span>}
                        </div>

                        {request && (
                            <Suspense fallback={null}>
                                <Component
                                    key={request.at}
                                    initialQuery={request.query}
                                    correction={request.correction}
                                    onClose={Reflect.get(closeHandlers, id)}
                                />
                            </Suspense>
                        )}
                    </WritingToolErrorBoundary>
                );
            })}
        </aside>
    );
};

export default WritingToolHost;
