/**
 * TUI resize handler for ORX interactive chat.
 *
 * Listens for terminal resize events and triggers a redraw callback
 * so the composer and status bar can be re-rendered at the new width.
 * Does NOT use the alternate screen buffer — the transcript stays in
 * the terminal's normal scrollback buffer so it survives resize.
 */

export interface ResizeStream {
  on?: (event: string, listener: () => void) => void;
  off?: (event: string, listener: () => void) => void;
}

export interface ResizeHandler {
  /** Start listening for resize events. */
  start: () => void;
  /** Stop listening for resize events. */
  stop: () => void;
  /** Whether the handler is currently listening. */
  readonly isActive: boolean;
}

/**
 * Creates a resize handler that calls `onResize` (debounced) when the
 * terminal is resized. Returns null if the stream doesn't support
 * resize events.
 */
export function createResizeHandler(
  stream: ResizeStream,
  onResize: () => void,
  debounceMs = 50,
): ResizeHandler | null {
  if (!stream.on || !stream.off) {
    return null;
  }

  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const listener = (): void => {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      if (active) {
        onResize();
      }
    }, debounceMs);
    timer.unref?.();
  };

  function start(): void {
    if (active) {
      return;
    }
    active = true;
    stream.off!("resize", listener);
    stream.on!("resize", listener);
  }

  function stop(): void {
    if (!active) {
      return;
    }
    active = false;
    stream.off!("resize", listener);
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  return {
    start,
    stop,
    get isActive() {
      return active;
    },
  };
}

/** Clear the visible terminal screen (cursor to top, clear to end). */
export function clearVisibleScreen(): string {
  return "\x1b[1;1H\x1b[0J";
}
