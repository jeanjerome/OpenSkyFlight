// Centralized logging module with circular buffer and UI output

import { CONFIG, onChange } from './config.js';

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const LEVEL_COLORS = { DEBUG: '#00ff88', INFO: '#00ccff', WARN: '#ffcc00', ERROR: '#ff4444' };
const MAX_ENTRIES = 200;

const buffer = [];
let panelEl = null;
let uiVisible = false;

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[CONFIG.logLevel || 'WARN'];
}

function formatTime() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${h}:${m}:${s}.${ms}`;
}

function log(level, module, message, data) {
  if (!shouldLog(level)) return;

  const entry = { time: formatTime(), level, module, message, data };

  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();

  // Console output
  const prefix = `[${entry.time}] [${level}] [${module}]`;
  const consoleFn =
    level === 'ERROR'
      ? console.error
      : level === 'WARN'
        ? console.warn
        : level === 'DEBUG'
          ? console.debug
          : console.log;
  if (data !== undefined) {
    consoleFn(prefix, message, data);
  } else {
    consoleFn(prefix, message);
  }

  // UI output
  if (uiVisible && panelEl) {
    appendToPanel(entry);
  }
}

function appendToPanel(entry) {
  const line = document.createElement('div');
  line.style.color = LEVEL_COLORS[entry.level];
  const dataStr = entry.data !== undefined ? ' ' + JSON.stringify(entry.data) : '';
  line.textContent = `${entry.time} [${entry.level}] [${entry.module}] ${entry.message}${dataStr}`;
  panelEl.appendChild(line);
  panelEl.scrollTop = panelEl.scrollHeight;
}

const Logger = {
  debug(module, message, data) {
    log('DEBUG', module, message, data);
  },
  info(module, message, data) {
    log('INFO', module, message, data);
  },
  warn(module, message, data) {
    log('WARN', module, message, data);
  },
  error(module, message, data) {
    log('ERROR', module, message, data);
  },

  getBuffer() {
    return buffer;
  },

  bindPanel(el) {
    panelEl = el;
  },

  show() {
    uiVisible = true;
    if (panelEl) {
      panelEl.parentElement.style.display = 'flex';
      // Flush buffer to panel
      panelEl.innerHTML = '';
      for (const entry of buffer) appendToPanel(entry);
    }
  },

  hide() {
    uiVisible = false;
    if (panelEl) panelEl.parentElement.style.display = 'none';
  },

  clear() {
    buffer.length = 0;
    if (panelEl) panelEl.innerHTML = '';
  },
};

onChange((key) => {
  if (key === 'showLogs') {
    if (CONFIG.showLogs) Logger.show();
    else Logger.hide();
  }
});

export default Logger;
