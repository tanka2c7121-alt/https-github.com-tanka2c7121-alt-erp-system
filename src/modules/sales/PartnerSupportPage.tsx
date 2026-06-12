"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

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
  release_date: string | null;
};

type SettlementRow = {
  work_name: string | null;
  progress_status: string | null;
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
  releaseDate: string;
  partnerCompany: string;
  carNumber: string;
  carModel: string;
  status: "미결" | "완결" | "종결";
  paymentTotal: number;
  vatAmount: number;
  materialAmount: number;
  partsAmount: number;
  baseAmount: number;
  supportRate: number;
  expectedSupportAmount: number;
  supportAmount: number;
  supportDate: string;
  isSupportEntered: boolean;
};

type SupportFilter = "pending" | "entered" | "all";

const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);
const pageSize = 30;
const defaultSupportTargetPartners = [
  "SK렌터카",
  "김병진",
  "경인렌터카",
  "블루모터스",
  "상동점",
] as const;

const formatWon = (amount: number) => amount.toLocaleString();
const normalizeText = (value: unknown) => String(value ?? "").trim();
const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;
const hasDateValue = (value: unknown) => {
  const text = normalizeText(value).toLowerCase();
  return Boolean(text && text !== "null" && text !== "undefined" && text !== "0000-00-00");
};
const normalizeStatus = (value: unknown): SupportRow["status"] => {
  const text = normalizeText(value);

  if (text.includes("종결")) return "종결";
  if (text.includes("완결")) return "완결";
  return "미결";
};
const includesKeyword = (value: unknown, keyword: string) =>
  normalizeText(value).replace(/\s+/g, "").includes(keyword);

type QueryBuilder = any;

async function fetchAllRows<T>(
  tableName: string,
  selectQuery: string,
  configure?: (query: QueryBuilder) => QueryBuilder
): Promise<{ data: T[]; error: any }> {
  const rows: T[] = [];
  const fetchSize = 1000;

  for (let from = 0; ; from += fetchSize) {
    let query = supabase.from(tableName).select(selectQuery);

    if (configure) {
      query = configure(query);
    }

    const { data, error } = await query.range(from, from + fetchSize - 1);

    if (error) {
      return { data: rows, error };
    }

    rows.push(...((data ?? []) as T[]));

    if (!data || data.length < fetchSize) {
      break;
    }
  }

  return { data: rows, error: null };
}

