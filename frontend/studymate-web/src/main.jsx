import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from './context/I18nContext'
import App from './App'
import './index.css'

/* I18nProvider sits outside the router, because the interface has to have a
   language before there is a route to render in it - including the redirect
   to /login, which is the first thing an unauthenticated visitor sees. */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </StrictMode>,
)
