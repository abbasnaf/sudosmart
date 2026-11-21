import { useCallback, useEffect, useRef } from 'react'

/**
 * Throttles high-frequency UI events (for example a colour picker being dragged)
 * so that real devices are not flooded with commands. The final value is always
 * delivered, even when it arrives inside the throttle window.
 */
export function useThrottledCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  waitMs = 180
): (...args: Args) => void {
  const callbackRef = useRef(callback)
  const lastRun = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<Args | null>(null)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return useCallback(
    (...args: Args) => {
      const now = Date.now()
      const elapsed = now - lastRun.current
      pending.current = args
      if (elapsed >= waitMs) {
        lastRun.current = now
        callbackRef.current(...args)
      } else if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null
          lastRun.current = Date.now()
          if (pending.current) callbackRef.current(...pending.current)
        }, waitMs - elapsed)
      }
    },
    [waitMs]
  )
}
