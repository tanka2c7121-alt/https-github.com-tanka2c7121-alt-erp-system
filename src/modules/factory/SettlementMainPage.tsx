"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
type QueryBuilder = any;

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
  const [settlementRows, setSettlementRows] = useState<any[]>([]);
  const [riskSourceCounts, setRiskSourceCounts] = useState({
    workOrders: 0,
    settlements: 0,
    payments: 0,
  });
  const [showReceivables, setShowReceivables] = useState(false);
  const [showReceivableDebug, setShowReceivableDebug] = useState(false);
  const [activeRiskView, setActiveRiskView] = useState<
    "pending" | "longPending" | "lowClaimRate" | null
  >(null);
  const [receivablePaymentDates, setReceivablePaymentDates] = useState<Record<string, string>>({});
  const [savingReceivableId, setSavingReceivableId] = useState<number | null>(null);

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
  setRiskSourceCounts((prev) => ({
    ...prev,
    payments: rows.length,
  }));
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

const fetchRiskRows = useCallback(async () => {
  const { data: workRows, error: workError } = await fetchAllRows<any>(
    "work_orders",
    "work_name, insurance_company, partner_company",
    (query) => query.order("id", { ascending: false })
  );

  if (workError) {
    alert("정산 위험관리 차량 조회 실패: " + workError.message);
    return;
  }

  const { data: settlementData, error } = await fetchAllRows<any>(
    "repair_settlements",
    "work_name, insurance_company, partner_company, progress_status, claim_amount, claim_date",
    (query) => query.order("work_name", { ascending: false })
  );

  if (error) {
    alert("정산 위험관리 조회 실패: " + error.message);
    return;
  }

  const settlementMap = new Map(
    (settlementData ?? []).map((row) => [normalizeText(row.work_name), row])
  );
  const workOrderMap = new Map(
    (workRows ?? []).map((row) => [normalizeText(row.work_name), row])
  );
  const workNames = Array.from(
    new Set([
      ...(workRows ?? []).map((row) => normalizeText(row.work_name)),
      ...(settlementData ?? []).map((row) => normalizeText(row.work_name)),
    ])
  ).filter(Boolean);

  setRiskSourceCounts((prev) => ({
    ...prev,
    workOrders: workRows?.length ?? 0,
    settlements: settlementData?.length ?? 0,
  }));

  setSettlementRows(
    workNames.map((workName) => {
      const workRow = workOrderMap.get(workName);
      const settlementRow = settlementMap.get(workName);

      return {
        work_name: workName,
        insurance_company:
          normalizeText(settlementRow?.insurance_company) ||
          normalizeText(workRow.insurance_company),
        partner_company:
          normalizeText(settlementRow?.partner_company) ||
          normalizeText(workRow.partner_company),
        progress_status: settlementRow?.progress_status ?? "미결",
        claim_amount: settlementRow?.claim_amount ?? 0,
        claim_date: settlementRow?.claim_date ?? "",
      };
    })
  );
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
  "BLUE POINT",
  "현금",
  "법인1층",
];

const accountSummary = accountNames.map((accountName) => {

  // 월 기준 입출금
  const monthlyRows = filteredRows.filter(
    (row) => normalizeBluePointAccount(row.account) === accountName
  );

  // 누적 잔고 기준
  const balanceAccountRows = balanceRows.filter(
  (row) =>
    normalizeBluePointAccount(row.account) === accountName
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

const totalCompanyBalance = balanceRows
  .filter((row) => row.type !== "내부이동")
  .reduce(
    (sum, row) => sum + Number(row.income || 0) - Number(row.expense || 0),
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

const normalizeAccountName = (value: unknown) => {
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
};

const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;

const dateDiffDays = (fromDate: unknown, toDate = today) => {
  const fromText = normalizeText(fromDate);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromText)) {
    return null;
  }

  const fromTime = new Date(`${fromText}T00:00:00`).getTime();
  const toTime = new Date(`${toDate}T00:00:00`).getTime();

  return Math.max(0, Math.floor((toTime - fromTime) / 86400000));
};

type PaymentSummary = {
  claimAmount: number;
  paidAmount: number;
  claimDates: string[];
};

const paymentSummaryByWork = paymentRows.reduce<Map<string, PaymentSummary>>((map, row) => {
  const workName = normalizeText(row.work_name);

  if (!workName) {
    return map;
  }

  const current = map.get(workName) ?? {
    claimAmount: 0,
    paidAmount: 0,
    claimDates: [] as string[],
  };

  current.claimAmount += toAmountNumber(row.claim_amount);

  if (!isEmptyDateValue(row.payment_date)) {
    current.paidAmount += toAmountNumber(row.payment_amount);
  }

  if (!isEmptyDateValue(row.claim_date)) {
    current.claimDates.push(normalizeText(row.claim_date));
  }

  map.set(workName, current);
  return map;
}, new Map<string, PaymentSummary>());

const settlementRowMap = new Map(
  settlementRows.map((row) => [normalizeText(row.work_name), row])
);
const riskWorkNames: string[] = Array.from(
  new Set<string>([
    ...settlementRows.map((row) => normalizeText(row.work_name)),
    ...Array.from(paymentSummaryByWork.keys()),
  ])
).filter(Boolean);

const riskRows = riskWorkNames
  .map((workName) => {
    const row = settlementRowMap.get(workName) ?? { work_name: workName };
    const paymentSummary = paymentSummaryByWork.get(workName);
    const claimAmount =
      toAmountNumber(row.claim_amount) || paymentSummary?.claimAmount || 0;
    const paidAmount = paymentSummary?.paidAmount ?? 0;
    const claimDate =
      normalizeText(row.claim_date) ||
      [...(paymentSummary?.claimDates ?? [])].sort()[0] ||
      "";
    const elapsedDays = dateDiffDays(claimDate);
    const claimRate = claimAmount > 0 ? (paidAmount / claimAmount) * 100 : null;
    const status = normalizeText(row.progress_status) || "미결";

    return {
      workName,
      company: normalizeText(row.insurance_company) || normalizeText(row.partner_company),
      status,
      claimDate,
      elapsedDays,
      claimAmount,
      paidAmount,
      shortageAmount: Math.max(0, claimAmount - paidAmount),
      claimRate,
    };
  })
  .filter((row) => row.workName)
  .sort((a, b) => {
    const dayCompare = (b.elapsedDays ?? -1) - (a.elapsedDays ?? -1);

    if (dayCompare !== 0) return dayCompare;
    return a.workName.localeCompare(b.workName, "ko");
  });

const pendingRiskRows = riskRows.filter((row) => row.status !== "완결");
const longPendingRiskRows = pendingRiskRows.filter(
  (row) => (row.elapsedDays ?? 0) > 30
);
const lowClaimRateRiskRows = riskRows.filter(
  (row) => row.claimAmount > 0 && (row.claimRate ?? 0) < 95
);

const activeRiskRows =
  activeRiskView === "pending"
    ? pendingRiskRows
    : activeRiskView === "longPending"
      ? longPendingRiskRows
      : activeRiskView === "lowClaimRate"
        ? lowClaimRateRiskRows
        : [];

const activeRiskTitle =
  activeRiskView === "pending"
    ? "미결건"
    : activeRiskView === "longPending"
      ? "장기미결건"
      : activeRiskView === "lowClaimRate"
        ? "청구율 95% 미만"
        : "";

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
  const paymentDate = receivablePaymentDates[String(row.id)] ?? "";

  if (!paymentDate) {
    alert("입금일자를 입력하세요.");
    return;
  }

  setSavingReceivableId(row.id);

  const { error: paymentError } = await supabase
    .from("settlement_payments")
    .update({
      payment_date: paymentDate,
      payment_status: "수금",
    })
    .eq("id", row.id);

  if (paymentError) {
    setSavingReceivableId(null);
    alert("입금일자 저장 실패: " + paymentError.message);
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
  await fetchRiskRows();
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
    void fetchRiskRows();
  }, [
    fetchBalanceRows,
    fetchReceivableRows,
    fetchRiskRows,
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
       <SummaryCard title="전체 잔고" value={totalCompanyBalance} color="text-blue-600" />
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h4 className="text-lg font-bold text-slate-900">정산 위험관리</h4>
          <p className="text-sm text-slate-500">
            미결, 장기미결, 청구율 95% 미만 차량을 따로 확인합니다.
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            원본: 차량 {riskSourceCounts.workOrders.toLocaleString()}건 / 정산 {riskSourceCounts.settlements.toLocaleString()}건 / 입금 {riskSourceCounts.payments.toLocaleString()}건
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <RiskCard
            title="미결건"
            count={pendingRiskRows.length}
            amount={pendingRiskRows.reduce((sum, row) => sum + row.shortageAmount, 0)}
            tone="orange"
            active={activeRiskView === "pending"}
            onClick={() =>
              setActiveRiskView((view) => (view === "pending" ? null : "pending"))
            }
          />
          <RiskCard
            title="장기미결건"
            count={longPendingRiskRows.length}
            amount={longPendingRiskRows.reduce((sum, row) => sum + row.shortageAmount, 0)}
            tone="red"
            active={activeRiskView === "longPending"}
            onClick={() =>
              setActiveRiskView((view) =>
                view === "longPending" ? null : "longPending"
              )
            }
          />
          <RiskCard
            title="청구율 95% 미만"
            count={lowClaimRateRiskRows.length}
            amount={lowClaimRateRiskRows.reduce(
              (sum, row) => sum + row.shortageAmount,
              0
            )}
            tone="blue"
            active={activeRiskView === "lowClaimRate"}
            onClick={() =>
              setActiveRiskView((view) =>
                view === "lowClaimRate" ? null : "lowClaimRate"
              )
            }
          />
        </div>

        {activeRiskView && (
          <RiskTable
            title={activeRiskTitle}
            rows={activeRiskRows}
            onEdit={(workName) =>
              onSelectMenu({
                id: "factory-settlement-repair-register",
                title: "정산등록",
                data: { workName },
              })
            }
          />
        )}
      </section>
      
</div>
    
  );
}

function RiskCard({
  title,
  count,
  amount,
  tone,
  active,
  onClick,
}: {
  title: string;
  count: number;
  amount: number;
  tone: "orange" | "red" | "blue";
  active: boolean;
  onClick: () => void;
}) {
  const toneClass = {
    orange: active
      ? "border-orange-400 bg-orange-50 text-orange-700"
      : "border-orange-100 bg-white text-orange-700 hover:bg-orange-50",
    red: active
      ? "border-red-400 bg-red-50 text-red-700"
      : "border-red-100 bg-white text-red-700 hover:bg-red-50",
    blue: active
      ? "border-blue-400 bg-blue-50 text-blue-700"
      : "border-blue-100 bg-white text-blue-700 hover:bg-blue-50",
  }[tone];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition ${toneClass}`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-3xl font-bold">{count.toLocaleString()}건</div>
      <div className="mt-2 text-sm font-semibold">
        부족금액 ₩ {amount.toLocaleString()}
      </div>
    </button>
  );
}

function RiskTable({
  title,
  rows,
  onEdit,
}: {
  title: string;
  rows: Array<{
    workName: string;
    company: string;
    status: string;
    claimDate: string;
    elapsedDays: number | null;
    claimAmount: number;
    paidAmount: number;
    shortageAmount: number;
    claimRate: number | null;
  }>;
  onEdit: (workName: string) => void;
}) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h5 className="font-bold text-slate-900">{title} 목록</h5>
        <span className="text-sm font-semibold text-slate-600">
          {rows.length.toLocaleString()}건
        </span>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-white text-left text-slate-600">
            <th className="border-b border-slate-200 px-3 py-2">작명</th>
            <th className="border-b border-slate-200 px-3 py-2">보험사</th>
            <th className="border-b border-slate-200 px-3 py-2">상태</th>
            <th className="border-b border-slate-200 px-3 py-2">청구일</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right">소요일수</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right">청구금액</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right">입금금액</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right">청구율</th>
            <th className="border-b border-slate-200 px-3 py-2 text-right">부족금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-8 text-center text-slate-500">
                관리 대상이 없습니다.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.workName} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => onEdit(row.workName)}
                    className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                  >
                    {row.workName}
                  </button>
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
                  {row.company || "-"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
                  <span
                    className={
                      row.status === "완결"
                        ? "rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700"
                        : "rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700"
                    }
                  >
                    {row.status}
                  </span>
                </td>
                <td className="border-b border-slate-100 px-3 py-2">
                  {row.claimDate || "-"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-right">
                  {row.elapsedDays === null ? "-" : `${row.elapsedDays}일`}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-right">
                  ₩ {row.claimAmount.toLocaleString()}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-right">
                  ₩ {row.paidAmount.toLocaleString()}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold">
                  {row.claimRate === null ? "-" : `${row.claimRate.toFixed(1)}%`}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold text-red-600">
                  ₩ {row.shortageAmount.toLocaleString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
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
        <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">

          {details.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-lg bg-orange-50 px-2 py-1.5 text-xs"
            >
              <span className="font-semibold text-slate-600">{item.name}</span>

              <span className="font-bold text-orange-700">
                ₩ {item.amount.toLocaleString()}
              </span>
            </div>
          ))}

        </div>
      )}

    </div>
  );
}
















