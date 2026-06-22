"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { fetchAllRows } from "../../lib/fetchAllRows";
import { supabase } from "../../lib/supabase";
import { useRealtimeRefresh } from "../../lib/useRealtimeRefresh";

const realtimeTables = [
  { table: "daily_cash" },
  { table: "settlement_payments" },
  { table: "repair_settlements" },
  { table: "work_orders" },
];


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
  const [showReceivableDebug, setShowReceivableDebug] = useState(false);
  const [receivablePaymentDates, setReceivablePaymentDates] = useState<Record<string, string>>({});
  const [savingReceivableId, setSavingReceivableId] = useState<number | null>(null);
  const savingReceivableIdsRef = useRef<Set<number>>(new Set());

const fetchReceivableRows = useCallback(async () => {
  const pageSize = 1000;
  const rows: any[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("settlement_payments")
      .select("id, work_name, payment_type, payment_detail, payment_amount, payment_date, payment_method, claim_date, claim_amount")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      alert(
        "미수금 조회 실패: " +
        error.message
      );

      return;
    }

    rows.push(...(data ?? []));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  setPaymentRows(rows);
}, []);

const fetchBalanceRows = useCallback(async () => {
  const today = localDateText();

  const { data, error } = await fetchAllRows<any>(
    "daily_cash",
    "*",
    (query) => query.lte("date", today)
  );

  if (error) {
    alert("잔고 조회 실패: " + error.message);
    return;
  }

  setBalanceRows(data ?? []);
}, []);

const filteredRows = dailyRows;

const periodIncome = filteredRows
  .reduce((sum, row) => sum + Number(row.income || 0), 0);

const periodExpense = filteredRows
  .reduce((sum, row) => sum + Number(row.expense || 0), 0);

const accountNames = [
  "국민은행",
  "부산은행",
  "카드",
  "BLUE POINT",
  "현금",
  "법인1층",
];

const accountSummary = accountNames.map((accountName) => {

  // 월 기준 입출금
  const monthlyRows = filteredRows.filter(
    (row) => normalizeAccountName(row.account) === accountName
  );

  // 누적 잔고 기준
  const balanceAccountRows = balanceRows.filter(
  (row) =>
    normalizeAccountName(row.account) === accountName
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
    income,
    expense,
    balance: balanceIncome - balanceExpense,
  };
});  

const totalCompanyBalance = accountSummary.reduce(
  (sum, account) => sum + account.balance,
  0
);

const receivableAccountNames = [
  "국민은행",
  "부산은행",
  "BLUE POINT",
];

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeBluePointAccount(value: unknown) {
  const rawText = normalizeText(value);
  const accountKey = rawText
    .replace(/\s+/g, "")
    .replaceAll("-", "")
    .replaceAll("_", "")
    .toUpperCase();

  return accountKey.includes("BLUE") || accountKey.includes("블루")
    ? "BLUE POINT"
    : rawText;
}

const isEmptyDateValue = (value: unknown) => {
  const text = normalizeText(value).toLowerCase();

  return !text || text === "null" || text === "undefined" || text === "0000-00-00";
};

function normalizeAccountName(value: unknown) {
  const rawText = normalizeBluePointAccount(value);
  const accountKey = rawText
    .replace(/\s+/g, "")
    .replaceAll("-", "")
    .replaceAll("_", "")
    .toUpperCase();

  if (accountKey.includes("국민") || accountKey.includes("KB")) {
    return "국민은행";
  }

  if (accountKey.includes("부산") || accountKey.includes("BNK")) {
    return "부산은행";
  }

  if (accountKey.includes("BLUE") || accountKey.includes("블루")) {
    return "BLUE POINT";
  }

  return rawText;
}

const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;

const getReceivableAmount = (row: any) =>
  toAmountNumber(row.payment_amount);

const getReceivableAccountName = (row: any) =>
  normalizeAccountName(row.payment_method);

