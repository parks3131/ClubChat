-- New message_type value for document attachments in chat (founder
-- wireframe: admin/member "+" attach menu). Alone in its own file:
-- `alter type ... add value` can't be used later in the same transaction
-- the enum type was created/altered in — see SPEC.md section 6 / 0007 /
-- 0047 / 0051 / 0055 for the same split.

alter type public.message_type add value 'document';
