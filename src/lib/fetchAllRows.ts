import { supabase } from "./supabase";

type QueryBuilder = any;

type FetchAllRowsOptions =
  | ((query: QueryBuilder) => QueryBuilder)
  | {
      order?: { column: string; ascending: boolean };
      eq?: { column: string; value: string | number | boolean };
    };

export async function fetchAllRows<T>(
  tableName: string,
  selectQuery: string,
  options?: FetchAllRowsOptions
): Promise<{ data: T[]; error: any }> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(tableName).select(selectQuery);

    if (typeof options === "function") {
      query = options(query);
    } else {
      if (options?.eq) {
        query = query.eq(options.eq.column, options.eq.value);
      }

      if (options?.order) {
        query = query.order(options.order.column, {
          ascending: options.order.ascending,
        });
      }
    }

    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      return { data: rows, error };
    }

    rows.push(...((data ?? []) as T[]));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return { data: rows, error: null };
}
