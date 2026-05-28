import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import '@/styles/SonaInput.css'

export interface SonaInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  icon?: ReactNode
  type?: InputHTMLAttributes<HTMLInputElement>['type']
  min?: InputHTMLAttributes<HTMLInputElement>['min']
  max?: InputHTMLAttributes<HTMLInputElement>['max']
  step?: InputHTMLAttributes<HTMLInputElement>['step']
  inputMode?: InputHTMLAttributes<HTMLInputElement>['inputMode']
  pattern?: InputHTMLAttributes<HTMLInputElement>['pattern']
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
  onBlur?: () => void
}

export function SonaInput({
  value,
  onChange,
  placeholder,
  icon,
  type = 'text',
  min,
  max,
  step,
  inputMode,
  pattern,
  onKeyDown,
  onBlur,
}: SonaInputProps) {
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
        min={min}
        max={max}
        step={step}
        inputMode={inputMode}
        pattern={pattern}
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
