create table if not exists vehicle_catalog (
  id bigserial primary key,
  maker text not null,
  model text not null,
  color_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_catalog_unique
on vehicle_catalog (
  lower(trim(maker)),
  lower(trim(model)),
  lower(trim(coalesce(color_code, '')))
);

create or replace function set_vehicle_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicle_catalog_set_updated_at on vehicle_catalog;

create trigger vehicle_catalog_set_updated_at
before update on vehicle_catalog
for each row
execute function set_vehicle_catalog_updated_at();

insert into vehicle_catalog (maker, model, color_code)
values
  ('현대', '그랜저', 'A2B'),
  ('현대', '그랜저', 'WC9'),
  ('현대', '그랜저', 'T2G'),
  ('현대', '그랜저', 'TB7'),
  ('현대', '그랜저', 'V7S'),
  ('현대', '쏘나타', 'T2G'),
  ('현대', '아반떼', 'SAW'),
  ('현대', '아반떼', 'WAW'),
  ('현대', '아반떼', 'A5G'),
  ('현대', '아반떼', 'PE2'),
  ('현대', '투싼', 'PKW'),
  ('현대', '투싼', 'A5G'),
  ('현대', '싼타페', 'W3A'),
  ('현대', '싼타페', 'WW2'),
  ('현대', '싼타페', 'PB2'),
  ('현대', '팰리세이드', 'RB5'),
  ('현대', '팰리세이드', 'P7V'),
  ('현대', '코나', 'SAW'),
  ('현대', '포터', 'KG'),
  ('현대', '포터', 'ZV'),
  ('현대', '포터', 'OA'),
  ('기아', 'K7', 'STM'),
  ('기아', 'K8', 'ABP'),
  ('기아', 'K8', 'B4U'),
  ('기아', '쏘렌토', 'AGT'),
  ('기아', '쏘렌토', 'SWP'),
  ('기아', '쏘렌토', 'MZH'),
  ('기아', '스포티지', 'SWP'),
  ('기아', '카니발', 'SNR'),
  ('기아', '카니발', 'SWP'),
  ('기아', '니로', 'ABP'),
  ('기아', '니로', 'SWP'),
  ('기아', '니로', 'AGT'),
  ('기아', 'EV6', 'ABP'),
  ('기아', 'EV6', 'SWP'),
  ('기아', 'EV6', 'MZH'),
  ('기아', '셀토스', 'ABP'),
  ('기아', '셀토스', 'SWP'),
  ('기아', '셀토스', 'MZH'),
  ('기아', '쏘울', 'ABP'),
  ('기아', '쏘울', 'SWP'),
  ('기아', '쏘울', 'MZH'),
  ('기아', '스토닉', 'ABP'),
  ('기아', '스토닉', 'SWP'),
  ('기아', '스토닉', 'MZH'),
  ('기아', '레이', 'ABP'),
  ('기아', '레이', 'SWP'),
  ('기아', '레이', 'MZH'),
  ('기아', '봉고3', 'ABP'),
  ('기아', '봉고3', 'SWP'),
  ('기아', '봉고3', 'MZH'),
  ('제네시스', 'G70', 'N5M'),
  ('제네시스', 'G70', 'RGY'),
  ('제네시스', 'G80', 'SSS'),
  ('제네시스', 'G80', 'UYH'),
  ('제네시스', 'G80', 'PH3'),
  ('제네시스', 'G90', 'HBK'),
  ('제네시스', 'GV70', 'SSS'),
  ('제네시스', 'GV80', 'UYH'),
  ('제네시스', 'GV80', 'NRB'),
  ('제네시스', 'GV80', 'NCM')
on conflict do nothing;
