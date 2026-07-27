-- Revoking from PUBLIC (previous migration) wasn't enough: Supabase's default
-- privileges auto-grant EXECUTE on every new public-schema function directly
-- to anon/authenticated/service_role at creation time, independent of the
-- PUBLIC grant. Verified live that an authenticated (DM) client could still
-- call notify_discord() directly despite the PUBLIC revoke — this closes
-- that gap. unlock_skill_node still works since it calls notify_discord as
-- its security-definer owner, not as the original caller's role.
revoke execute on function public.notify_discord(text) from anon, authenticated;
