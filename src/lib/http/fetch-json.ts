// Safe JSON fetch utility.
// Handles: HTTP errors, empty bodies, HTML responses, malformed JSON.
// Returns structured errors instead of crashing.

export interface SafeJsonResult<T = any> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    status: number;
    contentType: string;
    preview: string;
  };
}

/**
 * Fetch a URL and parse JSON safely.
 * Detects HTML responses, empty bodies, and HTTP errors.
 */
export async function fetchJsonSafe(
  url: string,
  options?: RequestInit,
  timeoutMs = 30000,
): Promise<SafeJsonResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);

    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();

    // Check HTTP status
    if (!res.ok) {
      return {
        ok: false,
        error: {
          code: `HTTP_${res.status}`,
          message: `HTTP ${res.status} ${res.statusText}`,
          status: res.status,
          contentType,
          preview: text.slice(0, 200),
        },
      };
    }

    // Check empty body
    if (!text || text.trim().length === 0) {
      return {
        ok: false,
        error: {
          code: 'EMPTY_BODY',
          message: 'Response body is empty',
          status: res.status,
          contentType,
          preview: '',
        },
      };
    }

    // Detect HTML response when JSON expected
    const trimmed = text.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') ||
        (contentType.includes('text/html') && !contentType.includes('json'))) {
      return {
        ok: false,
        error: {
          code: 'HTML_INSTEAD_OF_JSON',
          message: 'Expected JSON but received HTML',
          status: res.status,
          contentType,
          preview: trimmed.slice(0, 200),
        },
      };
    }

    // Parse JSON
    try {
      const data = JSON.parse(text);
      return { ok: true, data };
    } catch (parseError: any) {
      return {
        ok: false,
        error: {
          code: 'JSON_PARSE_ERROR',
          message: `JSON.parse failed: ${parseError.message}`,
          status: res.status,
          contentType,
          preview: trimmed.slice(0, 200),
        },
      };
    }
  } catch (e: any) {
    if (e.name === 'AbortError') {
      return {
        ok: false,
        error: {
          code: 'TIMEOUT',
          message: `Request timed out after ${timeoutMs}ms`,
          status: 0,
          contentType: '',
          preview: '',
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: e.message,
        status: 0,
        contentType: '',
        preview: '',
      },
    };
  }
}
