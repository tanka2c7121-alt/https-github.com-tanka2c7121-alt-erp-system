"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MenuItem } from "../../data/menuData";
import { fetchAllRows } from "../../lib/fetchAllRows";
import { useRealtimeRefresh } from "../../lib/useRealtimeRefresh";

type PartnerSupportPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

type WorkOrderRow = {
  id: number;
  work_name: string;
  car_number: string | null;
  car_model: string | null;
  category: string | null;
  insurance_company: string | null;
  partner_company: string | null;
  inbound_date: string | null;
  release_date: string | null;
};

type PaymentRow = {
  work_name: string | null;
  payment_type: string | null;
  payment_detail: string | null;
  payment_amount: number | null;
  payment_date: string | null;
};

type ExpenseRow = {
  work_name: string | null;
  expense_amount: number | null;
  expense_date: string | null;
  expense_type: string | null;
};

type DailyCashRow = {
  category: string | null;
  content: string | null;
  expense: number | null;
  memo: string | null;
  source_work_name: string | null;
};

type BusinessCatalogRow = {
  name: string;
};

type SupportRow = {
  id: number;
  workName: string;
  inboundDate: string;
  releaseDate: string;
  partnerCompany: string;
  carNumber: string;
  carModel: string;
  status: "미결" | "완결" | "종결";
  paymentDate: string;
  paymentAmount: number;
  deductibleAmount: number;
  totalPaymentAmount: number;
  expenseAmount: number;
  supportRate: number;
  expectedSupportAmount: number;
  supportAmount: number;
  supportDate: string;
  isSupportEntered: boolean;
};

type SupportFilter = "pending" | "entered" | "all";
type SortKey =
  | "inboundDate"
  | "partnerCompany"
  | "workName"
  | "carNumber"
  | "carModel"
  | "paymentDate"
  | "paymentAmount"
  | "deductibleAmount"
  | "totalPaymentAmount"
  | "expenseAmount"
  | "expectedSupportAmount"
  | "supportAmount";
type SortDirection = "asc" | "desc";
const realtimeTables = [
  { table: "work_orders" },
  { table: "business_catalog" },
  { table: "settlement_payments" },
  { table: "settlement_expenses" },
  { table: "daily_cash" },
];

const pageSize = 30;
const printFirstPageRows = 34;
const printNextPageRows = 41;

const formatWon = (amount: number) => amount.toLocaleString();
const normalizeText = (value: unknown) => String(value ?? "").trim();
const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;
const hasDateValue = (value: unknown) => {
  const text = normalizeText(value).toLowerCase();
  return Boolean(text && text !== "null" && text !== "undefined" && text !== "0000-00-00");
};
const includesKeyword = (value: unknown, keyword: string) =>
  normalizeText(value).replace(/\s+/g, "").includes(keyword);

function buildPrintPages(rows: SupportRow[]) {
  const pages: SupportRow[][] = [];
  let cursor = 0;

  pages.push(rows.slice(cursor, cursor + printFirstPageRows));
  cursor += printFirstPageRows;

  while (cursor < rows.length) {
    pages.push(rows.slice(cursor, cursor + printNextPageRows));
    cursor += printNextPageRows;
  }

  return pages;
}


