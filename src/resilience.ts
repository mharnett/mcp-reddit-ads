import {
  retry,
  circuitBreaker,
  wrap,
  handleWhen,
  timeout,
  TimeoutStrategy,
  ExponentialBackoff,
  ConsecutiveBreaker,
} from "cockatiel";
import pino from "pino";

// ============================================
// LOGGER
// ============================================

// Pretty-print only for a person at a terminal; pino-pretty writes to fd 2.
const prettyOnTty = process.env.NODE_ENV !== "test" && process.stderr.isTTY;

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || "info",
    redact: ["access_token", "refresh_token", "client_secret", "*.access_token", "*.refresh_token", "*.client_secret"],
    ...(prettyOnTty && {
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          singleLine: true,
          translateTime: "SYS:standard",
          destination: 2, // stderr -- stdout is reserved for MCP JSON-RPC
        },
      },
    }),
  },
  // Everything else, including piped stdio (how MCP clients start this
  // server), writes JSON lines to fd 2. pino defaults to stdout, which carries
  // the MCP JSON-RPC stream, so leaving this undefined corrupted it
  // (mcp-test-harness#10). pino takes a transport or a destination, not both.
  prettyOnTty ? undefined : pino.destination(2),
);

// ============================================
// SAFE RESPONSE (Response Size Limiting)
// ============================================

const MAX_RESPONSE_SIZE = 200_000; // 200KB

export function safeResponse<T>(data: T, context: string): T {
  let current = data;
  for (let pass = 0; pass < 10; pass++) {
    const jsonStr = JSON.stringify(current);
    const sizeBytes = Buffer.byteLength(jsonStr, "utf-8");
    if (sizeBytes <= MAX_RESPONSE_SIZE) return current;

    // Deep clone on first truncation pass to avoid mutating the original object
    if (pass === 0 && typeof current === "object" && current !== null) {
      current = JSON.parse(JSON.stringify(current)) as T;
    }

    logger.warn({ sizeBytes, maxSize: MAX_RESPONSE_SIZE, context, pass }, "Response exceeds size limit, truncating");

    if (Array.isArray(current)) {
      current = (current as any[]).slice(0, Math.max(1, Math.floor((current as any[]).length * 0.5))) as T;
      continue;
    }

    if (typeof current === "object" && current !== null) {
      const obj = current as Record<string, any>;
      let truncated = false;
      for (const key of ["items", "results", "data", "rows", "tags", "triggers", "variables"]) {
        if (Array.isArray(obj[key]) && obj[key].length > 1) {
          obj[key] = obj[key].slice(0, Math.max(1, Math.floor(obj[key].length * 0.5)));
          if ("count" in obj) obj.count = obj[key].length;
          if ("row_count" in obj) obj.row_count = obj[key].length;
          obj.truncated = true;
          truncated = true;
          break;
        }
      }
      if (truncated) continue;
    }

    break;
  }
  return current;
}

// ============================================
// RETRY + CIRCUIT BREAKER + TIMEOUT
// ============================================

const backoff = new ExponentialBackoff({
  initialDelay: 100,
  maxDelay: 5_000,
});

const isTransient = handleWhen((err) => {
  const msg = (err?.message || "").toLowerCase();
  const code = (err as any)?.code || (err as any)?.status;
  if (code === 401 || code === 403 || code === 7 || code === 16) return false;
  if (msg.includes("unauthenticated") || msg.includes("permission_denied") || msg.includes("invalid_grant")) return false;
  if (code === 429 || msg.includes("rate")) return true;
  if (code >= 400 && code < 500) return false;
  return true;
});

const retryPolicy = retry(isTransient, {
  maxAttempts: 3,
  backoff,
});

const circuitBreakerPolicy = circuitBreaker(isTransient, {
  halfOpenAfter: 60_000,
  breaker: new ConsecutiveBreaker(5),
});

const timeoutPolicy = timeout(30_000, TimeoutStrategy.Cooperative);

const policy = wrap(timeoutPolicy, circuitBreakerPolicy, retryPolicy);

// Non-idempotent writes (creates) go out once: a 5xx or dropped connection
// after Reddit stored the object would otherwise create it again on retry.
const noRetryPolicy = wrap(timeoutPolicy, circuitBreakerPolicy);

// ============================================
// WRAPPED API CALL WITH LOGGING
// ============================================

export async function withResilience<T>(
  fn: () => Promise<T>,
  operationName: string,
  options: { idempotent?: boolean } = {},
): Promise<T> {
  try {
    logger.debug({ operation: operationName }, "Starting API call");

    const chosen = options.idempotent === false ? noRetryPolicy : policy;
    const result = await chosen.execute(() => fn());

    logger.debug({ operation: operationName }, "API call succeeded");
    return result;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      { operation: operationName, error: error.message, stack: error.stack },
      "API call failed after retries"
    );
    throw error;
  }
}
