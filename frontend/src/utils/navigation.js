export function getInitialRoute() {
  return window.location.hash.replace('#', '') || 'login'
}

export function navigate(nextRoute) {
  window.location.hash = nextRoute
}
