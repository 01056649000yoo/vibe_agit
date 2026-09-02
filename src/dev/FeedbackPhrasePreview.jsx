import { useState } from 'react'
import FeedbackPhrasePicker from '../components/teacher/FeedbackPhrasePicker'
import {
  DEFAULT_FEEDBACK_PHRASES,
  normalizeFeedbackPhrases,
  reorderFeedbackPhrases,
} from '../constants/feedbackPhrases'

/*
 * 자주 쓰는 피드백 문장 고르기 미리보기.
 *
 * 왜 필요한가: 이 부품이 들어가는 두 자리는 폭이 크게 다르다 — 글 상세는 **380px 사이드바**이고
 * 제출 현황은 창 전체 폭이다. 좁은 쪽에서 문장이 몇 글자씩 끊겨 읽히는 문제를 실제로 겪었기에
 * 배포 전에 두 폭을 함께 눈으로 본다.
 *
 * 저장은 이 화면의 메모리까지만 한다. `supabase` 나 훅을 부르지 않는다(README 원칙).
 */
const SCENARIOS = [
  { id: 'empty', label: '빈 목록', phrases: [] },
  { id: 'default', label: '기본 6개', phrases: [...DEFAULT_FEEDBACK_PHRASES] },
  {
    id: 'long',
    label: '긴 문장 섞인 12개',
    phrases: [
      ...DEFAULT_FEEDBACK_PHRASES,
      '문단마다 중심 문장을 하나씩 정하고, 그 문장을 뒷받침하는 까닭이나 겪은 일을 두 문장 이상 붙여서 다시 써 보세요.',
      '친구의 글과 비교해 보고 내 글에서 더 자세히 쓸 수 있는 곳을 두 군데 찾아 고쳐 주세요.',
      '문장이 너무 깁니다. 한 문장에 한 가지 생각만 담아 짧게 끊어 주세요.',
      '높임말과 반말이 섞여 있어요. 하나로 맞춰 주세요.',
      '처음-가운데-끝이 드러나게 문단을 세 덩어리로 나눠 주세요.',
      '제목을 다시 지어 주세요.',
    ],
  },
]

const FeedbackPhrasePreview = () => {
  const [scenarioId, setScenarioId] = useState('default')
  const [phrases, setPhrases] = useState(SCENARIOS[1].phrases)
  const [inserted, setInserted] = useState('')

  const applyScenario = (id) => {
    const scenario = SCENARIOS.find((item) => item.id === id) || SCENARIOS[0]
    setScenarioId(scenario.id)
    setPhrases([...scenario.phrases])
    setInserted('')
  }

  // 훅과 같은 모양을 메모리로만 흉내 낸다.
  const phraseStore = {
    phrases,
    loading: false,
    error: null,
    ensurePhrasesLoaded: () => {},
    clearPhraseError: () => {},
    addPhrase: (text) => { setPhrases((current) => normalizeFeedbackPhrases([...current, text])); return true },
    updatePhrase: (index, text) => {
      setPhrases((current) => normalizeFeedbackPhrases(
        current.map((phrase, position) => (position === index ? text : phrase)),
      ))
      return true
    },
    movePhrase: (index, direction) => {
      setPhrases((current) => reorderFeedbackPhrases(current, index, index + direction))
      return true
    },
    reorderPhrases: (from, to) => {
      setPhrases((current) => reorderFeedbackPhrases(current, from, to))
      return true
    },
    removePhrase: (index) => {
      setPhrases((current) => current.filter((_, position) => position !== index))
      return true
    },
    seedDefaultPhrases: () => { setPhrases([...DEFAULT_FEEDBACK_PHRASES]); return true },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {SCENARIOS.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            onClick={() => applyScenario(scenario.id)}
            style={{
              padding: '6px 12px', borderRadius: 'var(--ui-radius-pill)', cursor: 'pointer',
              border: `1px solid ${scenarioId === scenario.id ? 'var(--ui-primary)' : 'var(--ui-border-strong)'}`,
              background: scenarioId === scenario.id ? 'var(--ui-primary-soft)' : 'var(--ui-surface)',
              fontSize: 'var(--ui-text-sm)', fontWeight: 700, color: 'var(--ui-ink)',
            }}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <section style={{ width: '380px', flexShrink: 0 }}>
          <h3 style={{ fontSize: 'var(--ui-text-md)', margin: '0 0 8px' }}>글 상세 사이드바 (380px)</h3>
          <FeedbackPhrasePicker
            phraseStore={phraseStore}
            applyLabel="피드백에 넣기"
            applyHint="넣을 문장을 고르세요."
            onApply={(message) => setInserted(message)}
          />
        </section>

        <section style={{ flex: '1 1 420px', minWidth: '320px' }}>
          <h3 style={{ fontSize: 'var(--ui-text-md)', margin: '0 0 8px' }}>제출 현황 (넓은 폭)</h3>
          <FeedbackPhrasePicker
            phraseStore={phraseStore}
            applyLabel="이 문장으로 일괄 요청"
            applyHint="반 전체에 보낼 문장을 고르세요."
            onApply={(message) => setInserted(message)}
          />
        </section>
      </div>

      <div>
        <h3 style={{ fontSize: 'var(--ui-text-md)', margin: '0 0 8px' }}>넣은 결과</h3>
        <pre style={{
          margin: 0, padding: '12px', minHeight: '60px', whiteSpace: 'pre-wrap',
          background: 'var(--ui-surface-muted)', borderRadius: 'var(--ui-radius-sm)',
          fontSize: 'var(--ui-text-sm)', fontFamily: 'inherit',
        }}>
          {inserted || '(아직 없음)'}
        </pre>
      </div>
    </div>
  )
}

export default FeedbackPhrasePreview
