"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { fetchAllRows } from "../../lib/fetchAllRows";
import { useRealtimeRefresh } from "../../lib/useRealtimeRefresh";

type SettlementRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_model: string | null;
  insurance_company: string | null;
  progress_status: string | null;
  claim_amount: number | null;
  claim_date: string | null;
  own_claim_amount: number | null;
  other_claim_amount: number | null;
  own_claim_date: string | null;
  other_claim_date: string | null;
};

type WorkOrderRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_model: string | null;
  category: string | null;
  coverage_type: string | null;
  insurance_company: string | null;
  other_insurance_company: string | null;
  release_date: string | null;
};

type PaymentRow = {
  id: number;
  work_name: string | null;
  payment_type: string | null;
  payment_detail: string | null;
  claim_amount: number | null;
  claim_date: string | null;
  payment_amount: number | null;
  payment_date: string | null;
};

type InsuranceListRow = {
  id: string;
  workName: string;
  carNumber: string;
  carModel: string;
  insuranceCompany: string;
  claimSide: string;
  status: "미결" | "완결" | "종결";
  claimDate: string;
  claimAmount: number;
  paidAmount: number;
  receivableAmount: number;
  collectionRate: number | null;
};

type ClaimDetail = "보험" | "캐피탈" | "일반" | "바디케어";
type ClaimTarget = {
  id: string;
  workName: string;
  carNumber: string;
  carModel: string;
  insuranceCompany: string;
  claimSide: string;
  claimDetail: ClaimDetail | null;
  status: InsuranceListRow["status"];
  claimDate: string;
  claimAmount: number;
  paidAmount: number;
};
type SortKey =
  | "workName"
  | "carNumber"
  | "carModel"
  | "insuranceCompany"
  | "claimSide"
  | "claimDate"
  | "claimAmount"
  | "paidAmount"
  | "receivableAmount"
  | "collectionRate";
type SortDirection = "asc" | "desc";
const realtimeTables = [
  { table: "work_orders" },
  { table: "repair_settlements" },
  { table: "settlement_payments" },
];


const formatWon = (amount: number) => amount.toLocaleString();
const formatRate = (rate: number | null) =>
  rate === null ? "-" : `${rate.toFixed(1)}%`;
const normalizeText = (value: unknown) => String(value ?? "").trim();
const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;
const claimDetails: ClaimDetail[] = ["보험", "캐피탈", "일반", "바디케어"];
const currentYear = new Date().getFullYear();

const normalizeStatus = (value: unknown): InsuranceListRow["status"] => {
  const text = normalizeText(value);

  if (text.includes("종결")) return "종결";
  if (text.includes("완결")) return "완결";
  return "미결";
};

const isFaultCoverage = (value: unknown) => normalizeText(value) === "과실";

const matchesPaymentSide = (detail: unknown, side: "자차" | "대물") => {
  const text = normalizeText(detail);

  if (side === "자차") return text.includes("자차");
  return text.includes("대물") || text.includes("상대");
};

const normalizeClaimDetail = (value: unknown): ClaimDetail | null => {
  const text = normalizeText(value);

  return claimDetails.find((detail) => text.includes(detail)) ?? null;
};

const inferClaimDetailFromCompany = (company: unknown): ClaimDetail | null => {
  const text = normalizeText(company);

  if (!text || text === "미지정") return null;
  if (text.includes("캐피탈")) return "캐피탈";
  return "보험";
};

const isClaimRow = (payment: PaymentRow) =>
  normalizeText(payment.payment_type) === "청구";

const isReceivablePaymentRow = (payment: PaymentRow) => {
  const paymentType = normalizeText(payment.payment_type);

  return (
    toAmountNumber(payment.payment_amount) > 0 &&
    (paymentType === "수리비" || paymentType === "부가세")
  );
};

const hasSettlementPaymentDetail = (payment: PaymentRow) =>
  Boolean(normalizeClaimDetail(payment.payment_detail));

const calculateCollectionRate = (claimAmount: number, paidAmount: number) =>
  claimAmount > 0 ? (paidAmount / claimAmount) * 100 : null;

