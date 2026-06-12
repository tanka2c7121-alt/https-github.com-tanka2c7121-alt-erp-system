"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";




type FactorySettlementPageProps = {
  view?: "all" | "complete" | "closed" | "pending" | "receivable" | "deductible";
  onSelectMenu: (menu: MenuItem) => void;
};

type SettlementItem = {
  id: number;
  work_name: string;
  car_number: string;
  car_model: string;
  category: string;
  coverage_type: string;
  company: string;
  deductible_amount: string;
  status: "완결" | "미결" | "종결";
  release_date: string;
  hasReceivable: boolean;
  hasExpense: boolean;
  chargeAmount: number;
  paidAmount: number;
  receivableAmount: number;
  paymentRate: number | null;
};

const formatWon = (amount: number) => amount.toLocaleString();
const formatPercent = (rate: number | null) =>
  rate === null ? "-" : `${rate.toFixed(1)}%`;
const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);
const hasDeductibleValue = (value?: string | null) => {
  const normalized = String(value ?? "").trim();

  return Boolean(
    normalized &&
      normalized !== "-" &&
      normalized !== "해당없음" &&
      normalized !== "0"
  );
};

const hasDeductibleCoverage = (value?: string | null) => {
  const normalized = String(value ?? "").trim();

  return normalized === "자차" || normalized === "과실";
};

const isEmptyDateValue = (value: unknown) => {
  const text = String(value ?? "").trim().toLowerCase();

  return !text || text === "null" || text === "undefined" || text === "0000-00-00";
};

const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;

const normalizeSettlementStatus = (value: unknown): SettlementItem["status"] => {
  const text = String(value ?? "").trim();

  if (text.includes("종결")) return "종결";
  if (text.includes("완결")) return "완결";
  return "미결";
};

const isReceivablePaymentRow = (row: any) =>
  toAmountNumber(row.payment_amount) > 0 &&
  isEmptyDateValue(row.payment_date);

const isDeductibleTarget = (
  item: Pick<SettlementItem, "coverage_type" | "deductible_amount">
) => hasDeductibleCoverage(item.coverage_type) && hasDeductibleValue(item.deductible_amount);

const isPendingSettlement = (item: SettlementItem) =>
  item.status === "미결" && !item.hasReceivable;

const isReceivableSettlement = (item: SettlementItem) =>
  item.status === "미결" && item.hasReceivable;

const isCompleteSettlement = (item: SettlementItem) =>
  item.status === "완결" && item.chargeAmount > 0 && item.paidAmount > 0;

const isClosedSettlement = (item: SettlementItem) =>
  item.status === "종결" &&
  item.chargeAmount > 0 &&
  item.paidAmount > 0;


