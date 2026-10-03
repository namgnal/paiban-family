// Two clicks also work on touch screens with touch-action: manipulation.
// The caller's key identifies the exact recommendation and game revision.
export function createDoubleTap(windowMs = 450) {
  let previous = null;
  return {
    reset() { previous = null; },
    tap(key, time = performance.now()) {
      const confirmed = previous?.key === key && time >= previous.time && time - previous.time <= windowMs;
      previous = confirmed ? null : { key, time };
      return confirmed;
    },
  };
}
