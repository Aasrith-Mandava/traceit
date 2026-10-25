// Warm up the dev server so the first test isn't charged for route compilation. Signed out, so the
// pages redirect to /signin (compiling it too) and the APIs answer 401 — compiled either way.
export default async function globalSetup() {
  const base = "http://localhost:3100";
  for (const path of ["/signin", "/signup", "/app", "/classes", "/api/auth/me", "/api/sessions", "/api/lectures", "/lectures/new"]) {
    try {
      await fetch(base + path);
    } catch {
      // Server may not be reachable yet in exotic setups; tests will surface real failures.
    }
  }
}
