import { CONTENT_SECURITY_POLICY } from "./constants";

/**
 * Returns the CloudFront Function (JS 2.0 runtime) source that attaches strict
 * security headers — including the CSP — to viewer responses for the static
 * site. CloudFront Functions run at every edge POP with sub-millisecond
 * overhead, which suits header injection.
 *
 * The CSP is inlined at synth time so there is a single source of truth
 * (constants.ts).
 */
export function buildCspFunctionCode(): string {
  return `
function handler(event) {
  var response = event.response;
  var headers = response.headers;

  headers['content-security-policy'] = { value: "${CONTENT_SECURITY_POLICY}" };
  headers['strict-transport-security'] = { value: 'max-age=63072000; includeSubDomains; preload' };
  headers['x-content-type-options'] = { value: 'nosniff' };
  headers['x-frame-options'] = { value: 'DENY' };
  headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };
  headers['permissions-policy'] = { value: 'geolocation=(self), camera=(), microphone=()' };

  return response;
}
`.trim();
}
