import { useEffect, useId, useRef, useState } from 'react';
import { searchSchools } from '../../utils/schoolApi';

const defaultInputStyle = {
    width: '100%', padding: '12px', borderRadius: '12px',
    border: '2px solid #ECEFF1', fontSize: '1rem', outline: 'none', boxSizing: 'border-box'
};

export default function SchoolSearchField({
    value,
    onValueChange,
    selectedSchool,
    onSelect,
    placeholder = '초등학교 이름을 입력해 주세요',
    inputStyle = null,
    disabled = false
}) {
    const listboxId = useId();
    const rootRef = useRef(null);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const close = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    useEffect(() => {
        const query = String(value || '').trim();
        if (disabled || selectedSchool?.schoolName === value || query.length < 2) {
            setResults([]);
            setOpen(false);
            setLoading(false);
            setError('');
            return undefined;
        }

        let active = true;
        const timer = window.setTimeout(async () => {
            setLoading(true);
            setError('');
            try {
                const schools = await searchSchools(query);
                if (!active) return;
                setResults(schools);
                setOpen(true);
            } catch (searchError) {
                if (!active) return;
                setResults([]);
                setOpen(true);
                setError(searchError.message || '학교를 검색하지 못했습니다.');
            } finally {
                if (active) setLoading(false);
            }
        }, 350);
        return () => {
            active = false;
            window.clearTimeout(timer);
        };
    }, [disabled, selectedSchool?.schoolName, value]);

    const handleChange = (event) => {
        onValueChange(event.target.value);
        onSelect(null);
    };

    const choose = (school) => {
        onValueChange(school.schoolName);
        onSelect(school);
        setOpen(false);
    };

    return (
        <div ref={rootRef} style={{ position: 'relative' }}>
            <input
                type="text"
                value={value}
                onChange={handleChange}
                onFocus={() => results.length > 0 && setOpen(true)}
                placeholder={placeholder}
                disabled={disabled}
                autoComplete="off"
                role="combobox"
                aria-expanded={open}
                aria-controls={listboxId}
                aria-autocomplete="list"
                style={{ ...defaultInputStyle, ...(inputStyle || {}) }}
            />
            {selectedSchool ? (
                <div style={{ marginTop: '6px', color: '#047857', fontSize: '0.78rem', fontWeight: 800 }}>
                    선택됨 · {selectedSchool.address || selectedSchool.region || '초등학교'}
                </div>
            ) : value?.trim().length >= 2 ? (
                <div style={{ marginTop: '6px', color: '#B45309', fontSize: '0.76rem' }}>
                    아래 검색 결과에서 학교를 선택해 주세요.
                </div>
            ) : null}
            {loading ? (
                <div style={{ marginTop: '6px', color: '#64748B', fontSize: '0.76rem' }}>학교를 찾고 있습니다…</div>
            ) : null}
            {open ? (
                <div id={listboxId} role="listbox" style={{
                    position: 'absolute', zIndex: 50, top: 'calc(100% + 6px)', left: 0, right: 0,
                    maxHeight: '240px', overflowY: 'auto', padding: '6px', border: '1px solid #CBD5E1',
                    borderRadius: '14px', background: 'white', boxShadow: '0 16px 38px rgba(15,23,42,.16)'
                }}>
                    {error ? <div style={{ padding: '12px', color: '#B91C1C', fontSize: '0.82rem' }}>{error}</div> : null}
                    {!error && results.length === 0 && !loading ? (
                        <div style={{ padding: '12px', color: '#64748B', fontSize: '0.82rem' }}>일치하는 초등학교가 없습니다.</div>
                    ) : null}
                    {results.map((school) => (
                        <button
                            type="button"
                            role="option"
                            aria-selected={selectedSchool?.schoolCode === school.schoolCode}
                            key={`${school.officeCode}:${school.schoolCode}`}
                            onClick={() => choose(school)}
                            style={{
                                width: '100%', display: 'block', padding: '11px', border: 0, borderRadius: '10px',
                                background: 'transparent', textAlign: 'left', cursor: 'pointer', color: '#1E293B'
                            }}
                        >
                            <strong style={{ display: 'block', fontSize: '0.9rem' }}>{school.schoolName}</strong>
                            <span style={{ display: 'block', marginTop: '3px', color: '#64748B', fontSize: '0.74rem' }}>
                                {[school.region, school.address].filter(Boolean).join(' · ')}
                            </span>
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}
