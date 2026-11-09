const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
export function allowedHost(host, additionalHosts = []) {
  if (typeof host !== 'string' || /[\s/@\\]/.test(host)) return false;
  return (
    localHost.test(host) ||
    additionalHosts.some((value) => value.toLowerCase() === host.toLowerCase())
  );
}
export function sameOriginRequest(req, additionalHosts = []) {
  const host = req.headers.host;
  if (!allowedHost(host, additionalHosts)) return false;
  try {
    const origin = new URL(req.headers.origin);
    const protocol = req.socket.encrypted ? 'https:' : 'http:';
    return (
      origin.origin === `${protocol}//${host}` &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash
    );
  } catch {
    return false;
  }
}
