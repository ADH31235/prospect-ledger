-- ============================================================
-- PHASE 4: ADMIN CONSOLE
-- is_platform_admin is deliberately separate from profiles.role
-- ('admin'/'member') — that role means "admin of one company,"
-- this means "sees across every company." Only you get this,
-- seeded directly below rather than through any UI, since it's
-- not something that should ever be self-service.
-- ============================================================

alter table profiles add column if not exists is_platform_admin boolean not null default false;

update profiles set is_platform_admin = true
where id in (select id from auth.users where email = 'henriques.angela19@gmail.com');
