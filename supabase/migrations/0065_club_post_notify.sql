-- Fan-out notification for a new News & Highlights post — same shape as
-- notify_race_created/notify_poll_created (0034): plain client .insert(),
-- no RPC layer, so an after-insert trigger is the hook point. Audience is
-- every club member except the creator, mirroring every other
-- "*_created" notification in this app.
create or replace function public.notify_news_post_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  club_name text;
  snippet text;
begin
  select name into club_name from public.clubs where id = new.club_id;
  snippet := left(coalesce(new.body, 'New photo'), 80);

  insert into public.notifications (recipient_id, actor_id, club_id, type, body, target_path)
  select
    cm.user_id, new.created_by, new.club_id, 'news_post_created',
    'New post in ' || coalesce(club_name, 'your club') || ': ' || snippet,
    '/clubs/' || new.club_id || '/news'
  from public.club_members cm
  where cm.club_id = new.club_id and cm.user_id <> new.created_by;

  return new;
end;
$$;

create trigger on_club_post_created
  after insert on public.club_posts
  for each row execute function public.notify_news_post_created();
