/**
 * CSRF-safe fetch wrapper.
 * Automatically adds X-Requested-With header to all requests
 * to satisfy CSRF protection middleware.
 */
export function secureFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has("X-Requested-With")) {
    headers.set("X-Requested-With", "XMLHttpRequest");
  }
  // Ensure JSON content type for POST/PATCH/PUT/DELETE with body
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(url, { ...options, headers });
}
