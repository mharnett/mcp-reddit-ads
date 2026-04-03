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
    super(`Rate limited, retry after ${retryAfterMs}ms`);
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
  return { valid: missing.length === 0, missing };
}

export function classifyError(error: any): Error {
  const message = error?.message || String(error);
  const status = error?.status;

  if (
    status === 401 ||
    status === 403 ||
    message.includes("invalid_grant") ||
    message.includes("OAuth") ||
    message.includes("Unauthorized") ||
    message.includes("Forbidden")
  ) {
    return new RedditAdsAuthError(
      `Auth failed: ${message}. Refresh token may be expired. Update REDDIT_REFRESH_TOKEN in Keychain.`,
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
