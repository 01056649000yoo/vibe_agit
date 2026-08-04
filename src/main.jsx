import { createRoot } from 'react-dom/client'
import './styles/design-system.css'
import './index.css'

const isUiPreview = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('ui-preview') === '1'

const { default: RootComponent } = isUiPreview
  ? await import('./dev/UiPreview.jsx')
  : await import('./App.jsx')

createRoot(document.getElementById('root')).render(<RootComponent />)
