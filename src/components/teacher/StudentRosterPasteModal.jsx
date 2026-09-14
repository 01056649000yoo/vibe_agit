import { useMemo, useState } from 'react';
import Button from '../common/Button';
import ModalCloseButton from '../common/ModalCloseButton.jsx';
import { parseStudentRoster, findExistingNames, STUDENT_ROSTER_MAX } from '../../lib/studentRoster.js';

/*
 * 명단 일괄 붙여넣기.
 *
 * 2026-09-14 사용자 분석: 학급까지 만든 교사 505명 중 학생을 등록한 사람은 168명이고,
 * 학생 0명으로 멈춘 337명 중 다시 들어온 사람은 2명이었다. 명단은 이미 나이스·엑셀·한글에
 * 있는데 한 명씩 치게 해 둔 탓이다. 여기서는 **붙여넣고 한 번 누르면** 끝난다.
 *
 * 보내기 전에 **무엇이 들어갈지 그대로 보여 준다** — 번호를 떼고 이름만 남기는 일을
 * 화면 뒤에서 조용히 하면, 선생님은 스물여덟 명을 넣고 스물여섯 명이 들어온 것을 모른다.
 */
const StudentRosterPasteModal = ({ students = [], isSaving = false, onClose, onSubmit }) => {
    const [text, setText] = useState('');
    const { names, dropped } = useMemo(() => parseStudentRoster(text), [text]);
    const existing = useMemo(() => findExistingNames(names, students), [names, students]);

    return (
        <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--ui-space-4)', background: 'rgba(15,23,42,.5)' }}>
            <section role="dialog" aria-modal="true" aria-label="명단 일괄 붙여넣기"
                style={{ width: 'min(640px, 100%)', maxHeight: '92vh', overflowY: 'auto', background: 'var(--ui-surface-raised)', borderRadius: 'var(--ui-radius-xl)', boxShadow: 'var(--ui-shadow-modal)', padding: 'var(--ui-space-6)' }}>
                <header style={{ display: 'flex', gap: 'var(--ui-space-4)', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ margin: '0 0 var(--ui-space-2)', fontSize: 'var(--ui-text-xl)', fontWeight: 900, color: 'var(--ui-ink-strong)' }}>명단 일괄 붙여넣기</h2>
                        <p style={{ margin: 0, fontSize: 'var(--ui-text-sm)', lineHeight: 'var(--ui-line-body)', color: 'var(--ui-ink-muted)' }}>
                            나이스·엑셀·한글에서 <strong>이름 칸을 그대로 긁어</strong> 붙여넣으세요.
                            번호가 같이 붙어 와도 됩니다. 한 번에 {STUDENT_ROSTER_MAX}명까지예요.
                        </p>
                    </div>
                    <ModalCloseButton onClick={onClose} label="명단 일괄 붙여넣기 닫기" />
                </header>

                <label style={{ display: 'block', margin: 'var(--ui-space-4) 0 var(--ui-space-2)', fontSize: 'var(--ui-text-sm)', fontWeight: 700, color: 'var(--ui-ink-strong)' }}>
                    붙여넣을 명단
                    <textarea
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        rows={8}
                        placeholder={'1\t김민준\n2\t이서연\n3\t박도윤'}
                        style={{ display: 'block', width: '100%', marginTop: '6px', padding: 'var(--ui-space-3)', font: 'inherit', fontWeight: 400, border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius-md)', resize: 'vertical' }}
                    />
                </label>

                <div aria-live="polite" style={{ fontSize: 'var(--ui-text-sm)', color: 'var(--ui-ink-muted)' }}>
                    <p style={{ margin: '0 0 var(--ui-space-2)' }}>
                        들어갈 학생 <strong style={{ color: 'var(--ui-primary)' }}>{names.length}명</strong>
                        {names.length > 0 && <span> · {names.slice(0, 6).join(', ')}{names.length > 6 ? ` 외 ${names.length - 6}명` : ''}</span>}
                    </p>
                    {existing.length > 0 && (
                        <p style={{ margin: '0 0 var(--ui-space-2)', color: 'var(--ui-danger)', fontWeight: 700 }}>
                            이 학급에 이미 있는 이름 {existing.length}개: {existing.slice(0, 5).join(', ')}
                            {existing.length > 5 ? ' 외' : ''} — 같은 이름의 학생이 둘이면 그대로 두셔도 됩니다.
                        </p>
                    )}
                    {dropped.length > 0 && (
                        <p style={{ margin: '0 0 var(--ui-space-2)' }}>
                            빼놓은 줄 {dropped.length}개 ({dropped.at(0).reason})
                        </p>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 'var(--ui-space-2)', justifyContent: 'flex-end', marginTop: 'var(--ui-space-4)' }}>
                    <Button variant="outline" type="button" onClick={onClose} disabled={isSaving}>취소</Button>
                    <Button variant="primary" type="button" disabled={!names.length || isSaving} onClick={() => onSubmit(names)}>
                        {isSaving ? '넣는 중…' : `${names.length}명 한 번에 추가`}
                    </Button>
                </div>
            </section>
        </div>
    );
};

export default StudentRosterPasteModal;
