import { useState } from 'react'
import Button from '../components/common/Button'
import useConfirmDialog from '../components/common/useConfirmDialog'
import useNotice from '../components/common/useNotice'

/*
 * 글 승인 흐름 미리보기.
 *
 * 왜 필요한가(2026-09-03): 승인 버튼은 교사 계정으로 실제 학생 글이 있어야만 눌러 볼 수 있어서,
 * 바꾼 확인 창과 알림 띠를 눈으로 볼 방법이 없었다. 진짜 부품으로 띄워 놓고 본다.
 *
 * 여기서 보는 것:
 *  - 승인 확인이 **앱 안 창**으로 뜨는지 (브라우저 회색 창이 아니라)
 *  - 누르는 동안 버튼이 `승인 중...`으로 바뀌어 누른 티가 나는지
 *  - 끝났다는 말이 **확인을 누르지 않아도** 스스로 사라지는지
 *  - 실패는 그냥 지나가지 않고 창으로 멈춰 서는지
 *  - 수정 모드로 잠겼을 때 **왜 잠겼는지** 말해 주는지
 *
 * 서버에 붙지 않는다. `supabase` 를 부르지 않는다(README 원칙).
 */

const WAIT_MS = 900

const ApprovePostFlowPreview = () => {
  const { ask, confirmDialog } = useConfirmDialog()
  const { notify, notice } = useNotice()
  const [approving, setApproving] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [log, setLog] = useState([])

  const add = (line) => setLog((current) => [
    { id: `${Date.now()}-${current.length}-${line}`, text: `${new Date().toLocaleTimeString('ko-KR')} · ${line}` },
    ...current
  ].slice(0, 8))

  // 실제 handleApprovePost 와 같은 차례로 움직인다.
  const approve = async (outcome) => {
    if (approving) return
    const studentName = '김하늘'
    const agreed = await ask({
      title: `${studentName} 학생의 글을 승인할까요?`,
      body: '승인하면 포인트가 바로 지급되고 학생에게 알림이 갑니다.',
      confirmLabel: '승인하고 포인트 주기 🎁'
    })
    if (!agreed) { add('그만두기를 눌러 승인하지 않음'); return }

    setApproving(true)
    await new Promise((resolve) => setTimeout(resolve, WAIT_MS))
    setApproving(false)

    if (outcome === 'fail') {
      add('실패 — 창으로 멈춰 세움')
      await ask({
        title: `${studentName} 학생의 글을 승인하지 못했습니다`,
        body: 'network error\n\n잠시 뒤 다시 시도해 주세요. 포인트는 지급되지 않았습니다.',
        confirmLabel: '알겠어요',
        acknowledgeOnly: true
      })
      return
    }
    if (outcome === 'already') {
      add('이미 승인된 글 — 띠로 알림')
      notify(`${studentName} 학생의 글은 이미 승인되어 있어요. 포인트는 다시 주지 않았습니다.`)
      return
    }
    add('승인 완료 — 띠로 알림(누를 것 없음)')
    notify(`✅ ${studentName} 학생 승인 · 100P 지급`)
  }

  const box = { display: 'flex', flexWrap: 'wrap', gap: 'var(--ui-space-3)', alignItems: 'center' }

  return (
    <div style={{ display: 'grid', gap: 'var(--ui-space-5)' }}>
      <div style={box}>
        <Button
          onClick={() => approve('ok')}
          disabled={editMode}
          loading={approving}
          loadingText="승인 중..."
          title={editMode ? '수정 모드를 끄면 승인할 수 있어요.' : '승인하면 포인트가 바로 지급됩니다.'}
          style={{
            backgroundColor: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9',
            fontWeight: 'bold', opacity: editMode ? 0.4 : 1, cursor: editMode ? 'not-allowed' : 'pointer'
          }}
        >
          {editMode ? '✅ 승인 (수정 모드 끄고)' : '✅ 승인 및 포인트 지급'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setEditMode((v) => !v)}>
          {editMode ? '수정 모드 종료' : '수정 모드 켜 보기'}
        </Button>
      </div>

      <div style={box}>
        <Button variant="outline" size="sm" onClick={() => approve('already')}>이미 승인된 글로 해 보기</Button>
        <Button variant="outline" size="sm" onClick={() => approve('fail')}>실패하게 해 보기</Button>
      </div>

      <div style={{
        padding: 'var(--ui-space-4)',
        border: '1px solid var(--ui-border)',
        borderRadius: 'var(--ui-radius-md)',
        background: 'var(--ui-surface)',
        fontSize: 'var(--ui-text-sm)',
        lineHeight: 1.7
      }}>
        <strong style={{ display: 'block', marginBottom: 'var(--ui-space-2)' }}>일어난 일</strong>
        {log.length === 0 ? <span style={{ color: 'var(--ui-ink-muted)' }}>아직 없습니다.</span>
          : log.map((line) => <div key={line.id}>{line.text}</div>)}
      </div>

      {confirmDialog}
      {notice}
    </div>
  )
}

export default ApprovePostFlowPreview
