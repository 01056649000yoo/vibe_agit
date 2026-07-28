import { useState } from 'react'
import { AlertCircle, BookOpen, Check, Inbox, LoaderCircle, RefreshCw } from 'lucide-react'
import Button from '../components/common/Button'
import Card from '../components/common/Card'
import '../App.css'
import './UiPreview.css'

const previewStates = [
  {
    id: 'empty',
    icon: Inbox,
    eyebrow: '빈 상태',
    title: '아직 제출된 글이 없어요',
    description: '학생들이 글을 제출하면 이곳에서 바로 확인할 수 있어요.',
    action: '과제 목록 보기',
  },
  {
    id: 'error',
    icon: AlertCircle,
    eyebrow: '연결 오류',
    title: '자료를 불러오지 못했어요',
    description: '작성 중인 내용은 그대로예요. 잠시 후 다시 시도해 주세요.',
    action: '다시 불러오기',
  },
]

function UiPreview() {
  const [activeState, setActiveState] = useState('empty')
  const [showLoading, setShowLoading] = useState(false)
  const state = previewStates.find((item) => item.id === activeState)
  const StateIcon = state.icon

  return (
    <main className="ui-preview">
      <header className="ui-preview__hero">
        <div>
          <span className="ui-preview__badge">개발 전용 · DB 연결 없음</span>
          <p className="ui-preview__eyebrow">끄적끄적 아지트 UI 작업실</p>
          <h1>화면의 말투와 상태를<br />한곳에서 맞춰봐요.</h1>
          <p className="ui-preview__lead">
            실제 데이터나 저장 동작 없이 공통 요소의 크기, 대비, 반응형과 예외 상태를 확인합니다.
          </p>
        </div>
        <div className="ui-preview__summary" aria-label="프리뷰 원칙">
          <Check aria-hidden="true" />
          <span>운영 데이터 호출 없음</span>
          <Check aria-hidden="true" />
          <span>기존 props 인터페이스 유지</span>
          <Check aria-hidden="true" />
          <span>모바일 화면 함께 확인</span>
        </div>
      </header>

      <section className="ui-preview__section" aria-labelledby="button-preview-title">
        <div className="ui-preview__section-heading">
          <div>
            <p className="ui-preview__eyebrow">01 · 공통 동작</p>
            <h2 id="button-preview-title">버튼</h2>
          </div>
          <p>Tab 키로 이동했을 때 포커스가 선명하고, 비활성 상태가 색상 외에도 구분되어야 합니다.</p>
        </div>
        <Card className="ui-preview__canvas" animate={false}>
          <div className="ui-preview__button-row">
            <Button type="button">저장하기</Button>
            <Button type="button" variant="secondary">미리 보기</Button>
            <Button type="button" variant="ghost">취소</Button>
            <Button type="button" loading loadingText="저장하고 있어요...">저장</Button>
            <Button type="button" disabled>제출 완료</Button>
          </div>
        </Card>
      </section>

      <section className="ui-preview__section" aria-labelledby="state-preview-title">
        <div className="ui-preview__section-heading">
          <div>
            <p className="ui-preview__eyebrow">02 · 화면 상태</p>
            <h2 id="state-preview-title">비어 있음과 오류</h2>
          </div>
          <div className="ui-preview__segmented" aria-label="화면 상태 선택">
            {previewStates.map((item) => (
              <button
                type="button"
                key={item.id}
                className={activeState === item.id ? 'is-active' : ''}
                aria-pressed={activeState === item.id}
                onClick={() => setActiveState(item.id)}
              >
                {item.eyebrow}
              </button>
            ))}
          </div>
        </div>

        <div className="ui-preview__state-grid">
          <article className={`ui-preview__state ui-preview__state--${state.id}`} aria-live="polite">
            <span className="ui-preview__state-icon"><StateIcon aria-hidden="true" /></span>
            <span className="ui-preview__state-label">{state.eyebrow}</span>
            <h3>{state.title}</h3>
            <p>{state.description}</p>
            <Button type="button" variant={state.id === 'error' ? 'ghost' : 'primary'}>
              {state.id === 'error' && <RefreshCw size={17} aria-hidden="true" />}
              {state.action}
            </Button>
          </article>

          <article className="ui-preview__state ui-preview__state--loading" aria-busy={showLoading}>
            <span className="ui-preview__state-icon">
              {showLoading ? <LoaderCircle className="ui-preview__spinner" aria-hidden="true" /> : <BookOpen aria-hidden="true" />}
            </span>
            <span className="ui-preview__state-label">로딩 상태</span>
            <h3>{showLoading ? '글 목록을 정리하고 있어요' : '로딩 화면 미리 보기'}</h3>
            <p>{showLoading ? '잠시만 기다려 주세요. 오래 걸리면 다시 시도할 수 있어요.' : '버튼을 눌러 실제 로딩 표현과 움직임을 확인하세요.'}</p>
            <Button type="button" variant="secondary" onClick={() => setShowLoading((value) => !value)}>
              {showLoading ? '로딩 멈추기' : '로딩 시작'}
            </Button>
          </article>
        </div>
      </section>
    </main>
  )
}

export default UiPreview
