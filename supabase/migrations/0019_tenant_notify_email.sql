alter table tenants add column if not exists notify_email text;

update tenants set notify_email = 'henriques.angela19@gmail.com'
where id = '00000000-0000-0000-0000-000000000001' and notify_email is null;
