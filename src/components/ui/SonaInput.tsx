import { useState, type ReactNode } from 'react'
import '@/styles/SonaInput.css'

export interface SonaInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  icon?: ReactNode
  type?: string
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: () => void
}

export function SonaInput({ value, onChange, placeholder, icon, type = 'text', onKeyDown, onBlur }: SonaInputProps) {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div className={`sona-input${isFocused ? ' sona-input--focused' : ''}`}>
      {icon && <span className="sona-input-icon">{icon}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false)
          onBlur?.()
        }}
        className="sona-input-field"
      />
    </div>
  )
}