const assignPaymentsByTarget = (
  targets: ClaimTarget[],
  payments: PaymentRow[]
) => {
  const nextTargets = targets.map((target) => ({ ...target }));

  payments
    .filter((payment) => !isClaimRow(payment))
    .filter(isReceivablePaymentRow)
    .filter(hasSettlementPaymentDetail)
    .forEach((payment) => {
      const paymentAmount = toAmountNumber(payment.payment_amount);
      const paymentDetail = normalizeClaimDetail(payment.payment_detail);
      const sideMatchedTargets = nextTargets.filter((target) =>
        target.claimSide === "자차" || target.claimSide === "대물"
          ? matchesPaymentSide(payment.payment_detail, target.claimSide)
          : false
      );
      const detailMatchedTargets = paymentDetail
        ? nextTargets.filter((target) => target.claimDetail === paymentDetail)
        : [];
      const candidates =
        sideMatchedTargets.length > 0
          ? sideMatchedTargets
          : detailMatchedTargets.length > 0
            ? detailMatchedTargets
            : nextTargets.length === 1
              ? nextTargets
              : [];

      if (candidates.length === 0) return;

      const selected = candidates.reduce((best, target) => {
        const bestGap = Math.abs(best.claimAmount - (best.paidAmount + paymentAmount));
        const targetGap = Math.abs(target.claimAmount - (target.paidAmount + paymentAmount));

        return targetGap < bestGap ? target : best;
      });

      selected.paidAmount += paymentAmount;
    });

  return nextTargets;
};

