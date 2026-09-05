import { createRoot } from 'react-dom/client'
import './styles/design-system.css'
import './index.css'

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
