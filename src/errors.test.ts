import { describe, it, expect } from "vitest";
import {
  RedditAdsAuthError,
  RedditAdsRateLimitError,
  RedditAdsServiceError,
  classifyError,
  validateCredentials,
} from "./errors.js";

describe("validateCredentials", () => {
  const originalEnv = process.env;

  it("fails when env vars are missing", () => {
    process.env = { ...originalEnv };
    delete process.env.REDDIT_CLIENT_ID;
    delete process.env.REDDIT_CLIENT_SECRET;
    delete process.env.REDDIT_REFRESH_TOKEN;
    const result = validateCredentials();
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    process.env = originalEnv;
  });
});

describe("classifyError", () => {
  it("classifies 401 as auth error", () => {
    const error = classifyError({ message: "Unauthorized", status: 401 });
    expect(error).toBeInstanceOf(RedditAdsAuthError);
  });

  it("classifies 403 as auth error", () => {
    const error = classifyError({ message: "Forbidden", status: 403 });
    expect(error).toBeInstanceOf(RedditAdsAuthError);
  });

  it("classifies invalid_grant as auth error", () => {
    const error = classifyError(new Error("invalid_grant: token expired"));
    expect(error).toBeInstanceOf(RedditAdsAuthError);
  });

  it("classifies 429 as rate limit error", () => {
    const error = classifyError({ message: "rate limit exceeded", status: 429 });
    expect(error).toBeInstanceOf(RedditAdsRateLimitError);
    expect((error as RedditAdsRateLimitError).retryAfterMs).toBe(60_000);
  });

  it("classifies 500 as service error", () => {
    const error = classifyError({ message: "Internal Server Error", status: 500 });
    expect(error).toBeInstanceOf(RedditAdsServiceError);
  });

  it("classifies 503 as service error", () => {
    const error = classifyError({ message: "Service Unavailable", status: 503 });
    expect(error).toBeInstanceOf(RedditAdsServiceError);
  });

  it("returns original error for unrecognized errors", () => {
    const original = new Error("Something weird");
    expect(classifyError(original)).toBe(original);
  });
});
