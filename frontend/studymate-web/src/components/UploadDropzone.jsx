import { useRef, useState } from 'react'
import { Button, cx } from './ui'
import { UploadIcon } from './icons'

/**
 * Drag-and-drop (or click / keyboard) PDF picker with an inline progress bar.
 * Purely presentational - the parent owns validation and the upload request.
 */
export default function UploadDropzone({ onFile, uploading, progress = 0, disabled = false }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState(null)

  function pick(file) {
    if (!file) return
    setFileName(file.name)
    onFile(file)
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled && !uploading) setDragging(true)
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        if (disabled || uploading) return
        pick(event.dataTransfer?.files?.[0])
      }}
      className={cx(
        'rounded-lg border border-dashed px-5 py-7 text-center transition-colors duration-150',
        dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface',
        (disabled || uploading) && 'opacity-70',
      )}
    >
      <input
        ref={inputRef}
        id="pdf-upload"
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        disabled={disabled || uploading}
        onChange={(event) => {
          pick(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-muted">
        <UploadIcon className="h-5 w-5" />
      </div>

      <label htmlFor="pdf-upload" className="type-title block cursor-pointer text-ink">
        Drop a PDF here
      </label>
      <p className="type-small mt-1 text-muted">
        or{' '}
        <button
          type="button"
          className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
        >
          browse your files
        </button>
        . PDF only.
      </p>

      {uploading ? (
        <div className="mx-auto mt-5 max-w-sm text-left">
          <div className="type-micro mb-1.5 flex items-center justify-between text-muted">
            <span className="truncate pr-3">{fileName || 'Uploading'}</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
          >
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
