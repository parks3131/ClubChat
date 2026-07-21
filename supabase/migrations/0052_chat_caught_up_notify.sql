-- Founder request, walking through the Notifications feed live: once a
-- "N unread messages in X chat" row is resolved by actually opening
-- that chat, it should stick around in the feed afterward as a read
-- (light-shaded) history item, the same way a resolved join request
-- persists tagged "Approved"/"Denied" instead of disappearing
-- (0035_notifications_persistent_requests.sql).
--
-- This is a real, deliberate departure from 0031's original design
-- ("a channel's 'N unread messages' is computed live via
-- fetch_unread_channel_summaries() rather than stored as discrete rows,
-- so it can never drift out of sync with messages... it only ever
-- advances when the user actually opens that channel") — that part is
-- UNCHANGED, fetch_unread_channel_summaries() still drives the *live*
-- "still unread" chat_unread feed item exactly as before. What's new is
-- a one-time, already-read `notifications` row written the moment a
-- channel transitions from unread to read, purely as a retrospective
-- log entry ("you caught up on N messages") — not a pending alert, so
-- it never touches the unread badge count and never interacts with
-- markAllNotificationsRead.
--
-- Direct client inserts into `notifications` aren't possible at all
-- (0031: "No insert policy... every row comes from a security-definer
-- trigger") — this is the first *RPC-driven* insert into that table
-- rather than a trigger-driven one (every prior notification insert
-- fires off a table trigger this app already owns; there is no
-- `channel_reads` trigger to hang this on, since the "was this channel
-- actually unread a moment ago" fact only exists transiently, computed
-- the same way fetch_unread_channel_summaries() computes it, and has to
-- be captured *before* channel_reads.last_read_at advances).

create or replace function public.mark_channel_read_and_log(p_channel_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_unread_count bigint;
  v_channel_name text;
  v_club_id uuid;
  v_race_id uuid;
  v_eboard_channel_id uuid;
  v_target_path text;
begin
  if not public.is_channel_member(p_channel_id) then
    raise exception 'not a channel member';
  end if;

  select c.club_id, c.race_id, c.eboard_channel_id, coalesce(r.name, eb.name, cl.name)
  into v_club_id, v_race_id, v_eboard_channel_id, v_channel_name
  from public.channels c
  join public.clubs cl on cl.id = c.club_id
  left join public.races r on r.id = c.race_id
  left join public.eboard_channels eb on eb.id = c.eboard_channel_id
  where c.id = p_channel_id;

  -- Same filter shape as fetch_unread_channel_summaries() (0031), read
  -- before channel_reads is advanced below, so the count reflects what
  -- was actually shown as "unread" a moment ago.
  select count(*) into v_unread_count
  from public.messages m
  left join public.channel_reads cr on cr.channel_id = p_channel_id and cr.user_id = auth.uid()
  where m.channel_id = p_channel_id
    and m.created_at > coalesce(cr.last_read_at, 'epoch'::timestamptz)
    and m.sender_id <> auth.uid()
    and m.deleted_at is null;

  if v_race_id is not null then
    v_target_path := '/clubs/' || v_club_id || '/race/' || v_race_id || '/chat';
  elsif v_eboard_channel_id is not null then
    v_target_path := '/clubs/' || v_club_id || '/eboard/chat';
  else
    v_target_path := '/clubs/' || v_club_id || '/chat';
  end if;

  if v_unread_count > 0 then
    insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path, read_at)
    values (
      auth.uid(), null, v_club_id, 'chat_caught_up'::notification_type,
      -- Matches the live chat_unread row's own phrasing exactly
      -- ("N unread messages in X chat", see notifications.tsx) so the
      -- row reads the same before and after it flips from live to
      -- persisted-history.
      'Caught up on ' || v_unread_count || ' message' || (case when v_unread_count = 1 then '' else 's' end)
        || ' in ' || coalesce(v_channel_name, 'the') || ' chat',
      v_target_path, now()
    );
  end if;

  insert into public.channel_reads (channel_id, user_id, last_read_at)
  values (p_channel_id, auth.uid(), now())
  on conflict (channel_id, user_id) do update set last_read_at = excluded.last_read_at;
end;
$$;
