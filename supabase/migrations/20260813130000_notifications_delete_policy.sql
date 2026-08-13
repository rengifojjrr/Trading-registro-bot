-- Notifications could be read and marked read, but never removed, so the
-- list only ever grew. Dismissing one is the user's own decision about
-- their own row -- the underlying condition (a failing sync, a
-- discrepancy) is unaffected, and if it recurs a fresh notification is
-- raised again by lib/notifications/create.ts.
create policy "notifications_delete_own" on public.notifications
  for delete using ((select auth.uid()) = user_id);
