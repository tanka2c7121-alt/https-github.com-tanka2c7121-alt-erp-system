"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

type SalesDashboardPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

type SettlementPaymentRow = {
  id: number;
  work_name: string | null;
  payment_type: string | null;
  payment_detail: string | null;
  payment_amount: number | null;
  payment_date: string | null;
  payment_method: string | null;
};

type WorkOrderRow = {
  work_name: string;
  car_number: string | null;
  car_model: string | null;
  category: string | null;
  insurance_company: string | null;
  other_insurance_company: string | null;
  partner_company: string | null;
};

type RevenueItem = {
  id: number;
  date: string;
  workName: string;
  carNumber: string;
  carModel: string;
  partnerCompany: string;
  insuranceCompany: string;
  category: "보험매출" | "캐피탈매출" | "일반매출";
  paymentInfo: string;
  amount: number;
};

const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);

const formatWon = (amount: number) => amount.toLocaleString();

export default function SalesDashboardPage({
  onSelectMenu,
}: SalesDashboardPageProps) {
  const [rows, setRows] = useState<RevenueItem[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [isLoading, setIsLoading] = useState(false);
  const [printPortalRoot, setPrintPortalRoot] = useState<HTMLElement | null>(null);

  const loadRows = useCallback(async () => {
    setIsLoading(true);

    const startDate = selectedMonth
      ? `${selectedYear}-${selectedMonth}-01`
      : `${selectedYear}-01-01`;
    const endDate = selectedMonth
      ? `${selectedYear}-${selectedMonth}-${String(
          new Date(Number(selectedYear), Number(selectedMonth), 0).getDate()
        ).padStart(2, "0")}`
      : `${selectedYear}-12-31`;

    const { data: paymentData, error: paymentError } = await supabase
      .from("settlement_payments")
      .select(
        "id,work_name,payment_type,payment_detail,payment_amount,payment_date,payment_method"
      )
      .not("payment_date", "is", null)
      .gte("payment_date", startDate)
      .lte("payment_date", endDate)
      .order("payment_date", { ascending: false })
      .order("id", { ascending: false });

    if (paymentError) {
      setIsLoading(false);
      alert("매출현황 조회 실패: " + paymentError.message);
      return;
    }

    const paymentRows = ((paymentData ?? []) as SettlementPaymentRow[]).filter(
      (row) => Number(row.payment_amount ?? 0) > 0
    );
    const workNames = Array.from(
      new Set(
        paymentRows
          .map((row) => row.work_name)
          .filter((workName): workName is string => Boolean(workName))
      )
    );
    let workMap = new Map<string, WorkOrderRow>();

    if (workNames.length > 0) {
      const { data: workData, error: workError } = await supabase
        .from("work_orders")
        .select(
          "work_name,car_number,car_model,category,insurance_company,other_insurance_company,partner_company"
        )
        .in("work_name", workNames);

      if (workError) {
        setIsLoading(false);
        alert("차량정보 조회 실패: " + workError.message);
        return;
      }

      workMap = new Map(
        ((workData ?? []) as WorkOrderRow[]).map((work) => [
          work.work_name,
          work,
        ])
      );
    }

    setRows(
      paymentRows.map((paymentRow) => {
        const workName = paymentRow.work_name ?? "";
        const work = workMap.get(workName);
        const insuranceCompany =
          work?.insurance_company ?? work?.other_insurance_company ?? "";

        return {
          id: paymentRow.id,
          date: paymentRow.payment_date ?? "",
          workName,
          carNumber: work?.car_number ?? "",
          carModel: work?.car_model ?? "",
          partnerCompany: work?.partner_company ?? "",
          insuranceCompany,
          category: getRevenueCategory(paymentRow, work, insuranceCompany),
          paymentInfo: paymentRow.payment_method ?? "",
          amount: Number(paymentRow.payment_amount ?? 0),
        };
      })
    );
    setIsLoading(false);
  }, [selectedMonth, selectedYear]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    const root = document.createElement("div");
    root.className = "sales-print-portal";
    document.body.appendChild(root);
    setPrintPortalRoot(root);

    return () => {
      root.remove();
    };
  }, []);

  const totals = useMemo(() => {
    const result = {
      total: 0,
      insurance: 0,
      capital: 0,
      general: 0,
    };

    rows.forEach((row) => {
      result.total += row.amount;

      if (row.category === "보험매출") result.insurance += row.amount;
      if (row.category === "캐피탈매출") result.capital += row.amount;
      if (row.category === "일반매출") result.general += row.amount;
    });

    return result;
  }, [rows]);

  const insuranceChartRows = useMemo(
    () =>
      groupRevenueRows(
        rows.filter((row) => row.category === "보험매출"),
        (row) => row.insuranceCompany || "보험사 미입력"
      ),
    [rows]
  );
  const capitalChartRows = useMemo(
    () =>
      groupRevenueRows(
        rows.filter((row) => row.category === "캐피탈매출"),
        (row) => row.partnerCompany || row.insuranceCompany || "캐피탈 미입력"
      ),
    [rows]
  );
  const yearOptions = useMemo(() => {
    const baseYear = Number(currentYear);
    return Array.from({ length: 5 }, (_, index) => String(baseYear - 2 + index))
      .sort((a, b) => b.localeCompare(a));
  }, []);

  const composition = [
    {
      label: "보험매출",
      amount: totals.insurance,
      color: "bg-blue-600",
      menuId: "sales-insurance",
    },
    {
      label: "캐피탈매출",
      amount: totals.capital,
      color: "bg-amber-600",
      menuId: "sales-capital",
    },
    {
      label: "일반매출",
      amount: totals.general,
      color: "bg-emerald-600",
      menuId: "sales-general",
    },
  ];

  const openMenu = (id: string, title: string) => {
    onSelectMenu({ id, title });
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="no-print flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-xl font-bold md:text-2xl">매출현황</h3>
          <p className="text-sm text-slate-700">
            입금일 기준 매출을 한눈에 확인하는 종합 화면입니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
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

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            출력
          </button>
        </div>
      </div>

      <section className="no-print grid grid-cols-4 gap-1.5 md:grid-cols-2 md:gap-3 xl:grid-cols-4">
        <button
          type="button"
          className="flex min-h-16 min-w-0 flex-col justify-between rounded-lg border border-slate-200 bg-slate-900 px-1.5 py-2 text-center text-white shadow-sm hover:bg-slate-800 md:min-h-28 md:rounded-xl md:p-4 md:text-left"
          onClick={() => openMenu("sales", "매출현황")}
        >
          <p className="min-w-0 truncate text-[10px] font-semibold leading-tight text-slate-300 md:text-sm">총매출</p>
          <p className="min-w-0 truncate text-[11px] font-bold leading-none md:mt-2 md:text-2xl">{formatWon(totals.total)}원</p>
          <p className="hidden text-xs text-slate-300 md:mt-2 md:block">{rows.length}건</p>
        </button>

        <MetricCard
          title="보험매출"
          amount={totals.insurance}
          tone="blue"
          onClick={() => openMenu("sales-insurance", "보험매출")}
        />
        <MetricCard
          title="캐피탈매출"
          amount={totals.capital}
          tone="amber"
          onClick={() => openMenu("sales-capital", "캐피탈매출")}
        />
        <MetricCard
          title="일반매출"
          amount={totals.general}
          tone="green"
          onClick={() => openMenu("sales-general", "일반매출")}
        />
      </section>

      <section className="no-print">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-bold text-slate-900">매출 구성</h4>
            <span className="text-sm text-slate-500">
              {isLoading ? "조회 중" : `${rows.length.toLocaleString()}건`}
            </span>
          </div>

          <div className="space-y-4">
            {composition.map((item) => {
              const ratio =
                totals.total > 0 ? Math.round((item.amount / totals.total) * 100) : 0;

              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => openMenu(item.menuId, item.label)}
                  className="block w-full rounded-lg border border-slate-100 p-3 text-left hover:bg-slate-50"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-800">{item.label}</span>
                    <span className="text-sm font-bold text-slate-900">
                      {formatWon(item.amount)}원
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full ${item.color}`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  <div className="mt-1 text-right text-xs text-slate-500">
                    {ratio}%
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="no-print grid grid-cols-1 gap-4 xl:grid-cols-2">
        <RevenueGroupChart
          title="보험사별 입금내역"
          rows={insuranceChartRows}
          total={totals.insurance}
          tone="blue"
        />
        <RevenueGroupChart
          title="캐피탈별 입금내역"
          rows={capitalChartRows}
          total={totals.capital}
          tone="amber"
        />
      </section>

      {printPortalRoot
        ? createPortal(
            <section className="print-only sales-print-sheet mx-auto bg-white text-black">
        <div className="mx-auto min-h-[283mm] w-[196mm] px-[3mm] pb-[4mm] pt-[2mm]">
          <div className="mb-2 text-center">
            <h1 className="text-2xl font-bold">매출현황 요약</h1>
            <p className="mt-1 text-xs">
              조회기간: {selectedYear}년{" "}
              {selectedMonth ? `${Number(selectedMonth)}월` : "전체"}
            </p>
          </div>

          <table className="mb-3 w-full border-collapse text-sm">
            <tbody>
              <PrintSummaryRow label="총매출" value={totals.total} />
              <PrintSummaryRow label="보험매출" value={totals.insurance} />
              <PrintSummaryRow label="캐피탈매출" value={totals.capital} />
              <PrintSummaryRow label="일반매출" value={totals.general} />
            </tbody>
          </table>
        </div>
            </section>,
            printPortalRoot
          )
        : null}
    </div>
  );
}

function MetricCard({
  title,
  amount,
  tone,
  onClick,
}: {
  title: string;
  amount: number;
  tone: "blue" | "green" | "amber";
  onClick: () => void;
}) {
  const toneClass = {
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    green: "text-emerald-700 bg-emerald-50 border-emerald-100",
    amber: "text-amber-700 bg-amber-50 border-amber-100",
  }[tone];

  return (
    <button
      type="button"
      className={`flex min-h-16 min-w-0 flex-col justify-between rounded-lg border px-1.5 py-2 text-center shadow-sm hover:brightness-95 md:min-h-28 md:rounded-xl md:p-4 md:text-left ${toneClass}`}
      onClick={onClick}
    >
      <p className="min-w-0 truncate text-[10px] font-semibold leading-tight md:text-sm">{title}</p>
      <p className="min-w-0 truncate text-[11px] font-bold leading-none md:mt-2 md:text-xl">{formatWon(amount)}원</p>
    </button>
  );
}

function RevenueGroupChart({
  title,
  rows,
  total,
  tone,
}: {
  title: string;
  rows: Array<{ name: string; amount: number; count: number }>;
  total: number;
  tone: "blue" | "amber";
}) {
  const barClass = tone === "blue" ? "bg-blue-600" : "bg-amber-600";
  const softClass =
    tone === "blue"
      ? "border-blue-100 bg-blue-50 text-blue-700"
      : "border-amber-100 bg-amber-50 text-amber-700";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="font-bold text-slate-900">{title}</h4>
        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${softClass}`}>
          {formatWon(total)}원
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          조회된 입금 내역이 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const ratio = total > 0 ? Math.round((row.amount / total) * 100) : 0;

            return (
              <div key={row.name} className="rounded-lg border border-slate-100 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800">
                      {row.name}
                    </div>
                    <div className="text-xs text-slate-500">{row.count}건</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-bold text-slate-900">
                      {formatWon(row.amount)}원
                    </div>
                    <div className="text-xs text-slate-500">{ratio}%</div>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${barClass}`} style={{ width: `${ratio}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PrintSummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <tr>
      <th className="border border-slate-400 bg-slate-100 px-3 py-2 text-left">
        {label}
      </th>
      <td className="border border-slate-400 px-3 py-2 text-right font-bold">
        {formatWon(value)}원
      </td>
    </tr>
  );
}

function groupRevenueRows(
  rows: RevenueItem[],
  getName: (row: RevenueItem) => string
) {
  const groupMap = new Map<string, { name: string; amount: number; count: number }>();

  rows.forEach((row) => {
    const name = getName(row).trim() || "미입력";
    const current = groupMap.get(name) ?? { name, amount: 0, count: 0 };

    current.amount += row.amount;
    current.count += 1;
    groupMap.set(name, current);
  });

  return Array.from(groupMap.values()).sort((a, b) => b.amount - a.amount);
}

function getRevenueCategory(
  paymentRow: SettlementPaymentRow,
  work: WorkOrderRow | undefined,
  insuranceCompany: string
): RevenueItem["category"] {
  const method = paymentRow.payment_method ?? "";
  const detail = paymentRow.payment_detail ?? "";
  const type = paymentRow.payment_type ?? "";
  const text = [method, detail, type].join(" ");
  const isCapital = detail.includes("캐피탈") || text.includes("캐피탈");
  const isGeneral = detail.includes("일반");
  const isInsurance =
    detail.includes("보험") ||
    work?.category === "보험" ||
    Boolean(insuranceCompany);

  if (isCapital) return "캐피탈매출";
  if (isGeneral) return "일반매출";
  if (isInsurance) return "보험매출";
  return "일반매출";
}
