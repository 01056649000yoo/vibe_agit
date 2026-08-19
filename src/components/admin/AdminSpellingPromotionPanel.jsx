import { useCallback, useEffect, useMemo, useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { getElementarySpellingEntries } from '../../modules/writing/tools/spelling-lookup/elementarySpellingEntries';

/**
 * 한 달에 한 번, 모인 표현을 훑어 기본 자료 500개로 올릴 것을 고르는 화면.
 *
 * **기준은 "여러 학급에서 되풀이"다.** 한 학급에서만 많이 나온 표현은 그 반의 유행이거나
 * 한 학생의 버릇일 수 있다. 서로 다른 학급에서 되풀이될 때 비로소 우리 학생 전체가
 * 헷갈리는 표현이라고 말할 수 있다.
 *
 * ⚠️ 이 화면은 **카탈로그를 직접 고치지 않는다.** 기본 자료는 소스 코드(`catalog/*.js`)라
 * 화면이 손댈 수 없다. 여기서는 ①고를 것을 정해 기록하고 ②저장소에 붙여 넣을 코드 조각을 만든다.
 * 실제 반영은 그 조각을 카탈로그 파일에 넣고 배포하는 것으로 끝난다.
 */
const normalize = (value) => String(value || '').normalize('NFC').replace(/\s+/g, '');

const AdminSpellingPromotionPanel = () => {
    const [minClasses, setMinClasses] = useState(2);
    const [minHits, setMinHits] = useState(3);
    const [data, setData] = useState({ ai_findings: [], searched: [], decided_recent: [] });
    const [selected, setSelected] = useState(() => new Set());
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [snippet, setSnippet] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        try {
            const { data: result, error } = await supabase.rpc('get_spelling_promotion_candidates_v1', {
                p_min_classes: minClasses,
                p_min_hits: minHits,
                p_limit: 200
            });
            if (error) throw error;
            setData(result || { ai_findings: [], searched: [], decided_recent: [] });
            setSelected(new Set());
        } catch (error) {
            setMessage(error.message || '후보를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    }, [minClasses, minHits]);

    useEffect(() => { load(); }, [load]);

    // 이미 기본 자료 500개에 있는 표현인지 화면에서 대조한다(카탈로그는 코드라 서버가 모른다).
    const builtInIndex = useMemo(() => {
        const index = new Set();
        for (const entry of getElementarySpellingEntries()) {
            for (const value of [entry.question, entry.answer, ...(entry.searchable || [])]) {
                if (value) index.add(normalize(value));
            }
        }
        return index;
    }, []);

    const findings = useMemo(() => (data.ai_findings || []).map((row) => ({
        ...row,
        alreadyKnown: builtInIndex.has(normalize(row.expression))
    })), [builtInIndex, data.ai_findings]);

    const newFindings = findings.filter((row) => !row.alreadyKnown);
    const keyOf = (row) => `${row.expression}→${row.correction}`;

    const toggle = (row) => {
        setSelected((current) => {
            const next = new Set(current);
            const key = keyOf(row);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const selectedRows = newFindings.filter((row) => selected.has(keyOf(row)));

    const decide = async (decision) => {
        if (selectedRows.length === 0) return;
        setLoading(true);
        setMessage('');
        try {
            const { error } = await supabase.rpc('record_spelling_promotion_decisions_v1', {
                p_items: selectedRows.map((row) => ({ expression: row.expression, correction: row.correction })),
                p_decision: decision
            });
            if (error) throw error;
            if (decision === 'accepted') setSnippet(buildCatalogSnippet(selectedRows));
            setMessage(decision === 'accepted'
                ? `${selectedRows.length}개를 반영 대상으로 기록했습니다. 아래 코드를 카탈로그에 붙여 넣고 배포하면 끝납니다.`
                : `${selectedRows.length}개를 보류로 기록했습니다. 다음 검토에서 다시 보이지 않습니다.`);
            await load();
        } catch (error) {
            setMessage(error.message || '결정을 기록하지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <Card style={{ padding: '24px', borderLeft: '5px solid #805AD5' }}>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '1.15rem', color: '#2D3748' }}>🔤 맞춤법 기본 자료 승격 검토</h3>
                <p style={{ margin: '0 0 16px 0', color: '#718096', fontSize: '0.9rem', lineHeight: 1.7 }}>
                    학생이 찾아본 표현과 AI 검사가 찾아낸 표현이 계속 쌓입니다. <strong>한 달에 한 번</strong> 훑어보고,
                    <strong> 서로 다른 학급에서 되풀이되는 것만</strong> 기본 자료로 올립니다.
                    한 학급에서만 많이 나온 표현은 그 반의 유행일 수 있어 기준에서 뺍니다.
                </p>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <label style={{ display: 'grid', gap: '4px', fontSize: '0.82rem', fontWeight: 700, color: '#4A5568' }}>
                        최소 학급 수
                        <input type="number" min={1} max={20} value={minClasses}
                            onChange={(event) => setMinClasses(Number(event.target.value) || 1)}
                            style={{ width: '90px', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '8px' }} />
                    </label>
                    <label style={{ display: 'grid', gap: '4px', fontSize: '0.82rem', fontWeight: 700, color: '#4A5568' }}>
                        최소 횟수
                        <input type="number" min={1} max={100} value={minHits}
                            onChange={(event) => setMinHits(Number(event.target.value) || 1)}
                            style={{ width: '90px', padding: '8px 10px', border: '1px solid #CBD5E0', borderRadius: '8px' }} />
                    </label>
                    <Button type="button" variant="outline" onClick={load} disabled={loading}>
                        {loading ? '불러오는 중…' : '다시 불러오기'}
                    </Button>
                </div>
                {(() => {
                    // 한 달에 한 번 하는 일이라, 마지막 검토가 언제였는지를 눈에 보이게 둔다.
                    const last = (data.decided_recent || [])[0]?.decided_at;
                    if (!last) return <p style={{ margin: '14px 0 0', color: '#805AD5', fontSize: '0.85rem', fontWeight: 700 }}>아직 검토한 기록이 없습니다. 첫 검토를 해 보세요.</p>;
                    const days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
                    const overdue = days >= 30;
                    return (
                        <p style={{ margin: '14px 0 0', color: overdue ? '#C05621' : '#718096', fontSize: '0.85rem', fontWeight: overdue ? 800 : 600 }}>
                            마지막 검토: {new Date(last).toLocaleDateString('ko-KR')} ({days}일 전)
                            {overdue && ' — 한 달이 지났어요. 이번 달 검토를 해 주세요.'}
                        </p>
                    );
                })()}
                {message && <p style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: '8px', background: '#EBF8FF', color: '#2C5282', fontSize: '0.85rem' }}>{message}</p>}
            </Card>

            <Card style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <h4 style={{ margin: 0, fontSize: '1rem', color: '#2D3748' }}>
                        AI 검사가 찾은 표현 <span style={{ color: '#805AD5' }}>{newFindings.length}개</span>
                        {findings.length - newFindings.length > 0 && (
                            <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: '#A0AEC0' }}>
                                (이미 기본 자료에 있는 {findings.length - newFindings.length}개는 숨김)
                            </span>
                        )}
                    </h4>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button type="button" variant="outline" size="sm" disabled={loading || selectedRows.length === 0} onClick={() => decide('rejected')}>
                            보류 {selectedRows.length > 0 && `(${selectedRows.length})`}
                        </Button>
                        <Button type="button" size="sm" disabled={loading || selectedRows.length === 0} onClick={() => decide('accepted')}>
                            반영 대상으로 확정 {selectedRows.length > 0 && `(${selectedRows.length})`}
                        </Button>
                    </div>
                </div>

                {newFindings.length === 0 ? (
                    <p style={{ margin: 0, padding: '24px', textAlign: 'center', color: '#A0AEC0', fontSize: '0.9rem' }}>
                        기준을 넘는 새 표현이 없습니다. 기준을 낮추거나 다음 달에 다시 확인해 주세요.
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ background: '#F7FAFC', textAlign: 'left' }}>
                                    <th style={{ padding: '8px' }}>고름</th>
                                    <th style={{ padding: '8px' }}>틀린 표현</th>
                                    <th style={{ padding: '8px' }}>바른 표현</th>
                                    <th style={{ padding: '8px' }}>학급</th>
                                    <th style={{ padding: '8px' }}>횟수</th>
                                    <th style={{ padding: '8px' }}>마지막</th>
                                </tr>
                            </thead>
                            <tbody>
                                {newFindings.map((row) => (
                                    <tr key={keyOf(row)} style={{ borderBottom: '1px solid #EDF2F7' }}>
                                        <td style={{ padding: '8px' }}>
                                            <input type="checkbox" checked={selected.has(keyOf(row))} onChange={() => toggle(row)} />
                                        </td>
                                        <td style={{ padding: '8px', color: '#C53030', fontWeight: 700 }}>{row.expression}</td>
                                        <td style={{ padding: '8px', color: '#2F855A', fontWeight: 700 }}>{row.correction}</td>
                                        <td style={{ padding: '8px' }}>{row.class_count}학급</td>
                                        <td style={{ padding: '8px' }}>{row.hit_count}회</td>
                                        <td style={{ padding: '8px', color: '#718096' }}>{new Date(row.last_seen_at).toLocaleDateString('ko-KR')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {snippet && (
                <Card style={{ padding: '24px', borderLeft: '5px solid #38A169' }}>
                    <h4 style={{ margin: '0 0 6px 0', fontSize: '1rem', color: '#2D3748' }}>📋 카탈로그에 붙여 넣을 코드</h4>
                    <p style={{ margin: '0 0 12px 0', color: '#718096', fontSize: '0.85rem', lineHeight: 1.7 }}>
                        알맞은 분류 파일(`catalog/wordCatalog.js` 등)에 넣고 `sortOrder`·`id`를 이어지는 값으로 고친 뒤,
                        <strong> `npm run spelling:check`</strong>를 돌려 오탐이 없는지 확인하고 배포합니다.
                    </p>
                    <textarea readOnly value={snippet} rows={Math.min(14, snippet.split('\n').length + 1)}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '12px', border: '1px solid #CBD5E0', borderRadius: '10px', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.6 }} />
                    <Button type="button" variant="outline" size="sm" style={{ marginTop: '10px' }}
                        onClick={() => navigator.clipboard?.writeText(snippet)}>
                        복사하기
                    </Button>
                </Card>
            )}

            <Card style={{ padding: '24px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#2D3748' }}>
                    학생이 직접 찾아본 표현 <span style={{ color: '#805AD5' }}>{(data.searched || []).length}개</span>
                </h4>
                <p style={{ margin: '0 0 12px 0', color: '#718096', fontSize: '0.85rem' }}>
                    수첩에서 찾았지만 우리 자료에 없던 표현입니다. 바른 표현이 없어 참고용으로만 보여 줍니다.
                </p>
                {(data.searched || []).length === 0 ? (
                    <p style={{ margin: 0, color: '#A0AEC0', fontSize: '0.88rem' }}>기준을 넘는 표현이 없습니다.</p>
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {(data.searched || []).map((row) => (
                            <span key={row.expression} style={{ padding: '6px 12px', borderRadius: '999px', background: '#FAF5FF', color: '#553C9A', fontSize: '0.82rem', fontWeight: 700 }}>
                                {row.expression} <span style={{ color: '#805AD5' }}>{row.class_count}학급 · {row.search_count}회</span>
                            </span>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};

/** 카탈로그에 붙여 넣을 `reference(...)` 줄을 만든다. id·sortOrder 는 사람이 채운다. */
function buildCatalogSnippet(rows) {
    const lines = rows.map((row) => {
        const question = `${row.expression} / ${row.correction}`;
        return `    reference(0, "TODO-id", "general", "exact", "expansion", ${JSON.stringify(question)}, ${JSON.stringify(row.correction)},`
            + `\n        "학생이 헷갈린 표현입니다. 설명을 다듬어 주세요.",`
            + `\n        ["${row.correction}을(를) 넣은 바른 예문 1", "${row.correction}을(를) 넣은 바른 예문 2"],`
            + `\n        { searchable: [${JSON.stringify(row.expression)}, ${JSON.stringify(row.correction)}] }),`;
    });
    return [
        '// 승격 후보 — sortOrder 와 id 를 이어지는 값으로 고치고 설명·예문을 손봐 주세요.',
        ...lines
    ].join('\n');
}

export default AdminSpellingPromotionPanel;
