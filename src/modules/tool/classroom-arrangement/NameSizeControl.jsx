import { useCallback, useEffect, useState } from 'react';

/*
 * 이름 글자 크기 조절.
 *
 * 교실 전자칠판에 띄우면 기본 크기로는 **아이들이 자기 이름을 못 찾는다**(2026-08-24 지적).
 * 칠판 크기와 반 인원이 교실마다 달라 한 값으로는 맞출 수 없어 교사가 고르게 한다.
 *
 * 고른 값은 이 브라우저에 기억한다 — 자리를 뽑을 때마다 다시 고르게 하면 안 쓰게 된다.
 */

export const NAME_SIZE_STEPS = Object.freeze([
    { id: 'normal', label: '가', scale: 1, hint: '보통' },
    { id: 'large', label: '가', scale: 1.45, hint: '크게' },
    { id: 'huge', label: '가', scale: 2, hint: '아주 크게' }
]);

const STORAGE_KEY = 'arrangement_name_size_v1';

const readStored = () => {
    try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        return NAME_SIZE_STEPS.some((step) => step.id === saved) ? saved : 'normal';
    } catch {
        // 저장소가 막힌 환경에서도 화면은 그대로 돌아야 한다.
        return 'normal';
    }
};

export function useNameSize() {
    const [sizeId, setSizeId] = useState(readStored);

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, sizeId);
        } catch {
            // 기억하지 못해도 이번 화면에서는 고른 크기가 그대로 쓰인다.
        }
    }, [sizeId]);

    const scale = NAME_SIZE_STEPS.find((step) => step.id === sizeId)?.scale ?? 1;
    return { sizeId, setSizeId, scale };
}

export default function NameSizeControl({ sizeId, onChange }) {
    const pick = useCallback((id) => () => onChange?.(id), [onChange]);

    return (
        <div className="arrange-name-size" role="group" aria-label="이름 글자 크기">
            <span>이름 크기</span>
            {NAME_SIZE_STEPS.map((step) => (
                <button
                    key={step.id}
                    type="button"
                    className={step.id === sizeId ? 'is-on' : ''}
                    aria-pressed={step.id === sizeId}
                    title={step.hint}
                    // 글자 자체를 단계별로 키워, 누르기 전에도 어느 정도인지 보이게 한다.
                    style={{ fontSize: `${0.72 * step.scale}rem` }}
                    onClick={pick(step.id)}
                >
                    {step.label}
                </button>
            ))}
        </div>
    );
}
