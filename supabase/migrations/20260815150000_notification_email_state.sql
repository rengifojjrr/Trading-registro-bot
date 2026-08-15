-- Track which notifications have already been emailed.
--
-- Without this the nightly digest would resend the same warnings every
-- night until they were read, which is how alerting becomes noise -- the
-- exact failure this project already hit once with a misconfigured cron
-- sending ~288 useless failure emails a day.
--
-- `emailed_at` also enforces the daily cap: the limit is derived from what
-- was actually sent, so a redeploy can't reset someone's allowance.

alter table public.notifications
  add column if not exists emailed boolean not null default false,
  add column if not exists emailed_at timestamptz;

create index if not exists notifications_emailed_idx
  on public.notifications (user_id, emailed, emailed_at);

comment on column public.notifications.emailed is
  'True once this notification has been included in an email digest. See lib/notifications/email.ts.';
