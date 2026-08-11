import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * For use at the top of Server Components / Server Actions under
 * (dashboard). src/proxy.ts already redirects unauthenticated requests
 * before render, so hitting the redirect() here should be rare -- this is
 * defense in depth, and gives callers a typed, non-null user.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
