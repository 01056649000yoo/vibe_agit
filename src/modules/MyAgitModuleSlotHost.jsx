import React, { lazy, Suspense } from 'react';
import { getAllModules } from './registry';

const MY_AGIT_ENTRIES = new Map(
    getAllModules()
        .filter((module) => typeof module.myAgitEntry === 'function')
        .map((module) => [module.id, lazy(module.myAgitEntry)])
);

class MyAgitSlotErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error) {
        console.error(`[나의 아지트 슬롯] ${this.props.moduleName} 표시 오류:`, error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    marginBottom: '14px', padding: '18px', border: '1px solid #F0D9C3', borderRadius: '20px',
                    background: '#FFF8F1', color: '#8D6E63', textAlign: 'center', fontSize: '.78rem', fontWeight: 850
                }}>
                    {this.props.moduleName} 공간을 잠시 불러오지 못했어요.
                </div>
            );
        }
        return this.props.children;
    }
}

/**
 * 나의 아지트 모듈 확장 슬롯.
 * 공통 화면은 활성 모듈과 순서만 해석하고 카드 UI·상태 해석은 각 모듈 entry가 소유한다.
 */
const MyAgitModuleSlotHost = ({ enabledModules = [], runtimeByModule = {}, onOpenModule }) => {
    const slots = enabledModules
        .filter((module) => typeof module.myAgitEntry === 'function' && MY_AGIT_ENTRIES.has(module.id))
        .sort((left, right) => (left.myAgit?.order ?? 100) - (right.myAgit?.order ?? 100));

    return slots.map((module) => {
        const SlotComponent = MY_AGIT_ENTRIES.get(module.id);
        return (
            <MyAgitSlotErrorBoundary key={module.id} moduleName={module.name}>
                <Suspense fallback={(
                    <div style={{
                        minHeight: '120px', marginBottom: '14px', display: 'grid', placeItems: 'center',
                        borderRadius: '20px', background: '#FFF8E8', color: '#8D6E63', fontSize: '.78rem', fontWeight: 850
                    }}>
                        {module.icon || '🏡'} 공간을 준비하는 중...
                    </div>
                )}>
                    <SlotComponent
                        module={module}
                        runtime={runtimeByModule[module.id]}
                        onOpen={() => onOpenModule?.(module)}
                    />
                </Suspense>
            </MyAgitSlotErrorBoundary>
        );
    });
};

export default MyAgitModuleSlotHost;
