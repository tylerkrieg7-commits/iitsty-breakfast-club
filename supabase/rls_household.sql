-- Per-household RLS (Build 130). APPLY ONLY AFTER both phones show a heartbeat row hh_hdr_p1 / hh_hdr_p2 with ok=true.
-- The app sends "x-household: <household code>" on every REST call (bc-hh.js). Rows are only visible/writable
-- when the row's household equals that header. The edge function (service role) is not affected.
create or replace function public.req_household() returns text
language sql stable as $$ select nullif(current_setting('request.headers', true)::json ->> 'x-household', '') $$;

-- club_kv
drop policy if exists "club_kv read" on public.club_kv;
drop policy if exists "club_kv add" on public.club_kv;
drop policy if exists "club_kv change" on public.club_kv;
create policy "club_kv read" on public.club_kv for select to anon, authenticated using (household = public.req_household());
create policy "club_kv add" on public.club_kv for insert to anon, authenticated with check (household = public.req_household() and length(household) >= 6);
create policy "club_kv change" on public.club_kv for update to anon, authenticated using (household = public.req_household()) with check (household = public.req_household() and length(household) >= 6);

-- club_events
drop policy if exists "club_events read" on public.club_events;
drop policy if exists "club_events add" on public.club_events;
create policy "club_events read" on public.club_events for select to anon, authenticated using (household = public.req_household());
create policy "club_events add" on public.club_events for insert to anon, authenticated with check (household = public.req_household() and length(household) >= 6);

-- club_backup
drop policy if exists "club_backup read" on public.club_backup;
drop policy if exists "club_backup add" on public.club_backup;
drop policy if exists "club_backup prune" on public.club_backup;
create policy "club_backup read" on public.club_backup for select to anon, authenticated using (household = public.req_household());
create policy "club_backup add" on public.club_backup for insert to anon, authenticated with check (household = public.req_household() and length(household) >= 6);
create policy "club_backup prune" on public.club_backup for delete to anon, authenticated using (
  household = public.req_household() and not (id in (select b2.id from public.club_backup b2 where b2.household = club_backup.household and b2.person = club_backup.person order by b2.created_at desc limit 5)));
