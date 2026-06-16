delete from public.daily_cash
where source_type = 'expense_request'
  and (
    replace(coalesce(category, ''), ' ', '') like '%입고지원%'
    or replace(coalesce(content, ''), ' ', '') like '%입고지원%'
    or replace(coalesce(memo, ''), ' ', '') like '%입고지원%'
  );
