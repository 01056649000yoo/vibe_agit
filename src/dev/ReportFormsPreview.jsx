import { useMemo, useState } from 'react'
import ReportEditor from '../modules/writing/mission-types/report/ReportEditor'
import ReportDocument from '../modules/writing/mission-types/report/ReportDocument'

/*
 * 보고서 양식 미리보기 — 관찰·조사·자유 보고서를 학생 편집 화면과 읽는 화면으로 나란히 본다.
 *
 * 운영 컴포넌트(ReportEditor·ReportDocument)를 그대로 쓰고 서버는 부르지 않는다(onPersistDraft 없음 · 사진 올리기는 약속 체크 뒤에도 서버가 없어 막힌다).
 * 종류·출처 켜기를 바꾸면 과제 설정(template_config)이 바뀐 것처럼 편집 화면이 다시 열린다.
 * 문집에 담기는 모양(문단 목록)은 서버 함수가 정하므로 롤백 스모크(tests/sql/20261403)로 따로 본다.
 */
const KINDS = [
  { id: 'observation', label: '🔍 관찰 보고서' },
  { id: 'research', label: '📚 조사 보고서' },
  { id: 'free', label: '📋 자유 보고서(예전 방식)' },
]

export default function ReportFormsPreview() {
  const [kind, setKind] = useState('observation')
  const [sources, setSources] = useState(false)
  const [mobile, setMobile] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [structured, setStructured] = useState(null)
  const config = useMemo(() => ({
    min_sections: 2, max_sections: 12, max_images: 3,
    ...(kind !== 'free' ? { kind } : {}),
    ...(kind !== 'free' && sources ? { sources_enabled: true } : {}),
  }), [kind, sources])
  const reset = (next) => { setKind(next); setStructured(null); setContent('') }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 980 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {KINDS.map((item) => (
          <button key={item.id} type="button" onClick={() => reset(item.id)} aria-pressed={kind === item.id}
            data-testid={`report-kind-${item.id}`}
            style={{ minHeight: 44, padding: '8px 14px', borderRadius: 12, border: kind === item.id ? '2px solid #0f766e' : '1px solid #cbd5e1', background: kind === item.id ? '#f0fdfa' : '#fff', fontWeight: 800, cursor: 'pointer' }}>
            {item.label}
          </button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
          <input type="checkbox" checked={sources} disabled={kind === 'free'} onChange={(event) => setSources(event.target.checked)} data-testid="report-sources" />
          출처 쓰기 켜기(선생님 설정)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
          <input type="checkbox" checked={mobile} onChange={(event) => setMobile(event.target.checked)} />
          좁은 화면
        </label>
      </div>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16 }} data-testid="report-editor-area">
        <h3 style={{ margin: '0 0 10px' }}>학생이 쓰는 화면</h3>
        <ReportEditor
          key={`${kind}-${sources}`}
          title={title} setTitle={setTitle} content={content} setContent={setContent}
          structuredContent={structured} setStructuredContent={setStructured}
          config={config} disabled={false} isMobile={mobile} postId={null}
        />
      </section>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 16 }} data-testid="report-document-area">
        <h3 style={{ margin: '0 0 10px' }}>읽는 화면(선생님·친구·제출 전 확인)</h3>
        <ReportDocument structuredContent={structured} content={content} />
        {!structured && <p style={{ color: '#64748b' }}>위에서 쓰기 시작하면 여기에 보고서가 나타나요.</p>}
      </section>
    </div>
  )
}
