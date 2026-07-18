import { onMounted, onUnmounted, ref, shallowRef, watch, type Ref } from 'vue'

/**
 * Drives a pure simulation from requestAnimationFrame.
 *
 * The model knows nothing about wall-clock time; this is the only place in the
 * app that does. Everything the reader can press — pause, step, restart, speed —
 * is just a different way of deciding when to call `advance`, which is why the
 * simulation stays reproducible no matter how they poke at it.
 */
export type Ticker<T> = {
  state: Ref<T>
  running: Ref<boolean>
  speed: Ref<number>
  play(): void
  pause(): void
  toggle(): void
  /** advances exactly one tick, whether or not the ticker is running */
  step(): void
  restart(): void
  /** replaces the state, e.g. after the reader kills a consumer */
  set(next: T): void
  /** attach to the section element so the sim idles while off screen */
  mount(el: HTMLElement | null): void
}

export function useTicker<T>(
  initial: () => T,
  advance: (state: T) => T,
  options: { ticksPerSecond?: number; autoplay?: boolean } = {},
): Ticker<T> {
  // shallowRef is required, not just an optimisation: the core advances state
  // with structuredClone, and structuredClone throws DataCloneError on the
  // Proxy a deep `ref` would wrap it in. (It is also faster — the state is
  // replaced wholesale each tick, so deep reactivity would buy nothing.)
  const state = shallowRef(initial()) as Ref<T>
  const running = ref(options.autoplay ?? false)
  const speed = ref(1)

  const baseTicksPerSecond = options.ticksPerSecond ?? 20
  let frame = 0
  let carry = 0
  let last = 0

  // Six sections each own a simulation. Without this they would all advance
  // forever, so a reader parked on section 1 would still be burning CPU on the
  // other five. Off-screen sims idle; they do not lose their state.
  const onScreen = ref(true)
  let observer: IntersectionObserver | null = null

  const loop = (now: number): void => {
    frame = requestAnimationFrame(loop)
    if (!running.value || !onScreen.value) {
      last = now
      return
    }
    if (last === 0) last = now

    const elapsed = Math.min(now - last, 250) // a backgrounded tab must not fast-forward
    last = now
    carry += (elapsed / 1000) * baseTicksPerSecond * speed.value

    let budget = 0
    while (carry >= 1 && budget < 40) {
      state.value = advance(state.value)
      carry -= 1
      budget++
    }
  }

  frame = requestAnimationFrame(loop)

  // A backgrounded tab already throttles rAF, but being explicit means the
  // carry-over accumulator cannot bank time while nobody is looking.
  const onVisibility = (): void => {
    if (document.hidden) last = 0
  }
  onMounted(() => document.addEventListener('visibilitychange', onVisibility))

  onUnmounted(() => {
    cancelAnimationFrame(frame)
    observer?.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
  })

  // Resetting the frame clock on re-entry stops a long absence from being
  // spent as one burst of catch-up ticks.
  watch(onScreen, (visible) => {
    if (visible) last = 0
  })

  return {
    state,
    running,
    speed,
    play: () => {
      running.value = true
    },
    pause: () => {
      running.value = false
    },
    toggle: () => {
      running.value = !running.value
    },
    step: () => {
      running.value = false
      state.value = advance(state.value)
    },
    restart: () => {
      carry = 0
      state.value = initial()
    },
    set: (next: T) => {
      state.value = next
    },
    mount: (el: HTMLElement | null) => {
      observer?.disconnect()
      if (!el) return
      observer = new IntersectionObserver(
        ([entry]) => {
          onScreen.value = entry?.isIntersecting ?? true
        },
        // A little margin so the sim is already moving by the time the section
        // is properly in view, rather than starting from a frozen frame.
        { rootMargin: '200px' },
      )
      observer.observe(el)
    },
  }
}
