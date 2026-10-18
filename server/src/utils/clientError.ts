// src/utils/clientError.ts
//
// Which error text may be sent back to the client. Our own business-logic
// errors (`throw new Error('A reason is required...')`) are written for the
// user and pass through. Errors from libraries — Firestore/gRPC ("5
// NOT_FOUND: ..."), Firebase Auth (code 'auth/...'), Cloudinary (http_code)
// — carry internals (paths, project ids, stack-ish detail) and are replaced
// with `fallback`. Used by every catch that answers 4xx with an error's
// message; 5xx responses already never echo it (AUDIT_WEB_SERVER_SECURITY_
// BUGS_2026_10_07.md H4).

const LIBRARY_ERROR_PROPS = ['code', 'details', 'http_code', 'errorInfo', 'metadata', 'status'];

export function clientMessage(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  if (LIBRARY_ERROR_PROPS.some((p) => Object.prototype.hasOwnProperty.call(err, p))) return fallback;
  const msg = err.message?.trim();
  if (!msg) return fallback;
  // gRPC status text ("5 NOT_FOUND: ...", "9 FAILED_PRECONDITION: The query
  // requires an index ...") — also how Firestore errors read when wrapped.
  if (/^\d+ [A-Z_]+:/.test(msg)) return fallback;
  if (/firestore|firebase|grpc|cloudinary|ECONN|ETIMEDOUT|ENOTFOUND/i.test(msg)) return fallback;
  return msg;
}
