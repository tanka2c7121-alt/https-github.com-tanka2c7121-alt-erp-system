"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { fetchAllRows } from "../../lib/fetchAllRows";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
};

type ClosedSettlementManagementPageProps = {
  user: LoginUser;
  onSelectMenu: (menu: MenuItem) => void;
};

type SettlementRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_model: string | null;
  category: string | null;
  coverage_type?: string | null;
  insurance_company: string | null;
  partner_company?: string | null;
  progress_status: string | null;
  claim_amount: number | null;
  paid_amount?: number;
  total_amount: number | null;
  payment_rate?: number | null;
};

type PaymentRow = {
  id: number;
  work_name: string | null;
  payment_type: string | null;
  payment_amount: number | null;
};

type WorkOrderRow = {
  work_name: string | null;
  partner_company: string | null;
  coverage_type: string | null;
};

type SortField =
  | "work_name"
  | "car_number"
  | "car_model"
  | "category"
  | "coverage_type"
  | "insurance_company"
  | "partner_company"
  | "claim_amount"
  | "paid_amount"
  | "total_amount"
  | "payment_rate";
type SortOrder = "asc" | "desc";

const normalizeText = (value: unknown) => String(value ?? "").trim();
const formatWon = (value: unknown) =>
  `${Number(value ?? 0).toLocaleString()}원`;
const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;
const calculateRate = (claimAmount: number, paidAmount: number) =>
  claimAmount > 0 ? (paidAmount / claimAmount) * 100 : null;
const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);