async function fetchAllRows<T>(
  tableName: string,
  selectQuery: string,
  options?: {
    order?: { column: string; ascending: boolean };
    eq?: { column: string; value: string };
  }
): Promise<{ data: T[]; error: any }> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(tableName).select(selectQuery);

    if (options?.eq) {
      query = query.eq(options.eq.column, options.eq.value);
    }

    if (options?.order) {
      query = query.order(options.order.column, {
        ascending: options.order.ascending,
      });
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
export default function FactorySettlementPage({
  view = "all",
  onSelectMenu,
}: FactorySettlementPageProps) {
  const [settlementList, setSettlementList] = useState<SettlementItem[]>([]);
  const [deductiblePaidWorkNames, setDeductiblePaidWorkNames] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState(view);
  const [searchText, setSearchText] = useState("");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const [sortField, setSortField] = useState<keyof SettlementItem>("work_name");
const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

const handleSort = (field: keyof SettlementItem) => {
  if (sortField === field) {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  } else {
    setSortField(field);
    setSortOrder("asc");
  }
};

  const loadSettlementList = useCallback(async () => {
    const { data, error } = await fetchAllRows<any>(
      "work_orders",
      `
        id,
        work_name,
        car_number,
        car_model,
        category,
        coverage_type,
        insurance_company,
        partner_company,
        deductible_amount,
        release_date
      `,
      { order: { column: "id", ascending: false } }
    );

    if (error) {
      alert("차량정산 조회 실패: " + error.message);
      return;
    }

    const { data: settlementRows, error: settlementError } = await fetchAllRows<any>(
      "repair_settlements",
      "work_name, progress_status, claim_amount"
    );

    if (settlementError) {
      alert("정산상태 조회 실패: " + settlementError.message);
      return;
    }

    const { data: paymentRows, error: paymentError } = await fetchAllRows<any>(
      "settlement_payments",
      "work_name, payment_type, claim_amount, payment_amount, payment_date, payment_method"
    );

    if (paymentError) {
      alert("입금내역 조회 실패: " + paymentError.message);
      return;
    }

    const { data: expenseRows, error: expenseError } = await fetchAllRows<any>(
      "settlement_expenses",
      "work_name, expense_amount, expense_date, expense_type"
    );

    if (expenseError) {
      alert("지출내역 조회 실패: " + expenseError.message);
      return;
    }

    const deductiblePaymentRows = paymentRows.filter(
      (row) => row.payment_type === "면책금"
    );
    const settlementMap = new Map(
      (settlementRows ?? []).map((row) => [
        row.work_name,
        row.progress_status,
      ])
    );
    const expenseWorkNames = new Set(
      (expenseRows ?? [])
        .filter(
          (row) =>
            toAmountNumber(row.expense_amount) > 0 ||
            !isEmptyDateValue(row.expense_date) ||
            Boolean(String(row.expense_type ?? "").trim())
        )
        .map((row) => row.work_name)
        .filter(Boolean)
    );
    const settlementClaimAmountMap = new Map(
      (settlementRows ?? []).map((row) => [
        row.work_name,
        toAmountNumber(row.claim_amount),
      ])
    );
    const paymentAmountMap = new Map<string, number>();
    const receivableAmountMap = new Map<string, number>();
    const paymentClaimAmountMap = new Map<string, number>();

    paymentRows.forEach((row) => {
      const workName = String(row.work_name ?? "");
      if (!workName) return;

      paymentClaimAmountMap.set(
        workName,
        (paymentClaimAmountMap.get(workName) ?? 0) + toAmountNumber(row.claim_amount)
      );

      if (!isEmptyDateValue(row.payment_date)) {
        paymentAmountMap.set(
          workName,
          (paymentAmountMap.get(workName) ?? 0) + toAmountNumber(row.payment_amount)
        );
      } else {
        receivableAmountMap.set(
          workName,
          (receivableAmountMap.get(workName) ?? 0) + toAmountNumber(row.payment_amount)
        );
      }
    });

    const receivableWorkNames = new Set(
      paymentRows
        .filter(isReceivablePaymentRow)
        .map((row) => row.work_name)
        .filter(Boolean)
    );

    setDeductiblePaidWorkNames(
      new Set(
        (deductiblePaymentRows ?? [])
          .map((row) => row.work_name)
          .filter(Boolean)
      )
    );

    setSettlementList(
      (data ?? []).map((item) => {
        const workName = item.work_name ?? "";
        const settlementClaimAmount = settlementClaimAmountMap.get(workName) ?? 0;
        const paymentClaimAmount = paymentClaimAmountMap.get(workName) ?? 0;

        return {
        id: item.id,
        work_name: workName,
        car_number: item.car_number ?? "",
        car_model: item.car_model ?? "",
        category: item.category ?? "",
        coverage_type: item.coverage_type ?? "",
        company: item.insurance_company || item.partner_company || "",
        deductible_amount: item.deductible_amount ?? "",
        status: normalizeSettlementStatus(settlementMap.get(workName)),
        release_date: item.release_date ?? "",
        hasReceivable: receivableWorkNames.has(workName),
        hasExpense: expenseWorkNames.has(workName),
        chargeAmount: settlementClaimAmount || paymentClaimAmount,
        paidAmount: paymentAmountMap.get(workName) ?? 0,
        receivableAmount: receivableAmountMap.get(workName) ?? 0,
        paymentRate:
          (settlementClaimAmount || paymentClaimAmount) > 0
            ? ((paymentAmountMap.get(workName) ?? 0) /
                (settlementClaimAmount || paymentClaimAmount)) *
              100
            : null,
      };
    })
    );
  }, []);

  useEffect(() => {
    setActiveView(view);
  }, [view]);

  useEffect(() => {
    void loadSettlementList();
  }, [loadSettlementList]);

  const filteredList = useMemo(() => {
  const keyword = searchText.trim().toLowerCase();

  return [...settlementList]
    .sort((a, b) => {
      const aValue = String(a[sortField] ?? "");
      const bValue = String(b[sortField] ?? "");

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;

      return 0;
    })
    .filter((item) => {
      if (!selectedYear) return true;
      return item.work_name.startsWith(selectedYear);
    })
    .filter((item) => {
      if (!selectedMonth) return true;
      return item.work_name.slice(5, 7) === selectedMonth;
    })
    .filter((item) => {
      if (activeView !== "deductible" && isEmptyDateValue(item.release_date)) return false;
      if (activeView === "all" && (item.status === "완결" || item.status === "종결")) return false;
      if (activeView === "complete" && !isCompleteSettlement(item)) return false;
      if (activeView === "closed" && !isClosedSettlement(item)) return false;
      if (activeView === "pending" && !isPendingSettlement(item)) return false;
      if (activeView === "receivable" && !isReceivableSettlement(item)) return false;
      if (activeView === "deductible" && !isDeductibleTarget(item)) return false;

      if (!keyword) return true;

      return (
        item.work_name.toLowerCase().includes(keyword) ||
        item.car_number.toLowerCase().includes(keyword) ||
        item.car_model.toLowerCase().includes(keyword) ||
        item.company.toLowerCase().includes(keyword)
      );
    });
}, [settlementList, searchText, selectedMonth, selectedYear, activeView, sortField, sortOrder]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set([
        currentYear,
        ...settlementList
          .map((item) => item.work_name.slice(0, 4))
          .filter(Boolean),
      ])
    ).sort((a, b) => b.localeCompare(a));
  }, [settlementList]);

  const releasedSettlementItems = settlementList.filter(
    (item) => !isEmptyDateValue(item.release_date)
  );
  const totalCount = releasedSettlementItems.length;
  const receivableCount = releasedSettlementItems.filter(isReceivableSettlement).length;
  const pendingCount = releasedSettlementItems.filter(isPendingSettlement).length;
  const completeCount = releasedSettlementItems.filter(isCompleteSettlement).length;
  const closedCount = releasedSettlementItems.filter(isClosedSettlement).length;
  const deductibleTargetItems = settlementList.filter(isDeductibleTarget);
  const deductibleTargetCount = deductibleTargetItems.length;
  const deductibleCompleteCount = deductibleTargetItems.filter((item) =>
    deductiblePaidWorkNames.has(item.work_name)
  ).length;

  const pageTitle =
    activeView === "complete"
      ? "완결 정산"
      : activeView === "closed"
      ? "종결 정산"
      : activeView === "pending"
        ? "미결 정산"
        : activeView === "receivable"
          ? "미수 정산"
          : activeView === "deductible"
          ? "면책금 관리"
          : "차량정산";

  const [currentPage, setCurrentPage] = useState(1);
