import { useState } from 'react'
import {
  CLASS_BOARD_LAYOUT,
  createWidgetInstance,
  updateClassBoardWidgetConfig,
  updateClassBoardWidgetPlacement,
} from '../modules/tool/class-board/classBoardModel'
import BoardCanvas from '../modules/tool/class-board/host/BoardCanvas'
import { WidgetSettingsHost } from '../modules/tool/class-board/host/WidgetHost'
import ClassBoardTabs from '../modules/tool/class-board/navigation/ClassBoardTabs'
import { sortClassBoards } from '../modules/tool/class-board/navigation/tabOrder'
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

const createPreviewBoard = ({ id, title, heading, body, tone, displayOrder, isDefault = false }) => {
  const textInstance = createWidgetInstance('text', 10, 0)
  const weatherInstance = createWidgetInstance('weather', 20, 1)
  return {
    id,
    title,
    layout: { ...CLASS_BOARD_LAYOUT },
    widgets: [
      { ...textInstance, config: { heading, body, tone, fontScale: 1.5 } },
      {
        ...weatherInstance,
        placement: { x: 36, y: 4, width: 31.5, height: 42, pinned: false },
        config: {
          weatherSource: 'manual',
          condition: 'sunny',
          temperature: 24,
          message: '바깥 활동하기 좋은 날이에요.',
        },
      },
    ],
    revision: 0,
    isActive: displayOrder === 0,
    isDefault,
    displayOrder,
  }
}

