// ============================================
// TYPED ERRORS
// ============================================

export class RedditAdsAuthError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "RedditAdsAuthError";
  }
}

export class RedditAdsRateLimitError extends Error {
  constructor(
    public readonly retryAfterMs: number,
    cause?: unknown,
  ) {
    super(`Reddit Ads rate limited, retry after ${retryAfterMs}ms`);
    this.name = "RedditAdsRateLimitError";
    this.cause = cause;
  }
}

export class RedditAdsServiceError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "RedditAdsServiceError";
  }
}

// ============================================
// STARTUP CREDENTIAL VALIDATION
// ============================================

export function validateCredentials(): { valid: boolean; missing: string[] } {
  const required = [
    "REDDIT_CLIENT_ID",
    "REDDIT_CLIENT_SECRET",
    "REDDIT_REFRESH_TOKEN",
  ];
  const missing = required.filter(
    (key) => !process.env[key] || process.env[key]!.trim() === "",
  );
  // Basic format validation: credentials should have reasonable length > 10 chars
  const malformed = required.filter(
    (key) => process.env[key] && process.env[key]!.trim().length > 0 && process.env[key]!.trim().length < 10,
  );
  if (malformed.length > 0) {
    missing.push(...malformed.map(k => `${k} (format: too short, expected length > 10)`));
  }
  return { valid: missing.length === 0, missing };
}

export function classifyError(error: any): Error {
  const message = error?.message || String(error);
  const status = error?.status;
  // Check response body for error objects (Reddit API can return errors in body on 200)
  const bodyError = error?.response?.body?.error || error?.data?.error || error?.errors?.[0];

  if (
    status === 401 ||
    status === 403 ||
    message.includes("invalid_grant") ||
    message.includes("OAuth") ||
    message.includes("Unauthorized") ||
    message.includes("Forbidden") ||
    bodyError?.code === 401
  ) {
    return new RedditAdsAuthError(
      `Reddit Ads auth failed: ${message}. Refresh token may be expired. Update REDDIT_REFRESH_TOKEN in Keychain.`,
      error,
    );
  }

  if (status === 429 || message.includes("rate limit") || message.includes("Rate limit")) {
    const retryMs = error?.retryAfterMs || 60_000;
    return new RedditAdsRateLimitError(retryMs, error);
  }

  if (status >= 500 || message.includes("Internal Server Error") || message.includes("Service Unavailable")) {
    return new RedditAdsServiceError(`Reddit API server error: ${message}`, error);
  }

  return error;
}
