import { useState } from 'react'
import { AlertCircle, BookOpen, Check, Inbox, LoaderCircle, RefreshCw } from 'lucide-react'
import Button from '../components/common/Button'
import Card from '../components/common/Card'
import WritingEditorFields from '../components/writing/WritingEditorFields'
import {
  WritingSectionHeader,
  WritingWorkspace,
  WritingWorkspaceHeader,
  WritingWorkspacePath,
} from '../components/writing/WritingWorkspace'
import WritingToolHost from '../modules/writing/tools/WritingToolHost'
import '../App.css'
import './UiPreview.css'

import { TEACHER_NAV_GROUPS } from '../constants/teacherNav'

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

const designSwatches = [
  { id: 'primary', label: '주요 행동', token: '--ui-primary' },
  { id: 'secondary', label: '보조 강조', token: '--ui-secondary' },
  { id: 'success', label: '완료·성공', token: '--ui-success' },
  { id: 'warning', label: '주의·변화', token: '--ui-warning' },
  { id: 'danger', label: '오류·삭제', token: '--ui-danger' },
  { id: 'ink', label: '본문 글자', token: '--ui-ink' },
]

function UiPreview() {
  const [activeState, setActiveState] = useState('empty')
  const [showLoading, setShowLoading] = useState(false)
  const [activeNav, setActiveNav] = useState(TEACHER_NAV_GROUPS[0].id)
  const [previewTitle, setPreviewTitle] = useState('우리 반 체육 대회')
  const [previewContent, setPreviewContent] = useState('오늘은 웬지 운동장이 더 넓어 보였다. 이어달리기를 할수 있어서 정말 신났다.')
  const [writingTone, setWritingTone] = useState('assignment')
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

      <section className="ui-preview__section" aria-labelledby="token-preview-title">
        <div className="ui-preview__section-heading">
          <div>
            <p className="ui-preview__eyebrow">01 · 공통 기준</p>
            <h2 id="token-preview-title">색·모서리·표면</h2>
          </div>
          <p>새 화면은 원시 색상값을 늘리지 않고 의미 토큰을 사용합니다. 기능 고유 색은 내용 강조에만 둡니다.</p>
        </div>
        <div className="ui-preview__token-grid">
          {designSwatches.map((swatch) => (
            <article className="ui-preview__token" key={swatch.id}>
              <span className="ui-preview__swatch" style={{ background: `var(${swatch.token})` }} />
              <strong>{swatch.label}</strong>
              <code>var({swatch.token})</code>
            </article>
          ))}
        </div>
        <div className="ui-preview__surface-row">
          <article className="ui-preview__surface-sample is-flat"><strong>기본 표면</strong><span>테두리 중심</span></article>
          <article className="ui-preview__surface-sample is-raised"><strong>강조 표면</strong><span>작은 그림자</span></article>
          <article className="ui-preview__surface-sample is-modal"><strong>대화상자</strong><span>큰 그림자·24px</span></article>
        </div>
      </section>

      <section className="ui-preview__section" aria-labelledby="button-preview-title">
        <div className="ui-preview__section-heading">
          <div>
            <p className="ui-preview__eyebrow">02 · 공통 동작</p>
            <h2 id="button-preview-title">버튼</h2>
          </div>
          <p>Tab 키로 이동했을 때 포커스가 선명하고, 비활성 상태가 색상 외에도 구분되어야 합니다.</p>
        </div>
        <Card className="ui-preview__canvas" animate={false}>
          <div className="ui-preview__button-row">
            <Button type="button">저장하기</Button>
            <Button type="button" variant="secondary">미리 보기</Button>
            <Button type="button" variant="ghost">취소</Button>
            <Button type="button" variant="outline">목록 보기</Button>
            <Button type="button" variant="danger">삭제</Button>
            <Button type="button" size="xs">아주 작게</Button>
            <Button type="button" loading loadingText="저장하고 있어요...">저장</Button>
            <Button type="button" disabled>제출 완료</Button>
          </div>
        </Card>
      </section>

      <section className="ui-preview__section" aria-labelledby="state-preview-title">
        <div className="ui-preview__section-heading">
          <div>
            <p className="ui-preview__eyebrow">03 · 화면 상태</p>
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

      <section className="ui-preview__section" aria-labelledby="writing-tool-preview-title">
        <div className="ui-preview__section-heading">
          <div>
            <p className="ui-preview__eyebrow">04 · 학생 글쓰기</p>
            <h2 id="writing-tool-preview-title">태블릿 글쓰기 작업대</h2>
          </div>
          <div className="ui-preview__segmented" aria-label="글쓰기 화면 종류">
            <button type="button" className={writingTone === 'assignment' ? 'is-active' : ''} onClick={() => setWritingTone('assignment')}>과제 글쓰기</button>
            <button type="button" className={writingTone === 'reading' ? 'is-active' : ''} onClick={() => setWritingTone('reading')}>독서록</button>
          </div>
        </div>
        <WritingWorkspace tone={writingTone}>
          <WritingWorkspaceHeader
            onBack={() => {}}
            eyebrow={writingTone === 'reading' ? '📚 나의 독서록' : '✍️ 생활문'}
            title={writingTone === 'reading' ? '새 독서록 쓰기' : '우리 반 체육 대회 이야기'}
            description={writingTone === 'reading'
              ? '책을 고르고 기억에 남은 장면과 내 생각을 나만의 말로 기록해요.'
              : '생각을 정리한 뒤 글을 쓰고, 마지막에 한 번 검토해 제출해요.'}
          />
          <WritingWorkspacePath steps={writingTone === 'reading' ? ['책 선택', '생각 쓰기', '공개·저장'] : ['생각 열기', '글쓰기', '검토·제출']} />
          <section className="writing-editor-surface">
            <WritingSectionHeader
              icon={writingTone === 'reading' ? '💭' : '✍️'}
              title={writingTone === 'reading' ? '책에서 만난 생각' : '본격 글쓰기'}
              description="맞춤법은 자동으로 고치지 않고 궁금한 표현을 직접 찾아봐요."
            />
            <WritingToolHost />
            <WritingEditorFields
              title={previewTitle}
              onTitleChange={setPreviewTitle}
              content={previewContent}
              onContentChange={setPreviewContent}
              isMobile
            />
          </section>
          <div className={`writing-action-bar ${writingTone === 'reading' ? 'writing-action-bar--reading' : ''}`}>
            <Button type="button" variant="ghost" size="lg">취소</Button>
            <Button type="button" variant="outline" size="lg">임시 저장 💾</Button>
            <Button type="button" size="lg">{writingTone === 'reading' ? '독서록 저장하기 📚' : '멋지게 제출하기! 🚀'}</Button>
          </div>
        </WritingWorkspace>
      </section>

      <section className="ui-preview__section" aria-labelledby="teacher-nav-title">
        <div className="ui-preview__section-heading">
          <div>
            <p className="ui-preview__eyebrow">05 · 교사 화면</p>
            <h2 id="teacher-nav-title">상단 업무 영역</h2>
          </div>
        </div>
        <p className="ui-preview__note">
          교사 대시보드가 쓰는 정의(<code>src/constants/teacherNav.js</code>)를 그대로 그립니다.
          영역을 누르면 그 안의 화면 목록이 바뀝니다.
        </p>

        <nav className="ui-preview__teacher-nav" aria-label="업무 영역">
          {TEACHER_NAV_GROUPS.map((group) => group.launchHref ? (
            <a key={group.id} href={group.launchHref}>
              <span aria-hidden="true">{group.icon}</span>
              {group.label} ↗
            </a>
          ) : (
              <button
                type="button"
                key={group.id}
                className={activeNav === group.id ? 'is-active' : ''}
                aria-pressed={activeNav === group.id}
                onClick={() => setActiveNav(group.id)}
              >
                <span aria-hidden="true">{group.icon}</span>
                {group.label}
              </button>
            ))}
        </nav>

        {(() => {
          const group = TEACHER_NAV_GROUPS.find((g) => g.id === activeNav)
          if (!group) return null
          // 실제 대시보드와 같은 세부 메뉴 배치 정의를 사용한다.
          const isSidebar = group.secondaryShape === 'sidebar'
          return (
            <>
              <p className="ui-preview__nav-shape">
                {isSidebar
                  ? 'PC에서 좌측 세로 메뉴로 표시됩니다.'
                  : '상단 가로 메뉴로 표시됩니다.'}
              </p>
              <div
                className={`ui-preview__teacher-tabs ${isSidebar ? 'is-sidebar' : ''}`}
                aria-label="선택한 영역의 화면"
              >
                {group.tabs.map((tab) => (
                  <span key={tab.id}>{tab.label}</span>
                ))}
              </div>

              {group.innerItems && (
                <div className="ui-preview__inner">
                  <p className="ui-preview__nav-shape">
                    {group.innerShape === 'cards'
                      ? '화면을 열면 아래 카드들이 나옵니다.'
                      : group.innerShape === 'stack'
                        ? '화면 하나에 아래 순서대로 놓입니다. 더 눌러 들어가지 않습니다.'
                        : '화면을 열면 아래 좌측 메뉴로 다시 나뉩니다.'}
                  </p>
                  <div
                    className={
                      group.innerShape === 'cards'
                        ? 'ui-preview__inner-cards'
                        : group.innerShape === 'stack'
                          ? 'ui-preview__inner-stack'
                          : 'ui-preview__teacher-tabs is-sidebar'
                    }
                  >
                    {group.innerItems.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                  {group.innerNote && (
                    <p className="ui-preview__inner-note">{group.innerNote}</p>
                  )}
                </div>
              )}
            </>
          )
        })()}
      </section>
    </main>
  )
}

export default UiPreview
