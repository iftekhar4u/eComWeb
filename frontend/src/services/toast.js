export function notifyToast(message) {
  window.dispatchEvent(new CustomEvent('aurelia:toast', { detail: { message } }))
}