const isReceivableAccountRow = (row: any) => {
  const accountName = getReceivableAccountName(row);

  return (
    getReceivableAmount(row) > 0 &&
    isEmptyDateValue(row.payment_date) &&
    receivableAccountNames.includes(accountName)
  );
};

const receivableDebugRows = paymentRows
  .map((row) => ({
    id: row.id,
    work_name: row.work_name ?? "",
    payment_type: row.payment_type ?? "",
    payment_detail: row.payment_detail ?? "",
    payment_amount: toAmountNumber(row.payment_amount),
    claim_amount: toAmountNumber(row.claim_amount),
    payment_date: normalizeText(row.payment_date),
    payment_method: normalizeText(row.payment_method),
    normalized_payment_method: getReceivableAccountName(row),
    is_empty_date: isEmptyDateValue(row.payment_date),
  }))
  .filter((row) => row.payment_amount > 0 || row.claim_amount > 0)
  .sort((a, b) => String(a.work_name).localeCompare(String(b.work_name), "ko"));

const receivableRows = paymentRows
  .filter(isReceivableAccountRow)
  .map((row) => ({
    ...row,
    receivable_amount: getReceivableAmount(row),
    normalized_payment_method: getReceivableAccountName(row),
  }))
  .sort((a, b) => {
    const accountCompare = a.normalized_payment_method.localeCompare(
      b.normalized_payment_method,
      "ko"
    );

    if (accountCompare !== 0) return accountCompare;
    return String(a.work_name ?? "").localeCompare(String(b.work_name ?? ""), "ko");
  });

const receivableSummary = receivableAccountNames.map((accountName) => {

  const rows = receivableRows.filter(
    (row) => row.normalized_payment_method === accountName
  );

  const amount = rows
    .reduce(
      (sum, row) =>
        sum + row.receivable_amount,
      0
    );

  return {
    name: accountName,
    amount,
  };
});  

const receivableAmount = receivableSummary.reduce(
  (sum, account) => sum + account.amount,
  0
);

const receivableSourceCount = paymentRows.filter(
  (row) =>
    getReceivableAmount(row) > 0 &&
    receivableAccountNames.includes(getReceivableAccountName(row))
).length;

