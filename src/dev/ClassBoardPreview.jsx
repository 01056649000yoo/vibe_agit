import { useState } from 'react'
import {
  CLASS_BOARD_LAYOUT,
  createWidgetInstance,
  updateClassBoardWidgetConfig,
} from '../modules/tool/class-board/classBoardModel'
import BoardCanvas from '../modules/tool/class-board/host/BoardCanvas'
import { WidgetSettingsHost } from '../modules/tool/class-board/host/WidgetHost'
import '../modules/tool/class-board/classBoard.css'
import './ClassBoardPreview.css'

const TEXT_PRESETS = [
  {
    id: 'short',
    label: '짧은 안내',
    config: { heading: '준비!', body: '국어책을 펴세요.', tone: 'sun', fontScale: 1.5 },
  },
  {
    id: 'lines',
    label: '여러 줄',
    config: {
      heading: '오늘의 활동',
      body: '1. 모둠별로 생각을 나눠요.\n2. 발표 내용을 정리해요.\n3. 서로의 발표를 들어요.',
      tone: 'sky',
      fontScale: 1.5,
    },
  },
  {
    id: 'long',
    label: '긴 본문',
    config: {
      heading: '활동 안내',
      body: '제시된 글을 천천히 읽고 중요한 문장에 밑줄을 그으세요. 모둠 친구들과 각자 고른 문장을 비교한 뒤, 우리 모둠이 발표할 핵심 생각을 한 문장으로 정리합니다. 발표를 들을 때에는 새롭게 알게 된 점을 기록하세요.',
      tone: 'mint',
      fontScale: 1.5,
    },
  },
]

const createPreviewState = () => {
  const instance = createWidgetInstance('text', 10, 0)
  return {
    board: {
      id: 'local-class-board-preview',
      title: '우리 반 스크린 로컬 미리보기',
      layout: { ...CLASS_BOARD_LAYOUT },
      widgets: [{ ...instance, config: { ...TEXT_PRESETS[0].config } }],
      revision: 0,
      isActive: true,
    },
    selectedInstanceId: instance.instanceId,
  }
}

export default function ClassBoardPreview() {
  const [preview, setPreview] = useState(createPreviewState)
  const selectedInstance = preview.board.widgets.find(
    (widget) => widget.instanceId === preview.selectedInstanceId
  )

  const updateConfig = (config) => {
    setPreview((current) => ({
      ...current,
      board: updateClassBoardWidgetConfig(
        current.board,
        current.selectedInstanceId,
        config
      ),
    }))
  }

  const updatePlacement = (instanceId, placement) => {
    setPreview((current) => ({
      ...current,
      board: {
        ...current.board,
        widgets: current.board.widgets.map((widget) => (
          widget.instanceId === instanceId ? { ...widget, placement } : widget
        )),
      },
    }))
  }

  const applyPreset = (config) => updateConfig({ ...config })

  return (
    <main className="class-board-preview">
      <header className="class-board-preview__header">
        <div>
          <span>개발 전용 · DB 연결 없음</span>
          <h1>우리 반 스크린 텍스트 미리보기</h1>
          <p>텍스트를 수정하고 오른쪽·아래쪽·오른쪽 아래 모서리를 드래그해 자동 맞춤을 확인합니다.</p>
        </div>
        <code>?class-board-preview=1</code>
      </header>

      <div className="class-board-preview__layout">
        <section className="class-board-preview__stage" aria-label="우리 반 스크린 미리보기">
          <BoardCanvas
            board={preview.board}
            editable
            selectedInstanceId={preview.selectedInstanceId}
            onSelect={(instanceId) => setPreview((current) => ({
              ...current,
              selectedInstanceId: instanceId,
            }))}
            onClearSelection={() => {}}
            onPlacementChange={updatePlacement}
          />
        </section>

        <aside className="class-board-preview__settings">
          <div className="class-board-preview__presets" aria-label="텍스트 예시">
            {TEXT_PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => applyPreset(preset.config)}>
                {preset.label}
              </button>
            ))}
          </div>
          {selectedInstance ? (
            <WidgetSettingsHost
              instance={selectedInstance}
              classId={null}
              boardId={preview.board.id}
              onChange={updateConfig}
            />
          ) : null}
          <button
            type="button"
            className="class-board-preview__reset"
            onClick={() => setPreview(createPreviewState())}
          >처음 상태로</button>
        </aside>
      </div>
    </main>
  )
}