export default function PartnerSupportPage({
  onSelectMenu,
}: PartnerSupportPageProps) {
  const [rows, setRows] = useState<SupportRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedPartner, setSelectedPartner] = useState("");
  const [supportFilter, setSupportFilter] = useState<SupportFilter>("pending");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("inboundDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [printPortalRoot, setPrintPortalRoot] = useState<HTMLElement | null>(null);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    try {
      const { data: workOrders, error: workError } = await fetchAllRows<WorkOrderRow>(
        "work_orders",
        "id,work_name,car_number,car_model,category,insurance_company,partner_company,inbound_date,release_date",
        (query) =>
          query
            .order("inbound_date", { ascending: false })
            .order("id", { ascending: false })
      );

      if (workError) {
        throw new Error("입고지원 대상 조회 실패: " + workError.message);
      }

      const { data: businessRows, error: businessError } =
        await fetchAllRows<BusinessCatalogRow>(
          "business_catalog",
          "name",
          (query) =>
            query
              .eq("item_type", "partner")
              .eq("group_name", "입고지원")
              .eq("is_active", true)
        );

      if (businessError) {
        throw new Error("입고지원 거래처 조회 실패: " + businessError.message);
      }

      const supportTargetPartners = new Set(
        (businessRows ?? [])
          .map((row) => normalizeText(row.name))
          .filter(Boolean)
      );

      const targetWorkOrders = (workOrders ?? []).filter((workOrder) => {
        const partnerCompany = normalizeText(workOrder.partner_company);
        return Boolean(
          normalizeText(workOrder.work_name) &&
            supportTargetPartners.has(partnerCompany)
        );
      });
      const workNames = Array.from(new Set(targetWorkOrders.map((row) => normalizeText(row.work_name))));

      const [
        paymentResult,
        expenseResult,
        dailyCashResult,
      ] =
        workNames.length === 0
          ? [
              { data: [] as PaymentRow[], error: null },
              { data: [] as ExpenseRow[], error: null },
              { data: [] as DailyCashRow[], error: null },
            ]
          : await Promise.all([
              fetchAllRows<PaymentRow>(
                "settlement_payments",
                "work_name,payment_type,payment_detail,payment_amount,payment_date",
                (query) => query.in("work_name", workNames)
              ),
              fetchAllRows<ExpenseRow>(
                "settlement_expenses",
                "work_name,expense_amount,expense_date,expense_type",
                (query) => query.in("work_name", workNames)
              ),
              fetchAllRows<DailyCashRow>(
                "daily_cash",
                "category,content,expense,memo,source_work_name",
                (query) => query.in("source_work_name", workNames)
              ),
            ]);

      if (paymentResult.error) {
        throw new Error("입금내역 조회 실패: " + paymentResult.error.message);
      }
      if (expenseResult.error) {
        throw new Error("지출내역 조회 실패: " + expenseResult.error.message);
      }
      if (dailyCashResult.error) {
        throw new Error("부품대 조회 실패: " + dailyCashResult.error.message);
      }

      const paymentsByWorkName = new Map<string, PaymentRow[]>();
      const supportByWorkName = new Map<string, { amount: number; date: string }>();
      const expenseByWorkName = new Map<string, number>();

      (paymentResult.data ?? []).forEach((row) => {
        const workName = normalizeText(row.work_name);
        if (!workName) return;

        paymentsByWorkName.set(workName, [
          ...(paymentsByWorkName.get(workName) ?? []),
          row,
        ]);
      });

      (expenseResult.data ?? []).forEach((row) => {
        const workName = normalizeText(row.work_name);
        const amount = toAmountNumber(row.expense_amount);

        if (!workName || amount <= 0 || normalizeText(row.expense_type) !== "입고지원") {
          if (workName && amount > 0) {
            expenseByWorkName.set(
              workName,
              (expenseByWorkName.get(workName) ?? 0) + amount
            );
          }
          return;
        }

        const current = supportByWorkName.get(workName) ?? { amount: 0, date: "" };
        current.amount += amount;
        if (!current.date && row.expense_date) current.date = row.expense_date;
        supportByWorkName.set(workName, current);
      });

      (dailyCashResult.data ?? []).forEach((row) => {
        const workName = normalizeText(row.source_work_name);
        const isPartsRow =
          includesKeyword(row.category, "부품대") ||
          includesKeyword(row.content, "부품대") ||
          includesKeyword(row.memo, "부품대");

        if (!workName || !isPartsRow) return;

        expenseByWorkName.set(
          workName,
          (expenseByWorkName.get(workName) ?? 0) + toAmountNumber(row.expense)
        );
      });

      setRows(
        targetWorkOrders
          .flatMap((workOrder) => {
            const workName = normalizeText(workOrder.work_name);
            const partnerCompany = normalizeText(workOrder.partner_company);
            const support = supportByWorkName.get(workName);
            const isSupportEntered = Boolean(support && support.amount > 0);

            if (isSupportEntered) {
              return [];
            }

            const paymentRows = paymentsByWorkName.get(workName) ?? [];
            const paidRows = paymentRows.filter(
              (row) => toAmountNumber(row.payment_amount) > 0 && hasDateValue(row.payment_date)
            );
            const deductibleAmount = paidRows
              .filter(
                (row) =>
                  includesKeyword(row.payment_type, "면책금") ||
                  includesKeyword(row.payment_detail, "면책금")
              )
              .reduce((sum, row) => sum + toAmountNumber(row.payment_amount), 0);
            const vatAmount = paidRows
              .filter(
                (row) =>
                  includesKeyword(row.payment_type, "부가세") ||
                  includesKeyword(row.payment_detail, "부가세")
              )
              .reduce((sum, row) => sum + toAmountNumber(row.payment_amount), 0);
            const paymentAmount = paidRows
              .filter(
                (row) =>
                  !includesKeyword(row.payment_type, "면책금") &&
                  !includesKeyword(row.payment_detail, "면책금") &&
                  !includesKeyword(row.payment_type, "부가세") &&
                  !includesKeyword(row.payment_detail, "부가세")
              )
              .reduce(
              (sum, row) => sum + toAmountNumber(row.payment_amount),
              0
            );
            const paymentDate =
              paidRows
                .map((row) => normalizeText(row.payment_date))
                .filter(Boolean)
                .sort()[0] ?? "";
            const totalPaymentAmount = paymentAmount + deductibleAmount + vatAmount;
            const expenseAmount = expenseByWorkName.get(workName) ?? 0;
            const supportRate = partnerCompany === "상동점" ? 0.15 : 0.1;
            const supportBase =
              paymentAmount > 0
                ? Math.max(0, ((totalPaymentAmount - expenseAmount) / 1.1) * 0.85)
                : 0;
            const expectedSupportAmount = Math.round(supportBase * supportRate);

            return [{
              id: workOrder.id,
              workName,
              inboundDate: normalizeText(workOrder.inbound_date),
              releaseDate: normalizeText(workOrder.release_date),
              partnerCompany,
              carNumber: normalizeText(workOrder.car_number),
              carModel: normalizeText(workOrder.car_model),
              status: "미결",
              paymentDate,
              paymentAmount,
              deductibleAmount,
              totalPaymentAmount,
              expenseAmount,
              supportRate,
              expectedSupportAmount,
              supportAmount: support?.amount ?? 0,
              supportDate: support?.date ?? "",
              isSupportEntered,
            } satisfies SupportRow];
          })
      );
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "입고지원관리 조회 중 오류가 발생했습니다."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    const root = document.createElement("div");
    root.className = "partner-support-v2-portal";
    document.body.appendChild(root);
    setPrintPortalRoot(root);

    return () => {
      root.remove();
    };
  }, []);

  useRealtimeRefresh({
    channelName: "partner-support-page",
    tables: realtimeTables,
    onRefresh: loadRows,
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, selectedPartner]);

  const yearOptions = useMemo(() => [String(new Date().getFullYear())], []);

  const partnerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.partnerCompany))).sort((a, b) =>
      a.localeCompare(b, "ko")
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (!selectedPartner) return true;
        return row.partnerCompany === selectedPartner;
      })
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.workName,
          row.partnerCompany,
          row.carNumber,
          row.carModel,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [rows, searchText, selectedPartner]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...filteredRows].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * direction;
      }

      return String(aValue ?? "").localeCompare(String(bValue ?? ""), "ko") * direction;
    });
  }, [filteredRows, sortDirection, sortKey]);

  const handleSort = (key: SortKey) => {
    setCurrentPage(1);
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const handlePrint = () => {
    document
      .querySelectorAll(".partner-support-v2-portal-active")
      .forEach((portal) =>
        portal.classList.remove("partner-support-v2-portal-active")
      );

    printPortalRoot?.classList.add("partner-support-v2-portal-active");
    document.body.classList.add("partner-support-v2-mode");

    const cleanupPrintMode = () => {
      printPortalRoot?.classList.remove("partner-support-v2-portal-active");
      document.body.classList.remove("partner-support-v2-mode");
      window.removeEventListener("afterprint", cleanupPrintMode);
    };

    window.addEventListener("afterprint", cleanupPrintMode);
    window.print();
    window.setTimeout(cleanupPrintMode, 1000);
  };

  const summary = useMemo(() => {
    return {
      totalCount: rows.length,
      pendingCount: rows.length,
      enteredCount: 0,
      expectedAmount: rows.reduce((sum, row) => sum + row.expectedSupportAmount, 0),
      enteredAmount: 0,
    };
  }, [rows]);

  const partnerSummaryRows = useMemo(() => {
    const map = new Map<
      string,
      {
        partnerCompany: string;
        pendingCount: number;
        enteredCount: number;
        expectedAmount: number;
      }
    >();

    rows.forEach((row) => {
      const current =
        map.get(row.partnerCompany) ??
        {
          partnerCompany: row.partnerCompany,
          pendingCount: 0,
          enteredCount: 0,
          expectedAmount: 0,
        };

      current.pendingCount += 1;
      current.expectedAmount += row.expectedSupportAmount;

      map.set(row.partnerCompany, current);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
      return a.partnerCompany.localeCompare(b.partnerCompany, "ko");
    });
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedRows = sortedRows.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );
  const printPages = useMemo(() => buildPrintPages(sortedRows), [sortedRows]);

  return (
    <div className="space-y-5 text-slate-900">
      <style>
        {`
          .partner-support-v2-portal {
            display: none;
          }

          @media print {
            @page {
              size: A4 portrait;
              margin: 0;
            }

            html,
            body.partner-support-v2-mode {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              overflow: visible !important;
            }

            body.partner-support-v2-mode * {
              visibility: hidden !important;
            }

            body.partner-support-v2-mode > :not(.partner-support-v2-portal-active) {
              display: none !important;
            }

            body.partner-support-v2-mode .partner-support-v2-portal-active,
            body.partner-support-v2-mode .partner-support-v2-portal-active * {
              visibility: visible !important;
            }

            body.partner-support-v2-mode .partner-support-v2-portal-active {
              position: static !important;
              left: 0 !important;
              top: 0 !important;
              display: block !important;
              width: 198mm !important;
              min-height: auto !important;
              margin: 0 auto !important;
              padding: 0 !important;
              background: #ffffff !important;
            }

            body.partner-support-v2-mode .partner-support-v2-sheet {
              width: 198mm !important;
              height: 282mm !important;
              min-height: 282mm !important;
              margin: 7.5mm auto !important;
              padding: 12mm 7mm 2mm !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
              box-shadow: none !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            body.partner-support-v2-mode .partner-support-v2-sheet:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }

            body.partner-support-v2-mode .partner-support-v2-table thead {
              display: table-header-group !important;
            }

            body.partner-support-v2-mode .partner-support-v2-table tfoot {
              display: table-footer-group !important;
            }

            body.partner-support-v2-mode .partner-support-v2-table th,
            body.partner-support-v2-mode .partner-support-v2-table td,
            body.partner-support-v2-mode .partner-support-v2-total-row th,
            body.partner-support-v2-mode .partner-support-v2-total-row td {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            body.partner-support-v2-mode .partner-support-v2-table tr {
              break-inside: avoid !important;
              page-break-inside: avoid !important;
            }
          }
        `}
      </style>
      <style jsx>{`
        .partner-support-table thead th:first-child,
        .partner-support-table tbody tr.data-row td:first-child {
          display: none;
        }
        .partner-support-table thead tr:nth-child(2) {
          display: none;
        }
      `}</style>
      <div>
        <h3 className="text-xl font-bold">입고지원관리</h3>
        <p className="text-sm text-slate-700">
          입금 전 미결 차량도 포함하고, 완결 후 입고지원 지출이 입력되면 집계에서 제외합니다.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <SummaryCard label="대상 차량" value={`${summary.totalCount.toLocaleString()}건`} tone="slate" />
        <SummaryCard label="예상 지원금" value={`${formatWon(summary.expectedAmount)}원`} tone="blue" />
        <SummaryCard label="거래처" value={`${partnerOptions.length.toLocaleString()}곳`} tone="green" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="hidden"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>

            <select
              className="hidden"
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

            <select
              className="hidden"
              value={supportFilter}
              onChange={(event) =>
                setSupportFilter(event.target.value as SupportFilter)
              }
            >
              <option value="pending">입력대기</option>
              <option value="entered">지출입력</option>
              <option value="all">전체</option>
            </select>

            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={selectedPartner}
              onChange={(event) => setSelectedPartner(event.target.value)}
            >
              <option value="">전체 거래처</option>
              {partnerOptions.map((partnerCompany) => (
                <option key={partnerCompany} value={partnerCompany}>
                  {partnerCompany}
                </option>
              ))}
            </select>
          </div>

          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm lg:w-80"
            placeholder="거래처, 작명, 차량번호 검색"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            출력
          </button>
        </div>

        <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {partnerSummaryRows.map((summaryRow) => (
            <button
              key={summaryRow.partnerCompany}
              type="button"
              onClick={() => setSelectedPartner(summaryRow.partnerCompany)}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-800">
                  {summaryRow.partnerCompany}
                </span>
                <span className="text-sm font-bold text-red-600">
                  대기 {summaryRow.pendingCount}건
                </span>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-500">
                예상 {formatWon(summaryRow.expectedAmount)}원
              </div>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="partner-support-table w-full min-w-[1160px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="hidden">상태</th>
                <SortableHeader label="입고일" sortKey="inboundDate" activeKey={sortKey} direction={sortDirection} align="center" onSort={handleSort} />
                <SortableHeader label="거래처" sortKey="partnerCompany" activeKey={sortKey} direction={sortDirection} align="center" onSort={handleSort} />
                <SortableHeader label="작명" sortKey="workName" activeKey={sortKey} direction={sortDirection} align="center" onSort={handleSort} />
                <SortableHeader label="차량번호" sortKey="carNumber" activeKey={sortKey} direction={sortDirection} align="center" onSort={handleSort} />
                <SortableHeader label="차량명" sortKey="carModel" activeKey={sortKey} direction={sortDirection} align="center" onSort={handleSort} />
                <SortableHeader label="입금일" sortKey="paymentDate" activeKey={sortKey} direction={sortDirection} align="center" onSort={handleSort} />
                <SortableHeader label="입금금액" sortKey="paymentAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
                <SortableHeader label="면책금" sortKey="deductibleAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
                <SortableHeader label="총입금액" sortKey="totalPaymentAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
                <SortableHeader label="지출금액" sortKey="expenseAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
                <SortableHeader label="지원금" sortKey="expectedSupportAmount" activeKey={sortKey} direction={sortDirection} align="right" onSort={handleSort} />
                <th className="border border-slate-300 px-2 py-2">관리</th>
              </tr>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-300 px-2 py-2 text-center">상태</th>
                <th className="border border-slate-300 px-2 py-2 text-center">입고일</th>
                <th className="border border-slate-300 px-2 py-2 text-center">거래처</th>
                <th className="border border-slate-300 px-2 py-2 text-center">작명</th>
                <th className="border border-slate-300 px-2 py-2 text-center">차량번호</th>
                <th className="border border-slate-300 px-2 py-2 text-center">차량명</th>
                <th className="border border-slate-300 px-2 py-2 text-center">입금일</th>
                <th className="border border-slate-300 px-2 py-2 text-right">입금금액</th>
                <th className="border border-slate-300 px-2 py-2 text-right">면책금</th>
                <th className="border border-slate-300 px-2 py-2 text-right">총입금액</th>
                <th className="border border-slate-300 px-2 py-2 text-right">지출금액</th>
                <th className="border border-slate-300 px-2 py-2 text-right">지원금</th>
                <th className="border border-slate-300 px-2 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={13} className="border border-slate-300 px-3 py-8 text-center text-slate-500">
                    조회 중입니다.
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={13} className="border border-slate-300 px-3 py-8 text-center text-slate-500">
                    표시할 입고지원 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={`${row.workName}-${row.id}`} className="data-row hover:bg-blue-50">
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span
                          className={
                            row.status === "완결"
                              ? "rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700"
                              : row.status === "종결"
                                ? "rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700"
                                : "rounded-full bg-orange-100 px-2 py-1 text-xs font-bold text-orange-700"
                          }
                        >
                          {row.status}
                        </span>
                        <span
                          className={
                            row.isSupportEntered
                              ? "rounded-full bg-blue-100 px-2 py-1 text-[11px] font-bold text-blue-700"
                              : "rounded-full bg-red-100 px-2 py-1 text-[11px] font-bold text-red-700"
                          }
                        >
                          {row.isSupportEntered ? "지출입력" : "입력대기"}
                        </span>
                      </div>
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      <div>{row.inboundDate || "-"}</div>
                      {row.releaseDate && (
                        <div className="text-xs text-slate-500">
                          출고 {row.releaseDate}
                        </div>
                      )}
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center font-semibold">{row.partnerCompany}</td>
                    <td className="border border-slate-300 px-2 py-2 text-center font-semibold text-blue-700">{row.workName}</td>
                    <td className="border border-slate-300 px-2 py-2 text-center">{row.carNumber || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2 text-center">{row.carModel || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2 text-center">{row.paymentDate || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.paymentAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.deductibleAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.totalPaymentAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.expenseAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-bold text-blue-700">
                      {formatWon(row.expectedSupportAmount)}
                      <span className="ml-1 text-xs text-slate-500">
                        {Math.round(row.supportRate * 100)}%
                      </span>
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectMenu({
                            id: "factory-settlement-repair-register",
                            title: "정산등록",
                            data: { workName: row.workName },
                          })
                        }
                        className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50"
                      >
                        정산등록
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage(1)}
            disabled={safeCurrentPage === 1}
            className="rounded px-3 py-1 disabled:opacity-40"
          >
            {"<<"}
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={safeCurrentPage === 1}
            className="rounded px-3 py-1 disabled:opacity-40"
          >
            {"<"}
          </button>
          <span className="px-2 text-sm font-semibold text-slate-600">
            {safeCurrentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={safeCurrentPage === totalPages}
            className="rounded px-3 py-1 disabled:opacity-40"
          >
            {">"}
          </button>
          <button
            type="button"
            onClick={() => setCurrentPage(totalPages)}
            disabled={safeCurrentPage === totalPages}
            className="rounded px-3 py-1 disabled:opacity-40"
          >
            {">>"}
          </button>
        </div>
      </section>
      {printPortalRoot
        ? createPortal(
            <div className="partner-support-v2-root">
              {printPages.map((pageRows, pageIndex) => (
                <PartnerSupportPrintSheet
                  key={pageIndex}
                  pageCount={printPages.length}
                  pageIndex={pageIndex}
                  rows={pageRows}
                  selectedPartner={selectedPartner}
                  summary={summary}
                  totalRows={sortedRows.length}
                  allRows={sortedRows}
                />
              ))}
            </div>,
            printPortalRoot
          )
        : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "slate" | "red" | "green" | "blue" | "violet";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-700",
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-green-200 bg-green-50 text-green-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function PartnerSupportPrintSheet({
  allRows,
  pageCount,
  pageIndex,
  rows,
  selectedPartner,
  summary,
  totalRows,
}: {
  allRows: SupportRow[];
  pageCount: number;
  pageIndex: number;
  rows: SupportRow[];
  selectedPartner: string;
  summary: {
    totalCount: number;
    pendingCount: number;
    enteredCount: number;
    expectedAmount: number;
    enteredAmount: number;
  };
  totalRows: number;
}) {
  const printTotals = allRows.reduce(
    (totals, row) => ({
      paymentAmount: totals.paymentAmount + row.paymentAmount,
      deductibleAmount: totals.deductibleAmount + row.deductibleAmount,
      totalPaymentAmount: totals.totalPaymentAmount + row.totalPaymentAmount,
      expenseAmount: totals.expenseAmount + row.expenseAmount,
      expectedSupportAmount:
        totals.expectedSupportAmount + row.expectedSupportAmount,
    }),
    {
      paymentAmount: 0,
      deductibleAmount: 0,
      totalPaymentAmount: 0,
      expenseAmount: 0,
      expectedSupportAmount: 0,
    }
  );
  const isFirstPage = pageIndex === 0;

  return (
    <section className="partner-support-v2-sheet mx-auto mb-6 h-[282mm] w-[198mm] bg-white px-[7mm] pb-[2mm] pt-[12mm] text-slate-900 shadow-lg">
      {isFirstPage ? (
        <>
          <div className="relative mb-3 text-center">
            <h1 className="text-3xl font-bold tracking-widest">입고지원관리</h1>
            <p className="mt-1 text-sm font-semibold">신흥현대서비스 ERP</p>
            <p className="absolute right-0 top-1 text-xs font-semibold text-slate-600">
              1 / {pageCount}
            </p>
          </div>

          <table className="mb-4 w-full border-collapse text-[12px] font-semibold">
            <tbody>
              <tr>
                <th className="w-20 border border-slate-900 bg-slate-50 px-2 py-2">
                  거래처
                </th>
                <td className="border border-slate-900 px-2 py-2">
                  {selectedPartner || "전체 거래처"}
                </td>
                <th className="w-20 border border-slate-900 bg-slate-50 px-2 py-2">
                  건수
                </th>
                <td className="border border-slate-900 px-2 py-2 text-right">
                  {totalRows.toLocaleString()}건
                </td>
                <th className="w-20 border border-slate-900 bg-slate-50 px-2 py-2">
                  지원금
                </th>
                <td className="border border-slate-900 px-2 py-2 text-right font-bold text-blue-700">
                  {formatWon(printTotals.expectedSupportAmount)}
                </td>
              </tr>
              <tr>
                <th className="border border-slate-900 bg-slate-50 px-2 py-2">
                  대상 차량
                </th>
                <td className="border border-slate-900 px-2 py-2 text-right">
                  {summary.totalCount.toLocaleString()}건
                </td>
                <th className="border border-slate-900 bg-slate-50 px-2 py-2">
                  입금합계
                </th>
                <td className="border border-slate-900 px-2 py-2 text-right">
                  {formatWon(printTotals.totalPaymentAmount)}
                </td>
                <th className="border border-slate-900 bg-slate-50 px-2 py-2">
                  비고
                </th>
                <td className="border border-slate-900 px-2 py-2">입력대기 기준</td>
              </tr>
            </tbody>
          </table>
        </>
      ) : (
        <div className="mb-2 text-right text-xs font-semibold text-slate-600">
          {pageIndex + 1} / {pageCount}
        </div>
      )}

      <PartnerSupportPrintTable
        rows={rows}
        showTotal={pageIndex === pageCount - 1}
        totals={printTotals}
      />
    </section>
  );
}

function PartnerSupportPrintTable({
  rows,
  showTotal,
  totals,
}: {
  rows: SupportRow[];
  showTotal: boolean;
  totals: {
    paymentAmount: number;
    deductibleAmount: number;
    totalPaymentAmount: number;
    expenseAmount: number;
    expectedSupportAmount: number;
  };
}) {
  return (
    <table className="partner-support-v2-table w-full table-fixed border-collapse text-[8.5px] leading-tight">
      <colgroup>
        <col className="w-[15mm]" />
        <col className="w-[20mm]" />
        <col className="w-[18mm]" />
        <col className="w-[18mm]" />
        <col className="w-[28mm]" />
        <col className="w-[16mm]" />
        <col className="w-[16mm]" />
        <col className="w-[17mm]" />
        <col className="w-[17mm]" />
        <col className="w-[17mm]" />
        <col className="w-[17mm]" />
      </colgroup>
      <thead className="text-center">
        <tr className="bg-slate-50">
          <PrintHeaderCell>입고일</PrintHeaderCell>
          <PrintHeaderCell>거래처</PrintHeaderCell>
          <PrintHeaderCell>작명</PrintHeaderCell>
          <PrintHeaderCell>차량번호</PrintHeaderCell>
          <PrintHeaderCell>차량명</PrintHeaderCell>
          <PrintHeaderCell>입금일</PrintHeaderCell>
          <PrintHeaderCell>입금금액</PrintHeaderCell>
          <PrintHeaderCell>면책금</PrintHeaderCell>
          <PrintHeaderCell>총입금액</PrintHeaderCell>
          <PrintHeaderCell>지출금액</PrintHeaderCell>
          <PrintHeaderCell>지원금</PrintHeaderCell>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td
              className="border border-slate-900 px-3 py-12 text-center text-slate-500"
              colSpan={11}
            >
              출력할 입고지원 데이터가 없습니다.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={`print-${row.workName}-${row.id}`} className="h-[5.8mm]">
              <PrintCell center>{row.inboundDate || "\u00A0"}</PrintCell>
              <PrintCell center strong>{row.partnerCompany || "\u00A0"}</PrintCell>
              <PrintCell center strong>{row.workName || "\u00A0"}</PrintCell>
              <PrintCell center>{row.carNumber || "\u00A0"}</PrintCell>
              <PrintCell center>{row.carModel || "\u00A0"}</PrintCell>
              <PrintCell center>{row.paymentDate || "\u00A0"}</PrintCell>
              <PrintCell amount>{formatWon(row.paymentAmount)}</PrintCell>
              <PrintCell amount>{formatWon(row.deductibleAmount)}</PrintCell>
              <PrintCell amount>{formatWon(row.totalPaymentAmount)}</PrintCell>
              <PrintCell amount>{formatWon(row.expenseAmount)}</PrintCell>
              <PrintCell amount strong>{formatWon(row.expectedSupportAmount)}</PrintCell>
            </tr>
          ))
        )}
      </tbody>
      {showTotal && rows.length > 0 && (
        <tfoot>
          <tr className="partner-support-v2-total-row bg-blue-50 font-bold text-blue-900">
            <th className="border border-slate-900 px-1 py-2 text-right" colSpan={6}>
              합계
            </th>
            <td className="border border-slate-900 px-1 py-2 text-right">
              {formatWon(totals.paymentAmount)}
            </td>
            <td className="border border-slate-900 px-1 py-2 text-right">
              {formatWon(totals.deductibleAmount)}
            </td>
            <td className="border border-slate-900 px-1 py-2 text-right">
              {formatWon(totals.totalPaymentAmount)}
            </td>
            <td className="border border-slate-900 px-1 py-2 text-right">
              {formatWon(totals.expenseAmount)}
            </td>
            <td className="border border-slate-900 px-1 py-2 text-right">
              {formatWon(totals.expectedSupportAmount)}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function PrintHeaderCell({ children }: { children: ReactNode }) {
  return <th className="border border-slate-900 px-1 py-2">{children}</th>;
}

function PrintCell({
  amount = false,
  center = false,
  children,
  strong = false,
}: {
  amount?: boolean;
  center?: boolean;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={`overflow-hidden whitespace-nowrap border border-slate-900 px-1 py-1 ${
        amount ? "text-right" : center ? "text-center" : ""
      } ${strong ? "font-semibold" : ""}`}
    >
      {children}
    </td>
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
  align?: "left" | "right" | "center";
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === activeKey;
  const arrow = isActive ? (direction === "asc" ? "▲" : "▼") : "↕";
  const alignClass =
    align === "right" ? "justify-end text-right" : align === "center" ? "justify-center text-center" : "justify-start text-left";

  return (
    <th className="border border-slate-300 px-2 py-2">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 font-semibold hover:text-blue-700 ${alignClass}`}
      >
        <span>{label}</span>
        <span className="text-[10px] text-slate-400">{arrow}</span>
      </button>
    </th>
  );
}
