-- New notification_type value for News & Highlights posts. Alone in its
-- own file: `alter type ... add value` can't be used later in the same
-- transaction the enum type was created/altered in — see SPEC.md
-- section 6 / 0047 / 0051 / 0055 for the same split.

alter type public.notification_type add value 'news_post_created';