const createPreviewState = () => {
  const boards = [
    createPreviewBoard({
      id: 'local-morning',
      title: '아침 활동',
      heading: '좋은 아침!',
      body: '오늘도 즐겁게 시작해요.',
      tone: 'sun',
      displayOrder: 0,
      isDefault: true,
    }),
    createPreviewBoard({
      id: 'local-korean',
      title: '국어 수업',
      heading: '오늘의 활동',
      body: '모둠별로 생각을 나눈 뒤 발표해요.',
      tone: 'sky',
      displayOrder: 1,
    }),
    createPreviewBoard({
      id: 'local-closing',
      title: '마무리',
      heading: '정리 시간',
      body: '오늘 배운 내용을 한 문장으로 써 봅시다.',
      tone: 'mint',
      displayOrder: 2,
    }),
  ]
  return {
    boards,
    board: boards[0],
    selectedInstanceId: boards[0].widgets[0].instanceId,
    draftIndex: 0,
    dirty: false,
    notice: '',
    openedDefaultBoardId: null,
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
      dirty: true,
      board: updateClassBoardWidgetConfig(
        current.board,
        current.selectedInstanceId,
        config
      ),
    }))
  }

  const updatePlacement = (instanceId, placement, metadata) => {
    setPreview((current) => ({
      ...current,
      dirty: true,
      board: updateClassBoardWidgetPlacement(current.board, instanceId, placement, metadata),
    }))
  }

  const applyPreset = (config) => updateConfig({ ...config })

  const selectLocalBoard = (board) => setPreview((current) => ({
    ...current,
    board,
    selectedInstanceId: board.widgets[0]?.instanceId || null,
    dirty: false,
    notice: '',
  }))

  const createLocalBoard = () => {
    const draft = createPreviewBoard({
      id: null,
      title: '새 스크린',
      heading: '새 안내',
      body: '내용을 입력해 주세요.',
      tone: 'paper',
      displayOrder: 0,
    })
    setPreview((current) => ({
      ...current,
      board: draft,
      selectedInstanceId: draft.widgets[0]?.instanceId || null,
      draftIndex: 0,
      dirty: true,
      notice: '새 탭도 저장하기 전에 좌우로 드래그할 수 있습니다.',
    }))
  }

  const saveLocalBoard = () => setPreview((current) => {
    const isNew = !current.board.id
    const saved = {
      ...current.board,
      id: current.board.id || `local-new-${Date.now()}`,
      displayOrder: isNew ? current.draftIndex : current.board.displayOrder,
      isActive: true,
      isDefault: isNew && current.boards.length === 0 ? true : current.board.isDefault,
    }
    const remaining = current.boards.filter((item) => item.id !== saved.id).map((item) => ({
      ...item,
      isActive: false,
      displayOrder: isNew && item.displayOrder >= saved.displayOrder
        ? item.displayOrder + 1
        : item.displayOrder,
    }))
    return {
      ...current,
      boards: sortClassBoards([saved, ...remaining]),
      board: saved,
      draftIndex: 0,
      dirty: false,
      notice: `‘${saved.title}’ 탭을 미리보기 메모리에 저장했습니다.`,
    }
  })

  const reorderLocalBoards = (orderedIds) => setPreview((current) => {
    const nextDraftIndex = orderedIds.indexOf('draft')
    const byId = new Map(current.boards.map((item) => [item.id, item]))
    const boards = orderedIds.filter((id) => id !== 'draft').map((id, index) => ({
      ...byId.get(id),
      displayOrder: index,
    }))
    return {
      ...current,
      boards,
      draftIndex: nextDraftIndex >= 0 ? nextDraftIndex : current.draftIndex,
      notice: '탭 순서를 미리보기 메모리에 반영했습니다.',
    }
  })

  const setLocalDefault = (board) => setPreview((current) => ({
    ...current,
    boards: current.boards.map((item) => ({ ...item, isDefault: item.id === board.id })),
    board: { ...current.board, isDefault: current.board.id === board.id },
    notice: `‘${board.title}’을 기본 스크린으로 지정했습니다.`,
    openedDefaultBoardId: null,
  }))

  const duplicateLocalBoard = () => setPreview((current) => {
    const copy = {
      ...current.board,
      id: `local-copy-${Date.now()}`,
      title: `${current.board.title} 복사본`,
      displayOrder: 0,
      isActive: true,
      isDefault: false,
    }
    return {
      ...current,
      boards: sortClassBoards([
        copy,
        ...current.boards.map((item) => ({ ...item, isActive: false, displayOrder: item.displayOrder + 1 })),
      ]),
      board: copy,
      dirty: false,
      notice: '복사본을 첫 탭에 만들었습니다.',
    }
  })

  const deleteLocalBoard = () => setPreview((current) => {
    const remaining = current.boards.filter((item) => item.id !== current.board.id)
    if (remaining.length === 0) {
      const draft = createPreviewBoard({
        id: null,
        title: '새 스크린',
        heading: '새 안내',
        body: '내용을 입력해 주세요.',
        tone: 'paper',
        displayOrder: 0,
      })
      return {
        ...current,
        boards: [],
        board: draft,
        selectedInstanceId: draft.widgets[0]?.instanceId || null,
        draftIndex: 0,
        dirty: true,
        notice: '마지막 탭을 삭제해 새 스크린 작성 상태로 돌아왔습니다.',
      }
    }
    const nextDefaultId = remaining.some((item) => item.isDefault) ? null : remaining[0]?.id
    const boards = remaining.map((item, index) => ({
      ...item,
      displayOrder: index,
      isDefault: nextDefaultId ? item.id === nextDefaultId : item.isDefault,
    }))
    const board = boards[0] || current.board
    return {
      ...current,
      boards,
      board,
      selectedInstanceId: board.widgets[0]?.instanceId || null,
      dirty: false,
      notice: '현재 탭을 미리보기에서 삭제했습니다.',
    }
  })

  const openLocalDefault = () => setPreview((current) => {
    const defaultBoard = current.boards.find((item) => item.isDefault)
    return {
      ...current,
      openedDefaultBoardId: defaultBoard?.id || null,
      notice: defaultBoard
        ? `기본 스크린 ‘${defaultBoard.title}’을 전체 화면으로 열었습니다.`
        : '별표로 기본 스크린을 먼저 지정해 주세요.',
    }
  })

  const openedDefaultBoard = preview.boards.find((item) => item.id === preview.openedDefaultBoardId)

  return (
    <main className="class-board-preview">
      <nav className="class-board-preview__teacher-bar" aria-label="교사 상단 바로가기 미리보기">
        <strong>🏫 미리보기 학급</strong>
        <div>
          <button type="button">ⓘ 활용 안내서</button>
          <button type="button" className="is-screen" onClick={openLocalDefault}>🖥️ 우리 반 스크린</button>
          <button type="button">⚙️ 정보 수정</button>
        </div>
      </nav>
      <header className="class-board-preview__header">
        <div>
          <span>개발 전용 · DB 연결 없음</span>
          <h1>우리 반 스크린 로컬 미리보기</h1>
          <p>탭 드래그·기본 별표·상단 바로가기와 위젯 배치를 DB 없이 함께 확인합니다.</p>
        </div>
        <code>?class-board-preview=1</code>
      </header>

      <section className="class-board-preview__tabs" aria-label="스크린 탭 기능 미리보기">
        <ClassBoardTabs
          boards={preview.boards}
          currentBoard={preview.board}
          dirty={preview.dirty}
          disabled={false}
          saving={false}
          deletedPanelOpen={false}
          draftIndex={preview.draftIndex}
          defaultingBoardId={null}
          onSelect={selectLocalBoard}
          onCreate={createLocalBoard}
          onSave={saveLocalBoard}
          onDelete={deleteLocalBoard}
          onDuplicate={duplicateLocalBoard}
          onOpenDeleted={() => setPreview((current) => ({ ...current, notice: '실제 화면에서는 삭제한 탭을 여기서 복구합니다.' }))}
          onReorder={reorderLocalBoards}
          onSetDefault={setLocalDefault}
        />
        <p>탭 전체를 좌우로 드래그하세요. ☆를 누르면 ★ 기본 스크린으로 바뀝니다. 키보드는 Alt+←/→를 사용할 수 있습니다.</p>
      </section>

      {preview.notice ? <div className="class-board-preview__notice" role="status">{preview.notice}</div> : null}
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

      {openedDefaultBoard ? (
        <section className="class-board-preview__presentation" role="dialog" aria-modal="true" aria-label={`${openedDefaultBoard.title} 전체 화면 미리보기`}>
          <header>
            <div><strong>미리보기 학급</strong><span>기본 스크린 · {openedDefaultBoard.title}</span></div>
            <button
              type="button"
              onClick={() => setPreview((current) => ({ ...current, openedDefaultBoardId: null }))}
            >전체 화면 닫기</button>
          </header>
          <div>
            <BoardCanvas board={openedDefaultBoard} presentation editable={false} />
          </div>
        </section>
      ) : null}
    </main>
  )
}
