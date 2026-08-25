import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ConfirmationProvider from './components/confirmation/ConfirmationProvider.jsx'
import { LanguageProvider } from './i18n/LanguageContext.jsx'

createRoot(document.getElementById('root')).render(
  <LanguageProvider>
    <ConfirmationProvider><App /></ConfirmationProvider>
  </LanguageProvider>,
)
