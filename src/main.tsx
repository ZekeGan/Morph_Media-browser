import React from 'react'
import { createRoot } from 'react-dom/client'
import { AppThemeProvider } from './themes/ThemeProvider'
import '@mantine/core/styles.css'
import 'react-grid-layout/css/styles.css'
import './styles/style.css'
import './video/video-player.css'
import './themes/themes.css'
import { App } from './App'
import { PlaybackProvider } from './media/Playback'
import { ErrorBoundary } from './notices/ErrorBoundary'
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppThemeProvider>
      <ErrorBoundary>
        <PlaybackProvider>
          <App />
        </PlaybackProvider>
      </ErrorBoundary>
    </AppThemeProvider>
  </React.StrictMode>
)
