import AsyncStorage from '@react-native-async-storage/async-storage';

// const BASE_URL = 'https://pawpal-279020382757.us-central1.run.app'; // Cloud Run backend
// const BASE_URL = 'http://3.146.189.10:8080'; // AWS single-instance deployment
const BASE_URL = 'http://10.0.2.2:8080'; // Local backend for Android emulator

/**
 * A failed request, already translated into something a user can read.
 *
 * Screens should show `message` and nothing else. The raw response body never
 * escapes this module: it used to become Error.message verbatim, so a wrong
 * password rendered as {"message":"Invalid email or password"} — braces, quotes
 * and all — and a 400 rendered as the whole ErrorResponse envelope including
 * the correlationId. `status` and `correlationId` are kept for logging and for
 * the few screens that need to branch on the status code.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** No response at all — airplane mode, dead wifi, or the backend isn't up. */
  get isNetworkError() {
    return this.status === 0;
  }

  /** The token is missing/expired: the caller should send the user back to Login. */
  get isAuthExpired() {
    return this.status === 401;
  }
}

// Some endpoints answer with a short machine code rather than user-facing copy
// (InvitationController returns "walk-full", MatchingController "no-match").
// Those read as a bug when shown verbatim, so translate the ones a user can
// actually reach; anything unlisted falls through to the server's own wording.
const MESSAGE_OVERRIDES: Record<string, string> = {
  'walk-full': 'This walk is already full.',
  'already-joined': "You've already joined this walk.",
  'no-match': 'No match found.',
  blocked: 'You can no longer connect with this pet.',
  'match already exists': "You're already connected with this pet.",
  'pet not found': 'That pet is no longer available.',
  'owner not found': 'That owner is no longer available.',
  'receiver not found': 'That user is no longer available.',
  'cannot message yourself': "You can't message yourself.",
  'cannot match a pet with itself': "You can't match a pet with itself.",
  'cannot match two pets of the same owner': "You can't match two of your own pets.",
};

function fallbackFor(status: number): string {
  if (status === 0) return "Can't reach the server. Check your connection and try again.";
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return 'That item no longer exists.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our end. Please try again.';
  return 'Request failed. Please try again.';
}

/**
 * Every error the backend produces carries a `message`, whether it is the
 * ErrorResponse envelope from GlobalExceptionHandler, a controller's
 * Map.of("message", ...), or the raw JSON written by JwtAuthFilter and
 * LoginRateLimitFilter — so one parser covers all of them.
 */
function toApiError(status: number, text: string): ApiError {
  let message = '';
  let correlationId: string | undefined;

  try {
    const body = JSON.parse(text);
    if (typeof body?.message === 'string') message = body.message.trim();
    if (typeof body?.correlationId === 'string') correlationId = body.correlationId;
  } catch {
    // Not JSON — an HTML error page from a proxy, or a truncated body.
  }

  // A 5xx message is an internal detail ("JSON parse error: Unexpected
  // character..."), not something to put in front of a user.
  if (!message || status >= 500) {
    message = fallbackFor(status);
  } else {
    message = MESSAGE_OVERRIDES[message] ?? message;
  }

  return new ApiError(status, message, correlationId);
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Delete/no-content responses (204, or 200 with an empty body) have nothing to
// parse — JSON.parse('') throws, so treat an empty body as success with no payload.
function parseBody<T>(text: string): T {
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

/**
 * fetch has no timeout of its own: a backend that accepts the connection and
 * then goes away, or a host that silently drops packets, leaves the promise
 * pending until the OS gives up — minutes, if ever. On the login screen that is
 * a spinner that never stops, which reads as a frozen app rather than an error.
 */
const REQUEST_TIMEOUT_MS = 15000;

/**
 * Single path for every verb, so the error handling can't drift between them —
 * it previously lived in four near-identical copies.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: await authHeaders(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    // Reading the body can hang for the same reasons the request can, so it
    // stays inside the abort window.
    const text = await res.text();
    if (!res.ok) throw toApiError(res.status, text);
    return parseBody<T>(text);
  } catch (e) {
    // A response we already translated is an answer, not a transport failure.
    if (e instanceof ApiError) throw e;
    throw new ApiError(
      0,
      controller.signal.aborted
        ? 'The server took too long to respond. Please try again.'
        : fallbackFor(0),
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  return request<T>('POST', path, body);
}

export async function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export async function apiPut<T>(path: string, body: object): Promise<T> {
  return request<T>('PUT', path, body);
}

/**
 * DELETE, optionally with a body — DELETE /api/notifications/device-token takes a
 * @RequestBody naming which token to retire, and rejects the request without one.
 */
export async function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('DELETE', path, body);
}

/**
 * What to show the user for a caught error, whatever it turns out to be.
 * Screens use this instead of reading `.message` off an unknown value.
 */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (e instanceof ApiError) return e.message;
  return fallback;
}

export async function saveToken(token: string) {
  await AsyncStorage.setItem('auth_token', token);
}

// userId of the signed-in account — used by the telemetry ping (the backend's
// /api/telemetry/location payload carries userId explicitly).
export async function saveUserId(userId: number | string) {
  await AsyncStorage.setItem('auth_user_id', String(userId));
}

export async function getUserId(): Promise<number | null> {
  const raw = await AsyncStorage.getItem('auth_user_id');
  return raw ? Number(raw) : null;
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem('auth_token');
}

export async function clearToken() {
  await AsyncStorage.removeItem('auth_token');
  await AsyncStorage.removeItem('auth_user_id');
}
