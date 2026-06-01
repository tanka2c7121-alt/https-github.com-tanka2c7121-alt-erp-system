"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  category: "보험매출" | "일반매출" | "카드매출" | "BLUE포인트";
  paymentInfo: string;
  amount: number;
};

const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);
const bankNames = ["국민은행", "부산은행"];

const formatWon = (amount: number) => amount.toLocaleString();

export default function SalesDashboardPage({
  onSelectMenu,
}: SalesDashboardPageProps) {
  const [rows, setRows] = useState<RevenueItem[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [isLoading, setIsLoading] = useState(false);

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

  const totals = useMemo(() => {
    const result = {
      total: 0,
      insurance: 0,
      general: 0,
      card: 0,
      blue: 0,
    };

    rows.forEach((row) => {
      result.total += row.amount;

      if (row.category === "보험매출") result.insurance += row.amount;
      if (row.category === "일반매출") result.general += row.amount;
      if (row.category === "카드매출") result.card += row.amount;
      if (row.category === "BLUE포인트") result.blue += row.amount;
    });

    return result;
  }, [rows]);

  const partnerTop = useMemo(() => {
    const partnerMap = new Map<string, number>();

    rows.forEach((row) => {
      if (!row.partnerCompany) return;
      partnerMap.set(
        row.partnerCompany,
        (partnerMap.get(row.partnerCompany) ?? 0) + row.amount
      );
    });

    return Array.from(partnerMap.entries())
      .map(([partnerCompany, amount]) => ({ partnerCompany, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }, [rows]);

  const recentRows = rows.slice(0, 10);
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
      label: "일반매출",
      amount: totals.general,
      color: "bg-emerald-600",
      menuId: "sales-general",
    },
    {
      label: "카드매출",
      amount: totals.card,
      color: "bg-violet-600",
      menuId: "sales-card",
    },
    {
      label: "BLUE포인트",
      amount: totals.blue,
      color: "bg-sky-500",
      menuId: "sales-blue",
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
            onClick={() => void loadRows()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            새로고침
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            출력
          </button>
        </div>
      </div>

      <section className="no-print grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <button
          type="button"
          className="rounded-xl border border-slate-200 bg-slate-900 p-4 text-left text-white shadow-sm hover:bg-slate-800"
          onClick={() => openMenu("sales", "매출현황")}
        >
          <p className="text-sm font-semibold text-slate-300">총매출</p>
          <p className="mt-2 text-2xl font-bold">{formatWon(totals.total)}원</p>
          <p className="mt-2 text-xs text-slate-300">{rows.length}건</p>
        </button>

        <MetricCard
          title="보험매출"
          amount={totals.insurance}
          tone="blue"
          onClick={() => openMenu("sales-insurance", "보험매출")}
        />
        <MetricCard
          title="일반매출"
          amount={totals.general}
          tone="green"
          onClick={() => openMenu("sales-general", "일반매출")}
        />
        <MetricCard
          title="카드매출"
          amount={totals.card}
          tone="violet"
          onClick={() => openMenu("sales-card", "카드매출")}
        />
        <MetricCard
          title="BLUE포인트"
          amount={totals.blue}
          tone="sky"
          onClick={() => openMenu("sales-blue", "BLUE포인트")}
        />
      </section>

      <section className="no-print grid grid-cols-1 gap-4 xl:grid-cols-[1.3fr_1fr]">
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

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between">
            <h4 className="font-bold text-slate-900">거래처 TOP 5</h4>
            <button
              type="button"
              onClick={() => openMenu("sales-partner", "거래처매출")}
              className="text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              자세히
            </button>
          </div>

          <div className="space-y-2">
            {partnerTop.map((item, index) => (
              <div
                key={item.partnerCompany}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">
                    {index + 1}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {item.partnerCompany}
                  </span>
                </div>
                <span className="font-bold text-blue-700">
                  {formatWon(item.amount)}원
                </span>
              </div>
            ))}
            {partnerTop.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                거래처 매출이 없습니다.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="no-print rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="mb-4 font-bold text-slate-900">최근 입금 내역</h4>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="border px-2 py-2">입금일</th>
                <th className="border px-2 py-2">작명</th>
                <th className="border px-2 py-2">차량번호</th>
                <th className="border px-2 py-2">구분</th>
                <th className="border px-2 py-2">입금정보</th>
                <th className="border px-2 py-2 text-right">금액</th>
              </tr>
            </thead>
            <tbody>
              {recentRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border px-2 py-2 text-center">{row.date}</td>
                  <td className="border px-2 py-2 text-center font-semibold">
                    {row.workName}
                  </td>
                  <td className="border px-2 py-2 text-center">{row.carNumber}</td>
                  <td className="border px-2 py-2 text-center">{row.category}</td>
                  <td className="border px-2 py-2 text-center">{row.paymentInfo}</td>
                  <td className="border px-2 py-2 text-right font-bold">
                    {formatWon(row.amount)}
                  </td>
                </tr>
              ))}
              {recentRows.length === 0 && (
                <tr>
                  <td className="border px-3 py-8 text-center text-slate-500" colSpan={6}>
                    조회된 입금 내역이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="print-only mx-auto bg-white text-black">
        <div className="mx-auto min-h-[275mm] w-[190mm] p-[7mm]">
          <div className="mb-5 text-center">
            <h1 className="text-2xl font-bold">매출현황 요약</h1>
            <p className="mt-2 text-sm">
              조회기간: {selectedYear}년{" "}
              {selectedMonth ? `${Number(selectedMonth)}월` : "전체"}
            </p>
          </div>

          <table className="mb-5 w-full border-collapse text-sm">
            <tbody>
              <PrintSummaryRow label="총매출" value={totals.total} />
              <PrintSummaryRow label="보험매출" value={totals.insurance} />
              <PrintSummaryRow label="일반매출" value={totals.general} />
              <PrintSummaryRow label="카드매출" value={totals.card} />
              <PrintSummaryRow label="BLUE포인트" value={totals.blue} />
            </tbody>
          </table>

          <h2 className="mb-2 text-base font-bold">거래처 TOP 5</h2>
          <table className="w-full border-collapse text-xs">
            <thead className="bg-slate-100">
              <tr>
                <th className="border border-slate-400 px-2 py-1">순위</th>
                <th className="border border-slate-400 px-2 py-1">거래처</th>
                <th className="border border-slate-400 px-2 py-1">매출</th>
              </tr>
            </thead>
            <tbody>
              {partnerTop.map((item, index) => (
                <tr key={`print-${item.partnerCompany}`}>
                  <td className="border border-slate-400 px-2 py-1 text-center">
                    {index + 1}
                  </td>
                  <td className="border border-slate-400 px-2 py-1">
                    {item.partnerCompany}
                  </td>
                  <td className="border border-slate-400 px-2 py-1 text-right">
                    {formatWon(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
  tone: "blue" | "green" | "violet" | "sky";
  onClick: () => void;
}) {
  const toneClass = {
    blue: "text-blue-700 bg-blue-50 border-blue-100",
    green: "text-emerald-700 bg-emerald-50 border-emerald-100",
    violet: "text-violet-700 bg-violet-50 border-violet-100",
    sky: "text-sky-700 bg-sky-50 border-sky-100",
  }[tone];

  return (
    <button
      type="button"
      className={`rounded-xl border p-4 text-left shadow-sm hover:brightness-95 ${toneClass}`}
      onClick={onClick}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-2 text-xl font-bold">{formatWon(amount)}원</p>
    </button>
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

function getRevenueCategory(
  paymentRow: SettlementPaymentRow,
  work: WorkOrderRow | undefined,
  insuranceCompany: string
): RevenueItem["category"] {
  const method = paymentRow.payment_method ?? "";
  const detail = paymentRow.payment_detail ?? "";
  const type = paymentRow.payment_type ?? "";
  const text = [method, detail, type].join(" ");
  const isCard = method.includes("카드");
  const isBlue = text.includes("BLUE");
  const isBank = bankNames.some((bankName) => method.includes(bankName));
  const isInsurance =
    detail.includes("보험") ||
    work?.category === "보험" ||
    Boolean(insuranceCompany);

  if (isCard) return "카드매출";
  if (isBlue) return "BLUE포인트";
  if (isBank && isInsurance) return "보험매출";
  return "일반매출";
}
