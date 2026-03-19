/**
 * Centralized keyboard dispatch.
 * Registers handlers via `on(code, handler)` and `onWhen(code, predicate, handler)`.
 */
export default class InputManager {
  constructor() {
    this._handlers = [];
    window.addEventListener('keydown', (e) => this._dispatch(e));
  }

  /** Register handler for a specific key code. */
  on(code, handler) {
    this._handlers.push({ code, predicate: null, handler });
  }

  /** Register handler that only fires when predicate returns true. */
  onWhen(code, predicate, handler) {
    this._handlers.push({ code, predicate, handler });
  }

  /** Register handler for any key matching a prefix (e.g. 'Digit'). */
  onPrefix(prefix, handler) {
    this._handlers.push({ code: null, prefix, predicate: null, handler });
  }

  _dispatch(e) {
    for (const entry of this._handlers) {
      if (entry.prefix) {
        if (!e.code.startsWith(entry.prefix)) continue;
      } else if (entry.code && e.code !== entry.code) {
        continue;
      }

      if (entry.predicate && !entry.predicate(e)) continue;

      entry.handler(e);
    }
  }
}
