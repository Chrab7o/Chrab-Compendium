-- Postgres grants EXECUTE on new functions to PUBLIC by default, which would
-- let any authenticated player call notify_discord() directly and post
-- arbitrary text to the DM's Discord channel — it's only meant to be called
-- from inside unlock_skill_node (which runs as its security-definer owner,
-- so this revoke doesn't affect that internal call).
revoke execute on function public.notify_discord(text) from public;
