'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

export function Dialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  busy?: boolean
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const headingId = useId()

  useEffect(() => {
    const dialog = ref.current
    const previousFocus = document.activeElement as HTMLElement | null
    dialog?.showModal()
    return () => {
      dialog?.close()
      previousFocus?.focus()
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' wide' : ''}`}
      aria-labelledby={headingId}
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      onClick={(event) => {
        if (!busy && event.target === event.currentTarget) {
          const bounds = event.currentTarget.getBoundingClientRect()
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose()
        }
      }}
    >
      <div className="dialog-header">
        <h2 id={headingId}>{title}</h2>
        <button
          type="button"
          className="ib"
          aria-label="Đóng hộp thoại"
          disabled={busy}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
