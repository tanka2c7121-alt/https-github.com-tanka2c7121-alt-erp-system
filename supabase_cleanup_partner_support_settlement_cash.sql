delete from public.daily_cash
where source_type = 'settlement_payment'
  and (
    replace(coalesce(content, ''), ' ', '') like '%입고지원%'
    or replace(coalesce(category, ''), ' ', '') like '%입고지원%'
    or replace(coalesce(memo, ''), ' ', '') like '%입고지원%'
  );
