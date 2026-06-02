"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

export default function SettlementMainPage({
  onSelectMenu,
}: {
  onSelectMenu: (menu: MenuItem) => void;
}) {
  const currentDate = localDateText();
  const currentYear = currentDate.slice(0, 4);
  const currentMonth = currentDate.slice(5, 7);

  const [dailyRows, setDailyRows] = useState<any[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [balanceRows, setBalanceRows] = useState<any[]>([]);
  const [paymentRows, setPaymentRows] = useState<any[]>([]);
  const [showReceivables, setShowReceivables] = useState(false);

const fetchReceivableRows = useCallback(async () => {

  const { data, error } = await supabase
    .from("settlement_payments")
    .select("*");

  if (error) {
    alert(
      "미수금 조회 실패: " +
      error.message
    );

    return;
  }

  setPaymentRows(data ?? []);
}, []);

const fetchBalanceRows = useCallback(async () => {
  const today = localDateText();

  const { data, error } = await supabase
    .from("daily_cash")
    .select("*")
    .lte("date", today);

  if (error) {
    alert("잔고 조회 실패: " + error.message);
    return;
  }

  setBalanceRows(data ?? []);
}, []);

const filteredRows = dailyRows;

const today = localDateText();

const todayIncome = filteredRows
  .filter((row) => row.date === today)
  .reduce((sum, row) => sum + Number(row.income || 0), 0);

const todayExpense = filteredRows
  .filter((row) => row.date === today)
  .reduce((sum, row) => sum + Number(row.expense || 0), 0);

const accountNames = [
  "국민은행",
  "부산은행",
  "카드",
  "BLUE",
  "현금",
  "법인1층",
];

const accountSummary = accountNames.map((accountName) => {

  // 월 기준 입출금
  const monthlyRows = filteredRows.filter(
    (row) => row.account === accountName
  );

  // 누적 잔고 기준
  const balanceAccountRows = balanceRows.filter(
  (row) =>
    row.account === accountName
);

  const income = monthlyRows.reduce(
    (sum, row) =>
      sum + Number(row.income || 0),
    0
  );

  const expense = monthlyRows.reduce(
    (sum, row) =>
      sum + Number(row.expense || 0),
    0
  );

  const balanceIncome = balanceAccountRows.reduce(
    (sum, row) =>
      sum + Number(row.income || 0),
    0
  );

  const balanceExpense = balanceAccountRows.reduce(
    (sum, row) =>
      sum + Number(row.expense || 0),
    0
  );

  return {
    name: accountName,

    income:
      income.toLocaleString(),

    expense:
      expense.toLocaleString(),

    balance:
      (balanceIncome - balanceExpense)
        .toLocaleString(),
  };
});  

const totalBalance = accountSummary.reduce(
  (sum, account) =>
    sum +
    Number(
      String(account.balance).replaceAll(",", "")
    ),
  0
  );

const isReceivableRow = (row: any) => {
  const amount = Number(row.payment_amount || 0);

  if (amount <= 0) {
    return false;
  }

  return (
    !row.payment_date
  );
};

const receivableAmount = paymentRows
  .filter(isReceivableRow)
  .reduce(
    (sum, row) =>
      sum + Number(row.payment_amount || 0),
    0
  );

const receivableRows = paymentRows.filter(isReceivableRow);

const receivableSummary = [
  "국민은행",
  "부산은행",
  "BLUE",
].map((accountName) => {

  const amount = paymentRows
    .filter((row) => isReceivableRow(row) && row.payment_method === accountName)
    .reduce(
      (sum, row) =>
        sum + Number(row.payment_amount || 0),
      0
    );

  return {
    name: accountName,
    amount,
  };
});  

const yearOptions = useMemo(() => {
  return Array.from(
    new Set(
      [
        currentYear,
        ...balanceRows
          .map((row) => String(row.date ?? "").slice(0, 4))
          .filter(Boolean),
        ...dailyRows
          .map((row) => String(row.date ?? "").slice(0, 4))
          .filter(Boolean),
      ]
    )
  ).sort((a, b) => b.localeCompare(a));
}, [balanceRows, currentYear, dailyRows]);

const fetchSettlementMain = useCallback(async (year: string, month: string) => {
  let query = supabase
    .from("daily_cash")
    .select("*")
    .order("date", { ascending: false });

  if (year && month) {
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const startDate = `${year}-${month}-01`;
    const lastDay = new Date(yearNumber, monthNumber, 0).getDate();
    const endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;

    query = query.gte("date", startDate).lte("date", endDate);
  } else if (year) {
    query = query.gte("date", `${year}-01-01`).lte("date", `${year}-12-31`);
  }

  const { data, error } = await query;

  if (error) {
    alert("정산관리 조회 실패: " + error.message);
    return;
  }

  const rows = data ?? [];

  setDailyRows(
    !year && month
      ? rows.filter((row) => String(row.date ?? "").slice(5, 7) === month)
      : rows
  );
}, []);

  useEffect(() => {
    void fetchSettlementMain(selectedYear, selectedMonth);
    void fetchBalanceRows();
    void fetchReceivableRows();
  }, [
    fetchBalanceRows,
    fetchReceivableRows,
    fetchSettlementMain,
    selectedMonth,
    selectedYear,
  ]);

  return (
    <div className="space-y-6 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">정산관리</h3>

        <p className="text-sm text-slate-600">
          차량정산 및 일일입출금 통합 조회 화면입니다.
        </p>
      </div>

      {/* 기간 선택 */}
<div className="rounded-2xl border border-slate-200 bg-white p-5">

  <div className="flex flex-wrap items-center gap-2">
    <div className="text-sm font-semibold text-slate-700">
      조회기간
    </div>

    <select
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      value={selectedYear}
      onChange={(event) => {
        const nextYear = event.target.value;
        setSelectedYear(nextYear);
        void fetchSettlementMain(nextYear, selectedMonth);
      }}
    >
      <option value="">전체 연도</option>
      {yearOptions.map((year) => (
        <option key={year} value={year}>
          {year}년
        </option>
      ))}
    </select>

    <select
      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      value={selectedMonth}
      onChange={(event) => {
        const nextMonth = event.target.value;
        setSelectedMonth(nextMonth);
        void fetchSettlementMain(selectedYear, nextMonth);
      }}
    >
      <option value="">전체 월</option>
      {Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, "0");

        return (
          <option key={month} value={month}>
            {index + 1}월
          </option>
        );
      })}
    </select>
  </div>

