"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { MenuItem } from "../../data/menuData";

type SettlementCompletePrintPageProps = {
  workName?: string;
  onSelectMenu: (menu: MenuItem) => void;
};

type PaymentRow = {
  id: number;
  payment_type?: string | null;
  payment_detail?: string | null;
  claim_amount?: number | string | null;
  payment_amount?: number | string | null;
  payment_date?: string | null;
  payment_method?: string | null;
  invoice_issued?: boolean | null;
  claim_date?: string | null;
  payment_status?: string | null;
};

type ExpenseRow = {
  id: number;
  expense_amount?: number | string | null;
  expense_date?: string | null;
  expense_type?: string | null;
};

type SettlementSummaryRow = {
  key: string;
  label: string;
  claimAmount: number;
  paymentAmount: number;
  paymentRate: string;
  daysText: string;
  status: string;
  statusClassName: string;
};

const baseCellClass = "border border-slate-400 px-2 py-1.5 align-middle";
const headCellClass = `${baseCellClass} bg-slate-100 text-center font-bold text-slate-800`;
const bodyCellClass = `${baseCellClass} text-center text-slate-900`;

const formatAmount = (value?: number | string | null) =>
  Number(value ?? 0).toLocaleString();

const toAmount = (value?: number | string | null) => Number(value ?? 0) || 0;

const displayValue = (value?: string | number | null) => {
  const text = String(value ?? "").trim();
  return text || "-";
};

const formatDateOnly = (value?: string | null) => {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, 10) : "";
};

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getDaysBetween = (from?: string | null, to?: string | null) => {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return null;
  const dayMs = 1000 * 60 * 60 * 24;
  return Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / dayMs));
};

const getStatusInfo = (days: number | null) => {
  if (days === null) {
    return {
      text: "정상",
      className: "bg-emerald-100 text-emerald-800",
    };
  }

  if (days <= 7) {
    return {
      text: "정상",
      className: "bg-emerald-100 text-emerald-800",
    };
  }

  if (days <= 14) {
    return {
      text: "주의",
      className: "bg-amber-100 text-amber-800",
    };
  }

  if (days <= 30) {
    return {
      text: "지연",
      className: "bg-orange-100 text-orange-800",
    };
  }

  return {
    text: "장기 미수",
    className: "bg-red-100 text-red-800",
  };
};

const getRowType = (row: PaymentRow) => {
  const type = String(row.payment_type ?? "").trim();
  if (type && type !== "청구") return type;
  return "수리비";
};

