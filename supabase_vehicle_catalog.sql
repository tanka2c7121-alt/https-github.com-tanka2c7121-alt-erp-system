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

create table if not exists vehicle_makers (
  id bigserial primary key,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_makers_unique
on vehicle_makers (lower(trim(name)));

create table if not exists vehicle_models (
  id bigserial primary key,
  maker_id bigint not null references vehicle_makers(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_models_unique
on vehicle_models (maker_id, lower(trim(name)));

create table if not exists vehicle_color_codes (
  id bigserial primary key,
  model_id bigint not null references vehicle_models(id) on delete cascade,
  code text not null,
  color_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists vehicle_color_codes_unique
on vehicle_color_codes (model_id, lower(trim(code)));

drop trigger if exists vehicle_makers_set_updated_at on vehicle_makers;

create trigger vehicle_makers_set_updated_at
before update on vehicle_makers
for each row
execute function set_vehicle_catalog_updated_at();

drop trigger if exists vehicle_models_set_updated_at on vehicle_models;

create trigger vehicle_models_set_updated_at
before update on vehicle_models
for each row
execute function set_vehicle_catalog_updated_at();

drop trigger if exists vehicle_color_codes_set_updated_at on vehicle_color_codes;

create trigger vehicle_color_codes_set_updated_at
before update on vehicle_color_codes
for each row
execute function set_vehicle_catalog_updated_at();

insert into vehicle_makers (name)
select distinct trim(maker)
from vehicle_catalog
where trim(maker) <> ''
on conflict do nothing;

insert into vehicle_models (maker_id, name)
select distinct makers.id, trim(catalog.model)
from vehicle_catalog catalog
join vehicle_makers makers on lower(trim(makers.name)) = lower(trim(catalog.maker))
where trim(catalog.model) <> ''
on conflict do nothing;

insert into vehicle_color_codes (model_id, code)
select distinct models.id, upper(trim(catalog.color_code))
from vehicle_catalog catalog
join vehicle_makers makers on lower(trim(makers.name)) = lower(trim(catalog.maker))
join vehicle_models models
  on models.maker_id = makers.id
  and lower(trim(models.name)) = lower(trim(catalog.model))
where trim(coalesce(catalog.color_code, '')) <> ''
on conflict do nothing;

create table if not exists business_catalog (
  id bigserial primary key,
  item_type text not null check (item_type in ('rental', 'partner', 'insurer')),
  name text not null,
  phone_number text,
  group_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists business_catalog_unique
on business_catalog (
  item_type,
  lower(trim(name)),
  lower(trim(coalesce(group_name, '')))
);

create or replace function set_business_catalog_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists business_catalog_set_updated_at on business_catalog;

create trigger business_catalog_set_updated_at
before update on business_catalog
for each row
execute function set_business_catalog_updated_at();

insert into business_catalog (item_type, name, phone_number, group_name)
values
  ('rental', 'N', null, null),
  ('rental', '타렌트사용', null, null),
  ('rental', '스타렌터카', '010-9335-1694', null),
  ('rental', 'SK렌터카', null, null),
  ('rental', '경인렌터카', null, null),
  ('rental', '중호렌터카', '010-5824-1257', null),
  ('rental', '라움렌터카', null, null),
  ('rental', '에이스렌터카', null, null),
  ('partner', '자력', null, null),
  ('partner', '블루모터스', null, null),
  ('partner', 'KB캐피탈', null, null),
  ('partner', '상동점', null, null),
  ('partner', '상동점소개', null, null),
  ('partner', '오릭스캐피탈', null, null),
  ('partner', 'BNK캐피탈', null, null),
  ('partner', '오픈링크', null, null),
  ('partner', '오부장', null, null),
  ('partner', '경인렌터카', null, null),
  ('insurer', '현대해상', null, '보험'),
  ('insurer', '삼성화재', null, '보험'),
  ('insurer', 'DB손해보험', null, '보험'),
  ('insurer', 'KB손해보험', null, '보험'),
  ('insurer', '메리츠화재', null, '보험'),
  ('insurer', '흥국화재', null, '보험'),
  ('insurer', '롯데손해보험', null, '보험'),
  ('insurer', '하나손해보험', null, '보험'),
  ('insurer', '한화손해보험', null, '보험'),
  ('insurer', '캐롯손해보험', null, '보험'),
  ('insurer', '화물공제', null, '보험'),
  ('insurer', '렌터카공제', null, '보험'),
  ('insurer', '택시공제', null, '보험'),
  ('insurer', '개인택시공제', null, '보험'),
  ('insurer', '전세버스공제', null, '보험'),
  ('insurer', '버스공제', null, '보험'),
  ('insurer', '배달서비스공제', null, '보험'),
  ('insurer', 'KB캐피탈', null, '캐피탈'),
  ('insurer', 'BNK캐피탈', null, '캐피탈'),
  ('insurer', '오릭스캐피탈', null, '캐피탈'),
  ('insurer', '오픈링크', null, '캐피탈'),
  ('insurer', '해당없음', null, '일반'),
  ('insurer', '바디케어', null, '일반')
on conflict do nothing;
