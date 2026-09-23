import { createRoot } from 'react-dom/client'
import './styles/design-system.css'
import './index.css'
import { reloadOnceForNewDeploy } from './utils/chunkReload.js'

// 새 배포 뒤 옛 화면 조각을 못 받아 오면(Vite 가 알려 준다) 한 번 새로고침해 새 판을 받는다.
// 새로고침하지 못한 경우(방금 했거나 저장소를 못 씀)에는 그대로 두어 화면의 오류 방어막이 안내한다.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceForNewDeploy()) event.preventDefault()
})

// 글꼴은 화면을 막지 않고 뒤따라 온다. 우리 반 스크린처럼 새 탭에서 바로 여는 화면이
// 바깥 글꼴 서버를 기다리느라 흰 화면으로 머물지 않게 한다.
const fontStylesheet = document.createElement('link')
fontStylesheet.rel = 'stylesheet'
fontStylesheet.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&display=swap'
document.head.appendChild(fontStylesheet)

const isUiPreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('ui-preview') === '1'
const isArrangementPreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('arrangement-preview') === '1'
const isClassBoardPreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('class-board-preview') === '1'
const isDevLab = import.meta.env.DEV
  && Boolean(new URLSearchParams(window.location.search).get('dev-lab'))

const isPublicExhibition = /^\/exhibition\/?$/.test(window.location.pathname)
const { default: RootComponent } = isPublicExhibition
  ? await import('./modules/class-agit/public/PublicEntry.jsx')
  : isDevLab
  ? await import('./dev/DevLab.jsx')
  : isClassBoardPreview
    ? await import('./dev/ClassBoardPreview.jsx')
  : isArrangementPreview
    ? await import('./dev/ArrangementPreview.jsx')
    : isUiPreview
      ? await import('./dev/UiPreview.jsx')
      : await import('./App.jsx')

createRoot(document.getElementById('root')).render(<RootComponent />)
