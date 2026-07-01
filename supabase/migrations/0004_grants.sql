-- Explicit grants so this schema doesn't depend on any platform's
-- "auto-expose new tables to the Data API" default (that default differs
-- between local dev and hosted projects, and has changed over time).
-- RLS policies are the real access control; these grants just let the
-- authenticated role reach the tables/functions at all.

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to authenticated;
