/**
 * Centralized keyboard dispatch.
 * - `on(code, handler)` matches by physical key position (e.code) — for WASD/arrows.
 * - `onKey(key, handler)` matches by character value (e.key) — for action shortcuts.
 */
export default class InputManager {
  constructor() {
    this._handlers = [];
    window.addEventListener('keydown', (e) => this._dispatch(e));
  }

  /** Register handler for a physical key code (e.code). */
  on(code, handler) {
    this._handlers.push({ code, predicate: null, handler });
  }

  /** Register handler for a character key (e.key), case-insensitive. */
  onKey(key, handler) {
    this._handlers.push({ key: key.toLowerCase(), predicate: null, handler });
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
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    for (const entry of this._handlers) {
      if (entry.key) {
        if (e.key.toLowerCase() !== entry.key) continue;
      } else if (entry.prefix) {
        if (!e.code.startsWith(entry.prefix)) continue;
      } else if (entry.code && e.code !== entry.code) {
        continue;
      }

      if (entry.predicate && !entry.predicate(e)) continue;

      entry.handler(e);
    }
  }
}