const handleReceivableDateSave = async (row: any) => {
  if (savingReceivableIdsRef.current.has(row.id)) {
    return;
  }

  const paymentDate = receivablePaymentDates[String(row.id)] ?? "";

  if (!paymentDate) {
    alert("입금일자를 입력하세요.");
    return;
  }

  savingReceivableIdsRef.current.add(row.id);
  setSavingReceivableId(row.id);

  const { error: paymentError } = await supabase
    .from("settlement_payments")
    .update({
      payment_date: paymentDate,
      payment_status: "수금",
    })
    .eq("id", row.id);

  if (paymentError) {
    savingReceivableIdsRef.current.delete(row.id);
    setSavingReceivableId(null);
    alert("입금일자 저장 실패: " + paymentError.message);
    return;
  }

  const { error: deleteCashError } = await supabase
    .from("daily_cash")
    .delete()
    .eq("source_type", "settlement_payment")
    .eq("source_work_name", row.work_name ?? "")
    .eq("content", `${row.payment_type ?? ""} / ${row.payment_detail ?? ""} / ${row.work_name ?? ""}`);

  if (deleteCashError) {
    savingReceivableIdsRef.current.delete(row.id);
    setSavingReceivableId(null);
    alert("기존 입출금 연동 내역 정리 실패: " + deleteCashError.message);
    return;
  }

  const { error: cashError } = await supabase.from("daily_cash").insert({
    date: paymentDate,
    created_on: localDateText(),
    account: row.normalized_payment_method,
    type: "수입",
    category: "차량정산",
    content: `${row.payment_type ?? ""} / ${row.payment_detail ?? ""} / ${row.work_name ?? ""}`,
    income: row.receivable_amount,
    expense: 0,
    memo: row.work_name ?? "",
    source_type: "settlement_payment",
    source_work_name: row.work_name ?? "",
  });

  savingReceivableIdsRef.current.delete(row.id);
  setSavingReceivableId(null);

  if (cashError) {
    alert("입출금 연동 실패: " + cashError.message);
    return;
  }

  setReceivablePaymentDates((prev) => {
    const next = { ...prev };
    delete next[String(row.id)];
    return next;
  });
  await fetchReceivableRows();
  await fetchSettlementMain(selectedYear, selectedMonth);
  await fetchBalanceRows();
  alert("입금일자를 저장했습니다.");
};

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
  let startDate = "";
  let endDate = "";

  if (year && month) {
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const lastDay = new Date(yearNumber, monthNumber, 0).getDate();

    startDate = `${year}-${month}-01`;
    endDate = `${year}-${month}-${String(lastDay).padStart(2, "0")}`;
  } else if (year) {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  }

  const { data, error } = await fetchAllRows<any>(
    "daily_cash",
    "*",
    (query) => {
      let nextQuery = query.order("date", { ascending: false });

      if (startDate && endDate) {
        nextQuery = nextQuery.gte("date", startDate).lte("date", endDate);
      }

      return nextQuery;
    }
  );

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

  useRealtimeRefresh({
    channelName: "settlement-main-page",
    tables: realtimeTables,
    onRefresh: () => {
      void fetchSettlementMain(selectedYear, selectedMonth);
      void fetchBalanceRows();
      void fetchReceivableRows();
    },
  });

  return (
    <div className="space-y-4 text-slate-900 md:space-y-6">
      <div>
        <h3 className="text-xl font-bold md:text-2xl">정산관리</h3>

        <p className="text-sm text-slate-600">
          차량정산 및 일일입출금 통합 조회 화면입니다.
        </p>
      </div>

      {/* 기간 선택 */}
<div className="rounded-xl border border-slate-200 bg-white p-3 md:rounded-2xl md:p-5">

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
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-4">
       <SummaryCard title="전체 잔고" value={totalCompanyBalance} color="text-blue-600" />
       <SummaryCard
         title="미수금"
         value={receivableAmount}
         color="text-orange-600"
        details={receivableSummary}
        onClick={() => setShowReceivables((value) => !value)}
       />
       <SummaryCard title="기간 입금" value={periodIncome} color="text-green-600" />
       <SummaryCard title="기간 출금" value={periodExpense} color="text-red-600" />
      </div>
      {showReceivables && (
        <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h4 className="text-lg font-bold text-slate-900">미수금 차량 목록</h4>
              <p className="text-sm text-slate-500">
                입금금액은 있고 입금일이 없는 국민은행, 부산은행, BLUE POINT 정산 내역입니다.
              </p>
              <p className="mt-1 text-xs font-semibold text-orange-700">
                저장목록 {paymentRows.length}건 / 계정 금액행 {receivableSourceCount}건 / 미수조건 {receivableRows.length}건
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowReceivableDebug((value) => !value)}
                className="rounded-lg border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50"
              >
                원본확인
              </button>
              <button
                type="button"
                onClick={() => setShowReceivables(false)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                닫기
              </button>
            </div>
          </div>

          {showReceivableDebug && (
            <div className="mb-4 overflow-x-auto rounded-xl border border-dashed border-orange-300 bg-orange-50 p-3">
              <div className="mb-2 text-sm font-bold text-orange-800">미수금 원본 확인</div>
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-left text-orange-900">
                    <th className="border border-orange-200 px-2 py-1">작명</th>
                    <th className="border border-orange-200 px-2 py-1">입금방법 원본</th>
                    <th className="border border-orange-200 px-2 py-1">인식계정</th>
                    <th className="border border-orange-200 px-2 py-1">입금일 원본</th>
                    <th className="border border-orange-200 px-2 py-1">입금일 없음</th>
                    <th className="border border-orange-200 px-2 py-1 text-right">입금금액</th>
                    <th className="border border-orange-200 px-2 py-1 text-right">청구금액</th>
                  </tr>
                </thead>
                <tbody>
                  {receivableDebugRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-orange-200 px-2 py-4 text-center text-orange-700">
                        settlement_payments에 금액 있는 행이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    receivableDebugRows.map((row) => (
                      <tr key={row.id}>
                        <td className="border border-orange-200 px-2 py-1">{row.work_name}</td>
                        <td className="border border-orange-200 px-2 py-1">{row.payment_method || "(빈값)"}</td>
                        <td className="border border-orange-200 px-2 py-1">{row.normalized_payment_method || "(미인식)"}</td>
                        <td className="border border-orange-200 px-2 py-1">{row.payment_date || "(빈값)"}</td>
                        <td className="border border-orange-200 px-2 py-1">{row.is_empty_date ? "Y" : "N"}</td>
                        <td className="border border-orange-200 px-2 py-1 text-right">{row.payment_amount.toLocaleString()}</td>
                        <td className="border border-orange-200 px-2 py-1 text-right">{row.claim_amount.toLocaleString()}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

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
                        {row.normalized_payment_method}
                      </td>
                      <td className="border border-orange-100 px-3 py-2">
                        {row.claim_date ?? ""}
                      </td>
                      <td className="border border-orange-100 px-3 py-2 min-w-[150px]">
                        <input
                          type="date"
                          className="w-full rounded border border-orange-200 px-2 py-1 text-sm text-slate-900"
                          value={receivablePaymentDates[String(row.id)] ?? ""}
                          onChange={(event) =>
                            setReceivablePaymentDates((prev) => ({
                              ...prev,
                              [String(row.id)]: event.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="border border-orange-100 px-3 py-2 text-right font-semibold text-orange-700">
                        ₩ {row.receivable_amount.toLocaleString()}
                      </td>
                      <td className="border border-orange-100 px-3 py-2 text-center">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleReceivableDateSave(row)}
                            disabled={savingReceivableId === row.id}
                            className="rounded bg-orange-600 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                          >
                            {savingReceivableId === row.id ? "저장중" : "입금처리"}
                          </button>
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
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6 md:gap-4">
  {accountSummary.map((account) => (
    <div
      key={account.name}
      className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm md:rounded-2xl md:p-5"
    >
      <h4 className="truncate text-xs font-bold text-slate-900 md:text-lg">
        {account.name}
      </h4>

      <div className="mt-2 space-y-1 text-[11px] md:mt-4 md:space-y-2 md:text-sm">

        <div className="flex justify-between gap-1">
          <span className="text-slate-500">
            입금
          </span>

          <span className="min-w-0 truncate font-semibold text-blue-600">
            ₩ {account.income.toLocaleString()}
          </span>
        </div>

        <div className="flex justify-between gap-1">
          <span className="text-slate-500">
            출금
          </span>

          <span className="min-w-0 truncate font-semibold text-red-600">
            ₩ {account.expense.toLocaleString()}
          </span>
        </div>

        <div className="flex justify-between gap-1 border-t pt-1.5 md:pt-2">
          <span className="font-semibold">
            잔액
          </span>

          <span className="min-w-0 truncate font-bold text-green-600">
            ₩ {account.balance.toLocaleString()}
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
        "rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:rounded-2xl md:p-5",
        onClick ? "cursor-pointer transition hover:border-orange-300 hover:bg-orange-50" : "",
      ].join(" ")}
    >

      <p className="text-xs font-semibold text-slate-600 md:text-sm">
        {title}
      </p>

      <p className={`mt-2 truncate text-lg font-bold md:mt-3 md:text-3xl ${color}`}>
        ₩ {value.toLocaleString()}
      </p>

      {details && (
        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-2 md:mt-4 md:space-y-2 md:pt-3">

          {details.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between gap-1 rounded-lg bg-orange-50 px-2 py-1.5 text-[11px] md:text-xs"
            >
              <span className="truncate font-semibold text-slate-600">{item.name}</span>

              <span className="shrink-0 font-bold text-orange-700">
                ₩ {item.amount.toLocaleString()}
              </span>
            </div>
          ))}

        </div>
      )}

    </div>
  );
}
















