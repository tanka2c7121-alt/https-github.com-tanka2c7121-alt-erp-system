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

type ExpenseRow = {
  work_name: string | null;
  expense_amount: number | null;
  expense_date: string | null;
  expense_type: string | null;
};

type SupportRow = {
  id: number;
  workName: string;
  releaseDate: string;
  partnerCompany: string;
  carNumber: string;
  carModel: string;
  category: string;
  insuranceCompany: string;
  supportAmount: number;
  supportDate: string;
  isPaid: boolean;
};

type SupportFilter = "unpaid" | "paid" | "all";

const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);
const pageSize = 30;
const supportTargetPartners = new Set([
  "SK렌터카",
  "김병진",
  "경인렌터카",
  "블루모터스",
  "상동점",
]);

const formatWon = (amount: number) => amount.toLocaleString();
const normalizeText = (value: unknown) => String(value ?? "").trim();
const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;

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
  const [supportFilter, setSupportFilter] = useState<SupportFilter>("unpaid");
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

      const workNames = Array.from(
        new Set(
          (workOrders ?? [])
            .map((row) => normalizeText(row.work_name))
            .filter(Boolean)
        )
      );

      const { data: expenseRows, error: expenseError } =
        workNames.length === 0
          ? { data: [] as ExpenseRow[], error: null }
          : await fetchAllRows<ExpenseRow>(
              "settlement_expenses",
              "work_name,expense_amount,expense_date,expense_type",
              (query) => query.in("work_name", workNames)
            );

      if (expenseError) {
        throw new Error("입고지원 지출내역 조회 실패: " + expenseError.message);
      }

      const supportByWorkName = new Map<
        string,
        { amount: number; date: string }
      >();

      (expenseRows ?? []).forEach((row) => {
        const workName = normalizeText(row.work_name);
        const expenseType = normalizeText(row.expense_type);
        const amount = toAmountNumber(row.expense_amount);

        if (!workName || expenseType !== "입고지원" || amount <= 0) {
          return;
        }

        const current = supportByWorkName.get(workName) ?? {
          amount: 0,
          date: "",
        };

        current.amount += amount;

        if (!current.date && row.expense_date) {
          current.date = row.expense_date;
        }

        supportByWorkName.set(workName, current);
      });

      setRows(
        (workOrders ?? [])
          .map((workOrder) => {
            const workName = normalizeText(workOrder.work_name);
            const partnerCompany = normalizeText(workOrder.partner_company);

            if (
              !workName ||
              !partnerCompany ||
              !supportTargetPartners.has(partnerCompany)
            ) {
              return null;
            }

            const support = supportByWorkName.get(workName);

            return {
              id: workOrder.id,
              workName,
              releaseDate: normalizeText(workOrder.release_date),
              partnerCompany,
              carNumber: normalizeText(workOrder.car_number),
              carModel: normalizeText(workOrder.car_model),
              category: normalizeText(workOrder.category),
              insuranceCompany: normalizeText(workOrder.insurance_company),
              supportAmount: support?.amount ?? 0,
              supportDate: support?.date ?? "",
              isPaid: Boolean(support && support.amount > 0),
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
        if (supportFilter === "paid") return row.isPaid;
        if (supportFilter === "unpaid") return !row.isPaid;
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
          row.category,
          row.insuranceCompany,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [rows, searchText, selectedPartner, supportFilter]);

  const summary = useMemo(() => {
    const paidRows = rows.filter((row) => row.isPaid);
    const unpaidRows = rows.filter((row) => !row.isPaid);

    return {
      totalCount: rows.length,
      paidCount: paidRows.length,
      unpaidCount: unpaidRows.length,
      paidAmount: paidRows.reduce((sum, row) => sum + row.supportAmount, 0),
    };
  }, [rows]);

  const partnerSummaryRows = useMemo(() => {
    const map = new Map<
      string,
      { partnerCompany: string; totalCount: number; paidCount: number; unpaidCount: number; paidAmount: number }
    >();

    rows.forEach((row) => {
      const current =
        map.get(row.partnerCompany) ??
        {
          partnerCompany: row.partnerCompany,
          totalCount: 0,
          paidCount: 0,
          unpaidCount: 0,
          paidAmount: 0,
        };

      current.totalCount += 1;

      if (row.isPaid) {
        current.paidCount += 1;
        current.paidAmount += row.supportAmount;
      } else {
        current.unpaidCount += 1;
      }

      map.set(row.partnerCompany, current);
    });

    return Array.from(map.values()).sort((a, b) => {
      if (b.unpaidCount !== a.unpaidCount) return b.unpaidCount - a.unpaidCount;
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
          출고월 기준으로 거래처 입고지원 지급 여부를 확인합니다.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard label="대상" value={`${summary.totalCount.toLocaleString()}건`} tone="slate" />
        <SummaryCard label="미지급" value={`${summary.unpaidCount.toLocaleString()}건`} tone="red" />
        <SummaryCard label="지급완료" value={`${summary.paidCount.toLocaleString()}건`} tone="green" />
        <SummaryCard label="지급금액" value={`${formatWon(summary.paidAmount)}원`} tone="blue" />
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
              <option value="unpaid">미지급</option>
              <option value="paid">지급완료</option>
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
                  미지급 {summaryRow.unpaidCount}건
                </span>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-500">
                지급 {summaryRow.paidCount}건 / 지급금액 {formatWon(summaryRow.paidAmount)}원
              </div>
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-300 px-2 py-2">상태</th>
                <th className="border border-slate-300 px-2 py-2">출고일</th>
                <th className="border border-slate-300 px-2 py-2">거래처</th>
                <th className="border border-slate-300 px-2 py-2">작명</th>
                <th className="border border-slate-300 px-2 py-2">차량번호</th>
                <th className="border border-slate-300 px-2 py-2">차량명</th>
                <th className="border border-slate-300 px-2 py-2">구분</th>
                <th className="border border-slate-300 px-2 py-2 text-right">입고지원</th>
                <th className="border border-slate-300 px-2 py-2">지급일</th>
                <th className="border border-slate-300 px-2 py-2">관리</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="border border-slate-300 px-3 py-8 text-center text-slate-500">
                    조회 중입니다.
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="border border-slate-300 px-3 py-8 text-center text-slate-500">
                    표시할 입고지원 데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={`${row.workName}-${row.id}`} className="hover:bg-blue-50">
                    <td className="border border-slate-300 px-2 py-2 text-center">
                      <span
                        className={
                          row.isPaid
                            ? "rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700"
                            : "rounded-full bg-red-100 px-2 py-1 text-xs font-bold text-red-700"
                        }
                      >
                        {row.isPaid ? "지급완료" : "미지급"}
                      </span>
                    </td>
                    <td className="border border-slate-300 px-2 py-2">{row.releaseDate || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2 font-semibold">{row.partnerCompany}</td>
                    <td className="border border-slate-300 px-2 py-2 font-semibold text-blue-700">{row.workName}</td>
                    <td className="border border-slate-300 px-2 py-2">{row.carNumber || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2">{row.carModel || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2 text-center">{row.category || "-"}</td>
                    <td className="border border-slate-300 px-2 py-2 text-right font-semibold">
                      {row.isPaid ? `${formatWon(row.supportAmount)}원` : "-"}
                    </td>
                    <td className="border border-slate-300 px-2 py-2">{row.supportDate || "-"}</td>
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
  tone: "slate" | "red" | "green" | "blue";
}) {
  const toneClass = {
    slate: "border-slate-200 bg-white text-slate-700",
    red: "border-red-200 bg-red-50 text-red-700",
    green: "border-green-200 bg-green-50 text-green-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