export default function SettlementCompletePrintPage({
  workName,
  onSelectMenu,
}: SettlementCompletePrintPageProps) {
  const [inputWorkName, setInputWorkName] = useState(workName ?? "");
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [settlement, setSettlement] = useState<any>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(false);

  const paymentRows = useMemo(
    () => payments.filter((row) => toAmount(row.payment_amount) > 0 || row.payment_date),
    [payments]
  );

  const claimRows = useMemo(
    () => payments.filter((row) => toAmount(row.claim_amount) > 0 || row.claim_date),
    [payments]
  );

  const paymentTotal = useMemo(
    () => paymentRows.reduce((sum, row) => sum + toAmount(row.payment_amount), 0),
    [paymentRows]
  );

  const expenseTotal = useMemo(
    () => expenses.reduce((sum, row) => sum + toAmount(row.expense_amount), 0),
    [expenses]
  );

  const claimTotal = useMemo(() => {
    const rowTotal = claimRows.reduce((sum, row) => sum + toAmount(row.claim_amount), 0);
    return rowTotal || toAmount(settlement?.claim_amount);
  }, [claimRows, settlement]);

  const firstClaimDate = useMemo(() => {
    const dates = [
      settlement?.claim_date,
      settlement?.own_claim_date,
      settlement?.other_claim_date,
      ...claimRows.map((row) => row.claim_date),
    ].filter(Boolean) as string[];

    return dates.sort()[0] ?? "";
  }, [claimRows, settlement]);

  const summaryRows = useMemo<SettlementSummaryRow[]>(() => {
    const typeSet = new Set<string>();
    paymentRows.forEach((row) => typeSet.add(getRowType(row)));

    return Array.from(typeSet).map((type) => {
      const typePayments = paymentRows.filter((row) => getRowType(row) === type);
      const typeClaims = claimRows.filter((row) => getRowType(row) === type);

      const claimAmount =
        type === "수리비"
          ? typePayments.reduce((sum, row) => sum + toAmount(row.claim_amount), 0) ||
            typeClaims.reduce((sum, row) => sum + toAmount(row.claim_amount), 0) ||
            toAmount(settlement?.claim_amount)
          : typePayments.reduce((sum, row) => sum + toAmount(row.claim_amount), 0) ||
            typeClaims.reduce((sum, row) => sum + toAmount(row.claim_amount), 0);
      const paymentAmount = typePayments.reduce(
        (sum, row) => sum + toAmount(row.payment_amount),
        0
      );
      const claimDate =
        typeClaims
          .map((row) => row.claim_date)
          .filter(Boolean)
          .sort()[0] ??
        (type === "수리비" ? firstClaimDate : "");
      const paymentDate =
        typePayments
        .map((row) => row.payment_date)
        .filter(Boolean)
        .sort()
        .at(-1) ?? new Date().toISOString().slice(0, 10);
      const days = getDaysBetween(claimDate, paymentDate);
      const status = getStatusInfo(days);

      return {
        key: type,
        label: type,
        claimAmount,
        paymentAmount,
        paymentRate: claimAmount ? `${Math.round((paymentAmount / claimAmount) * 100)}%` : "-",
        daysText: days === null ? "-" : `${days}일`,
        status: status.text,
        statusClassName: status.className,
      };
    });
  }, [claimRows, firstClaimDate, paymentRows, settlement]);

  const loadData = async (targetWorkName = inputWorkName) => {
    if (!targetWorkName) {
      alert("작명을 입력하세요.");
      return;
    }

    setLoading(true);

    const [{ data: work }, { data: settlementData }, { data: paymentData }, { data: expenseData }] =
      await Promise.all([
        supabase.from("work_orders").select("*").eq("work_name", targetWorkName).maybeSingle(),
        supabase.from("repair_settlements").select("*").eq("work_name", targetWorkName).maybeSingle(),
        supabase.from("settlement_payments").select("*").eq("work_name", targetWorkName).order("id", { ascending: true }),
        supabase.from("settlement_expenses").select("*").eq("work_name", targetWorkName).order("id", { ascending: true }),
      ]);

    setWorkOrder(work);
    setSettlement(settlementData);
    setPayments(paymentData ?? []);
    setExpenses(expenseData ?? []);
    setLoading(false);

    if (!work && !settlementData) {
      alert("정산 정보를 찾을 수 없습니다.");
    }
  };

  useEffect(() => {
    if (!workName) return;
    setInputWorkName(workName);
    void loadData(workName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workName]);

  const netTotal = paymentTotal - expenseTotal;
  const completedDate = formatDateOnly(settlement?.completed_at);
  const completedByName = String(
    settlement?.completed_by_name ?? settlement?.completed_by ?? ""
  ).trim();

  return (
    <div className="space-y-4 text-slate-900">
      <div className="no-print flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <button
          type="button"
          onClick={() =>
            onSelectMenu({
              id: "factory-settlement-repair-register",
              title: "정산등록",
              data: { workName: inputWorkName },
            })
          }
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          뒤로가기
        </button>
        <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-sm font-semibold text-slate-700">작명</label>
          <input
            className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={inputWorkName}
            onChange={(event) => setInputWorkName(event.target.value)}
            placeholder="2026-06-001"
          />
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          불러오기
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          출력
        </button>
        </div>
      </div>

      <section className="settlement-complete-print relative mx-auto max-w-5xl bg-white p-8 shadow print-area">
        <div className="settlement-complete-stamp pointer-events-none absolute right-10 top-12 z-10 flex h-24 w-36 rotate-[-12deg] flex-col items-center justify-center border-8 border-red-600 text-red-600 opacity-75">
          <div className="text-3xl font-black leading-none">완결</div>
          {(completedDate || completedByName) && (
            <div className="mt-1 text-center text-[10px] font-black leading-tight text-blue-700">
              <div>{completedDate}</div>
              <div>{completedByName}</div>
            </div>
          )}
        </div>

        <div className="mb-5 text-center">
          <h1 className="text-3xl font-black">차량정산</h1>
          <p className="mt-1 text-xs text-slate-500">{loading ? "불러오는 중" : inputWorkName}</p>
        </div>

        <section className="mb-4">
          <div className="grid grid-cols-3 border-l border-t border-slate-400 text-sm">
            <Info label="작명" value={inputWorkName} className="col-span-3" />
            <Info label="차량번호" value={workOrder?.car_number ?? settlement?.car_number} className="col-span-3" />
            <Info label="차량명" value={workOrder?.car_model ?? settlement?.car_model} className="col-span-3" />
            <Info label="구분" value={workOrder?.category ?? settlement?.category} />
            <Info label="담보" value={workOrder?.coverage_type ?? settlement?.coverage_type} />
            <Info label="보험사" value={workOrder?.insurance_company ?? settlement?.insurance_company} />
            <Info label="접수번호" value={workOrder?.receipt_number ?? settlement?.receipt_number} />
            <Info label="담당자" value={workOrder?.manager_name ?? settlement?.manager_name} />
            <Info label="담당자 연락처" value="" />
            <Info label="출고일" value={workOrder?.release_date ?? ""} />
            <Info label="청구일" value={firstClaimDate} />
            <Info label="청구금액" value={`${formatAmount(claimTotal)}원`} />
          </div>
        </section>

        <PrintSection title="입금내역">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={headCellClass}>입금일</th>
                <th className={headCellClass}>입금금액</th>
                <th className={headCellClass}>입금구분</th>
                <th className={headCellClass}>입금상세</th>
                <th className={headCellClass}>입금방법</th>
                <th className={headCellClass}>계산서</th>
              </tr>
            </thead>
            <tbody>
              {withBlankRows(paymentRows, 1).map((row, index) => (
                <tr key={row?.id ?? `payment-empty-${index}`}>
                  <td className={bodyCellClass}>{displayValue(row?.payment_date)}</td>
                  <td className={`${bodyCellClass} text-right`}>
                    {row ? formatAmount(row.payment_amount) : "-"}
                  </td>
                  <td className={bodyCellClass}>{displayValue(row?.payment_type)}</td>
                  <td className={bodyCellClass}>{displayValue(row?.payment_detail)}</td>
                  <td className={bodyCellClass}>{displayValue(row?.payment_method)}</td>
                  <td className={bodyCellClass}>
                    {row?.invoice_issued ? displayValue(row.claim_date ?? "발행") : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>

        <PrintSection title="지출내역">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={headCellClass}>지출일</th>
                <th className={headCellClass}>지출금액</th>
                <th className={headCellClass}>지출내역</th>
              </tr>
            </thead>
            <tbody>
              {withBlankRows(expenses, 1).map((row, index) => (
                <tr key={row?.id ?? `expense-empty-${index}`}>
                  <td className={bodyCellClass}>{displayValue(row?.expense_date)}</td>
                  <td className={`${bodyCellClass} text-right`}>
                    {row ? formatAmount(row.expense_amount) : "-"}
                  </td>
                  <td className={bodyCellClass}>{displayValue(row?.expense_type)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>

        <PrintSection title="결산내역">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={headCellClass}>구분</th>
                <th className={headCellClass}>청구금액</th>
                <th className={headCellClass}>입금금액</th>
                <th className={headCellClass}>결제율</th>
                <th className={headCellClass}>소요일수</th>
                <th className={headCellClass}>상태</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.key}>
                  <td className={`${bodyCellClass} font-bold`}>{row.label}</td>
                  <td className={`${bodyCellClass} text-right`}>{formatAmount(row.claimAmount)}</td>
                  <td className={`${bodyCellClass} text-right`}>{formatAmount(row.paymentAmount)}</td>
                  <td className={`${bodyCellClass} bg-sky-50 text-center text-sky-900`}>
                    {row.paymentRate}
                  </td>
                  <td className={`${bodyCellClass} bg-violet-50 text-center text-violet-900`}>
                    {row.daysText}
                  </td>
                  <td className={`${bodyCellClass} text-center`}>
                    <span className={`inline-block min-w-16 px-2 py-1 text-xs font-bold ${row.statusClassName}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              <tr>
                <td className={`${headCellClass} py-2 text-center text-sm`}>총합계금액</td>
                <td className={`${bodyCellClass} py-2 text-right text-sm font-black`}>{formatAmount(claimTotal)}</td>
                <td className={`${bodyCellClass} py-2 text-right text-sm font-black`}>{formatAmount(paymentTotal)}</td>
                <td className={`${bodyCellClass} py-2 text-right text-sm font-black`} colSpan={3}>
                  {formatAmount(netTotal)}원 (입금금액 - 지출금액)
                </td>
              </tr>
            </tbody>
          </table>
        </PrintSection>

        <PrintSection title="비고">
          <div className="min-h-7 whitespace-pre-wrap border border-slate-400 px-3 py-2 text-xs">
            {displayValue(settlement?.memo ?? workOrder?.message)}
          </div>
        </PrintSection>
      </section>
    </div>
  );
}

function withBlankRows<T>(rows: T[], minRows: number): Array<T | null> {
  const nextRows: Array<T | null> = [...rows];
  while (nextRows.length < minRows) nextRows.push(null);
  return nextRows;
}

function Info({
  label,
  value,
  className = "",
}: {
  label: string;
  value?: string | number | null;
  className?: string;
}) {
  const leftAlignedLabels = ["작명", "차량번호", "차량명"];
  const valueAlignClass = leftAlignedLabels.includes(label)
    ? "text-left"
    : label.includes("금액")
      ? "text-right"
      : "text-center";

  return (
    <div className={`grid grid-cols-[92px_1fr] border-b border-r border-slate-400 ${className}`}>
      <div className="bg-slate-100 px-2 py-1.5 text-xs font-bold text-slate-800">{label}</div>
      <div className={`px-2 py-1.5 text-xs text-slate-900 ${valueAlignClass}`}>{displayValue(value)}</div>
    </div>
  );
}

function PrintSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-4">
      <h2 className="mb-1 text-sm font-black text-slate-900">{title}</h2>
      {children}
    </section>
  );
}
