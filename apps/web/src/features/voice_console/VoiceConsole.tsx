/**
 * VoiceConsole Component
 *
 * Voice-enabled command interface with Web Speech API integration.
 */

import { useState, useEffect, useRef } from 'react'
import { processVoiceCommand, VoiceRecognition } from '@/services/voiceService'
import type { VoiceCommandResponse } from '@/types'

export function VoiceConsole() {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [response, setResponse] = useState<VoiceCommandResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<VoiceCommandResponse[]>([])
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<string | null>(null)

  const recognitionRef = useRef<VoiceRecognition | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Initialize voice recognition
    recognitionRef.current = new VoiceRecognition({
      onResult: (text: string) => {
        setTranscript(text)
        setIsListening(false)
      },
      onError: (err: string) => {
        setError(err)
        setIsListening(false)
      },
      onEnd: () => {
        setIsListening(false)
      },
    })

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
    }
  }, [])

  const handleStartListening = () => {
    if (!VoiceRecognition.isSupported()) {
      setError('Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.')
      return
    }

    setError(null)
    setTranscript('')
    setResponse(null)

    if (recognitionRef.current) {
      recognitionRef.current.start()
      setIsListening(true)
    }
  }

  const handleStopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      setIsListening(false)
    }
  }

  const handleSubmit = async (commandText?: string) => {
    const textToSubmit = commandText || transcript

    if (!textToSubmit.trim()) {
      setError('Please enter or speak a command first')
      return
    }

    setProcessing(true)
    setError(null)
    setResponse(null)

    try {
      const result = await processVoiceCommand(textToSubmit)

      // Check if confirmation required
      if (result.intent?.requires_confirmation && !commandText) {
        setPendingCommand(textToSubmit)
        setShowConfirmation(true)
        setProcessing(false)
        return
      }

      setResponse(result)
      setHistory((prev) => [result, ...prev.slice(0, 9)]) // Keep last 10

      if (result.success) {
        setTranscript('')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to process command')
    } finally {
      setProcessing(false)
    }
  }

  const handleConfirm = async () => {
    if (pendingCommand) {
      setShowConfirmation(false)
      await handleSubmit(pendingCommand)
      setPendingCommand(null)
    }
  }

  const handleCancel = () => {
    setShowConfirmation(false)
    setPendingCommand(null)
    setProcessing(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !processing) {
      handleSubmit()
    }
  }

  const handleQuickCommand = (command: string) => {
    setTranscript(command)
    inputRef.current?.focus()
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Voice Console</h1>
          <p className="page-description">Control the system with your voice or text commands</p>
        </div>

        {/* Command Input */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Command Input</h2>
          </div>
          <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="voice-input-area">
              <div className="voice-input-group">
                <input
                  ref={inputRef}
                  type="text"
                  className="voice-input"
                  placeholder="Type or speak a command..."
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={processing || isListening}
                />
                <button
                  className={`btn btn-mic ${isListening ? 'listening' : ''}`}
                  onClick={isListening ? handleStopListening : handleStartListening}
                  disabled={processing}
                  title={
                    isListening ? 'Stop listening' : 'Start voice input'
                  }
                >
                  {isListening ? '🎤 Listening...' : '🎤'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleSubmit()}
                  disabled={processing || isListening || !transcript.trim()}
                >
                  {processing ? 'Processing...' : 'Submit'}
                </button>
              </div>

              {isListening && (
                <div className="listening-indicator">
                  <div className="pulse-dot"></div>
                  <span>Listening... speak your command</span>
                </div>
              )}
            </div>

            {/* Quick Commands */}
            <div className="quick-commands">
              <h4>Quick Commands:</h4>
              <div className="quick-command-buttons">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleQuickCommand('Show me renewals at risk')}
                >
                  Show Renewals at Risk
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleQuickCommand('Show ask-ready prospects')}
                >
                  Show Prospects
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleQuickCommand("What's in my queue?")}
                >
                  My Work Queue
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleQuickCommand('Show pipeline summary')}
                >
                  Pipeline Summary
                </button>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="alert alert-error mt-lg">
                <span className="alert-icon">⚠️</span>
                <span className="alert-message">{error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Confirmation Dialog */}
        {showConfirmation && (
          <div className="modal-overlay" onClick={handleCancel}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Confirm Action</h2>
                <button className="modal-close" onClick={handleCancel}>
                  ×
                </button>
              </div>
              <div className="modal-body">
                <p>This action requires confirmation:</p>
                <p className="font-semibold mt-md">"{pendingCommand}"</p>
                <p className="text-muted mt-md">
                  This is a potentially destructive action. Are you sure you want to proceed?
                </p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={handleCancel}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleConfirm}>
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Response Display */}
        {response && (
          <div className="card mt-lg">
            <div className="card-header">
              <h2 className="card-title">Response</h2>
              <div className="intent-badge">
                <span className="text-sm text-muted">Intent: </span>
                <span className="badge badge-info">{response.intent?.action || 'unknown'}</span>
                <span className="text-sm text-muted ml-md">
                  Confidence: {((response.intent?.confidence || 0) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
              {/* Message */}
              <div className={`alert ${response.success ? 'alert-success' : 'alert-warning'}`}>
                <span className="alert-icon">{response.success ? '✅' : '⚠️'}</span>
                <span className="alert-message">{response.message}</span>
              </div>

              {/* Display Data */}
              {response.display_data && (
                <div className="response-display mt-lg">
                  {response.display_data.type === 'table' && (
                    <div className="data-table-wrapper">
                      <table className="data-table">
                        <thead>
                          <tr>
                            {response.display_data.columns.map((col: string) => (
                              <th key={col}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {response.display_data.rows.map((row: any, idx: number) => (
                            <tr key={idx}>
                              <td>{row.name}</td>
                              <td>{row.email}</td>
                              <td>{row.value || row.giving}</td>
                              <td>
                                {row.risk && (
                                  <span className={`badge badge-${row.risk === 'high' ? 'danger' : row.risk === 'medium' ? 'warning' : 'info'}`}>
                                    {row.risk}
                                  </span>
                                )}
                                {row.capacity && row.capacity}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {response.display_data.type === 'list' && (
                    <ul className="response-list">
                      {response.display_data.items.map((item: any, idx: number) => (
                        <li key={idx} className="response-list-item">
                          <div className="list-item-header">
                            <span className="list-item-title">{item.title}</span>
                            {item.priority && (
                              <span
                                className={`badge badge-${item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'info'}`}
                              >
                                {item.priority}
                              </span>
                            )}
                          </div>
                          <div className="list-item-subtitle text-sm text-muted">
                            {item.subtitle}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {response.display_data.type === 'summary' && (
                    <div className="metrics-grid">
                      {response.display_data.metrics.map((metric: any, idx: number) => (
                        <div key={idx} className="metric-card">
                          <div className="metric-label">{metric.label}</div>
                          <div className="metric-value">{metric.value}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {response.display_data.type === 'profile' && (
                    <div className="profile-display">
                      <div className="profile-header">
                        <h3>{response.display_data.constituent.name}</h3>
                        <div className="profile-tags">
                          {response.display_data.constituent.tags.map((tag: string) => (
                            <span key={tag} className="badge badge-primary">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="profile-details">
                        <p>
                          <strong>Email:</strong> {response.display_data.constituent.email || 'N/A'}
                        </p>
                        <p>
                          <strong>Phone:</strong> {response.display_data.constituent.phone || 'N/A'}
                        </p>
                        <p>
                          <strong>Lifetime Value:</strong>{' '}
                          {response.display_data.constituent.lifetime_value}
                        </p>
                      </div>
                      {response.display_data.alternatives &&
                        response.display_data.alternatives.length > 0 && (
                          <div className="profile-alternatives mt-md">
                            <p className="text-sm text-muted">
                              Other matches: {response.display_data.alternatives.join(', ')}
                            </p>
                          </div>
                        )}
                    </div>
                  )}

                  {response.display_data.type === 'action' && (
                    <div className="alert alert-info mt-md">
                      <span className="alert-icon">💡</span>
                      <span className="alert-message">{response.display_data.suggestion}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Command History */}
        {history.length > 0 && (
          <div className="card mt-lg">
            <div className="card-header">
              <h2 className="card-title">Recent Commands</h2>
            </div>
            <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
              <ul className="history-list">
                {history.map((item, idx) => (
                  <li key={idx} className="history-item">
                    <div className="history-header">
                      <span className="badge badge-secondary">{item.intent?.action || 'unknown'}</span>
                      <span className="text-sm text-muted">
                        {((item.intent?.confidence || 0) * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    <div className="history-message text-sm">{item.message}</div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Voice Console Guide */}
        <div className="card mt-lg">
          <div className="card-header">
            <h2 className="card-title">Voice Console Guide</h2>
          </div>
          <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="voice-guide">
              <div className="guide-section">
                <h4>🎤 How to Use Voice Input</h4>
                <ol>
                  <li>Click the microphone button or press it to start listening</li>
                  <li>Speak your command clearly</li>
                  <li>The system will transcribe and process your command</li>
                  <li>Review the response and parsed intent</li>
                </ol>
              </div>

              <div className="guide-section">
                <h4>💬 Example Commands</h4>
                <ul>
                  <li>
                    <strong>"Show me renewals at risk"</strong> - View constituents at risk of not
                    renewing
                  </li>
                  <li>
                    <strong>"Show ask-ready prospects"</strong> - View constituents ready for asks
                  </li>
                  <li>
                    <strong>"What's in my queue?"</strong> - View your work queue
                  </li>
                  <li>
                    <strong>"Show pipeline summary"</strong> - View pipeline metrics
                  </li>
                  <li>
                    <strong>"Find John Smith"</strong> - Search for a specific constituent
                  </li>
                  <li>
                    <strong>"Show high risk renewals"</strong> - Filter by risk level
                  </li>
                  <li>
                    <strong>"Show major gift pipeline"</strong> - Filter pipeline by type
                  </li>
                </ul>
              </div>

              <div className="guide-section">
                <h4>🔒 Confirmations</h4>
                <p className="text-sm text-muted">
                  Destructive actions like sending proposals or approving require confirmation.
                  You'll see a confirmation dialog before the action is executed.
                </p>
              </div>

              <div className="guide-section">
                <h4>⚡ Keyboard Shortcuts</h4>
                <ul>
                  <li>
                    <kbd>Enter</kbd> - Submit command
                  </li>
                  <li>Type commands directly if voice input is not available</li>
                </ul>
              </div>

              <div className="guide-section">
                <h4>🌐 Browser Support</h4>
                <p className="text-sm text-muted">
                  Voice recognition works best in Chrome, Edge, and Safari. Firefox does not
                  currently support the Web Speech API. You can always type commands directly.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
