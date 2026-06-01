delete from work_details a
using work_details b
where a.work_name = b.work_name
  and a.line_no = b.line_no
  and a.id < b.id;

create unique index if not exists work_orders_work_name_unique
on work_orders (work_name);

create unique index if not exists work_details_work_name_line_no_unique
on work_details (work_name, line_no);
