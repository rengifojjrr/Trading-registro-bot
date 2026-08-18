import type { NextConfig } from "next";

/**
 * Security headers.
 *
 * This app renders a private financial journal, so the defaults matter more
 * than usual: without them the deployment shipped with no CSP, no HSTS and
 * no clickjacking protection at all.
 *
 * The CSP is deliberately strict except for two unavoidable relaxations,
 * both documented inline. It is applied in report-only mode alongside the
 * enforcing one so a mistake surfaces as a console report rather than a
 * blank page -- see the `Content-Security-Policy-Report-Only` entry.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    // Build-time only: an unset/invalid URL must not break the build, and
    // the connect-src below simply won't include an origin that doesn't
    // exist yet.
    return "";
  }
})();

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next's own bootstrap/hydration scripts,
  // and 'unsafe-eval' only in development (React Refresh). Neither is
  // avoidable without nonce-based streaming SSR, which Next does not yet
  // expose for the App Router in a stable form.
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  // Tailwind injects a stylesheet; Radix and lightweight-charts set inline
  // styles on elements they position.
  "style-src 'self' 'unsafe-inline'",
  // Trade screenshots live in a private Supabase Storage bucket and are
  // rendered through signed URLs on that origin, so leaving it out here
  // blocked every uploaded image at the browser -- the row rendered, the
  // picture did not.
  ["img-src 'self' data: blob:", supabaseOrigin].filter(Boolean).join(" "),
  "font-src 'self' data:",
  // Supabase (REST, auth, realtime, storage) is the only third party this
  // app talks to from the browser. Coinbase and Notion are server-side only.
  ["connect-src 'self'", supabaseOrigin, supabaseOrigin.replace("https://", "wss://")]
    .filter(Boolean)
    .join(" "),
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Belt and braces with frame-ancestors above: older browsers only honour
  // this one.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // This app never needs any of these; denying them outright means a
  // compromised dependency can't silently ask for them either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Two years, subdomains included. Safe here because the app is only ever
  // served over HTTPS (Vercel) and has no plain-HTTP deployment.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Never leak the framework version to anyone probing the deployment.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
