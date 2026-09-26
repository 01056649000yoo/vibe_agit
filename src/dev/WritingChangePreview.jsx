import React, { useState } from 'react';
import WritingChangeHighlight from '../modules/writing/review/WritingChangeHighlight';

/*
 * 승인된 글의 처음 글 → 고친 글 형광펜 미리보기 (2026-09-26).
 * 실제 부품을 DB 없이 띄운다. 전환형 화면(합친 보기)과 나란히 보기(처음·최종), 승인 전(칠하지 않음),
 * 문단이 많은 글·공백만 바뀐 글을 한 화면에서 본다.
 */
const SAMPLES = {
    short: {
        label: '짧은 글',
        before: '오늘은 운동장이 넓어 보였다. 이어달리기를 할수 있어서 신났다.\n우리 반이 이겼다.',
        after: '오늘은 웬지 운동장이 더 넓어 보였다. 이어달리기를 할 수 있어서 정말 신났다.\n우리 반이 끝까지 힘을 모아 이겼다. 다음에도 함께 뛰고 싶다.'
    },
    long: {
        label: '문단 많은 글',
        before: '나는 강아지를 키우고 싶다. 강아지는 귀엽다.\n\n하지만 엄마는 안 된다고 하셨다. 왜냐하면 집이 좁기 때문이다.\n\n그래서 나는 슬펐다.',
        after: '나는 강아지를 꼭 키우고 싶다. 강아지는 귀엽고 나를 반겨 준다.\n\n하지만 엄마는 안 된다고 하셨다. 왜냐하면 집이 좁고 낮에는 돌볼 사람이 없기 때문이다.\n\n그래서 나는 엄마와 약속을 정해 보기로 했다. 산책은 내가 맡겠다고 말씀드릴 것이다.'
    },
    spaces: { label: '줄바꿈만 바뀐 글', before: '첫 줄\n둘째 줄', after: '첫 줄\n\n둘째 줄' }
};

const box = { padding: 20, borderRadius: 16, border: '1px solid var(--ui-border)', background: 'var(--ui-surface)', fontSize: '1.1rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

export default function WritingChangePreview() {
    const [sampleId, setSampleId] = useState('short');
    const [approved, setApproved] = useState(true);
    const sample = Reflect.get(SAMPLES, sampleId) || SAMPLES.short;
    return (
        <div style={{ padding: 16, background: 'var(--ui-page)', display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {Object.entries(SAMPLES).map(([id, item]) => (
                    <button key={id} type="button" aria-pressed={id === sampleId} onClick={() => setSampleId(id)}>{item.label}</button>
                ))}
                <label><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> 승인된 글</label>
            </div>
            <section>
                <h3>전환형(내 서재·친구 글·학생 아지트·글쓰기 화면) — 처음글과 비교하기</h3>
                <div style={box}>
                    {approved
                        ? <WritingChangeHighlight before={sample.before} after={sample.after} />
                        : sample.before}
                </div>
            </section>
            <section>
                <h3>나란히 보기(글 자세히 보기·제출 현황)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                    <div style={box}><strong>🌱 최초 제출</strong><br /><WritingChangeHighlight variant="before" enabled={approved} before={sample.before} after={sample.after} /></div>
                    <div style={box}><strong>✨ 최종 제출</strong><br /><WritingChangeHighlight variant="after" enabled={approved} before={sample.before} after={sample.after} /></div>
                </div>
            </section>
        </div>
    );
}
