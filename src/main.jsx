import { createRoot } from 'react-dom/client'
import './styles/design-system.css'
import './index.css'

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
