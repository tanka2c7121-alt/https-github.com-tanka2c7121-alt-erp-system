"use client";

import { fetchAllRows } from "../../lib/fetchAllRows";

export type SettlementRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_model: string | null;
  insurance_company: string | null;
  receipt_number?: string | null;
  manager_name?: string | null;
  progress_status: string | null;
  claim_amount: number | null;
  claim_date: string | null;
  own_claim_amount: number | null;
  other_claim_amount: number | null;
  own_claim_date: string | null;
  other_claim_date: string | null;
  memo?: string | null;
};

export type WorkOrderRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_model: string | null;
  category: string | null;
  coverage_type: string | null;
  insurance_company: string | null;
  other_insurance_company: string | null;
  receipt_number?: string | null;
  own_receipt_number?: string | null;
  other_receipt_number?: string | null;
  manager_name?: string | null;
  own_manager_name?: string | null;
  other_manager_name?: string | null;
  release_date: string | null;
  message?: string | null;
};

export type PaymentRow = {
  id: number;
  work_name: string | null;
  payment_type: string | null;
  payment_detail: string | null;
  claim_amount: number | null;
  claim_date: string | null;
  payment_amount: number | null;
  payment_date: string | null;
};

export type PendingInsuranceManagementRow = {
  work_name: string;
  status: string | null;
  action_memo: string | null;
  final_result: string | null;
  updated_at: string | null;
};

export type InsuranceListRow = {
  id: string;
  workName: string;
  carNumber: string;
  carModel: string;
  insuranceCompany: string;
  receiptNumber: string;
  managerName: string;
  claimSide: string;
  status: "미결" | "완결" | "종결";
  claimDate: string;
  claimAmount: number;
  paidAmount: number;
  receivableAmount: number;
  collectionRate: number | null;
  memo: string;
};

export type PendingInsuranceFilters = {
  insuranceFilter?: string;
  startDate?: string;
  endDate?: string;
  searchText?: string;
  longPendingOnly?: boolean;
};

export type PendingInsuranceSummary = {
  count: number;
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
  receiptNumber: string;
  managerName: string;
  claimSide: string;
  claimDetail: ClaimDetail | null;
  status: InsuranceListRow["status"];
  claimDate: string;
  claimAmount: number;
  paidAmount: number;
  memo: string;
};

export type SortKey =
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

export type SortDirection = "asc" | "desc";

export const realtimeTables = [
  { table: "work_orders" },
  { table: "repair_settlements" },
  { table: "settlement_payments" },
];

const claimDetails: ClaimDetail[] = ["보험", "캐피탈", "일반", "바디케어"];

export const formatWon = (amount: number) => amount.toLocaleString();

export const formatRate = (rate: number | null) =>
  rate === null ? "-" : `${rate.toFixed(1)}%`;

export const normalizeText = (value: unknown) => String(value ?? "").trim();

const toAmountNumber = (value: unknown) =>
  Number(String(value ?? 0).replaceAll(",", "")) || 0;

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

const isGeneralRepairPaymentDetail = (payment: PaymentRow) =>
  normalizeText(payment.payment_type) === "수리비" &&
  ["일반", "바디케어"].includes(normalizeText(payment.payment_detail));

const hasSettlementPaymentDetail = (payment: PaymentRow) =>
  Boolean(normalizeClaimDetail(payment.payment_detail)) ||
  isGeneralRepairPaymentDetail(payment);

export const calculateCollectionRate = (claimAmount: number, paidAmount: number) =>
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
      receiptNumber: item.receiptNumber,
      managerName: item.managerName,
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
      memo: item.memo,
    }));

export async function fetchPendingInsuranceSourceRows() {
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
        "receipt_number",
        "manager_name",
        "progress_status",
        "claim_amount",
        "claim_date",
        "own_claim_amount",
        "other_claim_amount",
        "own_claim_date",
        "other_claim_date",
        "memo",
      ].join(", "),
      (query) => query.order("id", { ascending: false })
    ),
    fetchAllRows<WorkOrderRow>(
      "work_orders",
      "id, work_name, car_number, car_model, category, coverage_type, insurance_company, other_insurance_company, receipt_number, own_receipt_number, other_receipt_number, manager_name, own_manager_name, other_manager_name, release_date, message"
    ),
    fetchAllRows<PaymentRow>(
      "settlement_payments",
      "id, work_name, payment_type, payment_detail, claim_amount, claim_date, payment_amount, payment_date",
      (query) => query.order("id", { ascending: true })
    ),
  ]);

  if (settlementError) {
    throw new Error("정산 조회 실패: " + settlementError.message);
  }

  if (workError) {
    throw new Error("작업정보 조회 실패: " + workError.message);
  }

  if (paymentError) {
    throw new Error("입금 조회 실패: " + paymentError.message);
  }

  const settlementByWorkName = new Map(
    (settlements ?? [])
      .map((row) => [normalizeText(row.work_name), row] as const)
      .filter(([workName]) => Boolean(workName))
  );
  const settlementRows = (works ?? [])
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
        receipt_number: settlement?.receipt_number ?? work.receipt_number ?? "",
        manager_name: settlement?.manager_name ?? work.manager_name ?? "",
        progress_status: settlement?.progress_status ?? "미결",
        claim_amount: settlement?.claim_amount ?? 0,
        claim_date: settlement?.claim_date ?? "",
        own_claim_amount: settlement?.own_claim_amount ?? 0,
        other_claim_amount: settlement?.other_claim_amount ?? 0,
        own_claim_date: settlement?.own_claim_date ?? "",
        other_claim_date: settlement?.other_claim_date ?? "",
        memo: settlement?.memo ?? work.message ?? "",
      };
    });

  return {
    settlementRows,
    workOrderRows: works ?? [],
    paymentRows: payments ?? [],
  };
}

