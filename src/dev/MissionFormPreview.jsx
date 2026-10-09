import { useState } from 'react'
import MissionForm from '../components/teacher/MissionForm'
import { getFreeformGenreCategories } from '../modules/writing/mission-types/genreCatalog'
import LetterMissionForm from '../modules/writing/mission-types/letter/LetterMissionForm'
import PoemMissionForm from '../modules/writing/mission-types/poem/PoemMissionForm'
import ReportMissionForm from '../modules/writing/mission-types/report/ReportMissionForm'

const KINDS = [
  { id: 'general', label: '일반 과제' },
  { id: 'letter', label: '✉️ 편지' },
  { id: 'poem', label: '🌿 시' },
  { id: 'report', label: '📋 보고서' },
]
const PREVIEW_CLASS = { id: 'preview', name: '미리보기 반' }

/*
 * 선생님 과제 만들기 창 미리보기 — 화면 정리(2026-10-09)를 로그인 없이 눈으로 보며 다듬으려고 둔다.
 * 저장·AI 질문 만들기는 이 화면의 메모리까지만 한다(supabase 를 부르지 않는다, README 원칙).
 */
const INITIAL = {
  title: '가을 운동회 이야기',
  guide: '운동회 날 가장 기억에 남는 순간을 처음-가운데-끝으로 써 보세요.',
  genre: '일기',
  mission_type: '일기',
  min_chars: 300,
  min_paragraphs: 3,
  base_reward: 100,
  bonus_threshold: 100,
  bonus_reward: 10,
  repeat_bonus_enabled: false,
  repeat_bonus_threshold: 100,
  repeat_bonus_reward: 10,
  repeat_bonus_max_count: 3,
  allow_comments: true,
  peer_reading_enabled: true,
  guide_questions: ['가장 기억에 남는 경기는 무엇인가요?', '그때 어떤 마음이 들었나요?'],
  question_count: 3,
  tags: ['행사', '일기'],
  schedule_at: '',
  evaluation_rubric: { use_rubric: false, levels: [] },
}

export default function MissionFormPreview() {
  const [formData, setFormData] = useState(INITIAL)
  const [presetGenre, setPresetGenre] = useState(null)
  const [kind, setKind] = useState(() => new URLSearchParams(window.location.search).get('kind') || 'general')
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  const tabs = (
    <div role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
      {KINDS.map((item) => (
        <button key={item.id} type="button" role="tab" aria-selected={kind === item.id} onClick={() => setKind(item.id)}
          style={{ minHeight: 40, padding: '0 14px', borderRadius: 999, border: '1px solid var(--ui-border)', background: kind === item.id ? 'var(--ui-primary-soft)' : 'var(--ui-surface)', fontWeight: 800 }}>
          {item.label}
        </button>
      ))}
    </div>
  )
  if (kind === 'letter') return <>{tabs}<LetterMissionForm activeClass={PREVIEW_CLASS} isMobile={isMobile} onBack={() => setKind('general')} onSaved={() => {}} /></>
  if (kind === 'poem') return <>{tabs}<PoemMissionForm activeClass={PREVIEW_CLASS} isMobile={isMobile} onBack={() => setKind('general')} onSaved={() => {}} /></>
  if (kind === 'report') return <>{tabs}<ReportMissionForm activeClass={PREVIEW_CLASS} isMobile={isMobile} onBack={() => setKind('general')} onSaved={() => {}} /></>
  return (
    <>{tabs}
    <MissionForm
      classId="preview"
      isFormOpen
      isEditing={false}
      editingMissionId={null}
      formData={formData}
      setFormData={setFormData}
      genreCategories={getFreeformGenreCategories()}
      presetGenre={presetGenre}
      setPresetGenre={setPresetGenre}
      submittedCount={0}
      handleSubmit={(event) => event?.preventDefault?.()}
      handleCancelEdit={() => {}}
      isMobile={typeof window !== 'undefined' && window.innerWidth < 768}
      handleGenerateQuestions={() => {}}
      isGeneratingQuestions={false}
      handleSaveDefaultRubric={() => {}}
      handleSaveDefaultSettings={() => {}}
      frequentTags={['행사', '일기', '독서', '주장하는 글']}
      saveFrequentTag={() => {}}
      removeFrequentTag={() => {}}
      ask={async () => true}
      notify={() => {}}
    />
    </>
  )
}
