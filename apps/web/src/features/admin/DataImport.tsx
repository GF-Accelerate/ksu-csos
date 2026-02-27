/**
 * DataImport Component
 *
 * CSV import interface for Paciolan and Raiser's Edge data.
 */

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type ImportType = 'paciolan' | 'raisers_edge'
type ImportStatus = 'idle' | 'uploading' | 'processing' | 'complete' | 'error'

interface ImportResult {
  success: boolean
  recordsProcessed: number
  constituentsCreated: number
  constituentsUpdated: number
  opportunitiesCreated: number
  opportunitiesUpdated: number
  errors: string[]
  warnings: string[]
}

export function DataImport() {
  const [importType, setImportType] = useState<ImportType>('paciolan')
  const [status, setStatus] = useState<ImportStatus>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [dryRun, setDryRun] = useState(true)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0]
      if (selectedFile.type === 'text/csv' || selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile)
        setError(null)
        setResult(null)
      } else {
        setError('Please select a CSV file')
        setFile(null)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile.type === 'text/csv' || droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile)
        setError(null)
        setResult(null)
      } else {
        setError('Please drop a CSV file')
        setFile(null)
      }
    }
  }

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file first')
      return
    }

    setStatus('uploading')
    setError(null)
    setResult(null)

    try {
      // Upload file to Supabase Storage
      const timestamp = Date.now()
      const fileName = `${importType}_${timestamp}_${file.name}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('imports')
        .upload(fileName, file)

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // Get the file URL
      const { data: urlData } = supabase.storage.from('imports').getPublicUrl(fileName)

      if (!urlData?.publicUrl) {
        throw new Error('Failed to get file URL')
      }

      // Read file content
      const fileContent = await file.text()

      setStatus('processing')

      // Call the appropriate edge function
      const functionName = importType === 'paciolan' ? 'ingest_paciolan' : 'ingest_raisers_edge'
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token

      if (!token) {
        throw new Error('Not authenticated')
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            csv_content: fileContent,
            dry_run: dryRun,
          }),
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Import failed: ${errorText}`)
      }

      const importResult = await response.json()

      setResult({
        success: importResult.success || true,
        recordsProcessed: importResult.records_processed || 0,
        constituentsCreated: importResult.constituents_created || 0,
        constituentsUpdated: importResult.constituents_updated || 0,
        opportunitiesCreated: importResult.opportunities_created || 0,
        opportunitiesUpdated: importResult.opportunities_updated || 0,
        errors: importResult.errors || [],
        warnings: importResult.warnings || [],
      })

      setStatus('complete')

      // Clean up uploaded file after processing
      await supabase.storage.from('imports').remove([fileName])
    } catch (err: any) {
      console.error('Import error:', err)
      setError(err.message || 'Import failed')
      setStatus('error')
    }
  }

  const handleReset = () => {
    setFile(null)
    setStatus('idle')
    setResult(null)
    setError(null)
  }

  return (
    <div className="page">
      <div className="container">
        <div className="page-header">
          <h1 className="page-title">Data Import</h1>
          <p className="page-description">Import constituent data from CSV files</p>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">CSV Upload</h2>
          </div>

          <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
            {/* Import Type Selection */}
            <div className="form-group">
              <label>Import Type</label>
              <select
                value={importType}
                onChange={(e) => setImportType(e.target.value as ImportType)}
                disabled={status === 'uploading' || status === 'processing'}
              >
                <option value="paciolan">Paciolan Ticketing Data</option>
                <option value="raisers_edge">Raiser's Edge Donor Data</option>
              </select>
            </div>

            {/* CSV Format Info */}
            <div className="import-format-info">
              <h4>Expected CSV Format:</h4>
              {importType === 'paciolan' ? (
                <div>
                  <p className="text-sm text-muted">
                    Columns: email, first_name, last_name, phone, zip, account_id,
                    lifetime_spend, sport_affinity
                  </p>
                  <p className="text-sm text-muted mt-sm">
                    <strong>Example:</strong> john.doe@example.com, John, Doe, 555-1234, 66502,
                    ACC123, 5000, Football
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted">
                    Columns: email, first_name, last_name, phone, zip, donor_id, lifetime_giving,
                    capacity_rating
                  </p>
                  <p className="text-sm text-muted mt-sm">
                    <strong>Example:</strong> jane.smith@example.com, Jane, Smith, 555-5678,
                    66502, DON456, 25000, 100000
                  </p>
                </div>
              )}
            </div>

            {/* Dry Run Option */}
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  disabled={status === 'uploading' || status === 'processing'}
                />
                <span>Dry Run (validate only, don't import data)</span>
              </label>
              <p className="text-sm text-muted mt-sm">
                Use dry run to validate your CSV file before importing. No data will be created or
                modified.
              </p>
            </div>

            {/* File Upload Area */}
            <div
              className={`file-upload-area ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {!file ? (
                <div className="upload-placeholder">
                  <div className="upload-icon">📁</div>
                  <p className="upload-text">Drag and drop CSV file here</p>
                  <p className="upload-subtext">or</p>
                  <label className="btn btn-secondary">
                    Choose File
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileChange}
                      style={{ display: 'none' }}
                      disabled={status === 'uploading' || status === 'processing'}
                    />
                  </label>
                </div>
              ) : (
                <div className="upload-file-info">
                  <div className="file-icon">📄</div>
                  <div className="file-details">
                    <p className="file-name">{file.name}</p>
                    <p className="file-size">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  {status === 'idle' && (
                    <button className="btn btn-sm btn-secondary" onClick={handleReset}>
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="import-actions">
              <button
                className="btn btn-secondary"
                onClick={handleReset}
                disabled={!file || status === 'uploading' || status === 'processing'}
              >
                Reset
              </button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={!file || status === 'uploading' || status === 'processing'}
              >
                {status === 'uploading' && 'Uploading...'}
                {status === 'processing' && 'Processing...'}
                {status !== 'uploading' && status !== 'processing' && (dryRun ? 'Validate' : 'Import')}
              </button>
            </div>

            {/* Status Messages */}
            {status === 'uploading' && (
              <div className="alert alert-info mt-lg">
                <span className="alert-icon">⏳</span>
                <span className="alert-message">Uploading file...</span>
              </div>
            )}

            {status === 'processing' && (
              <div className="alert alert-info mt-lg">
                <span className="alert-icon">⚙️</span>
                <span className="alert-message">
                  Processing {importType === 'paciolan' ? 'ticketing' : 'donor'} data...
                </span>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="alert alert-error mt-lg">
                <span className="alert-icon">⚠️</span>
                <span className="alert-message">{error}</span>
              </div>
            )}

            {/* Results Display */}
            {status === 'complete' && result && (
              <div className="import-results mt-lg">
                <div className={`alert ${result.errors.length > 0 ? 'alert-warning' : 'alert-success'}`}>
                  <span className="alert-icon">{result.errors.length > 0 ? '⚠️' : '✅'}</span>
                  <span className="alert-message">
                    {dryRun
                      ? 'Validation complete'
                      : result.errors.length > 0
                        ? 'Import completed with errors'
                        : 'Import successful!'}
                  </span>
                </div>

                <div className="results-grid">
                  <div className="result-card">
                    <div className="result-label">Records Processed</div>
                    <div className="result-value">{result.recordsProcessed}</div>
                  </div>
                  <div className="result-card">
                    <div className="result-label">Constituents Created</div>
                    <div className="result-value text-success">{result.constituentsCreated}</div>
                  </div>
                  <div className="result-card">
                    <div className="result-label">Constituents Updated</div>
                    <div className="result-value text-info">{result.constituentsUpdated}</div>
                  </div>
                  <div className="result-card">
                    <div className="result-label">Opportunities Created</div>
                    <div className="result-value text-success">{result.opportunitiesCreated}</div>
                  </div>
                </div>

                {/* Warnings */}
                {result.warnings.length > 0 && (
                  <div className="mt-lg">
                    <h4>Warnings ({result.warnings.length})</h4>
                    <ul className="error-list">
                      {result.warnings.slice(0, 10).map((warning, index) => (
                        <li key={index} className="text-warning">
                          {warning}
                        </li>
                      ))}
                      {result.warnings.length > 10 && (
                        <li className="text-muted">
                          ... and {result.warnings.length - 10} more warnings
                        </li>
                      )}
                    </ul>
                  </div>
                )}

                {/* Errors */}
                {result.errors.length > 0 && (
                  <div className="mt-lg">
                    <h4>Errors ({result.errors.length})</h4>
                    <ul className="error-list">
                      {result.errors.slice(0, 10).map((err, index) => (
                        <li key={index} className="text-error">
                          {err}
                        </li>
                      ))}
                      {result.errors.length > 10 && (
                        <li className="text-muted">... and {result.errors.length - 10} more errors</li>
                      )}
                    </ul>
                  </div>
                )}

                {dryRun && result.errors.length === 0 && (
                  <div className="alert alert-info mt-lg">
                    <span className="alert-icon">💡</span>
                    <span className="alert-message">
                      Validation successful! Uncheck "Dry Run" and click Import to process the data.
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Import Guide */}
        <div className="card mt-lg">
          <div className="card-header">
            <h2 className="card-title">Import Guide</h2>
          </div>
          <div className="card-body" style={{ padding: 'var(--spacing-lg)' }}>
            <div className="import-guide">
              <div className="guide-section">
                <h4>📋 Before You Import</h4>
                <ul>
                  <li>Ensure your CSV file matches the expected format exactly</li>
                  <li>Use dry run mode first to validate your data</li>
                  <li>Check for duplicate records in your source system</li>
                  <li>Backup your data before performing large imports</li>
                </ul>
              </div>

              <div className="guide-section">
                <h4>🔍 Identity Resolution</h4>
                <ul>
                  <li>
                    <strong>Email matching:</strong> Exact match (case-insensitive)
                  </li>
                  <li>
                    <strong>Phone matching:</strong> Normalized to E.164 format
                  </li>
                  <li>
                    <strong>Name + Zip matching:</strong> Fuzzy matching with 80% similarity
                    threshold
                  </li>
                  <li>Existing constituents will be updated, new ones will be created</li>
                </ul>
              </div>

              <div className="guide-section">
                <h4>⚙️ What Happens During Import</h4>
                <ol>
                  <li>File is uploaded to secure storage</li>
                  <li>CSV is parsed and validated</li>
                  <li>Each record is matched against existing constituents</li>
                  <li>Constituent data is created or updated</li>
                  <li>Opportunities are created based on data type and thresholds</li>
                  <li>Audit log entries are created for all changes</li>
                </ol>
              </div>

              <div className="guide-section">
                <h4>🎯 Paciolan Import Specifics</h4>
                <ul>
                  <li>Sets <code>is_ticket_holder = true</code></li>
                  <li>Updates <code>lifetime_ticket_spend</code></li>
                  <li>Updates <code>sport_affinity</code></li>
                  <li>Creates ticket opportunities for active accounts</li>
                </ul>
              </div>

              <div className="guide-section">
                <h4>💰 Raiser's Edge Import Specifics</h4>
                <ul>
                  <li>Sets <code>is_donor = true</code></li>
                  <li>Updates <code>lifetime_giving</code></li>
                  <li>
                    Creates major gift opportunities if lifetime_giving ≥ $1,000 OR capacity ≥
                    $10,000
                  </li>
                  <li>
                    Ask amount = max(capacity × 0.10, giving × 0.20, $5,000)
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