const pageSize = 30;

const totalPages = Math.ceil(filteredList.length / pageSize);

const pagedList = filteredList.slice(
  (currentPage - 1) * pageSize,
  currentPage * pageSize
);

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">{pageTitle}</h3>
        <p className="text-sm text-slate-700">
          작업별 청구금액, 입금금액, 결제율, 면책금을 확인하는 화면입니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
        <button
          type="button"
          onClick={() => {
            setActiveView("all");
            setCurrentPage(1);
          }}
          className={[
            "rounded-xl border bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50",
            activeView === "all" ? "border-blue-500 ring-2 ring-blue-100" : "",
          ].join(" ")}
        >
          <p className="text-sm font-semibold text-slate-700">전체</p>
          <p className="mt-2 text-2xl font-bold">{totalCount}건</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("pending");
            setCurrentPage(1);
          }}
          className={[
            "rounded-xl border bg-white p-4 text-left transition hover:border-red-300 hover:bg-red-50",
            activeView === "pending" ? "border-red-500 ring-2 ring-red-100" : "",
          ].join(" ")}
        >
          <p className="text-sm font-semibold text-slate-700">미결</p>
          <p className="mt-2 text-2xl font-bold text-red-600">{pendingCount}건</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("receivable");
            setCurrentPage(1);
          }}
          className={[
            "rounded-xl border bg-white p-4 text-left transition hover:border-orange-300 hover:bg-orange-50",
            activeView === "receivable" ? "border-orange-500 ring-2 ring-orange-100" : "",
          ].join(" ")}
        >
          <p className="text-sm font-semibold text-slate-700">미수</p>
          <p className="mt-2 text-2xl font-bold text-orange-600">{receivableCount}건</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("complete");
            setCurrentPage(1);
          }}
          className={[
            "rounded-xl border bg-white p-4 text-left transition hover:border-green-300 hover:bg-green-50",
            activeView === "complete" ? "border-green-500 ring-2 ring-green-100" : "",
          ].join(" ")}
        >
          <p className="text-sm font-semibold text-slate-700">완결</p>
          <p className="mt-2 text-2xl font-bold text-green-600">{completeCount}건</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("closed");
            setCurrentPage(1);
          }}
          className={[
            "rounded-xl border bg-white p-4 text-left transition hover:border-slate-400 hover:bg-slate-50",
            activeView === "closed" ? "border-slate-700 ring-2 ring-slate-200" : "",
          ].join(" ")}
        >
          <p className="text-sm font-semibold text-slate-700">종결</p>
          <p className="mt-2 text-2xl font-bold text-slate-700">{closedCount}건</p>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("deductible");
            setCurrentPage(1);
          }}
          className={[
            "rounded-xl border bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50",
            activeView === "deductible" ? "border-blue-500 ring-2 ring-blue-100" : "",
          ].join(" ")}
        >
          <p className="text-sm font-semibold text-slate-700">면책금</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">
            {deductibleCompleteCount} / {deductibleTargetCount}건
          </p>
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedYear}
              onChange={(event) => {
                setSelectedYear(event.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="">전체 년도</option>
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
                setSelectedMonth(event.target.value);
                setCurrentPage(1);
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

            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 lg:w-80"
              placeholder="작명 / 차량번호 / 보험사 검색"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <button
            type="button"
            onClick={() =>
              onSelectMenu({
                id: "factory-settlement-repair-register",
                title: "정산등록",
              })
            }
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            정산등록
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th
                  onClick={() => handleSort("work_name")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  작명
                </th>
                <th
                  onClick={() => handleSort("car_number")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  차량번호
                </th>
                <th
                  onClick={() => handleSort("car_model")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  차량명
                </th>
                <th
                  onClick={() => handleSort("category")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  구분
                </th>
                <th
                  onClick={() => handleSort("company")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  보험사
                </th>
                <th
                  onClick={() => handleSort("chargeAmount")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  청구금액
                </th>
                <th
                  onClick={() => handleSort("paidAmount")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  입금금액
                </th>
                <th
                  onClick={() => handleSort("paymentRate")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  결제율
                </th>
                <th
                  onClick={() => handleSort("deductible_amount")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  면책금
                </th>
                <th
                  onClick={() => handleSort("status")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  상태
                </th>
                <th
                  onClick={() => handleSort("id")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  관리
                </th>
              </tr>
            </thead>

            <tbody>
              {pagedList.map((item, index) => {
                return (
                  <tr key={`${item.id}-${item.work_name}-${index}`} className="hover:bg-blue-50">
                    <td className="border border-slate-300 px-3 py-2 font-semibold">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectMenu({
                            id: "factory-work-register",
                            title: "작업등록",
                            data: { workName: item.work_name },
                          })
                        }
                        className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                      >
                        {item.work_name}
                      </button>
                    </td>
                    <td className="border border-slate-300 px-3 py-2">{item.car_number}</td>
                    <td className="border border-slate-300 px-3 py-2">{item.car_model}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center">{item.category}</td>
                    <td className="border border-slate-300 px-3 py-2">{item.company}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">{formatWon(item.chargeAmount)}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">{formatWon(item.paidAmount)}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-semibold">
                      {formatPercent(item.paymentRate)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-blue-600">
                      {item.deductible_amount || "-"}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center">
                      <span
                        className={
                          item.status === "종결"
                            ? "rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700"
                            : item.status === "완결"
                            ? "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
                            : item.hasReceivable
                              ? "rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700"
                              : "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
                        }
                      >
                        {item.status === "종결"
                          ? "종결"
                          : item.status === "완결"
                            ? "완결"
                            : item.hasReceivable
                              ? "미수"
                              : "미결"}
                      </span>
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectMenu({
                            id: "factory-settlement-repair-register",
                            title: "정산등록",
                            data: { workName: item.work_name },
                          })
                        }
                        className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50"
                      >
                        수정
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredList.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="border border-slate-300 px-3 py-10 text-center text-slate-500"
                  >
                    표시할 정산 데이터가 없습니다.
                  </td>
                </tr>
              )}
             
            </tbody>
          </table>
          <div className="mt-4 flex w-full items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="rounded px-3 py-1 disabled:opacity-40"
                >
                 {"<<"}
                 </button>

                 <button
                   type="button"
                   onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                   disabled={currentPage === 1}
                   className="rounded px-3 py-1 disabled:opacity-40"
                >
                 {"<"}
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                 <button
                   key={page}
                   type="button"
                   onClick={() => setCurrentPage(page)}
                   className={
                   currentPage === page
                  ? "rounded bg-blue-600 px-3 py-1 text-white"
                  : "rounded px-3 py-1"
                }
                  >
                 {page}
                </button>
              ))}

                <button
                  type="button"
                   onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                   disabled={currentPage === totalPages}
                   className="rounded px-3 py-1 disabled:opacity-40"
                >
                  {">"}
                </button>

                <button
                   type="button"
                   onClick={() => setCurrentPage(totalPages)}
                   disabled={currentPage === totalPages}
                   className="rounded px-3 py-1 disabled:opacity-40"
                    >
                  {">>"}
                </button>
              </div>
           </div>
       </div>
    </div>
  );
}

















