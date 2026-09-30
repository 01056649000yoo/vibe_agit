import React, { useMemo, useState } from 'react'
import ClassTimetableTeacherEntry from '../modules/tool/class-timetable/TeacherEntry.jsx'
import TimetableWidget from '../modules/tool/class-board/widgets/timetable/TimetableWidget.jsx'
import { createFakeTimetableApi } from './fakeTimetableApi.js'

/*
 * 학급 시간표 관리 + 스크린 `시간표` 위젯 실험실(DB 없음).
 * 장면: 빈 학급 · 기초 시간표만 · 이번 주 바뀜 · 불러오기 오류. 오늘 요일을 바꿔 `내일`(금 → 월)과 주말을 본다.
 * 위젯 칸은 실제 스크린 틀처럼 크기 기준(container-type:size)이다.
 */

const SCENES = Object.freeze([
  { id: 'empty', label: '빈 학급' },
  { id: 'filled', label: '기초 시간표만' },
  { id: 'changed', label: '이번 주 바뀜' },
  { id: 'error', label: '불러오기 오류' },
])

const TODAYS = Object.freeze([
  { id: '2026-09-29', label: '화요일' },
  { id: '2026-10-02', label: '금요일' },
  { id: '2026-10-04', label: '일요일' },
])

const WIDGET_VIEWS = Object.freeze([
  { view: 'today', label: '오늘', width: 360, height: 420 },
  { view: 'tomorrow', label: '내일', width: 360, height: 420 },
  { view: 'pair', label: '오늘·내일', width: 620, height: 360 },
  { view: 'week', label: '이번 주', width: 620, height: 420 },
])

const box = (width, height) => ({
  width, height, containerType: 'size', display: 'flex', borderRadius: 18, overflow: 'hidden',
  boxShadow: '0 6px 18px rgba(15,23,42,.12)',
})

export default function ClassTimetablePreview() {
  const [scene, setScene] = useState('changed')
  const [today, setToday] = useState('2026-09-29')
  const [version, setVersion] = useState(0)
  // `처음 상태로`(version)를 누르면 새 가짜 서버를 만든다.
  const api = useMemo(() => createFakeTimetableApi({ today, scene, resetKey: version }), [today, scene, version])
  const key = `${scene}-${today}-${version}`

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {SCENES.map((item) => (
          <button key={item.id} type="button" aria-pressed={scene === item.id} onClick={() => setScene(item.id)}
            style={{ fontWeight: scene === item.id ? 900 : 600 }}>{item.label}</button>
        ))}
        <span style={{ margin: '0 6px', color: '#64748b' }}>오늘:</span>
        {TODAYS.map((item) => (
          <button key={item.id} type="button" aria-pressed={today === item.id} onClick={() => setToday(item.id)}
            style={{ fontWeight: today === item.id ? 900 : 600 }}>{item.label} {item.id.slice(5)}</button>
        ))}
        <button type="button" onClick={() => setVersion((value) => value + 1)}>처음 상태로</button>
      </div>
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.8rem' }}>
        DB 없이 봅니다. 저장은 이 화면 메모리에만 남고, 위젯은 `처음 상태로`를 눌러야 새로 읽습니다(실제 스크린도 열 때 한 번 읽음).
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }} aria-label="스크린 시간표 위젯">
        {WIDGET_VIEWS.map((item) => (
          <figure key={item.view} style={{ margin: 0, display: 'grid', gap: 6 }}>
            <figcaption style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 800 }}>위젯 · {item.label}</figcaption>
            <div style={box(item.width, item.height)}>
              <TimetableWidget key={key} classId="preview-class" api={api} config={{ heading: '시간표', view: item.view, tone: 'sky' }} />
            </div>
          </figure>
        ))}
      </div>

      <div style={{ border: '1px dashed #cbd5e1', borderRadius: 16, padding: 16, background: '#fff' }}>
        <ClassTimetableTeacherEntry key={key} activeClass={{ id: 'preview-class', name: '3학년 1반' }} api={api} />
      </div>
    </div>
  )
}
