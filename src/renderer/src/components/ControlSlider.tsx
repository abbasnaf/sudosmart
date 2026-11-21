import { useEffect, useRef, useState } from 'react'
import { Slider } from './ui/slider'

interface ControlSliderProps {
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  onValueChange?: (value: number) => void
  onValueCommit: (value: number) => void
  className?: string
  trackClassName?: string
  rangeClassName?: string
}

/**
 * Slider that stays responsive while dragging. Radix Slider is controlled here,
 * so we keep local state during interaction and only sync from device state when
 * the user is not actively dragging.
 */
export function ControlSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  onValueChange,
  onValueCommit,
  className,
  trackClassName,
  rangeClassName
}: ControlSliderProps) {
  const [local, setLocal] = useState(value)
  const dragging = useRef(false)

  useEffect(() => {
    if (!dragging.current) setLocal(value)
  }, [value])

  return (
    <Slider
      className={className}
      trackClassName={trackClassName}
      rangeClassName={rangeClassName}
      value={[local]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={([next]) => {
        dragging.current = true
        setLocal(next)
        onValueChange?.(next)
      }}
      onValueCommit={([next]) => {
        dragging.current = false
        setLocal(next)
        onValueChange?.(next)
        onValueCommit(next)
      }}
    />
  )
}