export async function fetchPendingInsuranceManagementRows() {
  const { data, error } = await fetchAllRows<PendingInsuranceManagementRow>(
    "pending_insurance_management",
    "work_name, status, action_memo, final_result, updated_at"
  );

  if (error) {
    if (error.code === "42P01" || String(error.message ?? "").includes("does not exist")) {
      return {
        data: [],
        error: null,
        missingTable: true,
      };
    }

    return {
      data: [],
      error,
      missingTable: false,
    };
  }

  return {
    data,
    error: null,
    missingTable: false,
  };
}

export function buildPendingInsuranceRows({
  settlementRows,
  workOrderRows,
  paymentRows,
}: {
  settlementRows: SettlementRow[];
  workOrderRows: WorkOrderRow[];
  paymentRows: PaymentRow[];
}) {
  const workOrderByName = new Map(
    workOrderRows
      .map((row) => [normalizeText(row.work_name), row] as const)
      .filter(([workName]) => Boolean(workName))
  );
  const paymentRowsByWork = paymentRows.reduce<Map<string, PaymentRow[]>>((map, row) => {
    const workName = normalizeText(row.work_name);

    if (!workName) return map;

    const rows = map.get(workName) ?? [];
    rows.push(row);
    map.set(workName, rows);
    return map;
  }, new Map<string, PaymentRow[]>());
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
        receiptNumber: normalizeText(row.receipt_number),
        managerName: normalizeText(row.manager_name),
        memo:
          normalizeText(row.memo) ||
          normalizeText(workOrder.message),
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
            receiptNumber:
              normalizeText(workOrder?.own_receipt_number) ||
              normalizeText(workOrder?.receipt_number) ||
              normalizeText(row.receipt_number),
            managerName:
              normalizeText(workOrder?.own_manager_name) ||
              normalizeText(workOrder?.manager_name) ||
              normalizeText(row.manager_name),
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
            receiptNumber: normalizeText(workOrder?.other_receipt_number),
            managerName: normalizeText(workOrder?.other_manager_name),
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

        return toListRows(assignPaymentsByTarget(targets, workPayments));
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
          assignPaymentsByTarget(Array.from(detailListTargets.values()), workPayments)
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
}

export function filterPendingInsuranceRows(
  rows: InsuranceListRow[],
  filters: PendingInsuranceFilters
) {
  const keyword = normalizeText(filters.searchText).toLowerCase();

  return rows.filter((row) => {
    if (filters.insuranceFilter && row.insuranceCompany !== filters.insuranceFilter) {
      return false;
    }

    if (row.status !== "미결") return false;
    if (!row.claimAmount && !row.claimDate) return false;

    if (filters.longPendingOnly && !isLongPendingRow(row, localDateTextForFilter())) {
      return false;
    }
    if (filters.startDate && (!row.claimDate || row.claimDate < filters.startDate)) {
      return false;
    }
    if (filters.endDate && (!row.claimDate || row.claimDate > filters.endDate)) {
      return false;
    }

    if (!keyword) return true;

    return [
      row.workName,
      row.carNumber,
      row.carModel,
      row.insuranceCompany,
      row.receiptNumber,
      row.managerName,
      row.claimSide,
      row.claimDate,
    ]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
}

function localDateTextForFilter() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function sortPendingInsuranceRows(
  rows: InsuranceListRow[],
  sortKey: SortKey,
  sortDirection: SortDirection
) {
  const direction = sortDirection === "asc" ? 1 : -1;

  return [...rows].sort((a, b) => {
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
}

export function summarizePendingInsuranceRows(
  rows: InsuranceListRow[]
): PendingInsuranceSummary {
  const count = new Set(rows.map((row) => row.workName)).size;
  const claimAmount = rows.reduce((sum, row) => sum + row.claimAmount, 0);
  const paidAmount = rows.reduce((sum, row) => sum + row.paidAmount, 0);
  const receivableAmount = rows.reduce(
    (sum, row) => sum + row.receivableAmount,
    0
  );
  const collectionRate = calculateCollectionRate(claimAmount, paidAmount);

  return {
    count,
    claimAmount,
    paidAmount,
    receivableAmount,
    collectionRate,
  };
}

export function getDaysSinceClaim(claimDate: string, todayText: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(claimDate)) return null;

  const from = new Date(`${claimDate}T00:00:00`);
  const to = new Date(`${todayText}T00:00:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;

  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function isLongPendingRow(row: InsuranceListRow, todayText: string) {
  const days = getDaysSinceClaim(row.claimDate, todayText);

  return days !== null && days > 90;
}
