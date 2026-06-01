create table if not exists home_notices (
  id bigserial primary key,
  title text not null,
  content text not null,
  is_active boolean not null default true,
  created_by text,
  created_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_home_notices_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists home_notices_set_updated_at on home_notices;

create trigger home_notices_set_updated_at
before update on home_notices
for each row
execute function set_home_notices_updated_at();
