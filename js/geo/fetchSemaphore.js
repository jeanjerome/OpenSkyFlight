// Shared browser-side semaphore to limit concurrent fetch requests
// and avoid ERR_INSUFFICIENT_RESOURCES.

const MAX_CONCURRENT = 6;
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
