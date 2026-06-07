"use client";

import { useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type DailyCashPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

type PeriodValue = 1 | 3 | 6 | 12 | "all";

type DailyCashRow = {
  id: number;
  date: string;
  account: string;
  type: string;
  category: string | null;
  content: string | null;
  income: number;
  expense: number;
  memo: string | null;
  source_type: string | null;
  source_work_name: string | null;
};

const formatWon = (amount: number) => amount.toLocaleString();
type QueryBuilder = any;

const normalizeAccountName = (value: unknown) => {
  const rawText = String(value ?? "").trim();
  const accountKey = rawText
    .replace(/\s+/g, "")
    .replaceAll("-", "")
    .replaceAll("_", "")
    .toUpperCase();

  return accountKey.includes("BLUE") || accountKey.includes("블루")
    ? "BLUE POINT"
    : rawText;
};

async function fetchAllRows<T>(
  tableName: string,
  selectQuery: string,
  configure?: (query: QueryBuilder) => QueryBuilder
): Promise<{ data: T[]; error: any }> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(tableName).select(selectQuery);

    if (configure) {
      query = configure(query);
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

export default function DailyCashPage({ onSelectMenu }: DailyCashPageProps) {
  const [rows, setRows] = useState<DailyCashRow[]>([]);
  const [balanceRows, setBalanceRows] = useState<DailyCashRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [period, setPeriod] = useState<PeriodValue>(1);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function fetchBalanceRows() {
    const today = localDateText();

    const { data, error } = await fetchAllRows<DailyCashRow>(
      "daily_cash",
      "*",
      (query) => query.lte("date", today)
    );

    if (error) {
      alert("잔고 조회 실패: " + error.message);
      return;
    }

    setBalanceRows(data ?? []);
  }

  async function fetchRows(selectedPeriod: PeriodValue = period) {
    const { data, error } = await fetchAllRows<DailyCashRow>(
      "daily_cash",
      "*",
      (query) => {
        let nextQuery = query
          .order("date", { ascending: false })
          .order("id", { ascending: false });

        if (selectedPeriod !== "all") {
          const startDate = new Date();
          startDate.setMonth(startDate.getMonth() - selectedPeriod);
          nextQuery = nextQuery.gte("date", localDateText(startDate));
        }

        return nextQuery;
      }
    );

    if (error) {
      alert("조회 실패: " + error.message);
      return;
    }

    setRows(data ?? []);
  }

  function handlePeriodChange(value: PeriodValue) {
    setPeriod(value);
    fetchRows(value);
  }
  async function handleCustomPeriodSearch() {
  if (!startDate || !endDate) {
    alert("시작일과 종료일을 선택하세요.");
    return;
  }

  const { data, error } = await fetchAllRows<DailyCashRow>(
    "daily_cash",
    "*",
    (query) => query
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: false })
      .order("id", { ascending: false })
  );

  if (error) {
    alert("조회 실패: " + error.message);
    return;
  }

  setPeriod("all");
  setRows(data ?? []);
}

  async function handleDelete(id: number) {
    const ok = confirm("이 입출금 내역을 삭제할까요?");

    if (!ok) return;

    const { error } = await supabase.from("daily_cash").delete().eq("id", id);

    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }

    alert("삭제되었습니다.");
    fetchRows();
  }

  useEffect(() => {
  async function fetchTodayRows() {
    const today = localDateText();

    const { data, error } = await fetchAllRows<DailyCashRow>(
      "daily_cash",
      "*",
      (query) => query
        .eq("date", today)
        .order("id", { ascending: false })
    );

    if (error) {
      alert("조회 실패: " + error.message);
      return;
    }

    setRows(data ?? []);
  }

  void fetchTodayRows();
  void fetchBalanceRows();
}, []);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim();

    if (!keyword) return rows;

    return rows.filter((item) => {
      const text = [
        item.date,
        item.account,
        item.type,
        item.category ?? "",
        item.content ?? "",
        item.memo ?? "",
      ].join(" ");

      return text.includes(keyword);
    });
  }, [rows, searchText]);

  const totalIncome = filteredRows.reduce(
    (sum, item) => sum + Number(item.income || 0),
    0
  );

  const totalExpense = filteredRows.reduce(
    (sum, item) => sum + Number(item.expense || 0),
    0
  );
  const accountNames = [
    "국민은행",
    "부산은행",
    "카드",
    "BLUE POINT",
    "현금",
    "법인1층",
  ];

  const accountSummary = accountNames.map((accountName) => {
    const periodRows = filteredRows.filter(
      (row) => normalizeAccountName(row.account) === accountName
    );
    const balanceAccountRows = balanceRows.filter(
      (row) => normalizeAccountName(row.account) === accountName
    );

    const income = periodRows.reduce(
      (sum, row) => sum + Number(row.income || 0),
      0
    );

    const expense = periodRows.reduce(
      (sum, row) => sum + Number(row.expense || 0),
      0
    );

    const balanceIncome = balanceAccountRows.reduce(
      (sum, row) => sum + Number(row.income || 0),
      0
    );

    const balanceExpense = balanceAccountRows.reduce(
      (sum, row) => sum + Number(row.expense || 0),
      0
    );

    return {
      name: accountName,
      income,
      expense,
      balance: balanceIncome - balanceExpense,
    };
  });

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">일일입출금내역</h3>
        <p className="text-sm text-slate-700">
          매일 입금되고 출금되는 금액과 내용을 정산하는 화면입니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">입금합계</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">
            {formatWon(totalIncome)}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">출금합계</p>
          <p className="mt-2 text-2xl font-bold text-red-600">
            {formatWon(totalExpense)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {accountSummary.map((account) => (
          <div
            key={account.name}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <h4 className="text-sm font-bold text-slate-900">{account.name}</h4>

            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500">입금</span>
                <span className="font-semibold text-blue-600">
                  ₩ {formatWon(account.income)}
                </span>
              </div>

              <div className="flex justify-between gap-2">
                <span className="text-slate-500">출금</span>
                <span className="font-semibold text-red-600">
                  ₩ {formatWon(account.expense)}
                </span>
              </div>

              <div className="flex justify-between gap-2 border-t pt-1.5">
                <span className="font-semibold text-slate-700">잔액</span>
                <span className="font-bold text-green-600">
                  ₩ {formatWon(account.balance)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
  {[
    { label: "금일", value: "today" },

    { label: "1개월", value: 1 },
    { label: "3개월", value: 3 },
    { label: "6개월", value: 6 },
    { label: "12개월", value: 12 },

    { label: "전체", value: "all" },
  ].map((item) => (
    <button
      key={item.label}
      type="button"
      onClick={async () => {

        // 금일 조회
        if (item.value === "today") {

          const today = new Date()
            .toISOString()
            .slice(0, 10);

          const { data, error } = await supabase
            .from("daily_cash")
            .select("*")
            .eq("date", today)
            .order("id", { ascending: false });

          if (error) {
            alert("조회 실패: " + error.message);
            return;
          }

          setRows(data ?? []);
          setPeriod("today" as PeriodValue);

          return;
        }

        // 기간 조회
        handlePeriodChange(
          item.value as PeriodValue
        );
      }}
      className={
        period === item.value
          ? "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          : "rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      }
    >
      {item.label}
    </button>
  ))}
</div>

   {/* 우측 */}
  <div className="flex flex-wrap items-center justify-end gap-2">

    <input
      type="date"
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      value={startDate}
      onChange={(event) => setStartDate(event.target.value)}
    />

    <span className="text-sm text-slate-500">~</span>

    <input
      type="date"
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      value={endDate}
      onChange={(event) => setEndDate(event.target.value)}
    />

    <button
      type="button"
      onClick={handleCustomPeriodSearch}
      className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
    >
      기간검색
    </button>

    <input
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 w-56"
      placeholder="날짜 / 계정 / 내용 검색"
      value={searchText}
      onChange={(event) => setSearchText(event.target.value)}
    />

    <button
      type="button"
      onClick={() =>
        onSelectMenu({
          id: "factory-settlement-daily-cash-register",
          title: "입출금등록",
        })
      }
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
    >
      입출금 등록
    </button>

    <button
      type="button"
      onClick={() =>
        onSelectMenu({
          id: "factory-settlement-daily-cash-print",
          title: "출력모드",
        })
      }
      className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      출력
    </button>
  </div>
</div>
      
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-300 px-3 py-2">일자</th>
                <th className="border border-slate-300 px-3 py-2">계정</th>
                <th className="border border-slate-300 px-3 py-2">구분</th>
                <th className="border border-slate-300 px-3 py-2">분류</th>
                <th className="border border-slate-300 px-3 py-2">내용</th>
                <th className="border border-slate-300 px-3 py-2">입금</th>
                <th className="border border-slate-300 px-3 py-2">출금</th>
                <th className="border border-slate-300 px-3 py-2">비고</th>
                <th className="border border-slate-300 px-3 py-2">관리</th>
              </tr>
            </thead>

            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="border border-slate-300 px-3 py-6 text-center text-slate-500"
                  >
                    등록된 입출금 내역이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((item) => (
                  <tr key={item.id} className="hover:bg-blue-50">
                    <td className="border border-slate-300 px-3 py-2">
                      {item.date}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {item.account}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center">
                      {item.type}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {item.category ?? ""}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {item.content ?? ""}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-blue-600">
                      {item.income ? formatWon(Number(item.income)) : ""}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-red-600">
                      {item.expense ? formatWon(Number(item.expense)) : ""}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">
                      {item.memo ?? ""}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center">
                      <div className="flex justify-center gap-2">
                        {item.source_type !== "settlement_payment" && (
                          <button
                            type="button"
                            onClick={() =>
                            onSelectMenu({
                           id: "factory-settlement-daily-cash-register",
                            title: "입출금수정",
                            data: item,
                             })
                           }
                          className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                           >
                            수정
                          </button>
                          )}
                          {item.source_type !== "settlement_payment" && (
                            <button
                              type="button"
                              onClick={() => {
                                void handleDelete(item.id);
                              }}
                              className="rounded border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                            >
                              삭제
                            </button>
                          )}
 
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>  
   );
}



