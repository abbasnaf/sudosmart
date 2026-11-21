import {
  Activity,
  Blinds,
  Cpu,
  Fan,
  Lamp,
  Lightbulb,
  Plug,
  Speaker,
  Thermometer,
  ToggleLeft,
  Wind
} from 'lucide-react'
import type { DeviceCategory } from '@shared/types'
import { cn } from '@renderer/lib/utils'

export function DeviceIcon({ category, className }: { category: DeviceCategory; className?: string }) {
  const Icon =
    category === 'light'
      ? Lightbulb
      : category === 'switch'
        ? ToggleLeft
        : category === 'sensor'
          ? Thermometer
          : category === 'cover'
            ? Blinds
            : category === 'climate'
              ? Wind
              : category === 'media_player'
                ? Speaker
                : category === 'other'
                  ? Cpu
                  : Lamp
  return <Icon className={cn('h-5 w-5', className)} />
}

export function DeviceGlyph({ category, className }: { category: DeviceCategory; className?: string }) {
  const Icon =
    category === 'light'
      ? Lamp
      : category === 'switch'
        ? Plug
        : category === 'sensor'
          ? Activity
          : category === 'cover'
            ? Blinds
            : category === 'climate'
              ? Fan
              : category === 'media_player'
                ? Speaker
                : Cpu
  return <Icon className={cn('h-4 w-4', className)} />
}
