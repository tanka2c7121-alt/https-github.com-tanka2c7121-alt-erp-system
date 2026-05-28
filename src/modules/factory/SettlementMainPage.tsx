"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function SettlementMainPage() {
  const [dailyRows, setDailyRows] = useState<any[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [balanceRows, setBalanceRows] = useState<any[]>([]);
  const [paymentRows, setPaymentRows] = useState<any[]>([]);

  useEffect(() => {
  void fetchSettlementMain(selectedMonth);
  void fetchBalanceRows();
  void fetchReceivableRows();
}, []);

async function fetchReceivableRows() {

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
}

async function fetchBalanceRows() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_cash")
    .select("*")
    .lte("date", today);

  if (error) {
    alert("잔고 조회 실패: " + error.message);
    return;
  }

  setBalanceRows(data ?? []);
}

const filteredRows = dailyRows.filter((row) => {
  const keyword = searchText.trim();

  if (!keyword) return true;

  return [
    row.date,
    row.account,
    row.type,
    row.category,
    row.content,
    row.memo,
  ]
    .join(" ")
    .includes(keyword);
});

const totalIncome = filteredRows.reduce(
  (sum, row) => sum + Number(row.income || 0),
  0
);

const totalExpense = filteredRows.reduce(
  (sum, row) => sum + Number(row.expense || 0),
  0
);

const balance = totalIncome - totalExpense;

const settlementIncome = filteredRows
  .filter((row) => row.category === "차량정산")
  .reduce((sum, row) => sum + Number(row.income || 0), 0);

const today = new Date().toISOString().slice(0, 10);

const todayIncome = filteredRows
  .filter((row) => row.date === today)
  .reduce((sum, row) => sum + Number(row.income || 0), 0);

const todayExpense = filteredRows
  .filter((row) => row.date === today)
  .reduce((sum, row) => sum + Number(row.expense || 0), 0);

const selectedYear = new Date().getFullYear();

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

const receivableAmount = paymentRows
  .filter(
    (row) =>
      row.payment_status === "청구"
  )
  .reduce(
    (sum, row) =>
      sum + Number(row.payment_amount || 0),
    0
  );

const receivableSummary = [
  "국민은행",
  "부산은행",
  "BLUE",
].map((accountName) => {

  const amount = paymentRows
    .filter(
      (row) =>
        row.payment_status === "청구" &&
        row.payment_method === accountName
    )
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

async function fetchSettlementMain(month: number) {
  const year = new Date().getFullYear();

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("daily_cash")
    .select("*")
    .gte("date", startDate)
    .lte("date", endDate)
    .order("date", { ascending: false });

  if (error) {
    alert("정산관리 조회 실패: " + error.message);
    return;
  }

  setDailyRows(data ?? []);
}

  return (
    <div className="space-y-6 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">정산관리</h3>

        <p className="text-sm text-slate-600">
          차량정산 및 일일입출금 통합 조회 화면입니다.
        </p>
      </div>

      {/* 월 선택 */}
<div className="rounded-2xl border border-slate-200 bg-white p-5">

  <div className="flex flex-wrap items-center gap-2">

    {[1,2,3,4,5,6,7,8,9,10,11,12].map((month) => (
      <button
        key={month}
        type="button"
        onClick={() => {
          setSelectedMonth(month);
          void fetchSettlementMain(month);
        }}
        className={
          selectedMonth === month
            ? "rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-sm"
            : "rounded-xl bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
        }
      >
        {month}월
      </button>
    ))}

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
       />
       <SummaryCard title="오늘 입금" value={todayIncome} color="text-green-600" />
       <SummaryCard title="오늘 출금" value={todayExpense} color="text-red-600" />
      </div>
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
}: {
  title: string;
  value: number;
  color: string;

  details?: {
    name: string;
    amount: number;
  }[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

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