const toListRows = (targets: ClaimTarget[]) =>
  targets
    .filter(
      (item) =>
        item.insuranceCompany !== "미지정" ||
        item.claimAmount > 0 ||
        item.paidAmount > 0
    )
    .map((item) => ({
      id: item.id,
      workName: item.workName,
      carNumber: item.carNumber,
      carModel: item.carModel,
      insuranceCompany: item.insuranceCompany,
      claimSide:
        item.claimDetail && item.claimSide !== item.claimDetail
          ? `${item.claimSide} / ${item.claimDetail}`
          : item.claimSide,
      status: item.status,
      claimDate: item.claimDate,
      claimAmount: item.claimAmount,
      paidAmount: item.paidAmount,
      receivableAmount: Math.max(0, item.claimAmount - item.paidAmount),
      collectionRate: calculateCollectionRate(item.claimAmount, item.paidAmount),
    }));

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

  const fetchRows = useCallback(async () => {
    setLoadError("");

    const [
      { data: settlements, error: settlementError },
      { data: works, error: workError },
      { data: payments, error: paymentError },
    ] = await Promise.all([
      fetchAllRows<SettlementRow>(
        "repair_settlements",
        [
          "id",
          "work_name",
          "car_number",
          "car_model",
          "insurance_company",
          "progress_status",
          "claim_amount",
          "claim_date",
          "own_claim_amount",
          "other_claim_amount",
          "own_claim_date",
          "other_claim_date",
        ].join(", "),
        (query) => query.order("id", { ascending: false })
      ),
      fetchAllRows<WorkOrderRow>(
        "work_orders",
        "id, work_name, car_number, car_model, category, coverage_type, insurance_company, other_insurance_company, release_date"
      ),
      fetchAllRows<PaymentRow>(
        "settlement_payments",
        "id, work_name, payment_type, payment_detail, claim_amount, claim_date, payment_amount, payment_date",
        (query) => query.order("id", { ascending: true })
      ),
    ]);

    if (settlementError) {
      setLoadError("정산 조회 실패: " + settlementError.message);
      return;
    }

    if (workError) {
      setLoadError("작업정보 조회 실패: " + workError.message);
      return;
    }

    if (paymentError) {
      setLoadError("입금 조회 실패: " + paymentError.message);
      return;
    }

    const settlementByWorkName = new Map(
      (settlements ?? [])
        .map((row) => [normalizeText(row.work_name), row] as const)
        .filter(([workName]) => Boolean(workName))
    );
    const mergedRows = (works ?? [])
      .filter((work) => normalizeText(work.release_date))
      .map((work) => {
        const workName = normalizeText(work.work_name);
        const settlement = settlementByWorkName.get(workName);

        return {
          id: settlement?.id ?? work.id,
          work_name: workName,
          car_number: settlement?.car_number ?? work.car_number ?? "",
          car_model: settlement?.car_model ?? work.car_model ?? "",
          insurance_company:
            settlement?.insurance_company ?? work.insurance_company ?? "",
          progress_status: settlement?.progress_status ?? "미결",
          claim_amount: settlement?.claim_amount ?? 0,
          claim_date: settlement?.claim_date ?? "",
          own_claim_amount: settlement?.own_claim_amount ?? 0,
          other_claim_amount: settlement?.other_claim_amount ?? 0,
          own_claim_date: settlement?.own_claim_date ?? "",
          other_claim_date: settlement?.other_claim_date ?? "",
        };
      });

    setSettlementRows(mergedRows);
    setWorkOrderRows(works ?? []);
    setPaymentRows(payments ?? []);
  }, []);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  useRealtimeRefresh({
    channelName: "pending-insurance-list-page",
    tables: realtimeTables,
    onRefresh: fetchRows,
  });

  const workOrderByName = useMemo(() => {
    return new Map(
      workOrderRows
        .map((row) => [normalizeText(row.work_name), row] as const)
        .filter(([workName]) => Boolean(workName))
    );
  }, [workOrderRows]);

  const paymentRowsByWork = useMemo(() => {
    return paymentRows.reduce<Map<string, PaymentRow[]>>((map, row) => {
      const workName = normalizeText(row.work_name);

      if (!workName) return map;

      const rows = map.get(workName) ?? [];
      rows.push(row);
      map.set(workName, rows);
      return map;
    }, new Map<string, PaymentRow[]>());
  }, [paymentRows]);

  const listRows = useMemo(() => {
    const seenWorkNames = new Set<string>();

    return settlementRows
      .filter((row) => {
        const workName = normalizeText(row.work_name);

        if (!workName || seenWorkNames.has(workName)) {
          return false;
        }

        seenWorkNames.add(workName);
        return true;
      })
      .flatMap((row): InsuranceListRow[] => {
        const workName = normalizeText(row.work_name);
        const workOrder = workOrderByName.get(workName);

        if (!workOrder || !normalizeText(workOrder.release_date)) {
          return [];
        }

        const workPayments = paymentRowsByWork.get(workName) ?? [];
        const status = normalizeStatus(row.progress_status);
        const totalClaimAmount = toAmountNumber(row.claim_amount);
        const claimRows = workPayments.filter(isClaimRow);
        const baseRow = {
          workName,
          carNumber: normalizeText(row.car_number),
          carModel: normalizeText(row.car_model),
          status,
        };

        if (isFaultCoverage(workOrder?.coverage_type)) {
          const ownCompany =
            normalizeText(workOrder?.insurance_company) ||
            normalizeText(row.insurance_company) ||
            "미지정";
          const otherCompany =
            normalizeText(workOrder?.other_insurance_company) || "미지정";
          const detailClaimRows = claimRows.filter((payment) =>
            normalizeClaimDetail(payment.payment_detail)
          );
          const ownClaimRow = detailClaimRows[0];
          const otherClaimRow = detailClaimRows[1];
          const ownClaimAmount = toAmountNumber(row.own_claim_amount);
          const otherClaimAmount = toAmountNumber(row.other_claim_amount);
          const targets = [
            {
              ...baseRow,
              id: `${row.id}-own`,
              insuranceCompany: ownCompany,
              claimSide: "자차",
              claimDetail:
                normalizeClaimDetail(ownClaimRow?.payment_detail) ||
                inferClaimDetailFromCompany(ownCompany),
              claimDate:
                normalizeText(row.own_claim_date) ||
                normalizeText(ownClaimRow?.claim_date) ||
                normalizeText(row.claim_date),
              claimAmount:
                ownClaimAmount || toAmountNumber(ownClaimRow?.claim_amount),
              paidAmount: 0,
            },
            {
              ...baseRow,
              id: `${row.id}-other`,
              insuranceCompany: otherCompany,
              claimSide: "대물",
              claimDetail:
                normalizeClaimDetail(otherClaimRow?.payment_detail) ||
                inferClaimDetailFromCompany(otherCompany),
              claimDate:
                normalizeText(row.other_claim_date) ||
                normalizeText(otherClaimRow?.claim_date) ||
                normalizeText(row.claim_date),
              claimAmount:
                otherClaimAmount || toAmountNumber(otherClaimRow?.claim_amount),
              paidAmount: 0,
            },
          ];

          return toListRows(
            assignPaymentsByTarget(targets, workPayments)
          );
        }

        const detailListTargets = claimRows
          .reduce<Map<ClaimDetail, ClaimTarget>>((map, payment) => {
            const detail = normalizeClaimDetail(payment.payment_detail);

            if (!detail) return map;

            const current = map.get(detail) ?? {
              ...baseRow,
              id: `${row.id}-${detail}`,
              insuranceCompany: normalizeText(row.insurance_company) || "미지정",
              claimSide: detail,
              claimDetail: detail,
              claimDate: normalizeText(payment.claim_date),
              claimAmount: 0,
              paidAmount: 0,
            };

            current.claimAmount += toAmountNumber(payment.claim_amount);

            const claimDate = normalizeText(payment.claim_date);

            if (claimDate && (!current.claimDate || claimDate < current.claimDate)) {
              current.claimDate = claimDate;
            }

            map.set(detail, current);
            return map;
          }, new Map<ClaimDetail, ClaimTarget>());

        if (detailListTargets.size > 0) {
          return toListRows(
            assignPaymentsByTarget(
              Array.from(detailListTargets.values()),
              workPayments
            )
          );
        }

        return toListRows(
          assignPaymentsByTarget(
            [
              {
                ...baseRow,
                id: String(row.id),
                insuranceCompany: normalizeText(row.insurance_company) || "미지정",
                claimSide: "-",
                claimDetail: inferClaimDetailFromCompany(row.insurance_company),
                claimDate: normalizeText(row.claim_date),
                claimAmount: totalClaimAmount,
                paidAmount: 0,
              },
            ],
            workPayments
          )
        );
      });
  }, [paymentRowsByWork, settlementRows, workOrderByName]);

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

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return listRows
      .filter((row) => {
        if (insuranceFilter && row.insuranceCompany !== insuranceFilter) return false;

        if (row.status !== "미결") return false;
        if (!row.claimAmount && !row.claimDate) return false;

        if (selectedYear && row.claimDate.slice(0, 4) !== selectedYear) return false;
        if (selectedMonth && row.claimDate.slice(5, 7) !== selectedMonth) return false;
        if (startDate && (!row.claimDate || row.claimDate < startDate)) return false;
        if (endDate && (!row.claimDate || row.claimDate > endDate)) return false;

        if (!keyword) return true;

        return [
          row.workName,
          row.carNumber,
          row.carModel,
          row.insuranceCompany,
          row.claimSide,
          row.claimDate,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [
    endDate,
    insuranceFilter,
    listRows,
    searchText,
    selectedMonth,
    selectedYear,
    startDate,
  ]);

  const sortedRows = useMemo(() => {
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...filteredRows].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * direction;
      }

      const primaryCompare =
        String(aValue ?? "").localeCompare(String(bValue ?? ""), "ko") * direction;

      if (primaryCompare !== 0) return primaryCompare;
      return String(b.claimDate).localeCompare(String(a.claimDate));
    });
  }, [filteredRows, sortDirection, sortKey]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection("asc");
  };

  const summary = useMemo(() => {
    const managementCount = new Set(sortedRows.map((row) => row.workName)).size;
    const claimAmount = sortedRows.reduce((sum, row) => sum + row.claimAmount, 0);
    const paidAmount = sortedRows.reduce((sum, row) => sum + row.paidAmount, 0);
    const receivableAmount = sortedRows.reduce(
      (sum, row) => sum + row.receivableAmount,
      0
    );
    const collectionRate = calculateCollectionRate(claimAmount, paidAmount);

    return {
      count: managementCount,
      claimAmount,
      paidAmount,
      receivableAmount,
      collectionRate,
    };
  }, [sortedRows]);

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
                <tr
                  key={`${row.id}-${row.workName}-${row.insuranceCompany}-${row.claimSide}-${index}`}
                  className="hover:bg-blue-50"
                >
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
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
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
