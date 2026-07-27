-- In-database rate limiting (see ADR-0003). RLS answers "are you allowed?", not
-- "how often?" - a member with permission can still spam. Since ClubChat is two-tier
-- (client -> PostgREST -> Postgres, no app server), the frequency guard lives in the
-- database too, at the same unbypassable chokepoint as RLS. This addresses a single
-- actor spamming; it does NOT stop a volumetric DDoS (the DB must process each request
-- to reject it) - that is a future CDN/WAF concern, not an application tier.
--
-- This migration adds a generic token-bucket limiter and applies it to message sends.

-- One token bucket per key (e.g. one per user per action).
create table public.rate_limits (
  key        text primary key,
  tokens     double precision not null,
  updated_at timestamptz not null default now()
);

-- The client must never read or reset its own bucket. RLS on, no policies = default
-- deny for authenticated/anon; only the SECURITY DEFINER functions below (owned by
-- postgres) touch this table. Revoke the blanket grants from 0004 for defense in depth.
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from authenticated, anon;

-- Generic token bucket: refill by elapsed time (capped at capacity), spend one token,
-- or raise. errcode 'PT429' makes PostgREST return HTTP 429 to the client.
create function public.rate_limit_spend(
  p_key text,
  p_capacity int,
  p_refill_per_sec double precision
)
  returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_tokens  double precision;
  v_updated timestamptz;
begin
  insert into public.rate_limits(key, tokens)
    values (p_key, p_capacity)
    on conflict (key) do nothing;

  select tokens, updated_at into v_tokens, v_updated
    from public.rate_limits
    where key = p_key
    for update;                                  -- serialize concurrent spends on this key

  v_tokens := least(
    p_capacity,
    v_tokens + extract(epoch from (now() - v_updated)) * p_refill_per_sec
  );

  if v_tokens < 1 then
    raise exception 'Rate limit exceeded. Please slow down.'
      using errcode = 'PT429';
  end if;

  update public.rate_limits
    set tokens = v_tokens - 1, updated_at = now()
    where key = p_key;
end;
$$;

-- Only the trigger (SECURITY DEFINER, owned by postgres) should call this. A client
-- must not be able to spend tokens on an arbitrary key (which could drain another
-- user's bucket). Supabase's default privileges grant execute directly to
-- authenticated/anon, so revoking from PUBLIC alone is not enough - revoke from those
-- roles explicitly too.
revoke execute on function public.rate_limit_spend(text, int, double precision)
  from public, authenticated, anon;

-- Apply it to message sends. Tunable: burst of 30, refill 1 token/sec (~60/min
-- sustained) - comfortably above a chatty human, far below a scripted flood.
-- Generated/system messages (no human sender) are exempt.
create function public.enforce_message_rate_limit()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.message_type = 'system' or new.sender_id is null then
    return new;
  end if;
  perform public.rate_limit_spend('msg:' || new.sender_id, 30, 1.0);
  return new;
end;
$$;

create trigger enforce_message_rate_limit
  before insert on public.messages
  for each row execute function public.enforce_message_rate_limit();
