create table if not exists public.incident_reports (
  id bigserial primary key,
  report_date date not null default current_date,
  incident_type text not null default '업무',
  title text not null,
  location text,
  content text not null,
  action_taken text,
  memo text,
  status text not null default '확인대기'
    check (status in ('확인대기', '확인완료', '반려')),
  requested_by text not null,
  requested_name text,
  requested_department text,
  checked_by text,
  checked_name text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.incident_reports
  drop constraint if exists incident_reports_status_check;

alter table public.incident_reports
  add constraint incident_reports_status_check
  check (status in ('확인대기', '확인완료', '반려'));

create index if not exists incident_reports_report_date_idx
  on public.incident_reports (report_date desc);

create index if not exists incident_reports_requested_by_idx
  on public.incident_reports (requested_by);

create index if not exists incident_reports_status_idx
  on public.incident_reports (status);

alter table public.incident_reports enable row level security;

drop policy if exists "incident_reports_select" on public.incident_reports;
create policy "incident_reports_select"
on public.incident_reports
for select
using (
  requested_by = public.current_app_user_id()
  or public.current_app_user_role() = 'ADMIN'
  or public.current_app_user_department() = '관리부'
);

drop policy if exists "incident_reports_insert" on public.incident_reports;
create policy "incident_reports_insert"
on public.incident_reports
for insert
with check (
  requested_by = public.current_app_user_id()
);

drop policy if exists "incident_reports_update_check" on public.incident_reports;
create policy "incident_reports_update_check"
on public.incident_reports
for update
using (
  public.current_app_user_role() = 'ADMIN'
  or public.current_app_user_department() = '관리부'
)
with check (
  public.current_app_user_role() = 'ADMIN'
  or public.current_app_user_department() = '관리부'
);
