"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { localDateText } from "../../lib/date";
import { useRealtimeRefresh } from "../../lib/useRealtimeRefresh";
import type { MenuItem } from "../../data/menuData";
import type { UserRole } from "../../types/roles";

type SettlementRegisterPageProps = {
  initialWorkName?: string;
  initialDailyCashLink?: DailyCashLink;
  user: {
    user_id: string;
    user_name: string;
    role: UserRole;
  };
  onSelectMenu: (menu: MenuItem) => void;
};

type PaymentRow = {
  id?: number;
  originalContent?: string;
  originalDate?: string;
  sourceDailyCashId?: number;
  refundRequested?: boolean;
  refundStatus?: string;
  refundReason?: string;
  paymentType: string;
  paymentDetail: string;
  claimAmount: string;
  amount: string;
  date: string;
  method: string;
  approvalNumber: string;
  merchantNumber: string;
  cardNumber: string;
  invoiceIssued: boolean;
  claimDate: string;
  paymentStatus: string;
};

type ExpenseRow = {
  amount: string;
  date: string;
  type: string;
};

type ClaimRow = {
  date: string;
  amount: string;
  detail: string;
};

type DailyCashLink = {
  dailyCashId: number;
  date: string;
  account: string;
  amount: number;
  content: string;
  memo: string;
};

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";
const smallInputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";
const labelClass = "text-sm font-semibold text-slate-800";
const realtimeTables = [
  { table: "work_orders" },
  { table: "repair_settlements" },
  { table: "settlement_payments" },
  { table: "settlement_expenses" },
  { table: "daily_cash" },
];
const getInputStateClass = (value?: string | number | null) =>
  String(value ?? "").trim()
    ? "border-blue-200 bg-blue-50"
    : "border-red-200 bg-red-50";
const getProgressStatusClass = (value?: string) => {
  if (value === "완결") {
    return "border-green-300 bg-green-100 font-bold text-green-800";
  }

  if (value === "종결") {
    return "border-slate-400 bg-slate-200 font-bold text-slate-800";
  }

  if (value === "미결") {
    return "border-orange-300 bg-orange-100 font-bold text-orange-800";
  }

  return getInputStateClass(value);
};

const emptyPaymentRow = (): PaymentRow => ({
  id: undefined,
  originalContent: undefined,
  paymentType: "",
  paymentDetail: "",
  claimAmount: "",
  amount: "",
  date: "",
  method: "",
  approvalNumber: "",
  merchantNumber: "",
  cardNumber: "",
  invoiceIssued: false,
  claimDate: "",
  paymentStatus: "청구",
});

const defaultPaymentRows = (): PaymentRow[] => {
  return [emptyPaymentRow()];
};

const normalizePaymentRowsForWorkOrder = (
  rows: PaymentRow[]
): PaymentRow[] => {
  return rows.length > 0 ? rows : defaultPaymentRows();
};

const emptyExpenseRow = (): ExpenseRow => ({
  amount: "",
  date: "",
  type: "",
});

const emptyClaimRow = (): ClaimRow => ({
  date: "",
  amount: "",
  detail: "",
});

const formatWorkName = (value: string) => {
  const numbers = value.replace(/\D/g, "").slice(0, 9);

  if (numbers.length <= 4) return numbers;
  if (numbers.length <= 6) return `${numbers.slice(0, 4)}-${numbers.slice(4)}`;
  return `${numbers.slice(0, 4)}-${numbers.slice(4, 6)}-${numbers.slice(6)}`;
};

const formatAmount = (value: string) => {
  const numbers = value.replace(/\D/g, "");
  return numbers ? Number(numbers).toLocaleString() : "";
};

const toNumber = (value: string) => Number(value.replaceAll(",", "") || 0);
const isPartnerSupportPaymentRow = (row: Pick<PaymentRow, "paymentType" | "paymentDetail">) =>
  [row.paymentType, row.paymentDetail]
    .map((value) => String(value ?? "").replace(/\s+/g, ""))
    .some((value) => value.includes("입고지원"));

const hasPaymentInputValue = (row: Partial<PaymentRow>) =>
  toNumber(row.amount ?? "") > 0 ||
  toNumber(row.claimAmount ?? "") > 0 ||
  Boolean(row.date);

const hasStoredPaymentInputValue = (item: any) =>
  Number(item.payment_amount ?? 0) > 0 ||
  Number(item.claim_amount ?? 0) > 0 ||
  Boolean(item.payment_date);

const getDailyCashEligiblePaymentRows = (rows: PaymentRow[]) =>
  rows.filter(
    (row) =>
      toNumber(row.amount) > 0 &&
      row.date &&
      row.method &&
      !isPartnerSupportPaymentRow(row)
  );

const getMissingPaymentMethodRows = (rows: PaymentRow[]) =>
  rows.filter(
    (row) =>
      toNumber(row.amount) > 0 &&
      Boolean(row.date) &&
      !row.method &&
      !isPartnerSupportPaymentRow(row)
  );

const isNewlyPaidReceivableRow = (row: PaymentRow) =>
  Boolean(row.id) && !row.originalDate && Boolean(row.date);

const requiresAdminApprovalForPastPaymentPosting = (row: PaymentRow) =>
  Boolean(row.id) && Boolean(row.date) && row.date < localDateText();

const getDailyCashContent = (
  row: PaymentRow,
  vehicleIdentifier: string
) => `${row.paymentType} / ${row.paymentDetail} / ${vehicleIdentifier}`;

const getSettlementPaymentSourceKey = (paymentId: number) =>
  `settlement_payment:${paymentId}`;

const getSettlementRefundSourceKey = (paymentId: number) =>
  `settlement_payment_refund:${paymentId}`;

const getSettlementPaymentPostingRequestKey = (paymentId: number) =>
  `settlement_payment_posting:${paymentId}`;

const cashWorkflowSetupMessage =
  "입출금 승인요청 DB 업데이트가 아직 적용되지 않았습니다. Supabase 운영 DB는 supabase_cash_control_workflow.sql, NAS DB는 nas_cash_control_workflow.sql을 먼저 실행해 주세요.";

const isCashWorkflowSetupError = (error: any) => {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");

  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("schema cache")
  );
};

const isDuplicateRequestError = (error: any) => {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "");

  return code === "23505" || message.includes("duplicate key");
};

const formatCashWorkflowError = (error: any) =>
  isCashWorkflowSetupError(error)
    ? cashWorkflowSetupMessage
    : String(error?.message ?? error ?? "알 수 없는 오류");

const omitCashWorkflowColumns = <T extends Record<string, any>>(payload: T) => {
  const legacyPayload = { ...payload };

  delete legacyPayload.source_detail_id;
  delete legacyPayload.source_key;
  delete legacyPayload.ledger_effective;
  delete legacyPayload.approval_status;
  delete legacyPayload.correction_note;

  return legacyPayload;
};

const omitSettlementRefundColumns = <T extends Record<string, any>>(payload: T) => {
  const legacyPayload = { ...payload };

  delete legacyPayload.refund_requested;
  delete legacyPayload.refund_status;
  delete legacyPayload.refund_requested_at;
  delete legacyPayload.refund_requested_by;
  delete legacyPayload.refund_requested_name;
  delete legacyPayload.refund_approved_at;
  delete legacyPayload.refund_approved_by;
  delete legacyPayload.refund_approved_name;
  delete legacyPayload.refund_daily_cash_id;
  delete legacyPayload.refund_reason;

  return legacyPayload;
};

