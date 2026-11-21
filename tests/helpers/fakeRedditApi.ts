/**
 * Test doubles for driving src/index.ts in-process without touching Reddit.
 *
 * - FAKE_ENV: credentials long enough to pass validateCredentials(), so the
 *   RedditAdsManager constructor at module load does not throw. A test that
 *   forgets them fails loudly at import instead of passing vacuously.
 * - createRecordingFetch(): a fetch stand-in that records every request and
 *   answers from a route function. It never calls the real fetch, so even
 *   with the write gate removed nothing reaches reddit.com.
 * - The token response carries no refresh_token, so getAccessToken() never
 *   reaches its Keychain-persist branch; callers also mock child_process.
 */

export const FAKE_ACCOUNT_ID = "t2_fakeacct01";

export const FAKE_ENV: Record<string, string> = {
  REDDIT_CLIENT_ID: "fake-client-id-0001",
  REDDIT_CLIENT_SECRET: "fake-client-secret-0001",
  REDDIT_REFRESH_TOKEN: "fake-refresh-token-0001",
  REDDIT_ACCOUNT_ID: FAKE_ACCOUNT_ID,
};

export const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";

export interface RecordedRequest {
  method: string;
  url: string;
  path: string;
  body: any;
}

export type Route = (req: RecordedRequest) => { status: number; body: unknown };

const defaultRoute: Route = (req) => {
  if (req.method === "GET") return { status: 200, body: { data: [] } };
  return { status: 200, body: { data: { id: "fake-created-id", ...(req.body?.data ?? {}) } } };
};

export function createRecordingFetch() {
  const tokenRequests: RecordedRequest[] = [];
  const apiRequests: RecordedRequest[] = [];
  let route: Route = defaultRoute;

  const fetch = async (input: string | URL, init: RequestInit = {}): Promise<Response> => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    if (url === TOKEN_URL) {
      tokenRequests.push({ method, url, path: "", body: null });
      return new Response(JSON.stringify({ access_token: "fake-access-token", expires_in: 3600 }), { status: 200 });
    }
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\/api\/v3/, "");
    const body = typeof init.body === "string" && init.body ? JSON.parse(init.body) : null;
    const req = { method, url, path, body };
    apiRequests.push(req);
    const { status, body: resBody } = route(req);
    return new Response(JSON.stringify(resBody), { status });
  };

  return {
    fetch,
    tokenRequests,
    apiRequests,
    get total() {
      return tokenRequests.length + apiRequests.length;
    },
    setRoute(r: Route) {
      route = r;
    },
    reset() {
      tokenRequests.length = 0;
      apiRequests.length = 0;
      route = defaultRoute;
    },
  };
}
