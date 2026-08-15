-- Private bucket for the scheduled backups.
--
-- Private, not public: these files contain the entire raw fill history and
-- every journal entry. Reads go through a signed URL from the settings
-- page; writes only ever happen from the cron route, which uses the
-- service-role client and bypasses RLS.

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

-- Each user may read only their own folder. The path convention is
-- <user_id>/<date>.json, so the first path segment is the owner.
create policy "backups_select_own"
  on storage.objects for select
  using (
    bucket_id = 'backups'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
