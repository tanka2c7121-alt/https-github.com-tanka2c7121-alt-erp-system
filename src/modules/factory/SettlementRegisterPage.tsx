"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";

const smallInputClass =
  "mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";

const labelClass = "text-sm font-semibold text-slate-800";

const formatWorkName = (value: string) => {
  const numbers = value.replace(/\D/g, "").slice(0, 9);

  if (numbers.length <= 4) return numbers;
  if (numbers.length <= 6) {
    return `${numbers.slice(0, 4)}-${numbers.slice(4)}`;
  }

  return `${numbers.slice(0, 4)}-${numbers.slice(4, 6)}-${numbers.slice(6)}`;
};


function formatNumber(value: string) {
  const raw = value.replaceAll(",", "");

  if (!/^\d*$/.test(raw)) {
    return value;
  }

  return raw ? Number(raw).toLocaleString() : "";
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
    onChange={(e) => onChange?.(e.target.value)}
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
    onChange={(e) => onChange?.(e.target.value)}
  />
)}
    </div>
  );
}

function CardInfoFields({
  title,
  approvalValue,
  merchantValue,
  cardValue,
  onApprovalChange,
  onMerchantChange,
  onCardChange,
}: {
  title: string;
  approvalValue: string;
  merchantValue: string;
  cardValue: string;
  onApprovalChange: (value: string) => void;
  onMerchantChange: (value: string) => void;
  onCardChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
      <div className="mb-2 text-xs font-bold text-blue-700">{title}</div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <input
  className={smallInputClass}
  placeholder="승인번호"
  value={approvalValue ?? ""}
  onChange={(e) => onApprovalChange(e.target.value)}
/>

<input
  className={smallInputClass}
  placeholder="가맹번호"
  value={merchantValue ?? ""}
  onChange={(e) => onMerchantChange(e.target.value)}
/>

<input
  className={smallInputClass}
  placeholder="카드번호"
  value={cardValue ?? ""}
  onChange={(e) => onCardChange(e.target.value)}
/>
      </div>
    </div>
  );
}

