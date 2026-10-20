import React, { useState } from 'react';
import WritingChangeHighlight from '../modules/writing/review/WritingChangeHighlight';
import WritingAttributedText from '../modules/writing/review/WritingAttributedText';
import { attributeWritingChanges } from '../modules/writing/review/writingAttribution.js';
import { TeacherEditBanner, TeacherEditToggle, getTeacherEditBlockedReason } from '../components/teacher/TeacherEditToggle';
import RevisionCountChip from '../modules/writing/review/RevisionCountChip';
import WritingVersionSwitch, { WRITING_VIEW, useWritingVersion } from '../modules/writing/review/WritingVersionSwitch';

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

// 처음 글 → (학생) → 선생님이 고치기 전 글 → (선생님) → 수정본 → (학생) → 지금 글
const ATTRIBUTION_SAMPLE = {
    original: SAMPLES.short.before,
    rounds: [{
        base_content: '오늘은 운동장이 더 넓어 보였다. 이어달리기를 할수 있어서 신났다.\n우리 반이 이겼다.',
        edited_content: '오늘은 운동장이 더 넓어 보였다. 이어달리기를 할 수 있어서 신났다.\n우리 반이 힘을 모아 이겼다.'
    }],
    current: '오늘은 운동장이 더 넓어 보였다. 이어달리기를 할 수 있어서 정말 신났다.\n우리 반이 힘을 모아 이겼다. 다음에도 뛰고 싶다.'
};

const box = { padding: 20, borderRadius: 16, border: '1px solid var(--ui-border)', background: 'var(--ui-surface)', fontSize: '1.1rem', lineHeight: 1.8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' };

export default function WritingChangePreview() {
    const [sampleId, setSampleId] = useState('short');
    const [approved, setApproved] = useState(true);
    const [editing, setEditing] = useState(false);
    const sample = Reflect.get(SAMPLES, sampleId) || SAMPLES.short;
    const version = useWritingVersion({ postId: `preview-${sampleId}`, before: sample.before, after: sample.after, approved });
    return (
        <div style={{ padding: 16, background: 'var(--ui-page)', display: 'grid', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {Object.entries(SAMPLES).map(([id, item]) => (
                    <button key={id} type="button" aria-pressed={id === sampleId} onClick={() => setSampleId(id)}>{item.label}</button>
                ))}
                <label><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> 승인된 글</label>
            </div>
            <section>
                <h3>전환형(내 서재·친구 글·학생 아지트·글쓰기 화면)</h3>
                <WritingVersionSwitch {...version} onChange={version.setView} />
                <div style={box}>
                    {version.view === WRITING_VIEW.CHANGES
                        ? <WritingChangeHighlight before={sample.before} after={sample.after} showLegend={false} />
                        : version.view === WRITING_VIEW.ORIGINAL ? sample.before : sample.after}
                </div>
            </section>
            <section>
                <h3>교사 글 자세히 보기 — 제목 줄의 직접 고쳐 주기</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingBottom: 12, borderBottom: '2px solid var(--ui-border)' }}>
                    <h2 style={{ margin: 0 }}>우리 반 체육 대회</h2>
                    <TeacherEditToggle
                        active={editing}
                        blockedReason={getTeacherEditBlockedReason({ isReportPost: false, isConfirmed: approved })}
                        onToggle={() => setEditing((value) => !value)}
                    />
                </div>
                {editing && !approved ? <div style={{ marginTop: 12 }}><TeacherEditBanner /></div> : null}
                <p style={{ color: 'var(--ui-ink-muted)' }}>승인된 글이면 흐리게 두고 까닭을 적는다 — 위 `승인된 글` 을 꺼서 눌러 본다.</p>
            </section>
            <section>
                <h3>목록 카드</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <strong>1. 김아지</strong>
                    <RevisionCountChip count={approved ? version.changeCount : 0} />
                    <RevisionCountChip count={approved ? version.changeCount : 0} compact />
                </div>
            </section>
            <section>
                <h3>교사 글 자세히 보기 — 처음 글과 나란히(학생·선생님 구분)</h3>
                <AttributedSection />
            </section>
            <section>
                <h3>학생 내 글 보기 — 바뀐 곳(내가 고친 곳·선생님이 고쳐 준 곳)</h3>
                <StudentMergedSection />
            </section>
            <section>
                <h3>교사 글 자세히 보기 — 단계 탭(선생님 교정 0회·1회)</h3>
                <StepTabsSection rounds={0} />
                <StepTabsSection rounds={1} />
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

function StepTabsSection({ rounds }) {
    const version = useWritingVersion({
        postId: `steps-${rounds}`, before: ATTRIBUTION_SAMPLE.original, after: ATTRIBUTION_SAMPLE.current,
        approved: false, teacherEditRounds: rounds, sideBySide: true
    });
    return (
        <div data-testid={`steps-${rounds}`}>
            <WritingVersionSwitch {...version} onChange={version.setView} layout="sideBySide" />
            <p>지금 칸: <b>{version.view}</b></p>
        </div>
    );
}

function AttributedSection() {
    const items = attributeWritingChanges(ATTRIBUTION_SAMPLE.original, ATTRIBUTION_SAMPLE.rounds, ATTRIBUTION_SAMPLE.current);
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }} data-testid="attributed-preview">
            <div style={box}><strong>🌱 최초 제출 (초안)</strong><br /><WritingAttributedText items={items} variant="before" /></div>
            <div style={box}><strong>✨ 현재 글 (선생님 교정본)</strong><br /><WritingAttributedText items={items} variant="after" showLegend={false} /></div>
        </div>
    );
}

function StudentMergedSection() {
    const items = attributeWritingChanges(ATTRIBUTION_SAMPLE.original, ATTRIBUTION_SAMPLE.rounds, ATTRIBUTION_SAMPLE.current);
    return (
        <div style={{ ...box, maxWidth: 560 }} data-testid="student-merged-preview">
            <WritingAttributedText items={items} variant="merged" studentLabel="내가 고친 곳" />
        </div>
    );
}
