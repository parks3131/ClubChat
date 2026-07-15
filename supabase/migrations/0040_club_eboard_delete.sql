-- Delete Club — only the club's original creator, given the much larger
-- blast radius than any other admin-gated action (wipes chat history,
-- members, races, Eboard, polls, notifications — everything, for every
-- member, permanently, via existing on-delete-cascade FKs). Deliberately
-- NOT "any club admin" the way every other club-management policy is —
-- an explicit founder decision for this one irreversible action.
create policy "creator can delete their club"
  on public.clubs for delete
  to authenticated
  using (created_by = auth.uid());

-- Delete Eboard channel — only existing members, mirroring 0017_eboard.sql's
-- own asymmetric rule: being a club admin alone does not grant Eboard
-- access, and add/decide rights already belong to existing members, not
-- every club admin. A club admin who was never let in shouldn't be able
-- to delete it either.
create policy "eboard members can delete their channel"
  on public.eboard_channels for delete
  to authenticated
  using (public.is_eboard_member(id));