export default function SettlementRegisterPage({
  initialWorkName,
}: {
  initialWorkName?: string;
}) {

  const [expenseRows, setExpenseRows] = useState([
  {
    amount: "",
    date: "",
    type: "",
  },
]);
  const [paymentRows, setPaymentRows] = useState([
  {
    paymentType: "",
    paymentDetail: "",
    amount: "",
    date: "",
    method: "",

    approvalNumber: "",
    merchantNumber: "",
    cardNumber: "",

    invoiceIssued: false,
    claimDate: "",
    paymentStatus: "청구",
  },
]);
const handleExpenseChange = (
  index: number,
  field: "amount" | "date" | "type",
  value: string
) => {
  setExpenseRows((prev) =>
    prev.map((row, rowIndex) =>
      rowIndex === index ? { ...row, [field]: value } : row
    )
  );
};
const handleAddExpenseRow = () => {
  setExpenseRows((prev) => [
    ...prev,
    {
      amount: "",
      date: "",
      type: "",
    },
  ]);
};
const handlePaymentChange = (
  index: number,
  field: string,
  value: string
) => {

  const updated = [...paymentRows];

  updated[index] = {
    ...updated[index],
    [field]: value,
  };

  if (field === "date" && value) {
    updated[index].paymentStatus = "수금";
  }

  setPaymentRows(updated);
};
const addPaymentRow = () => {
  setPaymentRows([
    ...paymentRows,
    {
      paymentType: "",
      paymentDetail: "",
      amount: "",
      date: "",
      method: "",

      approvalNumber: "",
      merchantNumber: "",
      cardNumber: "",

      invoiceIssued: false,
      claimDate: "",
      paymentStatus: "청구",
    },
  ]);
};
  const [form, setForm] = useState({
    workName: "",
    carNumber: "",
    carModel: "",
    insuranceCompany: "",
    category: "",
    coverageType: "",
    managerName: "",
    receiptNumber: "",

    totalAmount: "",
    progressStatus: "미결",

    claimAmount: "",
    claimDate: "",

    memo: "",
  });

  function handleChange(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }
  useEffect(() => {
  if (!initialWorkName) return;

  async function loadWorkOrder() {
    const { data, error } = await supabase
      .from("work_orders")
      .select(`
        work_name,
        car_number,
        car_model,
        insurance_company,
        category,
        coverage_type,
        manager_name,
        receipt_number
      `)
      .eq("work_name", initialWorkName)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    setForm((prev) => ({
  ...prev,

  // 기본정보
  workName: data.work_name ?? "",
  carNumber: data.car_number ?? "",
  carModel: data.car_model ?? "",

  insuranceCompany: data.insurance_company ?? "",

  category: data.category ?? "",
  coverageType: data.coverage_type ?? "",

  managerName: data.manager_name ?? "",
  receiptNumber: data.receipt_number ?? "",

}));
  }

  void loadWorkOrder();
}, [initialWorkName]);

const handleLoadWorkOrder = async () => {

  if (!form.workName) {
    alert("작명을 입력하세요.");
    return;
  }

  // 작업정보
  const { data: workOrder } = await supabase
    .from("work_orders")
    .select("*")
    .eq("work_name", form.workName)
    .maybeSingle();

  if (!workOrder) {
    alert("작업정보를 찾을 수 없습니다.");
    return;
  }

  // 정산정보
  const { data: settlement } = await supabase
    .from("repair_settlements")
    .select("*")
    .eq("work_name", form.workName)
    .maybeSingle();

  // 지출내역
  const { data: expenses } = await supabase
    .from("settlement_expenses")
    .select("*")
    .eq("work_name", form.workName)
    .order("id", { ascending: true });

  const { data: payments } = await supabase
  .from("settlement_payments")
  .select("*")
  .eq("work_name", form.workName)
  .order("id", { ascending: true });  

  // 화면 세팅
  setForm((prev) => ({
    ...prev,

    // 기본정보
    workName:
      workOrder?.work_name ?? "",

    carNumber:
      workOrder?.car_number ?? "",

    carModel:
      workOrder?.car_model ?? "",

    insuranceCompany:
      workOrder?.insurance_company ?? "",

    category:
      workOrder?.category ?? "",

    coverageType:
      workOrder?.coverage_type ?? "",

    managerName:
      workOrder?.manager_name ?? "",

    receiptNumber:
      workOrder?.receipt_number ?? "",

    // 수리비
    repairAmount:
      settlement?.repair_amount?.toLocaleString() ?? "",

    repairPaymentDate:
      settlement?.repair_payment_date ?? "",

    repairPaymentMethod:
      settlement?.repair_payment_method ?? "",

    repairApprovalNumber:
      settlement?.repair_approval_number ?? "",

    repairMerchantNumber:
      settlement?.repair_merchant_number ?? "",

    repairCardNumber:
      settlement?.repair_card_number ?? "",

    // 면책금
    deductibleAmount:
      settlement?.deductible_amount?.toLocaleString() ?? "",

    deductiblePaymentDate:
      settlement?.deductible_payment_date ?? "",

    deductiblePaymentMethod:
      settlement?.deductible_payment_method ?? "",

    deductibleApprovalNumber:
      settlement?.deductible_approval_number ?? "",

    deductibleMerchantNumber:
      settlement?.deductible_merchant_number ?? "",

    deductibleCardNumber:
      settlement?.deductible_card_number ?? "",

    // 부가세
    vatAmount:
      settlement?.vat_amount?.toLocaleString() ?? "",

    vatPaymentDate:
      settlement?.vat_payment_date ?? "",

    vatPaymentMethod:
      settlement?.vat_payment_method ?? "",

    // 청구
    claimAmount:
      settlement?.claim_amount?.toLocaleString() ?? "",

    claimDate:
      settlement?.claim_date ?? "",

    // 기타
    totalAmount:
      settlement?.total_amount?.toLocaleString() ?? "",

    progressStatus: settlement?.progress_status || "미결",
    memo:
      settlement?.memo ?? "",
  }));
  
  if (payments && payments.length > 0) {
  setPaymentRows(
    payments.map((item) => ({
      paymentType: item.payment_type ?? "",
      paymentDetail: item.payment_detail ?? "",
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
  );
} else {
  setPaymentRows([
    {
      paymentType: "",
      paymentDetail: "",
      amount: "",
      date: "",
      method: "",
      approvalNumber: "",
      merchantNumber: "",
      cardNumber: "",
      invoiceIssued: false,
      claimDate: "",
      paymentStatus: "청구",
    },
  ]);
}
  // 지출내역 세팅
  if (expenses && expenses.length > 0) {

    setExpenseRows(
      expenses.map((item) => ({
        amount:
          item.expense_amount?.toLocaleString() ?? "",

        date:
          item.expense_date ?? "",

        type:
          item.expense_type ?? "",
      }))
    );

  } else {

    setExpenseRows([
      {
        amount: "",
        date: "",
        type: "",
      },
    ]);
  }

  alert("불러왔습니다.");
};

  async function handleSave() {

  // 기존 정산 헤더 삭제
await supabase
  .from("repair_settlements")
  .delete()
  .eq("work_name", form.workName);

// 기존 입금내역 삭제
await supabase
  .from("settlement_payments")
  .delete()
  .eq("work_name", form.workName);

// 기존 지출내역 삭제
await supabase
  .from("settlement_expenses")
  .delete()
  .eq("work_name", form.workName);

  // 정산 저장
  const { error } = await supabase
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

      // 청구
      claim_amount: Number(
        form.claimAmount.replaceAll(",", "") || 0
      ),

      claim_date:
        form.claimDate || null,

      // 기타
      memo: form.memo,
    });

  if (error) {
    alert("저장 실패: " + error.message);
    return;
  }
  const paymentInsertRows = paymentRows
  .filter(
    (row) =>
      row.paymentType ||
      row.paymentDetail ||
      row.amount ||
      row.date ||
      row.method
  )
  .map((row) => ({
    work_name: form.workName,

    payment_type: row.paymentType,
    payment_detail: row.paymentDetail,

    payment_amount: Number(
      row.amount.replaceAll(",", "") || 0
    ),

    payment_date: row.date || null,
    payment_method: row.method,

    approval_number: row.approvalNumber,
    merchant_number: row.merchantNumber,
    card_number: row.cardNumber,

    invoice_issued: row.invoiceIssued,

    claim_date:
      row.claimDate || null,

    payment_status:
      row.paymentStatus,
  }));
  

if (paymentInsertRows.length > 0) {
  const { error: paymentError } = await supabase
    .from("settlement_payments")
    .insert(paymentInsertRows);
  
  if (paymentError) {
    alert("입금내역 저장 실패: " + paymentError.message);
    return;
  }
}

// daily_cash 기존 연동 삭제
await supabase
  .from("daily_cash")
  .delete()
  .eq("source_type", "settlement_payment")
  .eq("source_work_name", form.workName);

  const dailyCashRows = paymentRows
  .filter(
    (row) =>
      row.amount &&
      row.date &&
      row.method
  )
  .map((row) => ({
    date: row.date,

    account: row.method,

    type: "수입",

    category: "차량정산",

    content:
      `${row.paymentType} / ${row.paymentDetail} / ${form.carNumber}`,

    income: Number(
      row.amount.replaceAll(",", "") || 0
    ),

    expense: 0,

    memo: form.workName,

    source_type: "settlement_payment",

    source_work_name: form.workName,
  }));

if (dailyCashRows.length > 0) {

  const { error: dailyCashError } =
    await supabase
      .from("daily_cash")
      .insert(dailyCashRows);

  if (dailyCashError) {
    alert(
      "일일입출금 저장 실패: " +
      dailyCashError.message
    );

    return;
  }
}


  // 지출내역 저장용 배열
  const expenseInsertRows = expenseRows
    .filter(
      (row) =>
        row.amount ||
        row.date ||
        row.type
    )
    .map((row) => ({
      work_name: form.workName,

      expense_amount: Number(
        row.amount.replaceAll(",", "") || 0
      ),

      expense_date:
        row.date || null,

      expense_type:
        row.type,
    }));

  // 지출내역 저장
  if (expenseInsertRows.length > 0) {

    const { error: expenseError } =
      await supabase
        .from("settlement_expenses")
        .insert(expenseInsertRows);

    if (expenseError) {
      alert(
        "지출내역 저장 실패: " +
        expenseError.message
      );
      return;
    }
  }

  alert("저장되었습니다.");
}

const formatAmount = (value: string) => {
  const numbers = value.replace(/\D/g, "");

  if (!numbers) return "";

  return Number(numbers).toLocaleString();
};  
const toNumber = (value: string) =>
  Number(value.replaceAll(",", "") || 0);

const paymentTotal = paymentRows.reduce(
  (sum, row) => sum + toNumber(row.amount),
  0
);

const expenseTotal = expenseRows.reduce(
  (sum, row) => sum + toNumber(row.amount),
  0
);

const totalAmount = paymentTotal - expenseTotal;

const receivableAmount = paymentRows
  .filter(
    (row) =>
      row.invoiceIssued === true &&
      row.paymentStatus === "청구"
  )
  .reduce(
    (sum, row) =>
      sum + toNumber(row.amount),
    0
  );

  return (
    <div className="space-y-6 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">정산등록</h3>
        <p className="text-sm text-slate-700">
          작업별 청구금액, 입금금액, 면책금, 부가세를 등록하는 화면입니다.
        </p>
      </div>

      {/* 기본정보 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-bold text-slate-900">기본정보</h3>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <label className={labelClass}>작명</label>

            <div className="mt-2 flex gap-2">
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                placeholder="2026-05-001"
                value={form.workName}
                onChange={(e) =>
                  handleChange(
                    "workName",
                   formatWorkName(e.target.value)
                )
              }
              />

              <button
                type="button"
                onClick={() => void handleLoadWorkOrder()}
                className="whitespace-nowrap rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
              >
                불러오기
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label="차량번호" placeholder="불러오기 후 표시" value={form.carNumber} />
          <Field label="차량명" placeholder="불러오기 후 표시" value={form.carModel} />
          <Field label="보험사" placeholder="불러오기 후 표시" value={form.insuranceCompany} />
          <Field label="구분" placeholder="불러오기 후 표시" value={form.category} />
          <Field label="담보" placeholder="불러오기 후 표시" value={form.coverageType} />
          <Field label="담당자" placeholder="불러오기 후 표시" value={form.managerName} />
          <Field label="접수번호" placeholder="불러오기 후 표시" value={form.receiptNumber} />
          <Field
            label="합계금액"
            value={totalAmount.toLocaleString()}
          />

          <Field
  label="진행상황"
  value={form.progressStatus}
  onChange={(value) =>
    handleChange("progressStatus", value)
  }
  options={["미결", "완결"]}
/>
        </div>
      </section>

      {/* 청구정보 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="text-lg font-bold text-slate-900">청구정보</h3>

        {form.coverageType === "과실" ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <label className={labelClass}>청구금액</label>
              <input className={smallInputClass} placeholder="자보험 청구금액" />
              <input className={smallInputClass} placeholder="상대보험 청구금액" />
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <label className={labelClass}>청구일</label>
              <input type="date" className={smallInputClass} />
              <input type="date" className={smallInputClass} />
            </div>

          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field
              label="청구금액"
              placeholder="0"
              value={form.claimAmount}
              onChange={(value) => handleChange("claimAmount", formatNumber(value))}
            />

            <Field
              label="청구일"
              type="date"
              value={form.claimDate}
              onChange={(value) => handleChange("claimDate", value)}
            />
            </div>
          )}
      </section>

      
      <section className="rounded-xl border border-slate-200 bg-white p-5">
  <div className="mb-4 flex items-center justify-between">
    <h3 className="text-lg font-bold text-slate-900">입금내역</h3>

    <button
      type="button"
      onClick={addPaymentRow}
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
          options={["보험","캐피탈", "일반", "바디케어"]}
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
          onChange={(value) =>
            handlePaymentChange(index, "date", value)
          }
        />

        <Field
          label="입금방법"
          value={row.method}
          onChange={(value) =>
            handlePaymentChange(index, "method", value)
          }
          options={["국민은행","부산은행", "카드", "현금", "BLUE POINT","법인1층"]}
        />

        {row.method === "카드" && (
          <div className="md:col-span-5">
            <CardInfoFields
              title="카드정보"
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
    onChange={(e) => {
      const checked = e.target.checked;

      setPaymentRows((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                invoiceIssued: checked,
                paymentStatus: checked
                  ? item.date
                    ? "수금"
                    : "청구"
                  : item.paymentStatus,
              }
            : item
        )
      );
    }}
  />

  계산서발행
</label>

{row.invoiceIssued && (
  <>

    <Field
      label="상태"
      value={row.paymentStatus}
      onChange={(value) =>
        handlePaymentChange(
          index,
          "paymentStatus",
          value
        )
      }
      options={["청구", "수금"]}
    />

    <Field
      label="청구일"
      type="date"
      value={row.claimDate}
      onChange={(value) =>
        handlePaymentChange(
          index,
          "claimDate",
          value
        )
      }
    />

  </>
)}
        
      </div>
    ))}
    
  </div>
</section>

       <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
  <div className="mb-4 flex items-center justify-between">
    <h3 className="text-lg font-bold text-slate-900">지출내역</h3>

    <button
      type="button"
      onClick={handleAddExpenseRow}
      className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
    >
      추가
    </button>
  </div>
  

  <div className="space-y-3">
    {expenseRows.map((row, index) => (
      <div key={index} 
         className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field
          label="지출금액"
          placeholder="0"
          value={row.amount}
          onChange={(value) =>
             handleExpenseChange(index, "amount",formatAmount(value))
           }
        />

        <Field
          label="지출일"
          type="date"
          value={row.date}
          onChange={(value) =>
            handleExpenseChange(index, "date", value)
           }
        />

        <Field
          label="지출내용"
          value={row.type}
          onChange={(value) =>
            handleExpenseChange(index, "type", value)
           }
          options={[
            "입고지원",
            "교통비",
            "견인비",
            "탁송비",
            "대차비",
            "기타",
          ]}
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
          onChange={(e) => handleChange("memo", e.target.value)}
        />
      </section>

      <div className="flex justify-end gap-2">
        

        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          저장
        </button>
      </div>
    </div>
  );
}
