// Shared browser-side semaphore to limit concurrent fetch requests
// and avoid ERR_INSUFFICIENT_RESOURCES.

import { MAX_CONCURRENT_FETCHES as MAX_CONCURRENT } from '../constants/rendering.js';
let active = 0;
const queue = [];

export function acquireFetch() {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve) => queue.push(resolve));
}

export function releaseFetch() {
  if (queue.length > 0) {
    const next = queue.shift();
    next();
  } else {
    active--;
  }
}