</div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
       <SummaryCard title="전체 잔고" value={totalBalance} color="text-blue-600" />
       <SummaryCard
         title="미수금"
         value={receivableAmount}
         color="text-orange-600"
        details={receivableSummary}
        onClick={() => setShowReceivables((value) => !value)}
       />
       <SummaryCard title="오늘 입금" value={todayIncome} color="text-green-600" />
       <SummaryCard title="오늘 출금" value={todayExpense} color="text-red-600" />
      </div>
      {showReceivables && (
        <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className="text-lg font-bold text-slate-900">미수금 차량 목록</h4>
              <p className="text-sm text-slate-500">
                청구 상태이거나 입금일이 없는 정산 내역입니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowReceivables(false)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              닫기
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-orange-50 text-left text-slate-700">
                  <th className="border border-orange-100 px-3 py-2">작명</th>
                  <th className="border border-orange-100 px-3 py-2">구분</th>
                  <th className="border border-orange-100 px-3 py-2">상세</th>
                  <th className="border border-orange-100 px-3 py-2">계정</th>
                  <th className="border border-orange-100 px-3 py-2">청구일</th>
                  <th className="border border-orange-100 px-3 py-2">입금일</th>
                  <th className="border border-orange-100 px-3 py-2 text-right">금액</th>
                  <th className="border border-orange-100 px-3 py-2 text-center">관리</th>
                </tr>
              </thead>
              <tbody>
                {receivableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="border border-orange-100 px-3 py-8 text-center text-slate-500"
                    >
                      미수금 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  receivableRows.map((row, index) => (
                    <tr key={`${row.work_name}-${index}`} className="hover:bg-orange-50">
                      <td className="border border-orange-100 px-3 py-2 font-semibold">
                        {row.work_name}
                      </td>
                      <td className="border border-orange-100 px-3 py-2">
                        {row.payment_type}
                      </td>
                      <td className="border border-orange-100 px-3 py-2">
                        {row.payment_detail}
                      </td>
                      <td className="border border-orange-100 px-3 py-2">
                        {row.payment_method}
                      </td>
                      <td className="border border-orange-100 px-3 py-2">
                        {row.claim_date ?? ""}
                      </td>
                      <td className="border border-orange-100 px-3 py-2">
                        {row.payment_date ?? ""}
                      </td>
                      <td className="border border-orange-100 px-3 py-2 text-right font-semibold text-orange-700">
                        ₩ {Number(row.payment_amount || 0).toLocaleString()}
                      </td>
                      <td className="border border-orange-100 px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            onSelectMenu({
                              id: "factory-settlement-repair-register",
                              title: "정산등록",
                              data: { workName: row.work_name },
                            })
                          }
                          className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          정산수정
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
  {accountSummary.map((account) => (
    <div
      key={account.name}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <h4 className="text-lg font-bold text-slate-900">
        {account.name}
      </h4>

      <div className="mt-4 space-y-2 text-sm">

        <div className="flex justify-between">
          <span className="text-slate-500">
            입금
          </span>

          <span className="font-semibold text-blue-600">
            ₩ {account.income}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-slate-500">
            출금
          </span>

          <span className="font-semibold text-red-600">
            ₩ {account.expense}
          </span>
        </div>

        <div className="flex justify-between border-t pt-2">
          <span className="font-semibold">
            잔액
          </span>

          <span className="font-bold text-green-600">
            ₩ {account.balance}
          </span>
        </div>

      </div>
    </div>
  ))}
</div>
      
</div>
    
  );
}
function SummaryCard({
  title,
  value,
  color,
  details,
  onClick,
}: {
  title: string;
  value: number;
  color: string;

  details?: {
    name: string;
    amount: number;
  }[];
  onClick?: () => void;
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(event) => {
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          onClick();
        }
      }}
      className={[
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm",
        onClick ? "cursor-pointer transition hover:border-orange-300 hover:bg-orange-50" : "",
      ].join(" ")}
    >

      <p className="text-sm font-semibold text-slate-600">
        {title}
      </p>

      <p className={`mt-3 text-3xl font-bold ${color}`}>
        ₩ {value.toLocaleString()}
      </p>

      {details && (
        <div className="mt-4 space-y-1">

          {details.map((item) => (
            <div
              key={item.name}
              className="flex justify-between text-xs text-slate-500"
            >
              <span>{item.name}</span>

              <span>
                ₩ {item.amount.toLocaleString()}
              </span>
            </div>
          ))}

        </div>
      )}

    </div>
  );
}
