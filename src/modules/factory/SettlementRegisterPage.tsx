"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type SettlementRegisterPageProps = {
  initialWorkName?: string;
};

type PaymentRow = {
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

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";
const smallInputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";
const labelClass = "text-sm font-semibold text-slate-800";

const emptyPaymentRow = (): PaymentRow => ({
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

const defaultFaultPaymentRows = (): PaymentRow[] => [
  {
    ...emptyPaymentRow(),
    paymentType: "수리비",
    paymentDetail: "자차",
    paymentStatus: "청구",
  },
  {
    ...emptyPaymentRow(),
    paymentType: "수리비",
    paymentDetail: "대물",
    paymentStatus: "청구",
  },
];

const defaultPaymentRowsForWorkOrder = (workOrder: any): PaymentRow[] => {
  if (workOrder?.coverage_type !== "과실") {
    return [emptyPaymentRow()];
  }

  return defaultFaultPaymentRows();
};

const normalizePaymentRowsForWorkOrder = (
  workOrder: any,
  rows: PaymentRow[]
): PaymentRow[] => {
  if (workOrder?.coverage_type !== "과실") {
    return rows.length > 0 ? rows : [emptyPaymentRow()];
  }

  const defaults = defaultFaultPaymentRows();
  const normalizedRows = rows.length > 0 ? [...rows] : [];

  defaults.forEach((defaultRow) => {
    const hasDetail = normalizedRows.some(
      (row) => row.paymentDetail === defaultRow.paymentDetail
    );

    if (!hasDetail) {
      normalizedRows.push(defaultRow);
    }
  });

  return normalizedRows;
};

const emptyExpenseRow = (): ExpenseRow => ({
  amount: "",
  date: "",
  type: "",
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

export default function SettlementRegisterPage({
  initialWorkName,
}: SettlementRegisterPageProps) {
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
    emptyPaymentRow(),
  ]);
  const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([
    emptyExpenseRow(),
  ]);
  const [saving, setSaving] = useState(false);
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
    totalAmount: "",
    progressStatus: "미결",
    claimAmount: "",
    claimDate: "",
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
  const receivableAmount = useMemo(
    () =>
      paymentRows
        .filter((row) => row.invoiceIssued && row.paymentStatus === "청구")
        .reduce(
          (sum, row) =>
            sum + Math.max(toNumber(row.claimAmount) - toNumber(row.amount), 0),
          0
        ),
    [paymentRows]
  );
  const ownPaymentIndex = paymentRows.findIndex(
    (row) => row.paymentDetail === "자차"
  );
  const otherPaymentIndex = paymentRows.findIndex(
    (row) => row.paymentDetail === "대물"
  );
  const ownPaymentRow =
    ownPaymentIndex >= 0 ? paymentRows[ownPaymentIndex] : undefined;
  const otherPaymentRow =
    otherPaymentIndex >= 0 ? paymentRows[otherPaymentIndex] : undefined;

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handlePaymentChange = (
    index: number,
    field: keyof PaymentRow,
    value: string | boolean
  ) => {
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

  const handleExpenseChange = (
    index: number,
    field: keyof ExpenseRow,
    value: string
  ) => {
    setExpenseRows((prev) =>
      prev.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: value } : row
      )
    );
  };

  const loadWorkOrder = async (targetWorkName = form.workName) => {
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
      totalAmount: settlement?.total_amount?.toLocaleString() ?? "",
      progressStatus: settlement?.progress_status ?? "미결",
      claimAmount: settlement?.claim_amount?.toLocaleString() ?? "",
      claimDate: settlement?.claim_date ?? "",
      memo: settlement?.memo ?? "",
    });

    const loadedPaymentRows =
      payments && payments.length > 0
        ? payments.map((item: any) => ({
            paymentType: item.payment_type ?? "",
            paymentDetail: item.payment_detail ?? "",
            claimAmount:
              item.claim_amount?.toLocaleString() ??
              item.payment_amount?.toLocaleString() ??
              "",
            amount: item.payment_amount?.toLocaleString() ?? "",
            date: item.payment_date ?? "",
            method: item.payment_method ?? "",
            approvalNumber: item.approval_number ?? "",
            merchantNumber: item.merchant_number ?? "",
            cardNumber: item.card_number ?? "",
            invoiceIssued: item.invoice_issued ?? false,
            claimDate: item.claim_date ?? "",
            paymentStatus: item.payment_status ?? "청구",
          }))
        : defaultPaymentRowsForWorkOrder(workOrder);

    setPaymentRows(normalizePaymentRowsForWorkOrder(workOrder, loadedPaymentRows));

    setExpenseRows(
      expenses && expenses.length > 0
        ? expenses.map((item: any) => ({
            amount: item.expense_amount?.toLocaleString() ?? "",
            date: item.expense_date ?? "",
            type: item.expense_type ?? "",
          }))
        : [emptyExpenseRow()]
    );
  };

  useEffect(() => {
    if (!initialWorkName) return;

    setForm((prev) => ({ ...prev, workName: initialWorkName }));
    void loadWorkOrder(initialWorkName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkName]);

  const savePaymentRows = async () => {
    const rows = paymentRows
      .filter(
        (row) =>
          row.paymentType ||
          row.paymentDetail ||
          row.claimAmount ||
          row.amount ||
          row.date ||
          row.method
      )
      .map((row) => ({
        work_name: form.workName,
        payment_type: row.paymentType,
        payment_detail: row.paymentDetail,
        claim_amount: toNumber(row.claimAmount),
        payment_amount: toNumber(row.amount),
        payment_date: row.date || null,
        payment_method: row.method,
        approval_number: row.approvalNumber,
        merchant_number: row.merchantNumber,
        card_number: row.cardNumber,
        invoice_issued: row.invoiceIssued,
        claim_date: row.claimDate || null,
        payment_status: row.paymentStatus,
      }));

    if (rows.length === 0) return null;

    const { error } = await supabase.from("settlement_payments").insert(rows);
    return error;
  };

  const saveExpenseRows = async () => {
    const rows = expenseRows
      .filter((row) => row.amount || row.date || row.type)
      .map((row) => ({
        work_name: form.workName,
        expense_amount: toNumber(row.amount),
        expense_date: row.date || null,
        expense_type: row.type,
      }));

    if (rows.length === 0) return null;

    const { error } = await supabase.from("settlement_expenses").insert(rows);
    return error;
  };

  const saveDailyCashRows = async () => {
    await supabase
      .from("daily_cash")
      .delete()
      .eq("source_type", "settlement_payment")
      .eq("source_work_name", form.workName);

    const rows = paymentRows
      .filter((row) => row.amount && row.date && row.method)
      .map((row) => ({
        date: row.date,
        account: row.method,
        type: "수입",
        category: "차량정산",
        content: `${row.paymentType} / ${row.paymentDetail} / ${form.carNumber}`,
        income: toNumber(row.amount),
        expense: 0,
        memo: form.workName,
        source_type: "settlement_payment",
        source_work_name: form.workName,
      }));

    if (rows.length === 0) return null;

    const { error } = await supabase.from("daily_cash").insert(rows);
    return error;
  };

  const handleSave = async () => {
    if (!form.workName) {
      alert("작명을 입력하세요.");
      return;
    }

    setSaving(true);

    await supabase.from("repair_settlements").delete().eq("work_name", form.workName);
    await supabase.from("settlement_payments").delete().eq("work_name", form.workName);
    await supabase.from("settlement_expenses").delete().eq("work_name", form.workName);

    const { error: settlementError } = await supabase
      .from("repair_settlements")
      .insert({
        work_name: form.workName,
        car_number: form.carNumber,
        car_model: form.carModel,
        insurance_company: form.insuranceCompany,
        category: form.category,
        coverage_type: form.coverageType,
        manager_name: form.managerName,
        receipt_number: form.receiptNumber,
        total_amount: totalAmount,
        progress_status: form.progressStatus,
        claim_amount: toNumber(form.claimAmount),
        claim_date: form.claimDate || null,
        memo: form.memo,
      });

    if (settlementError) {
      setSaving(false);
      alert("정산 저장 실패: " + settlementError.message);
      return;
    }

    const paymentError = await savePaymentRows();
    if (paymentError) {
      setSaving(false);
      alert("입금내역 저장 실패: " + paymentError.message);
      return;
    }

    const dailyCashError = await saveDailyCashRows();
    if (dailyCashError) {
      setSaving(false);
      alert("일일입출금 연동 저장 실패: " + dailyCashError.message);
      return;
    }

    const expenseError = await saveExpenseRows();
    if (expenseError) {
      setSaving(false);
      alert("지출내역 저장 실패: " + expenseError.message);
      return;
    }

    setSaving(false);
    alert("저장되었습니다.");
  };

  return (
    <div className="space-y-6 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">정산등록</h3>
        <p className="text-sm text-slate-700">
          작업별 청구금액, 입금내역, 면책금, 부가세, 지출내역을 등록합니다.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-4 text-lg font-bold text-slate-900">기본정보</h3>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className={labelClass}>작명</label>
            <div className="mt-2 flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                placeholder="2026-05-001"
                value={form.workName}
                onChange={(event) =>
                  handleChange("workName", formatWorkName(event.target.value))
                }
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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="차량번호" value={form.carNumber} />
          <Field label="차량명" value={form.carModel} />
          <Field label="구분" value={form.category} />
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
          <Field label="담보" value={form.coverageType} />
          <Field label="합계금액" value={totalAmount.toLocaleString()} />
          <Field
            label="진행상황"
            value={form.progressStatus}
            onChange={(value) => handleChange("progressStatus", value)}
            options={["미결", "완결"]}
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-4 text-lg font-bold text-slate-900">청구정보</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {form.coverageType === "과실" ? (
            <>
              <StackedField
                label="청구금액"
                rows={[
                  {
                    label: "자차",
                    value: ownPaymentRow?.claimAmount ?? "",
                    onChange:
                      ownPaymentIndex >= 0
                        ? (value) =>
                            handlePaymentChange(
                              ownPaymentIndex,
                              "claimAmount",
                              formatAmount(value)
                            )
                        : undefined,
                  },
                  {
                    label: "대물",
                    value: otherPaymentRow?.claimAmount ?? "",
                    onChange:
                      otherPaymentIndex >= 0
                        ? (value) =>
                            handlePaymentChange(
                              otherPaymentIndex,
                              "claimAmount",
                              formatAmount(value)
                            )
                        : undefined,
                  },
                ]}
              />
              <StackedField
                label="청구일"
                type="date"
                rows={[
                  {
                    label: "자차",
                    value: ownPaymentRow?.claimDate ?? "",
                    onChange:
                      ownPaymentIndex >= 0
                        ? (value) =>
                            handlePaymentChange(ownPaymentIndex, "claimDate", value)
                        : undefined,
                  },
                  {
                    label: "대물",
                    value: otherPaymentRow?.claimDate ?? "",
                    onChange:
                      otherPaymentIndex >= 0
                        ? (value) =>
                            handlePaymentChange(otherPaymentIndex, "claimDate", value)
                        : undefined,
                  },
                ]}
              />
            </>
          ) : (
            <>
              <Field
                label="청구금액"
                placeholder="0"
                value={form.claimAmount}
                onChange={(value) => handleChange("claimAmount", formatAmount(value))}
              />
              <Field
                label="청구일"
                type="date"
                value={form.claimDate}
                onChange={(value) => handleChange("claimDate", value)}
              />
            </>
          )}
          <Field label="미수금" value={receivableAmount.toLocaleString()} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">입금내역</h3>
          <button
            type="button"
            onClick={() => setPaymentRows((prev) => [...prev, emptyPaymentRow()])}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            추가
          </button>
        </div>

        <div className="space-y-3">
          {paymentRows.map((row, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-4 rounded-xl border border-slate-100 p-3 md:grid-cols-5"
            >
              <Field
                label="입금구분"
                value={row.paymentType}
                onChange={(value) =>
                  handlePaymentChange(index, "paymentType", value)
                }
                options={["수리비", "면책금", "부가세"]}
              />
              <Field
                label="입금상세"
                value={row.paymentDetail}
                onChange={(value) =>
                  handlePaymentChange(index, "paymentDetail", value)
                }
                options={["보험", "자차", "대물", "캐피탈", "일반", "바디케어"]}
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
                label="입금일"
                type="date"
                value={row.date}
                onChange={(value) => handlePaymentChange(index, "date", value)}
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

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">지출내역</h3>
          <button
            type="button"
            onClick={() => setExpenseRows((prev) => [...prev, emptyExpenseRow()])}
            className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            추가
          </button>
        </div>

        <div className="space-y-3">
          {expenseRows.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field
                label="지출금액"
                placeholder="0"
                value={row.amount}
                onChange={(value) =>
                  handleExpenseChange(index, "amount", formatAmount(value))
                }
              />
              <Field
                label="지출일"
                type="date"
                value={row.date}
                onChange={(value) => handleExpenseChange(index, "date", value)}
              />
              <Field
                label="지출내역"
                value={row.type}
                onChange={(value) => handleExpenseChange(index, "type", value)}
                options={["입고지원", "교통비", "견인비", "탁송비", "대차비", "기타"]}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className={labelClass}>비고</label>
        <textarea
          className={`${inputClass} h-28 resize-none`}
          placeholder="정산 관련 메모를 입력하세요."
          value={form.memo}
          onChange={(event) => handleChange("memo", event.target.value)}
        />
      </section>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "저장 중" : "저장"}
        </button>
      </div>
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
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value?: string;
  options?: string[];
  onChange?: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <label className={labelClass}>{label}</label>
      {options ? (
        <select
          className={inputClass}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
        >
          <option value="">선택</option>
          {options.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={inputClass}
          placeholder={placeholder}
          type={type}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          readOnly={!onChange}
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
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
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
          className={smallInputClass}
          placeholder="승인번호"
          value={approvalValue}
          onChange={(event) => onApprovalChange(event.target.value)}
        />
        <input
          className={smallInputClass}
          placeholder="가맹번호"
          value={merchantValue}
          onChange={(event) => onMerchantChange(event.target.value)}
        />
        <input
          className={smallInputClass}
          placeholder="카드번호"
          value={cardValue}
          onChange={(event) => onCardChange(event.target.value)}
        />
      </div>
    </div>
  );
}