export default function PartnerSupportPage({
  onSelectMenu,
}: PartnerSupportPageProps) {
  const [rows, setRows] = useState<SupportRow[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedPartner, setSelectedPartner] = useState("");
  const [supportFilter, setSupportFilter] = useState<SupportFilter>("pending");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    try {
      const startDate = selectedMonth
        ? `${selectedYear}-${selectedMonth}-01`
        : `${selectedYear}-01-01`;
      const endDate = selectedMonth
        ? `${selectedYear}-${selectedMonth}-${String(
            new Date(Number(selectedYear), Number(selectedMonth), 0).getDate()
          ).padStart(2, "0")}`
        : `${selectedYear}-12-31`;

      const { data: workOrders, error: workError } = await fetchAllRows<WorkOrderRow>(
        "work_orders",
        "id,work_name,car_number,car_model,category,insurance_company,partner_company,release_date",
        (query) =>
          query
            .not("release_date", "is", null)
            .gte("release_date", startDate)
            .lte("release_date", endDate)
            .order("release_date", { ascending: false })
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

      const supportTargetPartners = new Set([
        ...defaultSupportTargetPartners,
        ...(businessRows ?? []).map((row) => normalizeText(row.name)).filter(Boolean),
      ]);

      const targetWorkOrders = (workOrders ?? []).filter((workOrder) => {
        const partnerCompany = normalizeText(workOrder.partner_company);
        return Boolean(normalizeText(workOrder.work_name) && supportTargetPartners.has(partnerCompany));
      });
      const workNames = Array.from(new Set(targetWorkOrders.map((row) => normalizeText(row.work_name))));

      const [
        settlementResult,
        paymentResult,
        expenseResult,
        dailyCashResult,
      ] =
        workNames.length === 0
          ? [
              { data: [] as SettlementRow[], error: null },
              { data: [] as PaymentRow[], error: null },
              { data: [] as ExpenseRow[], error: null },
              { data: [] as DailyCashRow[], error: null },
            ]
          : await Promise.all([
              fetchAllRows<SettlementRow>(
                "repair_settlements",
                "work_name,progress_status",
                (query) => query.in("work_name", workNames)
              ),
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

      if (settlementResult.error) {
        throw new Error("정산상태 조회 실패: " + settlementResult.error.message);
      }
      if (paymentResult.error) {
        throw new Error("입금내역 조회 실패: " + paymentResult.error.message);
      }
      if (expenseResult.error) {
        throw new Error("지출내역 조회 실패: " + expenseResult.error.message);
      }
      if (dailyCashResult.error) {
        throw new Error("부품대 조회 실패: " + dailyCashResult.error.message);
      }

      const statusByWorkName = new Map(
        (settlementResult.data ?? [])
          .map((row) => [normalizeText(row.work_name), normalizeStatus(row.progress_status)] as const)
          .filter(([workName]) => Boolean(workName))
      );
      const paymentsByWorkName = new Map<string, PaymentRow[]>();
      const supportByWorkName = new Map<string, { amount: number; date: string }>();
      const partsByWorkName = new Map<string, number>();

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

        partsByWorkName.set(
          workName,
          (partsByWorkName.get(workName) ?? 0) + toAmountNumber(row.expense)
        );
      });

      setRows(
        targetWorkOrders
          .map((workOrder) => {
            const workName = normalizeText(workOrder.work_name);
            const partnerCompany = normalizeText(workOrder.partner_company);
            const status = statusByWorkName.get(workName) ?? "미결";
            const support = supportByWorkName.get(workName);
            const isSupportEntered = Boolean(support && support.amount > 0);

            if ((status === "완결" || status === "종결") && isSupportEntered) {
              return null;
            }

            const paymentRows = paymentsByWorkName.get(workName) ?? [];
            const paidRows = paymentRows.filter(
              (row) => toAmountNumber(row.payment_amount) > 0 && hasDateValue(row.payment_date)
            );
            const paymentTotal = paidRows.reduce(
              (sum, row) => sum + toAmountNumber(row.payment_amount),
              0
            );
            const explicitVatAmount = paidRows
              .filter(
                (row) =>
                  includesKeyword(row.payment_type, "부가세") ||
                  includesKeyword(row.payment_detail, "부가세")
              )
              .reduce((sum, row) => sum + toAmountNumber(row.payment_amount), 0);
            const vatAmount =
              explicitVatAmount > 0
                ? explicitVatAmount
                : paymentTotal - Math.round(paymentTotal / 1.1);
            const materialAmount = Math.round(paymentTotal * 0.15);
            const partsAmount = partsByWorkName.get(workName) ?? 0;
            const baseAmount = Math.max(
              0,
              paymentTotal - vatAmount - materialAmount - partsAmount
            );
            const supportRate = partnerCompany === "상동점" ? 0.15 : 0.1;
            const expectedSupportAmount = Math.round(baseAmount * supportRate);

            return {
              id: workOrder.id,
              workName,
              releaseDate: normalizeText(workOrder.release_date),
              partnerCompany,
              carNumber: normalizeText(workOrder.car_number),
              carModel: normalizeText(workOrder.car_model),
              status,
              paymentTotal,
              vatAmount,
              materialAmount,
              partsAmount,
              baseAmount,
              supportRate,
              expectedSupportAmount,
              supportAmount: support?.amount ?? 0,
              supportDate: support?.date ?? "",
              isSupportEntered,
            } satisfies SupportRow;
          })
          .filter((row): row is SupportRow => Boolean(row))
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
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, selectedPartner, supportFilter, selectedMonth, selectedYear]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set([
        currentYear,
        ...rows.map((row) => row.releaseDate.slice(0, 4)).filter(Boolean),
      ])
    ).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const partnerOptions = useMemo(() => {
    return Array.from(new Set(rows.map((row) => row.partnerCompany))).sort((a, b) =>
      a.localeCompare(b, "ko")
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return rows
      .filter((row) => {
        if (supportFilter === "entered") return row.isSupportEntered;
        if (supportFilter === "pending") return !row.isSupportEntered;
        return true;
      })
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
          row.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [rows, searchText, selectedPartner, supportFilter]);

  const summary = useMemo(() => {
    const pendingRows = rows.filter((row) => !row.isSupportEntered);
    const enteredRows = rows.filter((row) => row.isSupportEntered);

    return {
      totalCount: rows.length,
      pendingCount: pendingRows.length,
      enteredCount: enteredRows.length,
      expectedAmount: pendingRows.reduce((sum, row) => sum + row.expectedSupportAmount, 0),
      enteredAmount: enteredRows.reduce((sum, row) => sum + row.supportAmount, 0),
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

      if (row.isSupportEntered) {
        current.enteredCount += 1;
      } else {
        current.pendingCount += 1;
        current.expectedAmount += row.expectedSupportAmount;
      }

      map.set(row.partnerCompany, current);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
      return a.partnerCompany.localeCompare(b.partnerCompany, "ko");
    });
  }, [rows]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedRows = filteredRows.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">입고지원관리</h3>
        <p className="text-sm text-slate-700">
          입금 전 미결 차량도 포함하고, 완결 후 입고지원 지출이 입력되면 집계에서 제외합니다.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <SummaryCard label="집계대상" value={`${summary.totalCount.toLocaleString()}건`} tone="slate" />
        <SummaryCard label="입력대기" value={`${summary.pendingCount.toLocaleString()}건`} tone="red" />
        <SummaryCard label="지출입력" value={`${summary.enteredCount.toLocaleString()}건`} tone="green" />
        <SummaryCard label="예상금액" value={`${formatWon(summary.expectedAmount)}원`} tone="blue" />
        <SummaryCard label="입력금액" value={`${formatWon(summary.enteredAmount)}원`} tone="violet" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                입력 {summaryRow.enteredCount}건 / 예상 {formatWon(summaryRow.expectedAmount)}원
              </div>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-300 px-2 py-2">상태</th>
                <th className="border border-slate-300 px-2 py-2">출고일</th>
                <th className="border border-slate-300 px-2 py-2">거래처</th>
                <th className="border border-slate-300 px-2 py-2">작명</th>
                <th className="border border-slate-300 px-2 py-2">차량번호</th>
                <th className="border border-slate-300 px-2 py-2">차량명</th>
                <th className="border border-slate-300 px-2 py-2 text-right">입금총액</th>
                <th className="border border-slate-300 px-2 py-2 text-right">부가세</th>
                <th className="border border-slate-300 px-2 py-2 text-right">총액15% 차감</th>
                <th className="border border-slate-300 px-2 py-2 text-right">부품대</th>
                <th className="border border-slate-300 px-2 py-2 text-right">기준금액</th>
                <th className="border border-slate-300 px-2 py-2 text-right">예상지원</th>
                <th className="border border-slate-300 px-2 py-2 text-right">입력금액</th>
                <th className="border border-slate-300 px-2 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="border border-slate-300 px-3 py-8 text-center text-slate-500">
                    조회 중입니다.
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="border border-slate-300 px-3 py-8 text-center text-slate-500">
                    표시할 입고지원 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={`${row.workName}-${row.id}`} className="hover:bg-blue-50">
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
                    <td className="border border-slate-300 px-2 py-2">{row.releaseDate || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2 font-semibold">{row.partnerCompany}</td>
                    <td className="border border-slate-300 px-2 py-2 font-semibold text-blue-700">{row.workName}</td>
                    <td className="border border-slate-300 px-2 py-2">{row.carNumber || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2">{row.carModel || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.paymentTotal)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.vatAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.materialAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.partsAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right">{formatWon(row.baseAmount)}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-bold text-blue-700">
                      {formatWon(row.expectedSupportAmount)}
                      <span className="ml-1 text-xs text-slate-500">
                        {Math.round(row.supportRate * 100)}%
                      </span>
                    </td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-semibold">
                      {row.isSupportEntered ? formatWon(row.supportAmount) : "-"}
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
