"use client";

import { useCallback, useEffect, useState } from "react";
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

type RiskView = "pending" | "longPending" | "lowClaimRate";

type PaymentSummary = {
  repairVatPaidAmount: number;
  hasReceivable: boolean;
};

type RiskRow = {
  workName: string;
  company: string;
  status: string;
  claimDate: string;
  elapsedDays: number | null;
  claimAmount: number;
  paidAmount: number;
  shortageAmount: number;
  claimRate: number | null;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizeStatus = (value: unknown) => {
  const text = normalizeText(value);

  if (text.includes("완결")) return "완결";
  if (text.includes("미결")) return "미결";
  return text || "미결";
};

const isEmptyDateValue = (value: unknown) => {
  const text = normalizeText(value).toLowerCase();

  return !text || text === "null" || text === "undefined" || text === "0000-00-00";
};

const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;

const dateDiffDays = (fromDate: unknown, toDate = localDateText()) => {
  const fromText = normalizeText(fromDate);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromText)) {
    return null;
  }

  const fromTime = new Date(`${fromText}T00:00:00`).getTime();
  const toTime = new Date(`${toDate}T00:00:00`).getTime();

  return Math.max(0, Math.floor((toTime - fromTime) / 86400000));
};

export default function PendingSettlementPage({
  onSelectMenu,
}: {
  onSelectMenu: (menu: MenuItem) => void;
}) {
  const [paymentRows, setPaymentRows] = useState<any[]>([]);
  const [settlementRows, setSettlementRows] = useState<any[]>([]);
  const [activeRiskView, setActiveRiskView] = useState<RiskView>("pending");
  const [sourceCounts, setSourceCounts] = useState({
    settlements: 0,
    payments: 0,
  });
  const [loadError, setLoadError] = useState("");

  const fetchPaymentRows = useCallback(async () => {
    setLoadError("");

    const { data, error } = await fetchAllRows<any>(
      "settlement_payments",
      "id, work_name, payment_type, payment_amount, payment_date",
      (query) => query.order("id", { ascending: true })
    );

    if (error) {
      setLoadError("입금내역 조회 실패: " + error.message);
      return;
    }

    setPaymentRows(data ?? []);
    setSourceCounts((prev) => ({
      ...prev,
      payments: data?.length ?? 0,
    }));
  }, []);

  const fetchRiskRows = useCallback(async () => {
    setLoadError("");

    const { data: settlementData, error } = await fetchAllRows<any>(
      "repair_settlements",
      "id, work_name, insurance_company, progress_status, claim_amount, claim_date",
      (query) => query.order("id", { ascending: false })
    );

    if (error) {
      setLoadError("미결관리 조회 실패: " + error.message);
      return;
    }

    setSourceCounts((prev) => ({
      ...prev,
      settlements: settlementData?.length ?? 0,
    }));

    const seenWorkNames = new Set<string>();
    const uniqueRows = (settlementData ?? []).filter((row) => {
      const workName = normalizeText(row.work_name);

      if (!workName || seenWorkNames.has(workName)) {
        return false;
      }

      seenWorkNames.add(workName);
      return true;
    });

    setSettlementRows(uniqueRows);
  }, []);

  useEffect(() => {
    void fetchPaymentRows();
    void fetchRiskRows();
  }, [fetchPaymentRows, fetchRiskRows]);

  const paymentSummaryByWork = paymentRows.reduce<Map<string, PaymentSummary>>(
    (map, row) => {
      const workName = normalizeText(row.work_name);

      if (!workName) {
        return map;
      }

      const current = map.get(workName) ?? {
        repairVatPaidAmount: 0,
        hasReceivable: false,
      };

      if (["수리비", "부가세"].includes(normalizeText(row.payment_type))) {
        current.repairVatPaidAmount += toAmountNumber(row.payment_amount);
      }

      if (
        toAmountNumber(row.payment_amount) > 0 &&
        isEmptyDateValue(row.payment_date)
      ) {
        current.hasReceivable = true;
      }

      map.set(workName, current);
      return map;
    },
    new Map<string, PaymentSummary>()
  );

  const riskRows = settlementRows
    .map((row): RiskRow => {
      const workName = normalizeText(row.work_name);
      const paymentSummary = paymentSummaryByWork.get(workName);
      const claimAmount = toAmountNumber(row.claim_amount);
      const paidAmount = paymentSummary?.repairVatPaidAmount ?? 0;
      const claimDate = normalizeText(row.claim_date);
      const elapsedDays = dateDiffDays(claimDate);
      const claimRate = claimAmount > 0 ? (paidAmount / claimAmount) * 100 : null;
      const status = normalizeStatus(row.progress_status);

      return {
        workName,
        company: normalizeText(row.insurance_company),
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

  const pendingRows = riskRows.filter((row) => {
    const paymentSummary = paymentSummaryByWork.get(row.workName);

    return row.status === "미결" && !paymentSummary?.hasReceivable;
  });
  const longPendingRows = pendingRows.filter(
    (row) =>
      row.claimAmount > 0 &&
      !isEmptyDateValue(row.claimDate) &&
      (row.elapsedDays ?? 0) > 30
  );
  const lowClaimRateRows = riskRows.filter(
    (row) =>
      row.status === "완결" &&
      row.claimAmount > 0 &&
      (row.claimRate ?? 0) < 95
  );

  const activeRows =
    activeRiskView === "pending"
      ? pendingRows
      : activeRiskView === "longPending"
        ? longPendingRows
        : lowClaimRateRows;

  const activeTitle =
    activeRiskView === "pending"
      ? "미결건"
      : activeRiskView === "longPending"
        ? "장기미결건"
        : "청구율 95% 미만";

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">미결관리</h3>
        <p className="text-sm text-slate-600">
          미결, 장기미결, 청구율 95% 미만 차량을 따로 확인합니다.
        </p>
        <p className="mt-1 text-xs font-semibold text-slate-500">
          원본: 차량정산 {sourceCounts.settlements.toLocaleString()}건 / 입금{" "}
          {sourceCounts.payments.toLocaleString()}건
        </p>
        {loadError && (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {loadError}
          </p>
        )}
      </div>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <RiskCard
          title="미결건"
          count={pendingRows.length}
          amount={pendingRows.reduce((sum, row) => sum + row.shortageAmount, 0)}
          tone="orange"
          active={activeRiskView === "pending"}
          onClick={() => setActiveRiskView("pending")}
        />
        <RiskCard
          title="장기미결건"
          count={longPendingRows.length}
          amount={longPendingRows.reduce((sum, row) => sum + row.shortageAmount, 0)}
          tone="red"
          active={activeRiskView === "longPending"}
          onClick={() => setActiveRiskView("longPending")}
        />
        <RiskCard
          title="청구율 95% 미만"
          count={lowClaimRateRows.length}
          amount={lowClaimRateRows.reduce((sum, row) => sum + row.shortageAmount, 0)}
          tone="blue"
          active={activeRiskView === "lowClaimRate"}
          onClick={() => setActiveRiskView("lowClaimRate")}
        />
      </section>

      <RiskTable
        title={activeTitle}
        rows={activeRows}
        onEdit={(workName) =>
          onSelectMenu({
            id: "factory-settlement-repair-register",
            title: "정산등록",
            data: { workName },
          })
        }
      />
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
  rows: RiskRow[];
  onEdit: (workName: string) => void;
}) {
  return (
    <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h4 className="font-bold text-slate-900">{title} 목록</h4>
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
            rows.map((row, index) => (
              <tr key={`${row.workName}-${index}`} className="hover:bg-slate-50">
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
    </section>
  );
}
