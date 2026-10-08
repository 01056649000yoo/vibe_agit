import { useState } from 'react'
import { StudentTextArea, StudentTextField } from '../modules/writing/student-input'

/*
 * 학생 입력기 모듈 미리보기 — 입력창 + 맞춤법 밑줄 한 부품을 다른 화면에 넣었을 때 모습.
 *
 * 서버 자료는 받지 않는다(spellingEntries={false}, README 원칙: supabase 를 부르지 않는다).
 * 빠른 규칙과 기본 자료 500개만으로 밑줄이 그어지는지, 칩이 뜨는지, 글을 고치면 밑줄이 따라오는지 본다.
 * `검토 중 자료 켜 보기` 는 이 화면에서만 862개를 켠다 — 학생 화면 스위치(pending/config.js)는 그대로 꺼져 있다.
 */
const SAMPLE_TITLE = '오늘 한 설겆이'
const SAMPLE_BODY = '저녁에 김치찌게를 먹고 설겆이를 했다.\n엄마가 잘했다고 하셔서 기분이 좋았다. 내일도 꼭 도와 드려야 겠다.\n책에서 이집트 피라밋과 세익스피어 이야기를 읽었는데 너무 쑥쓰러웠다.'

export default function StudentInputPreview() {
  const [title, setTitle] = useState(SAMPLE_TITLE)
  const [body, setBody] = useState(SAMPLE_BODY)
  const [picked, setPicked] = useState(null)
  const [pending, setPending] = useState(false)
  return (
    <div style={{ display: 'grid', gap: 'var(--ui-space-3, 12px)', maxWidth: 640 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 }}>
        <input type="checkbox" checked={pending} onChange={(event) => setPending(event.target.checked)} data-testid="student-input-pending" />
        검토 중 자료 862개 켜 보기(이 화면에서만)
      </label>
      <StudentTextField
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        spelling="on"
        spellingEntries={false}
        spellingPending={pending}
        aria-label="제목"
        style={{ padding: '10px 12px', fontSize: '1.1rem', border: '1px solid var(--ui-border, #d0d7de)', borderRadius: 8 }}
      />
      <StudentTextArea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        spelling="on"
        spellingEntries={false}
        spellingPending={pending}
        onIssueClick={setPicked}
        autoGrow
        rows={5}
        aria-label="본문"
        style={{ padding: '12px', fontSize: '1rem', lineHeight: 1.7, border: '1px solid var(--ui-border, #d0d7de)', borderRadius: 8 }}
      />
      {picked && <p role="status" data-testid="student-input-picked">고른 표현: {picked.wrong} → {picked.right}</p>}
    </div>
  )
}
