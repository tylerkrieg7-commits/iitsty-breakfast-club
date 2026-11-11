-- ROLLBACK for rls_household.sql: restores the original open policies (any caller with the key + household code in the query).
drop policy if exists "club_kv read" on public.club_kv; drop policy if exists "club_kv add" on public.club_kv; drop policy if exists "club_kv change" on public.club_kv;
create policy "club_kv read" on public.club_kv for select to anon, authenticated using (true);
create policy "club_kv add" on public.club_kv for insert to anon, authenticated with check (length(household) >= 6);
create policy "club_kv change" on public.club_kv for update to anon, authenticated using (true) with check (length(household) >= 6);
drop policy if exists "club_events read" on public.club_events; drop policy if exists "club_events add" on public.club_events;
create policy "club_events read" on public.club_events for select to anon, authenticated using (true);
create policy "club_events add" on public.club_events for insert to anon, authenticated with check (length(household) >= 6);
drop policy if exists "club_backup read" on public.club_backup; drop policy if exists "club_backup add" on public.club_backup; drop policy if exists "club_backup prune" on public.club_backup;
create policy "club_backup read" on public.club_backup for select to anon, authenticated using (true);
create policy "club_backup add" on public.club_backup for insert to anon, authenticated with check (length(household) >= 6);
create policy "club_backup prune" on public.club_backup for delete to anon, authenticated using (not (id in (select b2.id from public.club_backup b2 where b2.household = club_backup.household and b2.person = club_backup.person order by b2.created_at desc limit 5)));
