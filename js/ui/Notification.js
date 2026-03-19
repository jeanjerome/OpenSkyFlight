/**
 * Toast notification system with auto-dismiss.
 * Levels: info, warn, error.
 */
const DISMISS_MS = 4000;

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.id = 'notification-container';
  document.body.appendChild(container);
  return container;
}

export function showNotification(message, level = 'info') {
  const el = document.createElement('div');
  el.className = `notification notification-${level}`;
  el.textContent = message;

  ensureContainer().appendChild(el);

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => el.classList.add('visible'));

  setTimeout(() => {
    el.classList.remove('visible');
    el.addEventListener('transitionend', () => el.remove());
    // Fallback removal if no transition fires
    setTimeout(() => el.remove(), 500);
  }, DISMISS_MS);
}