export default function SettlementRegisterPage({
  initialWorkName,
  initialDailyCashLink,
  user,
  onSelectMenu,
}: SettlementRegisterPageProps) {
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    emptyPaymentRow(),
  ]);
  const [claimRows, setClaimRows] = useState<ClaimRow[]>([emptyClaimRow()]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([
    emptyExpenseRow(),
  ]);
  const [saving, setSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [loadedProgressStatus, setLoadedProgressStatus] = useState("미결");
  const [completionWarningAccepted, setCompletionWarningAccepted] = useState(false);
  const [closingWarningAccepted, setClosingWarningAccepted] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [dailyCashAdminUnlocked, setDailyCashAdminUnlocked] = useState(false);
  const [adminPasswordOpen, setAdminPasswordOpen] = useState(false);
  const [adminPasswordPurpose, setAdminPasswordPurpose] = useState<
    "unlock" | "serviceChargeOverride" | "dailyCashCorrection"
  >("unlock");
  const [adminPassword, setAdminPassword] = useState("");
  const saveInProgressRef = useRef(false);
  const [form, setForm] = useState({
    workName: "",
    carNumber: "",
    carModel: "",
    insuranceCompany: "",
    otherInsuranceCompany: "",
    category: "",
    coverageType: "",
    managerName: "",
    ownManagerName: "",
    otherManagerName: "",
    receiptNumber: "",
    ownReceiptNumber: "",
    otherReceiptNumber: "",
    faultRate: "",
    releaseDate: "",
    partnerCompany: "",
    totalAmount: "",
    progressStatus: "미결",
    claimAmount: "",
    claimDate: "",
    ownClaimAmount: "",
    otherClaimAmount: "",
    ownClaimDate: "",
    otherClaimDate: "",
    completedAt: "",
    completedBy: "",
    completedByName: "",
    serviceChargeOverride: false,
    memo: "",
  });

  const paymentTotal = useMemo(
    () => paymentRows.reduce((sum, row) => sum + toNumber(row.amount), 0),
    [paymentRows]
  );
  const expenseTotal = useMemo(
    () => expenseRows.reduce((sum, row) => sum + toNumber(row.amount), 0),
    [expenseRows]
  );
  const totalAmount = paymentTotal - expenseTotal;
  const canCloseSettlement = user.role === "ADMIN" || user.role === "CHIEF";
  const isCompleted = form.progressStatus === "완결";
  const isFinalized = form.progressStatus === "완결" || form.progressStatus === "종결";
  const isLocked =
    (loadedProgressStatus === "완결" || loadedProgressStatus === "종결") &&
    !adminUnlocked;
  const canEditExpenseWhileCompleted =
    loadedProgressStatus === "완결" && !adminUnlocked;
  const isExpenseLocked = isLocked && !canEditExpenseWhileCompleted;
  const progressStatusOptions =
    canCloseSettlement || form.progressStatus === "종결"
      ? ["미결", "완결", "종결"]
      : ["미결", "완결"];

  const handleChange = (key: string, value: string) => {
    if (isLocked && key !== "workName") {
      const canMoveCompletedToClosed =
        key === "progressStatus" &&
        loadedProgressStatus === "완결" &&
        value === "종결" &&
        canCloseSettlement;

      if (!canMoveCompletedToClosed) return;
    }
    setHasUnsavedChanges(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePaymentChange = (
    index: number,
    field: keyof PaymentRow,
    value: string | boolean
  ) => {
    if (isLocked) return;
    setHasUnsavedChanges(true);
    setPaymentRows((prev) =>
      prev.map((row, rowIndex) => {
        if (rowIndex !== index) return row;

        const nextRow = { ...row, [field]: value } as PaymentRow;

        if (field === "date" && value) {
          nextRow.paymentStatus = "수금";
        }

        if (field === "invoiceIssued" && value === true) {
          nextRow.paymentStatus = nextRow.date ? "수금" : "청구";
        }

        return nextRow;
      })
    );
  };

  const handleRefundRequestChange = (index: number, checked: boolean) => {
    if (isLocked) return;

    if (checked) {
      const confirmed = window.confirm("환불처리 하시겠습니까?");
      if (!confirmed) return;
    }

    setHasUnsavedChanges(true);
    setPaymentRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              refundRequested: checked,
              refundStatus: checked ? row.refundStatus || "pending" : "none",
              refundReason: checked
                ? row.refundReason ||
                  `${row.paymentType} / ${row.paymentDetail} / ${form.carNumber} 환불`
                : "",
            }
          : row
      )
    );
  };

  const handleClaimChange = (
    index: number,
    field: keyof ClaimRow,
    value: string
  ) => {
    if (isLocked) return;
    setHasUnsavedChanges(true);
    setClaimRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  const handleExpenseChange = (
    index: number,
    field: keyof ExpenseRow,
    value: string
  ) => {
    if (isExpenseLocked) return;
    setHasUnsavedChanges(true);
    setExpenseRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  const loadWorkOrder = async (
    targetWorkName = form.workName,
    options: { silent?: boolean; dailyCashLink?: DailyCashLink } = {}
  ) => {
    if (!targetWorkName) {
      alert("작명을 입력하세요.");
      return;
    }

    const { data: workOrder, error: workError } = await supabase
      .from("work_orders")
      .select("*")
      .eq("work_name", targetWorkName)
      .maybeSingle();

    if (workError || !workOrder) {
      alert("작업정보를 찾을 수 없습니다.");
      return;
    }

    const { data: settlement } = await supabase
      .from("repair_settlements")
      .select("*")
      .eq("work_name", targetWorkName)
      .maybeSingle();

    const { data: payments } = await supabase
      .from("settlement_payments")
      .select("*")
      .eq("work_name", targetWorkName)
      .order("id", { ascending: true });

    const { data: expenses } = await supabase
      .from("settlement_expenses")
      .select("*")
      .eq("work_name", targetWorkName)
      .order("id", { ascending: true });

    const paymentItems = payments ?? [];
    const storedClaimRows = paymentItems.filter(
      (item: any) =>
        item.payment_type === "청구" &&
        Number(item.payment_amount ?? 0) === 0 &&
        !item.payment_date &&
        !item.payment_method &&
        (item.claim_amount || item.claim_date || item.payment_detail)
    );
    const legacyOwnClaimRow = paymentItems.find(
      (item: any) =>
        workOrder.coverage_type === "과실" &&
        item.payment_detail === "자차" &&
        Number(item.claim_amount ?? 0) > 0 &&
        Number(item.payment_amount ?? 0) === 0 &&
        !item.payment_date &&
        !item.payment_method
    );
    const legacyOtherClaimRow = paymentItems.find(
      (item: any) =>
        workOrder.coverage_type === "과실" &&
        item.payment_detail === "대물" &&
        Number(item.claim_amount ?? 0) > 0 &&
        Number(item.payment_amount ?? 0) === 0 &&
        !item.payment_date &&
        !item.payment_method
    );
    const paymentItemsForInput = paymentItems.filter(
      (item: any) =>
        !storedClaimRows.includes(item) &&
        item !== legacyOwnClaimRow &&
        item !== legacyOtherClaimRow &&
        hasStoredPaymentInputValue(item)
    );

    setForm({
      workName: workOrder.work_name ?? "",
      carNumber: workOrder.car_number ?? "",
      carModel: workOrder.car_model ?? "",
      insuranceCompany: workOrder.insurance_company ?? "",
      otherInsuranceCompany: workOrder.other_insurance_company ?? "",
      category: workOrder.category ?? "",
      coverageType: workOrder.coverage_type ?? "",
      managerName: workOrder.manager_name ?? "",
      ownManagerName: workOrder.own_manager_name ?? "",
      otherManagerName: workOrder.other_manager_name ?? "",
      receiptNumber: workOrder.receipt_number ?? "",
      ownReceiptNumber: workOrder.own_receipt_number ?? "",
      otherReceiptNumber: workOrder.other_receipt_number ?? "",
      faultRate: workOrder.fault_rate ?? "",
      releaseDate: workOrder.release_date ?? "",
      partnerCompany: workOrder.partner_company ?? "",
      totalAmount: settlement?.total_amount?.toLocaleString() ?? "",
      progressStatus: settlement?.progress_status ?? "미결",
      claimAmount: settlement?.claim_amount?.toLocaleString() ?? "",
      claimDate: settlement?.claim_date ?? "",
      ownClaimAmount:
        settlement?.own_claim_amount?.toLocaleString() ??
        legacyOwnClaimRow?.claim_amount?.toLocaleString() ??
        "",
      otherClaimAmount:
        settlement?.other_claim_amount?.toLocaleString() ??
        legacyOtherClaimRow?.claim_amount?.toLocaleString() ??
        "",
      ownClaimDate:
        settlement?.own_claim_date ?? legacyOwnClaimRow?.claim_date ?? "",
      otherClaimDate:
        settlement?.other_claim_date ?? legacyOtherClaimRow?.claim_date ?? "",
      completedAt: settlement?.completed_at ?? "",
      completedBy: settlement?.completed_by ?? "",
      completedByName: settlement?.completed_by_name ?? "",
      serviceChargeOverride: Boolean(settlement?.service_charge_override),
      memo: workOrder.message ?? settlement?.memo ?? "",
    });

    const loadedPaymentRows =
      paymentItemsForInput.length > 0
        ? paymentItemsForInput.map((item: any) => {
            const paymentAmount = Number(item.payment_amount ?? 0);
            const claimAmount = Number(item.claim_amount ?? 0);
            return {
              paymentType: item.payment_type ?? "",
              paymentDetail: item.payment_detail ?? "",
              claimAmount: claimAmount ? claimAmount.toLocaleString() : "",
              amount: paymentAmount ? paymentAmount.toLocaleString() : "",
              date: item.payment_date ?? "",
              method: item.payment_method ?? "",
              approvalNumber: item.approval_number ?? "",
              merchantNumber: item.merchant_number ?? "",
              cardNumber: item.card_number ?? "",
              invoiceIssued: item.invoice_issued ?? false,
              claimDate: item.claim_date ?? "",
              paymentStatus: item.payment_status ?? "청구",
              id: item.id,
              refundRequested: Boolean(item.refund_requested),
              refundStatus: item.refund_status ?? "none",
              refundReason: item.refund_reason ?? "",
              originalDate: item.payment_date ?? "",
              originalContent: `${item.payment_type ?? ""} / ${
                item.payment_detail ?? ""
              } / ${workOrder.car_number ?? targetWorkName}`,
            };
          })
        : defaultPaymentRows();

    const normalizedPaymentRows = normalizePaymentRowsForWorkOrder(loadedPaymentRows);
    const dailyCashLink = options.dailyCashLink;
    const linkedPaymentRow: PaymentRow | null = dailyCashLink
      ? {
          ...emptyPaymentRow(),
          sourceDailyCashId: dailyCashLink.dailyCashId,
          originalDate: "",
          date: dailyCashLink.date,
          amount: dailyCashLink.amount ? dailyCashLink.amount.toLocaleString() : "",
          method: dailyCashLink.account,
          paymentStatus: "수금",
        }
      : null;
    const hasOnlyEmptyPaymentRow =
      normalizedPaymentRows.length === 1 &&
      !hasPaymentInputValue(normalizedPaymentRows[0]);

    setPaymentRows(
      linkedPaymentRow
        ? hasOnlyEmptyPaymentRow
          ? [linkedPaymentRow]
          : [...normalizedPaymentRows, linkedPaymentRow]
        : normalizedPaymentRows
    );

    const loadedClaimRows =
      storedClaimRows.length > 0
        ? storedClaimRows.map((item: any) => ({
            date: item.claim_date ?? "",
            amount: item.claim_amount?.toLocaleString() ?? "",
            detail: item.payment_detail ?? "",
          }))
        : workOrder.coverage_type === "과실"
          ? [
              {
                date: settlement?.own_claim_date ?? legacyOwnClaimRow?.claim_date ?? "",
                amount:
                  settlement?.own_claim_amount?.toLocaleString() ??
                  legacyOwnClaimRow?.claim_amount?.toLocaleString() ??
                  "",
                detail: "",
              },
              {
                date:
                  settlement?.other_claim_date ??
                  legacyOtherClaimRow?.claim_date ??
                  "",
                amount:
                  settlement?.other_claim_amount?.toLocaleString() ??
                  legacyOtherClaimRow?.claim_amount?.toLocaleString() ??
                  "",
                detail: "",
              },
            ]
          : [
              {
                date: settlement?.claim_date ?? "",
                amount: settlement?.claim_amount?.toLocaleString() ?? "",
                detail: "",
              },
            ];

    setClaimRows(loadedClaimRows);

    setExpenseRows(
      expenses && expenses.length > 0
        ? expenses.map((item: any) => ({
            amount: item.expense_amount?.toLocaleString() ?? "",
            date: item.expense_date ?? "",
            type: item.expense_type ?? "",
          }))
        : [emptyExpenseRow()]
    );

    const loadedStatus = settlement?.progress_status ?? "미결";
    setLoadedProgressStatus(loadedStatus);
    setCompletionWarningAccepted(false);
    setClosingWarningAccepted(false);
    setHasUnsavedChanges(Boolean(linkedPaymentRow));
    setAdminUnlocked(false);
    setDailyCashAdminUnlocked(false);
    setIsEditMode(Boolean(settlement) || paymentItems.length > 0 || Boolean(expenses?.length));
    if (!options.silent) {
      alert("불러왔습니다.");
    }
  };

  useEffect(() => {
    if (!initialWorkName) return;

    setForm((prev) => ({ ...prev, workName: initialWorkName }));
    void loadWorkOrder(initialWorkName, { dailyCashLink: initialDailyCashLink });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkName, initialDailyCashLink]);

  useRealtimeRefresh({
    channelName: `settlement-register-page-${form.workName || initialWorkName || "empty"}`,
    tables: realtimeTables,
    enabled: Boolean(
      form.workName &&
        isEditMode &&
        !hasUnsavedChanges &&
        !adminUnlocked &&
        !dailyCashAdminUnlocked &&
        !adminPasswordOpen
    ),
    onRefresh: () => loadWorkOrder(form.workName || initialWorkName, { silent: true }),
  });

  const savePaymentRows = async (targetForm = form) => {
    const inputRows = paymentRows.filter(hasPaymentInputValue);
    const savedRows: PaymentRow[] = [];
    const keptIds = new Set(
      inputRows
        .map((row) => row.id)
        .filter((id): id is number => typeof id === "number")
    );

    const { data: existingPaymentRows, error: existingPaymentError } =
      await supabase
        .from("settlement_payments")
        .select("id, payment_type, payment_amount, payment_date, payment_method")
        .eq("work_name", targetForm.workName);

    if (existingPaymentError) {
      return { error: existingPaymentError, rows: savedRows };
    }

    const removableIds = (existingPaymentRows ?? [])
      .filter((item: any) => {
        const isClaimOnly =
          item.payment_type === "청구" &&
          Number(item.payment_amount ?? 0) === 0 &&
          !item.payment_date &&
          !item.payment_method;

        return !isClaimOnly && !keptIds.has(Number(item.id));
      })
      .map((item: any) => Number(item.id))
      .filter((id) => Number.isFinite(id));

    if (removableIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("settlement_payments")
        .delete()
        .in("id", removableIds);

      if (deleteError) {
        return { error: deleteError, rows: savedRows };
      }
    }

    for (const row of inputRows) {
        const inputAmount = toNumber(row.amount);
        const claimAmount =
          toNumber(row.claimAmount) || (row.invoiceIssued ? inputAmount : 0);

        const payload = {
          work_name: targetForm.workName,
          payment_type: row.paymentType,
          payment_detail: row.paymentDetail,
          claim_amount: claimAmount,
          payment_amount: inputAmount,
          payment_date: row.date || null,
          payment_method: row.method,
          approval_number: row.approvalNumber,
          merchant_number: row.merchantNumber,
          card_number: row.cardNumber,
          invoice_issued: row.invoiceIssued,
          claim_date: row.claimDate || null,
          payment_status: row.paymentStatus,
          refund_requested: Boolean(row.refundRequested),
          refund_status: row.refundRequested ? row.refundStatus || "pending" : "none",
          refund_reason: row.refundRequested ? row.refundReason || null : null,
        };

      let saveResult = row.id
        ? await supabase
            .from("settlement_payments")
            .update(payload)
            .eq("id", row.id)
            .select("id, refund_status")
            .maybeSingle()
        : await supabase
            .from("settlement_payments")
            .insert(payload)
            .select("id, refund_status")
            .maybeSingle();

      if (saveResult.error && isCashWorkflowSetupError(saveResult.error)) {
        const legacyPayload = omitSettlementRefundColumns(payload);
        saveResult = row.id
          ? await supabase
              .from("settlement_payments")
              .update(legacyPayload)
              .eq("id", row.id)
              .select("id")
              .maybeSingle()
          : await supabase
              .from("settlement_payments")
              .insert(legacyPayload)
              .select("id")
              .maybeSingle();
      }

      if (saveResult.error) {
        return { error: saveResult.error, rows: savedRows };
      }

      savedRows.push({
        ...row,
        id: Number(saveResult.data?.id ?? row.id),
        refundStatus: saveResult.data?.refund_status ?? row.refundStatus,
      });
    }

    return { error: null, rows: savedRows };
  };

  const saveClaimRows = async (targetForm = form) => {
    const { data: existingRows, error: existingError } = await supabase
      .from("settlement_payments")
      .select("id, payment_type, payment_amount, payment_date, payment_method")
      .eq("work_name", targetForm.workName);

    if (existingError) return existingError;

    const claimOnlyIds = (existingRows ?? [])
      .filter(
        (item: any) =>
          item.payment_type === "청구" &&
          Number(item.payment_amount ?? 0) === 0 &&
          !item.payment_date &&
          !item.payment_method
      )
      .map((item: any) => Number(item.id))
      .filter((id) => Number.isFinite(id));

    if (claimOnlyIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("settlement_payments")
        .delete()
        .in("id", claimOnlyIds);

      if (deleteError) return deleteError;
    }

    const rows = claimRows
      .filter((row) => row.date || row.amount || row.detail)
      .map((row) => ({
        work_name: targetForm.workName,
        payment_type: "청구",
        payment_detail: row.detail,
        claim_amount: toNumber(row.amount),
        payment_amount: 0,
        payment_date: null,
        payment_method: "",
        approval_number: "",
        merchant_number: "",
        card_number: "",
        invoice_issued: true,
        claim_date: row.date || null,
        payment_status: "청구",
      }));

    if (rows.length === 0) return null;

    const { error } = await supabase.from("settlement_payments").insert(rows);
    return error;
  };

  const saveExpenseRows = async (targetForm = form) => {
    const rows = expenseRows
      .filter((row) => row.amount || row.date || row.type)
      .map((row) => ({
        work_name: targetForm.workName,
        expense_amount: toNumber(row.amount),
        expense_date: row.date || null,
        expense_type: row.type,
      }));

    if (rows.length === 0) return null;

    const { error } = await supabase.from("settlement_expenses").insert(rows);
    return error;
  };

  const toDailyCashPayload = (row: PaymentRow, targetForm = form) => ({
    date: row.date,
    created_on: localDateText(),
    account: row.method,
    type: "수입",
    category: "차량정산",
    content: getDailyCashContent(row, targetForm.carNumber),
    income: toNumber(row.amount),
    expense: 0,
    memo: targetForm.workName,
    source_type: "settlement_payment",
    source_work_name: targetForm.workName,
    source_detail_id: row.id ?? null,
    source_key: row.id ? getSettlementPaymentSourceKey(row.id) : null,
    ledger_effective: true,
    approval_status: "approved",
  });

  const getDailyCashContentCandidates = (row: PaymentRow, targetForm = form) =>
    [
      getDailyCashContent(row, targetForm.carNumber),
      row.originalContent,
      `${row.paymentType} / ${row.paymentDetail} / ${targetForm.workName}`,
    ].filter((value): value is string => Boolean(value));

  const findMatchingDailyCashRow = (
    existingRows: any[],
    usedExistingIds: Set<number>,
    row: PaymentRow,
    targetForm = form
  ) => {
    const candidates = new Set(getDailyCashContentCandidates(row, targetForm));

    return existingRows.find((cashRow: any) => {
      const id = Number(cashRow.id);
      if (usedExistingIds.has(id)) return false;

      if (row.sourceDailyCashId && id === row.sourceDailyCashId) return true;

      if (
        row.id &&
        String(cashRow.source_key ?? "") === getSettlementPaymentSourceKey(row.id)
      ) {
        return true;
      }

      if (isNewlyPaidReceivableRow(row)) return false;

      return candidates.has(String(cashRow.content ?? ""));
    });
  };

  const requiresDailyCashAdminApproval = async (targetForm = form) => {
    const today = localDateText();
    const { data: existingCashRows, error: existingCashError } = await supabase
      .from("daily_cash")
      .select("id, source_key, created_on, date, account, content, income, expense, memo")
      .eq("source_type", "settlement_payment")
      .eq("source_work_name", targetForm.workName)
      .eq("category", "차량정산");

    let existingRows: any[] = existingCashRows ?? [];

    if (existingCashError) {
      if (!isCashWorkflowSetupError(existingCashError)) {
        return { error: existingCashError, requiresApproval: false };
      }

      const { data: legacyRows, error: legacyError } = await supabase
        .from("daily_cash")
        .select("id, created_on, date, account, content, income, expense, memo")
        .eq("source_type", "settlement_payment")
        .eq("source_work_name", targetForm.workName)
        .eq("category", "차량정산");

      if (legacyError) {
        return { error: legacyError, requiresApproval: false };
      }

      existingRows = legacyRows ?? [];
    }

    const eligibleRows = getDailyCashEligiblePaymentRows(paymentRows);
    const usedExistingIds = new Set<number>();

    for (const row of eligibleRows) {
      const payload = toDailyCashPayload(row, targetForm);
      const matchingCashRow = findMatchingDailyCashRow(
        existingRows,
        usedExistingIds,
        row,
        targetForm
      );

      if (!matchingCashRow) continue;

      usedExistingIds.add(Number(matchingCashRow.id));

      if (matchingCashRow.created_on === today) continue;

      const willChange =
        String(matchingCashRow.date ?? "") !== payload.date ||
        String(matchingCashRow.account ?? "") !== payload.account ||
        String(matchingCashRow.content ?? "") !== payload.content ||
        Number(matchingCashRow.income ?? 0) !== payload.income ||
        Number(matchingCashRow.expense ?? 0) !== payload.expense ||
        String(matchingCashRow.memo ?? "") !== payload.memo;

      if (willChange) {
        return { error: null, requiresApproval: true };
      }
    }

    const removedStoredPaymentRows = paymentRows.filter(
      (row) =>
        row.id &&
        !getDailyCashEligiblePaymentRows([row]).length &&
        !isPartnerSupportPaymentRow(row)
    );
    const willDeleteLockedRow = removedStoredPaymentRows.some((row) => {
      const matchingCashRow = findMatchingDailyCashRow(
        existingRows,
        usedExistingIds,
        row,
        targetForm
      );

      return Boolean(matchingCashRow && matchingCashRow.created_on !== today);
    });

    return { error: null, requiresApproval: willDeleteLockedRow };
  };

  const createDailyCashCorrectionRequests = async (targetForm = form) => {
    const today = localDateText();
    const { data: existingCashRows, error: existingCashError } = await supabase
      .from("daily_cash")
      .select("id, source_key, created_on, date, account, content, income, expense, memo")
      .eq("source_type", "settlement_payment")
      .eq("source_work_name", targetForm.workName)
      .eq("category", "차량정산");

    if (existingCashError) return existingCashError;

    const existingRows = existingCashRows ?? [];
    const eligibleRows = getDailyCashEligiblePaymentRows(paymentRows);
    const usedExistingIds = new Set<number>();

    for (const row of eligibleRows) {
      const payload = toDailyCashPayload(row, targetForm);
      const matchingCashRow = findMatchingDailyCashRow(
        existingRows,
        usedExistingIds,
        row,
        targetForm
      );

      if (!matchingCashRow) continue;
      usedExistingIds.add(Number(matchingCashRow.id));

      if (matchingCashRow.created_on === today) continue;

      const updatePayload = {
        date: payload.date,
        account: payload.account,
        type: payload.type,
        category: payload.category,
        content: payload.content,
        income: payload.income,
        expense: payload.expense,
        memo: [
          payload.memo,
          "관리자 승인 정정",
          `입금금액 ${payload.income.toLocaleString()}원`,
        ].join(" / "),
        source_type: payload.source_type,
        source_work_name: payload.source_work_name,
        source_detail_id: payload.source_detail_id,
        source_key:
          payload.source_key ?? matchingCashRow.source_key ?? `daily_cash:${matchingCashRow.id}`,
        ledger_effective: true,
        approval_status: "approved",
      };

      const willChange =
        String(matchingCashRow.date ?? "") !== updatePayload.date ||
        String(matchingCashRow.account ?? "") !== updatePayload.account ||
        String(matchingCashRow.content ?? "") !== updatePayload.content ||
        Number(matchingCashRow.income ?? 0) !== updatePayload.income ||
        Number(matchingCashRow.expense ?? 0) !== updatePayload.expense ||
        String(matchingCashRow.memo ?? "") !== updatePayload.memo;

      if (!willChange) continue;

      const requestSourceKey = `daily_cash_correction:${matchingCashRow.id}`;
      const { data: existingRequest, error: existingRequestError } =
        await supabase
          .from("cash_change_requests")
          .select("id")
          .eq("source_key", requestSourceKey)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle();

      if (existingRequestError) return existingRequestError;
      if (existingRequest) continue;

      const { error } = await supabase.from("cash_change_requests").insert({
        request_type: "daily_cash_correction",
        status: "pending",
        source_type: "settlement_payment",
        source_work_name: targetForm.workName,
        source_detail_id: row.id ?? null,
        source_key: requestSourceKey,
        target_table: "daily_cash",
        target_id: Number(matchingCashRow.id),
        title: `${targetForm.workName} 일일입출금 정정 요청`,
        reason: "당일이 지난 차량정산 입금내역 수정",
        before_payload: matchingCashRow,
        requested_payload: { daily_cash: updatePayload },
        requested_by: user.user_id,
        requested_name: user.user_name,
      });

      if (error) return error;
    }

    return null;
  };

  const createReceivablePostingApprovalRequests = async (
    targetForm = form,
    targetPaymentRows = paymentRows
  ) => {
    const rows = getDailyCashEligiblePaymentRows(targetPaymentRows).filter(
      requiresAdminApprovalForPastPaymentPosting
    );
    if (rows.length === 0) return null;

    const { data: existingCashRows, error: existingCashError } = await supabase
      .from("daily_cash")
      .select("id, source_key, created_on, date, account, content, income, expense, memo")
      .eq("source_type", "settlement_payment")
      .eq("source_work_name", targetForm.workName)
      .eq("category", "차량정산");

    let existingRows: any[] = existingCashRows ?? [];

    if (existingCashError) {
      if (!isCashWorkflowSetupError(existingCashError)) return existingCashError;

      const { data: legacyRows, error: legacyError } = await supabase
        .from("daily_cash")
        .select("id, created_on, date, account, content, income, expense, memo")
        .eq("source_type", "settlement_payment")
        .eq("source_work_name", targetForm.workName)
        .eq("category", "차량정산");

      if (legacyError) return legacyError;
      existingRows = legacyRows ?? [];
    }

    const usedExistingIds = new Set<number>();

    for (const row of rows) {
      const paymentId = Number(row.id);
      if (!Number.isFinite(paymentId)) continue;

      const payload = toDailyCashPayload(row, targetForm);
      const matchingCashRow = findMatchingDailyCashRow(
        existingRows,
        usedExistingIds,
        row,
        targetForm
      );

      if (matchingCashRow) {
        usedExistingIds.add(Number(matchingCashRow.id));
        continue;
      }

      const requestSourceKey = getSettlementPaymentPostingRequestKey(paymentId);
      const { data: existingRequest, error: existingRequestError } =
        await supabase
          .from("cash_change_requests")
          .select("id")
          .eq("source_key", requestSourceKey)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle();

      if (existingRequestError) return existingRequestError;
      if (existingRequest) continue;

      const { error } = await supabase.from("cash_change_requests").insert({
        request_type: "daily_cash_posting",
        status: "pending",
        source_type: "settlement_payment",
        source_work_name: targetForm.workName,
        source_detail_id: paymentId,
        source_key: requestSourceKey,
        target_table: "daily_cash",
        target_id: null,
        title: `${targetForm.workName} ${payload.content} 입금 반영 요청`,
        reason: "미수 입금일 지연 입력으로 일일입출금 반영 승인 요청",
        before_payload: {
          payment_id: paymentId,
          payment_type: row.paymentType,
          payment_detail: row.paymentDetail,
          payment_amount: toNumber(row.amount),
          payment_date: row.date,
          payment_method: row.method,
        },
        requested_payload: {
          daily_cash: {
            ...payload,
            memo: [
              payload.memo,
              "관리자 승인 후 미수 입금 반영",
              `입금금액 ${payload.income.toLocaleString()}원`,
            ]
              .filter(Boolean)
              .join(" / "),
          },
        },
        requested_by: user.user_id,
        requested_name: user.user_name,
      });

      if (error && !isDuplicateRequestError(error)) return error;
    }

    return null;
  };

  const saveDailyCashRows = async (targetForm = form, targetPaymentRows = paymentRows) => {
    let supportsCashWorkflowColumns = true;
    const { data: existingCashRows, error: existingCashError } = await supabase
      .from("daily_cash")
      .select("id, source_key, content")
      .eq("source_type", "settlement_payment")
      .eq("source_work_name", targetForm.workName)
      .eq("category", "차량정산");

    let existingRows: any[] = existingCashRows ?? [];

    if (existingCashError) {
      if (!isCashWorkflowSetupError(existingCashError)) return existingCashError;

      supportsCashWorkflowColumns = false;
      const legacyResult = await supabase
        .from("daily_cash")
        .select("id, content")
        .eq("source_type", "settlement_payment")
        .eq("source_work_name", targetForm.workName)
        .eq("category", "차량정산");

      if (legacyResult.error) return legacyResult.error;
      existingRows = legacyResult.data ?? [];
    }

    const eligibleRows = getDailyCashEligiblePaymentRows(targetPaymentRows);
    const usedExistingIds = new Set<number>();
    const insertRows = [];

    for (const row of eligibleRows) {
      const payload = toDailyCashPayload(row, targetForm);

      if (row.sourceDailyCashId) {
        const updatePayload = {
          date: payload.date,
          account: payload.account,
          type: payload.type,
          category: payload.category,
          content: payload.content,
          income: payload.income,
          expense: payload.expense,
          memo: payload.memo,
          source_type: payload.source_type,
          source_work_name: payload.source_work_name,
          source_detail_id: payload.source_detail_id,
          source_key: payload.source_key,
          ledger_effective: payload.ledger_effective,
          approval_status: payload.approval_status,
        };

        if (supportsCashWorkflowColumns && payload.source_key) {
          const duplicateCleanup = await supabase
            .from("daily_cash")
            .delete()
            .eq("source_key", payload.source_key)
            .neq("id", row.sourceDailyCashId);

          if (
            duplicateCleanup.error &&
            !isCashWorkflowSetupError(duplicateCleanup.error)
          ) {
            return duplicateCleanup.error;
          }
        }

        const linkResult = await supabase
          .from("daily_cash")
          .update(
            supportsCashWorkflowColumns
              ? updatePayload
              : omitCashWorkflowColumns(updatePayload)
          )
          .eq("id", row.sourceDailyCashId);

        if (linkResult.error) {
          if (!supportsCashWorkflowColumns || !isCashWorkflowSetupError(linkResult.error)) {
            return linkResult.error;
          }

          supportsCashWorkflowColumns = false;
          const legacyLinkResult = await supabase
            .from("daily_cash")
            .update(omitCashWorkflowColumns(updatePayload))
            .eq("id", row.sourceDailyCashId);

          if (legacyLinkResult.error) return legacyLinkResult.error;
        }

        usedExistingIds.add(row.sourceDailyCashId);
        continue;
      }

      const matchingCashRow = findMatchingDailyCashRow(
        existingRows,
        usedExistingIds,
        row,
        targetForm
      );

      if (!matchingCashRow) {
        if (requiresAdminApprovalForPastPaymentPosting(row)) {
          continue;
        }

        if (!row.id) {
          return new Error("입금내역 저장 후 일일입출금 연동키를 만들 수 없습니다.");
        }

        if (!row.sourceDailyCashId) {
          insertRows.push(
            supportsCashWorkflowColumns ? payload : omitCashWorkflowColumns(payload)
          );
        }
        continue;
      }

      usedExistingIds.add(Number(matchingCashRow.id));
      const updatePayload = {
        date: payload.date,
        account: payload.account,
        type: payload.type,
        category: payload.category,
        content: payload.content,
        income: payload.income,
        expense: payload.expense,
        memo: payload.memo,
        source_type: payload.source_type,
        source_work_name: payload.source_work_name,
        source_detail_id: payload.source_detail_id,
        source_key: payload.source_key,
        ledger_effective: payload.ledger_effective,
        approval_status: payload.approval_status,
      };
      const { error: updateError } = await supabase
        .from("daily_cash")
        .update(
          supportsCashWorkflowColumns
            ? updatePayload
            : omitCashWorkflowColumns(updatePayload)
        )
        .eq("id", matchingCashRow.id);

      if (updateError) return updateError;
    }

    const removedStoredPaymentRows = targetPaymentRows.filter(
      (row) =>
        row.id &&
        !getDailyCashEligiblePaymentRows([row]).length &&
        !isPartnerSupportPaymentRow(row)
    );
    const deleteIds = removedStoredPaymentRows
      .map((row) => {
        const matchingCashRow = findMatchingDailyCashRow(
          existingRows,
          usedExistingIds,
          row,
          targetForm
        );

        return Number(matchingCashRow?.id);
      })
      .filter((id) => Number.isFinite(id));

    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabase
        .from("daily_cash")
        .delete()
        .in("id", deleteIds);

      if (deleteError) return deleteError;
    }

    if (insertRows.length === 0) return null;

    const { error } = await supabase.from("daily_cash").insert(insertRows);
    return error;
  };

  const createRefundApprovalRequests = async (
    targetForm = form,
    targetPaymentRows = paymentRows
  ) => {
    const refundRows = targetPaymentRows.filter(
      (row) => row.id && row.refundRequested && row.refundStatus !== "approved"
    );

    for (const row of refundRows) {
      const paymentId = Number(row.id);
      const sourceKey = getSettlementRefundSourceKey(paymentId);
      const { data: existingRequest, error: existingRequestError } =
        await supabase
          .from("cash_change_requests")
          .select("id")
          .eq("source_key", sourceKey)
          .eq("status", "pending")
          .limit(1)
          .maybeSingle();

      if (existingRequestError) return existingRequestError;
      if (existingRequest) continue;

      const refundAmount = toNumber(row.amount);
      const refundContent = getDailyCashContent(row, targetForm.carNumber);
      const refundMemo = [
        targetForm.workName,
        "환불 승인 후 일일입출금 지출 반영",
        row.refundReason,
      ]
        .filter(Boolean)
        .join(" / ");

      const { error } = await supabase.from("cash_change_requests").insert({
        request_type: "settlement_refund",
        status: "pending",
        source_type: "settlement_payment_refund",
        source_work_name: targetForm.workName,
        source_detail_id: paymentId,
        source_key: sourceKey,
        target_table: "settlement_payments",
        target_id: paymentId,
        title: `${targetForm.workName} ${refundContent} 환불 요청`,
        reason: row.refundReason || "차량정산 입금 환불 요청",
        before_payload: {
          payment_id: paymentId,
          amount: refundAmount,
          payment_date: row.date,
          payment_method: row.method,
        },
        requested_payload: {
          daily_cash: {
            date: localDateText(),
            created_on: localDateText(),
            account: row.method,
            type: "변동비",
            category: "환불",
            content: refundContent,
            income: 0,
            expense: refundAmount,
            memo: refundMemo,
            source_type: "settlement_payment_refund",
            source_work_name: targetForm.workName,
            source_detail_id: paymentId,
            source_key: sourceKey,
            ledger_effective: true,
            approval_status: "approved",
          },
        },
        requested_by: user.user_id,
        requested_name: user.user_name,
      });

      if (error && !isDuplicateRequestError(error)) return error;
    }

    return null;
  };

  const requestSettlementReopen = async () => {
    if (!form.workName) {
      alert("작명을 입력하세요.");
      return;
    }

    const confirmed = window.confirm(
      "완결/종결 정산 수정 요청을 관리자에게 보낼까요?"
    );
    if (!confirmed) return;

    const { data: existingRequest, error: existingRequestError } =
      await supabase
        .from("cash_change_requests")
        .select("id")
        .eq("request_type", "reopen_settlement")
        .eq("source_work_name", form.workName)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

    if (existingRequestError) {
      alert("수정 요청 확인 실패: " + formatCashWorkflowError(existingRequestError));
      return;
    }

    if (existingRequest) {
      alert("이미 관리자 승인 대기 중인 수정 요청이 있습니다.");
      return;
    }

    const { error } = await supabase.from("cash_change_requests").insert({
      request_type: "reopen_settlement",
      status: "pending",
      source_type: "repair_settlement",
      source_work_name: form.workName,
      source_key: `repair_settlement_reopen:${form.workName}`,
      target_table: "repair_settlements",
      title: `${form.workName} 완결/종결 정산 수정 요청`,
      reason: `${loadedProgressStatus} 상태 정산을 미결로 되돌린 뒤 수정 필요`,
      before_payload: {
        progress_status: loadedProgressStatus,
        memo: form.memo,
      },
      requested_payload: {
        progress_status: "미결",
      },
      requested_by: user.user_id,
      requested_name: user.user_name,
    });

    if (error) {
      alert("수정 요청 저장 실패: " + formatCashWorkflowError(error));
      return;
    }

    alert("관리자에게 수정 요청을 보냈습니다.");
  };

  const handleAdminUnlock = () => {
    if (user.role !== "ADMIN") {
      alert("관리자만 잠금해제할 수 있습니다.");
      return;
    }

    setAdminPassword("");
    setAdminPasswordPurpose("unlock");
    setAdminPasswordOpen(true);
  };

  const handleServiceChargeOverrideChange = (checked: boolean) => {
    if (isLocked) return;

    if (!checked) {
      setHasUnsavedChanges(true);
      setForm((prev) => ({ ...prev, serviceChargeOverride: false }));
      return;
    }

    setAdminPassword("");
    setAdminPasswordPurpose("serviceChargeOverride");
    setAdminPasswordOpen(true);
  };

  const confirmAdminUnlock = async () => {
    const password = adminPassword.trim();
    if (!password) return;

    let query = supabase
      .from("app_users")
      .select("id")
      .eq("password", password)
      .eq("role", "ADMIN")
      .eq("is_active", true);

    if (adminPasswordPurpose === "unlock") {
      query = query.eq("user_id", user.user_id);
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error || !data) {
      alert("관리자 인증에 실패했습니다.");
      return;
    }

    if (adminPasswordPurpose === "serviceChargeOverride") {
      setHasUnsavedChanges(true);
      setForm((prev) => ({ ...prev, serviceChargeOverride: true }));
      setAdminPassword("");
      setAdminPasswordOpen(false);
      alert("서비스 체크가 적용되었습니다.");
      return;
    }

    if (adminPasswordPurpose === "dailyCashCorrection") {
      setDailyCashAdminUnlocked(true);
      setAdminPassword("");
      setAdminPasswordOpen(false);
      alert("일일입출금 정정 승인이 완료되었습니다. 다시 저장하세요.");
      return;
    }

    setAdminUnlocked(true);
    setAdminPassword("");
    setAdminPasswordOpen(false);
    alert("잠금이 해제되었습니다. 저장 후 다시 잠금 상태가 됩니다.");
  };
  const handleSave = async ({
    nextProgressStatus,
    printAfterSave = false,
    skipCompleteConfirm = false,
  }: {
    nextProgressStatus?: string;
    printAfterSave?: boolean;
    skipCompleteConfirm?: boolean;
  } = {}) => {
    if (saveInProgressRef.current) {
      return;
    }

    saveInProgressRef.current = true;

    const saveForm = nextProgressStatus
      ? { ...form, progressStatus: nextProgressStatus }
      : form;

    if (!saveForm.workName) {
      alert("작명을 입력하세요.");
      saveInProgressRef.current = false;
      return;
    }

    if (isLocked && !canEditExpenseWhileCompleted) {
      alert("완결 또는 종결 처리된 정산입니다. 관리자 잠금해제 후 수정할 수 있습니다.");
      saveInProgressRef.current = false;
      return;
    }

    const isNewCompletion =
      saveForm.progressStatus === "완결" && loadedProgressStatus !== "완결";
    const isNewClosing =
      saveForm.progressStatus === "종결" && loadedProgressStatus !== "종결";

    if (isNewCompletion && !skipCompleteConfirm && !completionWarningAccepted) {
      const confirmed = window.confirm("완결로 바꾸면 되돌릴 수 없습니다.");
      if (!confirmed) {
        saveInProgressRef.current = false;
        return;
      }
    }

    if (isNewClosing && !canCloseSettlement) {
      alert("종결은 관리자와 총괄관리만 처리할 수 있습니다.");
      saveInProgressRef.current = false;
      return;
    }

    if (isNewClosing && !closingWarningAccepted) {
      const confirmed = window.confirm("종결 처리하시겠습니까?");
      if (!confirmed) {
        saveInProgressRef.current = false;
        return;
      }
    }

    const claimTotal = claimRows.reduce(
      (sum, row) => sum + toNumber(row.amount),
      0
    );
    const firstClaimDate =
      claimRows.find((row) => row.date)?.date || saveForm.claimDate || null;
    const ownClaimRow = claimRows.find((row) => row.detail === "자차");
    const otherClaimRow = claimRows.find((row) => row.detail === "대물");
    const hasDatedPaymentAmount = paymentRows.some(
      (row) => toNumber(row.amount) > 0 && Boolean(row.date)
    );
    const missingPaymentMethodRows = getMissingPaymentMethodRows(paymentRows);

    if (missingPaymentMethodRows.length > 0) {
      alert(
        "입금일과 입금금액이 있는 입금내역은 입금방법/계정을 선택해야 일일입출금에 반영됩니다."
      );
      saveInProgressRef.current = false;
      return;
    }

    const requiresChargeAndPayment = !saveForm.serviceChargeOverride;
    if (
      (saveForm.progressStatus === "완결" || saveForm.progressStatus === "종결") &&
      requiresChargeAndPayment &&
      (claimTotal <= 0 || !hasDatedPaymentAmount)
    ) {
      alert("완결/종결은 청구금액, 입금일, 입금금액이 모두 있어야 저장할 수 있습니다.");
      saveInProgressRef.current = false;
      return;
    }

    const {
      error: dailyCashApprovalCheckError,
      requiresApproval: dailyCashRequiresApproval,
    } = await requiresDailyCashAdminApproval(saveForm);

    if (dailyCashApprovalCheckError) {
      alert("일일입출금 연동 확인 실패: " + dailyCashApprovalCheckError.message);
      saveInProgressRef.current = false;
      return;
    }

    if (dailyCashRequiresApproval && !dailyCashAdminUnlocked) {
      const requestError = await createDailyCashCorrectionRequests(saveForm);
      if (requestError) {
        alert("일일입출금 정정 요청 실패: " + formatCashWorkflowError(requestError));
      } else {
        alert(
          "이미 일일입출금에 반영된 과거 입금내역은 관리자 승인 후 변경됩니다. 관리자에게 정정 요청을 보냈습니다."
        );
      }
      saveInProgressRef.current = false;
      return;
    }

    setSaving(true);

    await supabase.from("repair_settlements").delete().eq("work_name", saveForm.workName);
    await supabase.from("settlement_expenses").delete().eq("work_name", saveForm.workName);

    const completedAt =
      saveForm.progressStatus === "완결" || saveForm.progressStatus === "종결"
        ? saveForm.completedAt || localDateText()
        : null;
    const completedBy =
      saveForm.progressStatus === "완결" || saveForm.progressStatus === "종결"
        ? saveForm.completedBy || user.user_id
        : null;
    const completedByName =
      saveForm.progressStatus === "완결" || saveForm.progressStatus === "종결"
        ? saveForm.completedByName || user.user_name || user.user_id
        : null;

    const { error: settlementError } = await supabase
      .from("repair_settlements")
      .insert({
        work_name: saveForm.workName,
        car_number: saveForm.carNumber,
        car_model: saveForm.carModel,
        insurance_company: saveForm.insuranceCompany,
        category: saveForm.category,
        coverage_type: saveForm.coverageType,
        manager_name: saveForm.managerName,
        receipt_number: saveForm.receiptNumber,
        total_amount: totalAmount,
        progress_status: saveForm.progressStatus,
        claim_amount: claimTotal,
        claim_date: firstClaimDate,
        own_claim_amount: toNumber(ownClaimRow?.amount ?? ""),
        other_claim_amount: toNumber(otherClaimRow?.amount ?? ""),
        own_claim_date: ownClaimRow?.date || null,
        other_claim_date: otherClaimRow?.date || null,
        completed_at: completedAt,
        completed_by: completedBy,
        completed_by_name: completedByName,
        service_charge_override: saveForm.serviceChargeOverride,
        memo: saveForm.memo,
      });

    if (settlementError) {
      saveInProgressRef.current = false;
      setSaving(false);
      alert("정산 저장 실패: " + settlementError.message);
      return;
    }

    const { error: workOrderMemoError } = await supabase
      .from("work_orders")
      .update({ message: saveForm.memo })
      .eq("work_name", saveForm.workName);

    if (workOrderMemoError) {
      saveInProgressRef.current = false;
      setSaving(false);
      alert("전달내용 저장 실패: " + workOrderMemoError.message);
      return;
    }

    const claimError = await saveClaimRows(saveForm);
    if (claimError) {
      saveInProgressRef.current = false;
      setSaving(false);
      alert("청구정보 저장 실패: " + claimError.message);
      return;
    }

    const paymentSaveResult = await savePaymentRows(saveForm);
    if (paymentSaveResult.error) {
      saveInProgressRef.current = false;
      setSaving(false);
      alert("입금내역 저장 실패: " + paymentSaveResult.error.message);
      return;
    }

    const receivablePostingApprovalError =
      await createReceivablePostingApprovalRequests(
        saveForm,
        paymentSaveResult.rows
      );
    if (receivablePostingApprovalError) {
      saveInProgressRef.current = false;
      setSaving(false);
      alert(
        "미수 입금 반영 승인요청 저장 실패: " +
          formatCashWorkflowError(receivablePostingApprovalError)
      );
      return;
    }

    const dailyCashError = await saveDailyCashRows(saveForm, paymentSaveResult.rows);
    if (dailyCashError) {
      saveInProgressRef.current = false;
      setSaving(false);
      alert("일일입출금 연동 저장 실패: " + dailyCashError.message);
      return;
    }

    const refundApprovalError = await createRefundApprovalRequests(
      saveForm,
      paymentSaveResult.rows
    );
    if (refundApprovalError) {
      saveInProgressRef.current = false;
      setSaving(false);
      alert("환불 승인요청 저장 실패: " + formatCashWorkflowError(refundApprovalError));
      return;
    }

    const expenseError = await saveExpenseRows(saveForm);
    if (expenseError) {
      saveInProgressRef.current = false;
      setSaving(false);
      alert("지출내역 저장 실패: " + expenseError.message);
      return;
    }

    setHasUnsavedChanges(false);
    setAdminUnlocked(false);
    setDailyCashAdminUnlocked(false);
    await loadWorkOrder(saveForm.workName, { silent: true });
    setSaving(false);

    if (printAfterSave || isNewCompletion) {
      saveInProgressRef.current = false;
      onSelectMenu({
        id: "factory-settlement-complete-print",
        title: "완결출력",
        data: { workName: saveForm.workName, autoPrint: true },
      });
      return;
    }

    alert(isEditMode ? "수정되었습니다." : "저장되었습니다.");
    saveInProgressRef.current = false;
  };

  const handleProgressStatusChange = (value: string) => {
    if (loadedProgressStatus === "완결" && value === "미결" && !adminUnlocked) {
      alert("완결 처리된 정산은 미결로 되돌릴 수 없습니다.");
      return;
    }

    if (value === "종결") {
      if (!canCloseSettlement) {
        alert("종결은 관리자와 총괄관리만 처리할 수 있습니다.");
        return;
      }

      const confirmed = window.confirm("종결 처리하시겠습니까?");
      if (!confirmed) return;

      setCompletionWarningAccepted(false);
      setClosingWarningAccepted(true);
      handleChange("progressStatus", "종결");
      return;
    }

    if (value !== "완결" || loadedProgressStatus === "완결") {
      if (value !== "완결") {
        setCompletionWarningAccepted(false);
        setClosingWarningAccepted(false);
      }
      handleChange("progressStatus", value);
      return;
    }

    const confirmed = window.confirm("완결로 바꾸면 되돌릴 수 없습니다.");
    if (!confirmed) return;

    setCompletionWarningAccepted(true);
    setClosingWarningAccepted(false);
    handleChange("progressStatus", "완결");
  };

  return (
    <div className="space-y-6 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">정산등록</h3>
        <p className="text-sm text-slate-700">
          작업별 청구금액, 입금내역, 면책금, 부가세, 지출내역을 등록합니다.
        </p>
      </div>

      {isLocked && (
        <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 md:flex-row md:items-center md:justify-between">
          <span>
            {canEditExpenseWhileCompleted
              ? "완결 처리된 정산입니다. 기본정보, 청구정보, 입금내역은 잠기며 지출내역만 수정할 수 있습니다."
              : "완결 또는 종결 처리된 정산입니다. 관리자 승인 후 미결로 되돌려 수정할 수 있습니다."}
          </span>
          <button
            type="button"
            onClick={() => void requestSettlementReopen()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            수정 요청
          </button>
        </div>
      )}
      {isFinalized && adminUnlocked && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
          관리자 잠금해제 상태입니다. 저장 후 다시 잠깁니다.
        </div>
      )}
      {dailyCashAdminUnlocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          일일입출금 정정 승인 상태입니다. 저장 후 다시 잠깁니다.
        </div>
      )}

      <section className="rounded-xl border border-cyan-200 border-l-4 border-l-cyan-500 bg-cyan-50/40 p-4 shadow-sm [&>h3]:rounded-lg [&>h3]:bg-cyan-100 [&>h3]:px-3 [&>h3]:py-2 [&>h3]:text-cyan-950">
        <h3 className="mb-4 text-lg font-bold text-slate-900">기본정보</h3>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className={labelClass}>작명</label>
            <div className="mt-2 flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                placeholder="2026-05-001"
                value={form.workName}
                onChange={(event) => {
                  handleChange("workName", formatWorkName(event.target.value));
                  setIsEditMode(false);
                }}
              />
              <button
                type="button"
                onClick={() => void loadWorkOrder()}
                className="whitespace-nowrap rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                불러오기
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label="차량번호" value={form.carNumber} />
          <Field label="차량명" value={form.carModel} />
          <Field label="구분" value={form.category} />
          <Field label="담보" value={form.coverageType} />
          {form.coverageType === "과실" ? (
            <StackedField
              label="보험사"
              rows={[
                { label: "자차", value: form.insuranceCompany },
                { label: "대물", value: form.otherInsuranceCompany },
              ]}
            />
          ) : (
            <Field label="보험사" value={form.insuranceCompany} />
          )}
          {form.coverageType === "과실" ? (
            <StackedField
              label="접수번호"
              rows={[
                { label: "자차", value: form.receiptNumber || form.ownReceiptNumber },
                { label: "대물", value: form.otherReceiptNumber },
              ]}
            />
          ) : (
            <Field label="접수번호" value={form.receiptNumber} />
          )}
          {form.coverageType === "과실" ? (
            <StackedField
              label="담당자"
              rows={[
                { label: "자차", value: form.ownManagerName || form.managerName },
                { label: "대물", value: form.otherManagerName },
              ]}
            />
          ) : (
            <Field label="담당자" value={form.managerName} />
          )}
          <Field label="출고일" type="date" value={form.releaseDate} />

          <Field label="과실" value={form.faultRate} />
          <Field label="합계금액" value={totalAmount.toLocaleString()} />
          <Field
            label="진행상황"
            value={form.progressStatus}
            onChange={handleProgressStatusChange}
            options={progressStatusOptions}
            statusTone
          />
          <Field label="거래처" value={form.partnerCompany} />
        </div>
      </section>

      <section className="rounded-xl border border-violet-200 border-l-4 border-l-violet-500 bg-violet-50/40 p-4 shadow-sm [&>div:first-child>h3]:rounded-lg [&>div:first-child>h3]:bg-violet-100 [&>div:first-child>h3]:px-3 [&>div:first-child>h3]:py-2 [&>div:first-child>h3]:text-violet-950">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">청구정보</h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={form.serviceChargeOverride}
                disabled={isLocked}
                onChange={(event) =>
                  handleServiceChargeOverrideChange(event.target.checked)
                }
              />
              서비스
            </label>
            <button
              type="button"
              onClick={() => {
                setHasUnsavedChanges(true);
                setClaimRows((prev) => [...prev, emptyClaimRow()]);
              }}
              disabled={isLocked}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              추가
            </button>
            <button
              type="button"
              disabled={isLocked}
              onClick={() => {
                setHasUnsavedChanges(true);
                setClaimRows((prev) =>
                  prev.length > 1 ? prev.slice(0, -1) : [emptyClaimRow()]
                );
              }}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {claimRows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-4 rounded-xl border border-violet-100 bg-white/80 p-3 md:grid-cols-5"
            >
              <Field
                label="청구일"
                type="date"
                value={row.date}
                onChange={(value) => handleClaimChange(index, "date", value)}
              />
              <Field
                label="청구금액"
                placeholder="0"
                value={row.amount}
                onChange={(value) =>
                  handleClaimChange(index, "amount", formatAmount(value))
                }
              />
              <Field
                label="청구상세"
                value={row.detail}
                onChange={(value) => handleClaimChange(index, "detail", value)}
                options={["보험", "캐피탈", "일반", "바디케어"]}
              />
              <div className="hidden md:block" aria-hidden="true" />
              <div className="hidden md:block" aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-emerald-200 border-l-4 border-l-emerald-500 bg-emerald-50/40 p-5 shadow-sm [&>div:first-child>h3]:rounded-lg [&>div:first-child>h3]:bg-emerald-100 [&>div:first-child>h3]:px-3 [&>div:first-child>h3]:py-2 [&>div:first-child>h3]:text-emerald-950">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">입금내역</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setHasUnsavedChanges(true);
                setPaymentRows((prev) => [...prev, emptyPaymentRow()]);
              }}
              disabled={isLocked}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              추가
            </button>
            <button
              type="button"
              disabled={isLocked}
              onClick={() => {
                setHasUnsavedChanges(true);
                setPaymentRows((prev) =>
                  prev.length > 1 ? prev.slice(0, -1) : [emptyPaymentRow()]
                );
              }}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {paymentRows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-4 rounded-xl border border-emerald-100 bg-white/80 p-3 md:grid-cols-5"
            >
              <Field
                label="입금일"
                type="date"
                value={row.date}
                onChange={(value) => handlePaymentChange(index, "date", value)}
              />
              <Field
                label="입금금액"
                placeholder="0"
                value={row.amount}
                onChange={(value) =>
                  handlePaymentChange(index, "amount", formatAmount(value))
                }
              />
              <Field
                label="입금구분"
                value={row.paymentType}
                onChange={(value) =>
                  handlePaymentChange(index, "paymentType", value)
                }
                options={["수리비", "면책금", "부가세", "견적비", "보관료"]}
              />
              <Field
                label="입금상세"
                value={row.paymentDetail}
                onChange={(value) =>
                  handlePaymentChange(index, "paymentDetail", value)
                }
                options={["보험", "캐피탈", "일반", "바디케어"]}
              />
              <Field
                label="입금방법"
                value={row.method}
                onChange={(value) => handlePaymentChange(index, "method", value)}
                options={["국민은행", "부산은행", "카드", "현금", "BLUE POINT", "법인1층"]}
              />

              {row.method === "카드" && (
                <div className="md:col-span-5">
                  <CardInfoFields
                    approvalValue={row.approvalNumber}
                    merchantValue={row.merchantNumber}
                    cardValue={row.cardNumber}
                    onApprovalChange={(value) =>
                      handlePaymentChange(index, "approvalNumber", value)
                    }
                    onMerchantChange={(value) =>
                      handlePaymentChange(index, "merchantNumber", value)
                    }
                    onCardChange={(value) =>
                      handlePaymentChange(index, "cardNumber", value)
                    }
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.invoiceIssued}
                  onChange={(event) =>
                    handlePaymentChange(index, "invoiceIssued", event.target.checked)
                  }
                />
                계산서발행
              </label>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(row.refundRequested)}
                  disabled={row.refundStatus === "approved" || isLocked}
                  onChange={(event) =>
                    handleRefundRequestChange(index, event.target.checked)
                  }
                />
                환불
                {row.refundStatus === "pending" && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    승인대기
                  </span>
                )}
                {row.refundStatus === "approved" && (
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                    승인완료
                  </span>
                )}
              </label>

              {row.invoiceIssued && (
                <>
                  <Field
                    label="상태"
                    value={row.paymentStatus}
                    onChange={(value) =>
                      handlePaymentChange(index, "paymentStatus", value)
                    }
                    options={["청구", "수금"]}
                  />
                  <Field
                    label="계산서 청구일"
                    type="date"
                    value={row.claimDate}
                    onChange={(value) =>
                      handlePaymentChange(index, "claimDate", value)
                    }
                  />
                </>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50/40 p-5 shadow-sm [&>div:first-child>h3]:rounded-lg [&>div:first-child>h3]:bg-amber-100 [&>div:first-child>h3]:px-3 [&>div:first-child>h3]:py-2 [&>div:first-child>h3]:text-amber-950">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">지출내역</h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setHasUnsavedChanges(true);
                setExpenseRows((prev) => [...prev, emptyExpenseRow()]);
              }}
              disabled={isExpenseLocked}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              추가
            </button>
            <button
              type="button"
              disabled={isExpenseLocked}
              onClick={() => {
                setHasUnsavedChanges(true);
                setExpenseRows((prev) =>
                  prev.length > 1 ? prev.slice(0, -1) : [emptyExpenseRow()]
                );
              }}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              삭제
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {expenseRows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-4 rounded-xl border border-amber-100 bg-white/80 p-3 md:grid-cols-5"
            >
              <Field
                label="지출일"
                type="date"
                value={row.date}
                disabled={isExpenseLocked}
                onChange={(value) => handleExpenseChange(index, "date", value)}
              />
              <Field
                label="지출금액"
                placeholder="0"
                value={row.amount}
                disabled={isExpenseLocked}
                onChange={(value) =>
                  handleExpenseChange(index, "amount", formatAmount(value))
                }
              />
              <Field
                label="지출내역"
                value={row.type}
                disabled={isExpenseLocked}
                onChange={(value) => handleExpenseChange(index, "type", value)}
                options={["입고지원", "교통비", "견인비", "탁송비", "대차비", "기타"]}
              />
              <div className="hidden md:block" aria-hidden="true" />
              <div className="hidden md:block" aria-hidden="true" />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className={labelClass}>비고</label>
        <textarea
          className={`${getInputStateClass(form.memo)} ${inputClass} h-28 resize-none disabled:cursor-not-allowed disabled:bg-slate-100`}
          placeholder="정산 관련 메모를 입력하세요."
          value={form.memo}
          disabled={isLocked}
          readOnly={isLocked}
          onChange={(event) => handleChange("memo", event.target.value)}
        />
      </section>

      <div className="flex justify-end gap-2">
        {isCompleted && (
          <button
            type="button"
            onClick={() =>
              onSelectMenu({
                id: "factory-settlement-complete-print",
                title: "완결출력",
                data: { workName: form.workName },
              })
            }
            className="rounded-lg border border-red-300 px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
          >
            완결출력
          </button>
        )}
        {isFinalized && (
          <button
            type="button"
            onClick={() => void handleAdminUnlock()}
            className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            관리자 잠금해제
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? (isEditMode ? "수정 중" : "저장 중") : isEditMode ? "수정 후 저장" : "저장"}
        </button>
      </div>

      {adminPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-white/70 bg-white p-5 shadow-2xl">
            <h4 className="text-lg font-bold text-slate-900">
              {adminPasswordPurpose === "dailyCashCorrection"
                ? "일일입출금 정정 승인"
                : "관리자 잠금해제"}
            </h4>
            <p className="mt-1 text-sm text-slate-600">
              {adminPasswordPurpose === "dailyCashCorrection"
                ? "이미 반영된 과거 일일입출금 내역을 변경하려면 관리자 비밀번호를 입력하세요."
                : "관리자 비밀번호를 입력하세요."}
            </p>

            <input
              className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none"
              type="password"
              autoFocus
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void confirmAdminUnlock();
                }
                if (event.key === "Escape") {
                  setAdminPassword("");
                  setAdminPasswordOpen(false);
                }
              }}
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdminPassword("");
                  setAdminPasswordOpen(false);
                }}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void confirmAdminUnlock()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
  value,
  options,
  onChange,
  disabled = false,
  statusTone = false,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value?: string;
  options?: string[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  statusTone?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <label className={labelClass}>{label}</label>
      {options ? (
        <select
          className={`${statusTone ? getProgressStatusClass(value) : getInputStateClass(value)} ${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100`}
          value={value}
          disabled={disabled || !onChange}
          onChange={(event) => onChange?.(event.target.value)}
        >
          <option value="">선택</option>
          {options.map((item) => (
            <option key={item} value={item} className={statusTone ? getProgressStatusClass(item) : undefined}>
              {item}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={`${getInputStateClass(value)} ${inputClass} disabled:cursor-not-allowed disabled:bg-slate-100`}
          placeholder={placeholder}
          type={type}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          readOnly={disabled || !onChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
function StackedField({
  label,
  rows,
  type = "text",
}: {
  label: string;
  rows: Array<{
    label: string;
    value: string;
    onChange?: (value: string) => void;
  }>;
  type?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <label className={labelClass}>{label}</label>
      <div className="mt-2 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[44px_1fr] items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">
              {row.label}
            </span>
            <input
              className={`${getInputStateClass(row.value)} w-full rounded-lg border px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none`}
              type={type}
              value={row.value}
              readOnly={!row.onChange}
              onChange={(event) => row.onChange?.(event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CardInfoFields({
  approvalValue,
  merchantValue,
  cardValue,
  onApprovalChange,
  onMerchantChange,
  onCardChange,
}: {
  approvalValue: string;
  merchantValue: string;
  cardValue: string;
  onApprovalChange: (value: string) => void;
  onMerchantChange: (value: string) => void;
  onCardChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="mb-2 text-xs font-bold text-blue-700">카드정보</div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
          className={`${getInputStateClass(approvalValue)} ${smallInputClass}`}
          placeholder="승인번호"
          value={approvalValue}
          onChange={(event) => onApprovalChange(event.target.value)}
        />
        <input
          className={`${getInputStateClass(merchantValue)} ${smallInputClass}`}
          placeholder="가맹번호"
          value={merchantValue}
          onChange={(event) => onMerchantChange(event.target.value)}
        />
        <input
          className={`${getInputStateClass(cardValue)} ${smallInputClass}`}
          placeholder="카드번호"
          value={cardValue}
          onChange={(event) => onCardChange(event.target.value)}
        />
      </div>
    </div>
  );
}





