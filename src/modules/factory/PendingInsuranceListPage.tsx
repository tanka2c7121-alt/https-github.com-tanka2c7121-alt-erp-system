"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { useRealtimeRefresh } from "../../lib/useRealtimeRefresh";
import {
  buildPendingInsuranceRows,
  fetchPendingInsuranceSourceRows,
  filterPendingInsuranceRows,
  formatRate,
  formatWon,
  realtimeTables,
  sortPendingInsuranceRows,
  summarizePendingInsuranceRows,
  type InsuranceListRow,
  type PaymentRow,
  type PendingInsuranceFilters,
  type SettlementRow,
  type SortDirection,
  type SortKey,
  type WorkOrderRow,
} from "./pendingInsuranceListData";

const currentYear = new Date().getFullYear();

export default function PendingInsuranceListPage({
  onSelectMenu,
}: {
  onSelectMenu: (menu: MenuItem) => void;
}) {
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([]);
  const [workOrderRows, setWorkOrderRows] = useState<WorkOrderRow[]>([]);
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([]);
  const [insuranceFilter, setInsuranceFilter] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loadError, setLoadError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("claimDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const filters = useMemo<PendingInsuranceFilters>(
    () => ({
      insuranceFilter,
      selectedYear,
      selectedMonth,
      startDate,
      endDate,
      searchText,
    }),
    [endDate, insuranceFilter, searchText, selectedMonth, selectedYear, startDate]
  );

  const fetchRows = useCallback(async () => {
    setLoadError("");

    try {
      const rows = await fetchPendingInsuranceSourceRows();
      setSettlementRows(rows.settlementRows);
      setWorkOrderRows(rows.workOrderRows);
      setPaymentRows(rows.paymentRows);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "미결 내역 조회 실패");
    }
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useRealtimeRefresh({
    channelName: "pending-insurance-list-page",
    tables: realtimeTables,
    onRefresh: fetchRows,
  });

  const listRows = useMemo(
    () =>
      buildPendingInsuranceRows({
        settlementRows,
        workOrderRows,
        paymentRows,
      }),
    [paymentRows, settlementRows, workOrderRows]
  );

  const insuranceOptions = useMemo(() => {
    return Array.from(new Set(listRows.map((row) => row.insuranceCompany)))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, "ko"));
  }, [listRows]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set(
        listRows
          .map((row) => row.claimDate.slice(0, 4))
          .filter((year) => {
            const yearNumber = Number(year);

            return (
              /^\d{4}$/.test(year) &&
              yearNumber >= 2000 &&
              yearNumber <= currentYear
            );
          })
      )
    ).sort((a, b) => b.localeCompare(a));
  }, [listRows]);

  const filteredRows = useMemo(
    () => filterPendingInsuranceRows(listRows, filters),
    [filters, listRows]
  );

  const sortedRows = useMemo(
    () => sortPendingInsuranceRows(filteredRows, sortKey, sortDirection),
    [filteredRows, sortDirection, sortKey]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const openPrintPage = (printMode: "insurance-confirm" | "long-pending-card") => {
    onSelectMenu({
      id: "factory-settlement-pending-insurance-print",
      title: printMode === "insurance-confirm" ? "보험사 확인용 출력" : "장기미결 관리카드",
      data: {
        printMode,
        filters,
        sortKey,
        sortDirection,
      },
    });
  };

  const summary = useMemo(
    () => summarizePendingInsuranceRows(sortedRows),
    [sortedRows]
  );

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="text-2xl font-bold">청구처별 미결 리스트</h3>
          <p className="text-sm text-slate-600">
            미결 차량의 청구처, 청구기간, 입금 현황을 한 화면에서 검색합니다.
          </p>
          {loadError && (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {loadError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openPrintPage("insurance-confirm")}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700"
          >
            보험사 확인용 출력
          </button>
          <button
            type="button"
            onClick={() => openPrintPage("long-pending-card")}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-red-700"
          >
            장기미결 관리카드
          </button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <SummaryCard label="관리건수" value={`${summary.count.toLocaleString()}건`} />
        <SummaryCard label="청구금액" value={`₩ ${formatWon(summary.claimAmount)}`} tone="blue" />
        <SummaryCard label="입금금액" value={`₩ ${formatWon(summary.paidAmount)}`} tone="green" />
        <SummaryCard label="미수금" value={`₩ ${formatWon(summary.receivableAmount)}`} tone="red" />
        <SummaryCard label="수금율" value={formatRate(summary.collectionRate)} tone="green" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            청구처
            <select
              value={insuranceFilter}
              onChange={(event) => setInsuranceFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            >
              <option value="">전체</option>
              {insuranceOptions.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            년도
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            >
              <option value="">전체</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            월
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            >
              <option value="">전체</option>
              {Array.from({ length: 12 }, (_, index) => {
                const month = String(index + 1).padStart(2, "0");

                return (
                  <option key={month} value={month}>
                    {index + 1}월
                  </option>
                );
              })}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            시작
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700">
            종료
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-semibold text-slate-700 md:col-span-2">
            검색
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="작명 / 차량번호 / 차량명 / 청구처 / 구분"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-50 text-slate-700">
              <SortableHeader label="작명" sortKey="workName" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="차량번호" sortKey="carNumber" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="차량명" sortKey="carModel" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="청구처" sortKey="insuranceCompany" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="청구상세" sortKey="claimSide" activeKey={sortKey} direction={sortDirection} align="center" onSort={handleSort} />
              <SortableHeader label="청구일" sortKey="claimDate" activeKey={sortKey} direction={sortDirection} onSort={handleSort} />
              <SortableHeader label="청구금액" sortKey="claimAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
              <SortableHeader label="입금금액" sortKey="paidAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
              <SortableHeader label="미수금" sortKey="receivableAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
              <SortableHeader label="수금율" sortKey="collectionRate" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-500">
                  조건에 맞는 내역이 없습니다.
                </td>
              </tr>
            ) : (
              sortedRows.map((row, index) => (
                <InsuranceTableRow
                  key={`${row.id}-${row.workName}-${row.insuranceCompany}-${row.claimSide}-${index}`}
                  row={row}
                  onSelectMenu={onSelectMenu}
                />
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function InsuranceTableRow({
  row,
  onSelectMenu,
}: {
  row: InsuranceListRow;
  onSelectMenu: (menu: MenuItem) => void;
}) {
  return (
    <tr className="hover:bg-blue-50">
      <td className="border-b border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={() =>
            onSelectMenu({
              id: "factory-settlement-repair-register",
              title: "정산등록",
              data: { workName: row.workName },
            })
          }
          className="font-semibold text-blue-700 underline-offset-2 hover:underline"
        >
          {row.workName}
        </button>
      </td>
      <td className="border-b border-slate-100 px-3 py-2">{row.carNumber}</td>
      <td className="border-b border-slate-100 px-3 py-2">{row.carModel}</td>
      <td className="border-b border-slate-100 px-3 py-2">{row.insuranceCompany}</td>
      <td className="border-b border-slate-100 px-3 py-2 text-center">
        {row.claimSide}
      </td>
      <td className="border-b border-slate-100 px-3 py-2">
        {row.claimDate || "-"}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-right">
        {formatWon(row.claimAmount)}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-right text-blue-600">
        {formatWon(row.paidAmount)}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold text-red-600">
        {formatWon(row.receivableAmount)}
      </td>
      <td className="border-b border-slate-100 px-3 py-2 text-right font-semibold text-slate-700">
        {formatRate(row.collectionRate)}
      </td>
    </tr>
  );
}

function SummaryCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "blue" | "green" | "red";
}) {
  const toneClass = {
    slate: "text-slate-900",
    blue: "text-blue-600",
    green: "text-green-600",
    red: "text-red-600",
  }[tone];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-slate-600">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  align = "left",
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  align?: "left" | "center" | "right";
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === activeKey;
  const alignClass =
    align === "right"
      ? "justify-end text-right"
      : align === "center"
        ? "justify-center text-center"
        : "justify-start text-left";

  return (
    <th className="border-b border-slate-200 px-3 py-2">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 font-bold hover:text-blue-700 ${alignClass}`}
      >
        <span>{label}</span>
        <span className={isActive ? "text-blue-600" : "text-slate-400"}>
          {isActive ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}
