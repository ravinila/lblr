import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App.js'
import './styles.css'

const host = document.getElementById('root')
if (!host) throw new Error('index.html is missing its #root element')

/**
 * A crash must say so. A blank window gives nobody anything to report, so
 * anything that escapes React is shown on screen with its stack, and the
 * saved session can be cleared from there in case it is what broke.
 */
class Crash extends Component<{ children: ReactNode }, { error: Error | null; stack: string }> {
  override state = { error: null as Error | null, stack: '' }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, stack: info.componentStack ?? '' })
  }

  override render() {
    const { error, stack } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ padding: 32, maxWidth: 760, userSelect: 'text' }}>
        <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>lblr stopped</h1>
        <p style={{ margin: '0 0 16px', color: '#5f6975' }}>
          Something went wrong while drawing the designer. The message below is what to report.
        </p>
        <pre className="code" style={{ maxHeight: 'none', whiteSpace: 'pre-wrap' }}>
          {error.message}
          {'\n\n'}
          {error.stack}
          {'\n'}
          {stack}
        </pre>
        <p style={{ marginTop: 16 }}>
          <button
            className="btn"
            onClick={() => {
              window.localStorage.removeItem('lblr.session.v1')
              window.location.reload()
            }}
          >
            Start over with a blank label
          </button>
        </p>
      </div>
    )
  }
}

createRoot(host).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
)
