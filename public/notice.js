// New notices cancel old dismissal timers, so an earlier success cannot hide a later error.
export function createNotice(element) {
 let timer;
 return function showNotice(message, duration = 0) {
  clearTimeout(timer);
  element.textContent = message;
  if (duration > 0) timer = setTimeout(() => { element.textContent = ''; }, duration);
 };
}
