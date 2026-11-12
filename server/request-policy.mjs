const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;
export function allowedHost(host, additionalHosts = []) {
  if (typeof host !== 'string' || /[\s/@\\]/.test(host)) return false;
  return (
    localHost.test(host) ||
    additionalHosts.some((value) => value.toLowerCase() === host.toLowerCase())
  );
}
export function parsePublicOrigin(value) {
  if (value === undefined || value === '') return null;
  const origin = new URL(value);
  if (
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without credentials, path or query.');
  return origin.origin;
}
export function sameOriginRequest(req, additionalHosts = [], publicOrigin = null) {
  const host = req.headers.host;
  if (!allowedHost(host, additionalHosts)) return false;
  try {
    const origin = new URL(req.headers.origin);
    const protocol = req.socket.encrypted ? 'https:' : 'http:';
    return (
      origin.origin === (publicOrigin || `${protocol}//${host}`) &&
      origin.host.toLowerCase() === host.toLowerCase() &&
      !origin.username &&
      !origin.password &&
      origin.pathname === '/' &&
      !origin.search &&
      !origin.hash
    );
  } catch {
    return false;
  }
}