export default function ClosedSettlementManagementPage({
  user,
  onSelectMenu,
}: ClosedSettlementManagementPageProps) {
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>("work_name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const canCloseSettlement = user.role === "ADMIN" || user.role === "CHIEF";

  const loadRows = useCallback(async () => {
    setLoading(true);

    const [
      { data, error },
      { data: payments, error: paymentError },
      { data: works, error: workError },
    ] = await Promise.all([
      fetchAllRows<SettlementRow>(
        "repair_settlements",
        [
          "id",
          "work_name",
          "car_number",
          "car_model",
          "category",
          "insurance_company",
          "progress_status",
          "claim_amount",
          "total_amount",
        ].join(", "),
        (query) => query.order("id", { ascending: false })
      ),
      fetchAllRows<PaymentRow>(
        "settlement_payments",
        "id, work_name, payment_type, payment_amount"
      ),
      fetchAllRows<WorkOrderRow>(
        "work_orders",
        "work_name, partner_company, coverage_type"
      ),
    ]);

    setLoading(false);

    if (error) {
      alert("완결 정산 조회 실패: " + error.message);
      return;
    }

    if (paymentError) {
      alert("입금내역 조회 실패: " + paymentError.message);
      return;
    }

    if (workError) {
      alert("작업정보 조회 실패: " + workError.message);
      return;
    }

    const workInfoByWorkName = new Map(
      (works ?? [])
        .map((row) => [normalizeText(row.work_name), row] as const)
        .filter(([workName]) => Boolean(workName))
    );
    const paidAmountByWorkName = (payments ?? []).reduce<Map<string, number>>(
      (map, row) => {
        const workName = normalizeText(row.work_name);
        const paymentType = normalizeText(row.payment_type);

        if (!workName || paymentType === "청구" || paymentType === "면책금") {
          return map;
        }

        map.set(workName, (map.get(workName) ?? 0) + toAmountNumber(row.payment_amount));
        return map;
      },
      new Map<string, number>()
    );

    setRows(
      ((data ?? []) as SettlementRow[])
        .filter((row) => normalizeText(row.progress_status).includes("완결"))
        .map((row) => {
          const workName = normalizeText(row.work_name);
          const claimAmount = toAmountNumber(row.claim_amount);
          const paidAmount = paidAmountByWorkName.get(workName) ?? 0;
          const workInfo = workInfoByWorkName.get(workName);

          return {
            ...row,
            partner_company: workInfo?.partner_company ?? "",
            coverage_type: workInfo?.coverage_type ?? "",
            paid_amount: paidAmount,
            payment_rate: calculateRate(claimAmount, paidAmount),
          };
        })
    );
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return rows
      .filter((row) => {
        const workName = normalizeText(row.work_name);
        if (!selectedYear) return true;
        return workName.startsWith(selectedYear);
      })
      .filter((row) => {
        const workName = normalizeText(row.work_name);
        if (!selectedMonth) return true;
        return workName.slice(5, 7) === selectedMonth;
      })
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.work_name,
          row.car_number,
          row.car_model,
          row.category,
          row.coverage_type,
          row.insurance_company,
          row.partner_company,
          row.progress_status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [rows, searchText, selectedMonth, selectedYear]);

  const sortedRows = useMemo(() => {
    const direction = sortOrder === "asc" ? 1 : -1;

    return [...filteredRows].sort((left, right) => {
      const leftValue = left[sortField];
      const rightValue = right[sortField];

      if (
        sortField === "claim_amount" ||
        sortField === "paid_amount" ||
        sortField === "total_amount" ||
        sortField === "payment_rate"
      ) {
        return (Number(leftValue ?? 0) - Number(rightValue ?? 0)) * direction;
      }

      const compare = normalizeText(leftValue).localeCompare(
        normalizeText(rightValue),
        "ko"
      );

      if (compare !== 0) return compare * direction;
      return normalizeText(left.work_name).localeCompare(
        normalizeText(right.work_name),
        "ko"
      );
    });
  }, [filteredRows, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortOrder("asc");
  };

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set([
        currentYear,
        ...rows
          .map((row) => normalizeText(row.work_name).slice(0, 4))
          .filter(Boolean),
      ])
    ).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const openSettlement = (workName: string) => {
    onSelectMenu({
      id: "factory-settlement-repair-register",
      title: "정산등록",
      data: { workName },
    });
  };

  const closeSettlement = async (row: SettlementRow) => {
    const workName = normalizeText(row.work_name);

    if (!canCloseSettlement || !workName) return;

    const ok = window.confirm(
      `${workName} 정산을 종결 처리할까요?`
    );

    if (!ok) return;

    setUnlockingId(row.id);

    const { error } = await supabase
      .from("repair_settlements")
      .update({
        progress_status: "종결",
      })
      .eq("id", row.id);

    setUnlockingId(null);

    if (error) {
      alert("종결 처리 실패: " + error.message);
      return;
    }

    alert("종결 처리했습니다.");
    await loadRows();
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">완결관리</h3>
          <p className="text-sm text-slate-600">
            완결 처리된 정산을 확인하고, 관리자와 총괄관리자가 종결 처리합니다.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700">
          완결 {rows.length.toLocaleString()}건
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
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
              onChange={(event) => setSelectedMonth(event.target.value)}
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 sm:w-80"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="작명, 차량번호, 보험사 검색"
            />
          </div>
          <div className="text-sm font-semibold text-slate-600">
            조회 {sortedRows.length.toLocaleString()}건
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-slate-700">
                <SortableHeader field="work_name" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="center">
                  작명
                </SortableHeader>
                <SortableHeader field="car_number" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="center">
                  차량번호
                </SortableHeader>
                <SortableHeader field="car_model" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="center">
                  차량명
                </SortableHeader>
                <SortableHeader field="category" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="center">
                  구분
                </SortableHeader>
                <SortableHeader field="coverage_type" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="center">
                  담보
                </SortableHeader>
                <SortableHeader field="insurance_company" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="center">
                  보험사
                </SortableHeader>
                <SortableHeader field="partner_company" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="center">
                  거래처
                </SortableHeader>
                <SortableHeader field="claim_amount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right">
                  청구금액
                </SortableHeader>
                <SortableHeader field="paid_amount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right">
                  입금금액
                </SortableHeader>
                <SortableHeader field="total_amount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right">
                  합계금액
                </SortableHeader>
                <SortableHeader field="payment_rate" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} align="right">
                  결제율
                </SortableHeader>
                <th className="border border-slate-200 px-3 py-2 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="border border-slate-200 px-3 py-8 text-center text-slate-500" colSpan={12}>
                    조회 중입니다.
                  </td>
                </tr>
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td className="border border-slate-200 px-3 py-8 text-center text-slate-500" colSpan={12}>
                    표시할 완결 정산이 없습니다.
                  </td>
                </tr>
              ) : (
                sortedRows.map((row, index) => {
                  const workName = normalizeText(row.work_name);

                  return (
                    <tr key={`${row.id}-${workName}-${index}`} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-2 text-center font-bold">{workName}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center">{row.car_number ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center">{row.car_model ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center">{row.category ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center">{row.coverage_type ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center">{row.insurance_company ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2 text-center">{row.partner_company ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right">{formatWon(row.claim_amount)}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right text-blue-600">{formatWon(row.paid_amount)}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right">{formatWon(row.total_amount)}</td>
                      <td className={`border border-slate-200 px-3 py-2 text-right font-bold ${
                        (row.payment_rate ?? 0) >= 95 ? "text-green-700" : "text-red-600"
                      }`}>
                        {row.payment_rate === null || row.payment_rate === undefined
                          ? "-"
                          : `${row.payment_rate.toFixed(1)}%`}
                      </td>
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openSettlement(workName)}
                            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            보기
                          </button>
                          {canCloseSettlement && (
                            <button
                              type="button"
                              onClick={() => void closeSettlement(row)}
                              disabled={unlockingId === row.id}
                              className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {unlockingId === row.id ? "처리중" : "종결처리"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {sortedRows.map((row, index) => {
            const workName = normalizeText(row.work_name);

            return (
              <div key={`${row.id}-${workName}-${index}`} className="rounded-xl border border-slate-200 p-4">
                <div className="font-bold text-slate-900">{workName}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {row.car_number ?? ""} / {row.car_model ?? ""}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {row.category ?? "-"} / {row.coverage_type ?? "-"} / {row.insurance_company ?? ""} / {row.partner_company ?? "-"} / 청구 {formatWon(row.claim_amount)}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-700">
                  입금 {formatWon(row.paid_amount)} / 결제율{" "}
                  {row.payment_rate === null || row.payment_rate === undefined
                    ? "-"
                    : `${row.payment_rate.toFixed(1)}%`}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openSettlement(workName)}
                    className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700"
                  >
                    보기
                  </button>
                  {canCloseSettlement && (
                    <button
                      type="button"
                      onClick={() => void closeSettlement(row)}
                      disabled={unlockingId === row.id}
                      className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {unlockingId === row.id ? "처리중" : "종결처리"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function SortableHeader({
  field,
  sortField,
  sortOrder,
  onSort,
  align = "left",
  children,
}: {
  field: SortField;
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
  align?: "left" | "center" | "right";
  children: ReactNode;
}) {
  const active = field === sortField;

  return (
    <th
      className={[
        "border border-slate-200 px-3 py-2",
        align === "right"
          ? "text-right"
          : align === "center"
            ? "text-center"
            : "text-left",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={[
          "inline-flex w-full items-center gap-1 font-bold hover:text-blue-700",
          align === "right"
            ? "justify-end"
            : align === "center"
              ? "justify-center"
              : "justify-start",
          active ? "text-blue-700" : "text-slate-700",
        ].join(" ")}
      >
        <span>{children}</span>
        <span className="text-[10px]">
          {active ? (sortOrder === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
