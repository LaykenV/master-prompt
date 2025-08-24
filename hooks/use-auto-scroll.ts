import { useEffect, useRef, useState, useCallback } from "react"

// How many pixels from the bottom of the container to enable auto-scroll
const ACTIVATION_THRESHOLD = 50
// Minimum pixels of scroll-up movement required to disable auto-scroll
const MIN_SCROLL_UP_THRESHOLD = 10

export function useAutoScroll(dependencies: React.DependencyList) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previousScrollTop = useRef<number | null>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isScrollingProgrammatically = useRef(false)
  const [isScrollable, setIsScrollable] = useState(false)

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      isScrollingProgrammatically.current = true
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      // Reset the flag after a short delay to allow the scroll event to fire
      setTimeout(() => {
        isScrollingProgrammatically.current = false
      }, 50)
    }
  }, [])

  const handleScroll = useCallback(() => {
    if (!containerRef.current || isScrollingProgrammatically.current) {
      return
    }

    // Clear any pending scroll timeout to debounce rapid scroll events
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current)
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return

      const { scrollTop, scrollHeight, clientHeight } = containerRef.current

      const distanceFromBottom = Math.abs(
        scrollHeight - scrollTop - clientHeight
      )

      // Track whether the container can actually scroll
      setIsScrollable(scrollHeight - clientHeight > 1)

      const isScrollingUp = previousScrollTop.current
        ? scrollTop < previousScrollTop.current
        : false

      const scrollUpDistance = previousScrollTop.current
        ? previousScrollTop.current - scrollTop
        : 0

      const isDeliberateScrollUp =
        isScrollingUp && scrollUpDistance > MIN_SCROLL_UP_THRESHOLD

      if (isDeliberateScrollUp) {
        setShouldAutoScroll(false)
      } else {
        const isScrolledToBottom = distanceFromBottom < ACTIVATION_THRESHOLD
        setShouldAutoScroll(isScrolledToBottom)
      }

      previousScrollTop.current = scrollTop
    }, 10) // Small debounce delay
  }, [])

  const handleTouchStart = () => {
    // No-op: avoid disabling auto-scroll on simple taps
  }

  const enableAutoScroll = useCallback(() => {
    setShouldAutoScroll(true)
    // Immediately scroll to bottom when enabling auto-scroll
    scrollToBottom()
  }, [scrollToBottom])

  const disableAutoScroll = () => {
    setShouldAutoScroll(false)
  }

  useEffect(() => {
    if (containerRef.current) {
      previousScrollTop.current = containerRef.current.scrollTop
      // Set initial auto-scroll state based on current scroll position
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current
      const distanceFromBottom = Math.abs(scrollHeight - scrollTop - clientHeight)
      setShouldAutoScroll(distanceFromBottom < ACTIVATION_THRESHOLD)
      setIsScrollable(scrollHeight - clientHeight > 1)
    }
  }, [])

  useEffect(() => {
    if (shouldAutoScroll) {
      // Use requestAnimationFrame followed by setTimeout to ensure DOM updates are complete
      const rafId = requestAnimationFrame(() => {
        const timeoutId = setTimeout(() => {
          scrollToBottom()
        }, 0)
        return () => clearTimeout(timeoutId)
      })
      return () => cancelAnimationFrame(rafId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies)

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  return {
    containerRef,
    scrollToBottom,
    handleScroll,
    shouldAutoScroll,
    handleTouchStart,
    enableAutoScroll,
    disableAutoScroll,
    isScrollable,
  }
}