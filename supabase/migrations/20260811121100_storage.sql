-- Storage bucket for trade screenshots (trade_screenshots.storage_path
-- points into this bucket). Private bucket; access is scoped by the
-- standard Supabase convention of a `{user_id}/...` path prefix enforced
-- via RLS policies on storage.objects, mirroring every other table in this
-- schema: a user can only reach objects under their own uid folder.

insert into storage.buckets (id, name, public)
values ('trade-screenshots', 'trade-screenshots', false)
on conflict (id) do nothing;

create policy "trade_screenshots_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'trade-screenshots'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "trade_screenshots_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'trade-screenshots'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "trade_screenshots_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'trade-screenshots'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

comment on policy "trade_screenshots_storage_select_own" on storage.objects is
  'Expected object path convention: {user_id}/{trade_id}/{filename}, matching trade_screenshots.storage_path.';
