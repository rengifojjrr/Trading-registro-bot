import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Named `proxy.ts` per the Next.js 16 convention (renamed from
// `middleware.ts` -- same mechanism). Runs on the Node.js runtime only; it
// cannot be configured to use the edge runtime.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
