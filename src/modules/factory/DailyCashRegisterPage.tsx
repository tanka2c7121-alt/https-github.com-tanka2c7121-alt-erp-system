"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import type { MenuItem } from "../../data/menuData";
import type { UserRole } from "../../types/roles";

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";

const labelClass = "text-sm font-semibold text-slate-800";

const normalizeAccountName = (value: string) =>
  value.trim().toUpperCase().includes("BLUE") || value.includes("블루")
    ? "BLUE POINT"
    : value;

const isUnconfirmedIncome = (row: Pick<DailyCashRow, "type" | "category">) =>
  row.type === "수입" && row.category === "미확인";
const isFinalizedStatus = (status: unknown) =>
  status === "완결" || status === "종결";

type FormState = {
  date: string;
  account: string;
  type: string;
  category: string;
  content: string;
  amount: string;
  memo: string;
};

export type DailyCashRow = {
  id: number;
  date: string;
  created_on?: string | null;
  account: string;
  type: string;
  category: string ;
  content: string | null;
  income: number;
  expense: number;
  memo: string | null;
  source_type?: string | null;
  source_work_name?: string | null;
  source_detail_id?: number | null;
  source_key?: string | null;
};

type DailyCashRegisterPageProps = {
  editData?: DailyCashRow;
  user: {
    user_id: string;
    user_name: string;
    role: UserRole;
    approval_role?: string | null;
  };
  onSelectMenu: (menu: MenuItem) => void;
};

const defaultCategoryOptions: Record<string, string[]> = {
  수입: [
    "수리비",
    "면책금",
    "부가세",
    "보험금",
    "카드매출",
    "BLUE포인트",
    "임대료",
    "차량정산",
    "기타수입",
  ],
  고정비: [
    "임대료",
    "관리비",
    "전기세",
    "수도세",
    "인터넷",
    "직원급여",
    "연장근로수당",
    "4대보험",
    "직원식대",
    "세금",
    "렌트료",
    "AOS프로그램사용료",
  ],
  변동비: [
    "부품대",
    "외주",
    "도장부관리비",
    "판금부관리비",
    "소모품",
    "유류비",
    "택시비",
    "식대",
    "탁송비",
    "세차비",
    "공구구입비",
  ],
  내부이동: ["계좌이체", "현금이동", "카드정산"],
};

export default function DailyCashRegisterPage({
  editData,
  user,
  onSelectMenu,
}: DailyCashRegisterPageProps) {
  const [categoryOptions, setCategoryOptions] = useState(defaultCategoryOptions);
  const [form, setForm] = useState<FormState>({
    date: "",
    account: "",
    type: "",
    category: "",
    content: "",
    amount: "",
    memo: "",
  });
  const [saving, setSaving] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPasswordOpen, setAdminPasswordOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [settlementWorkName, setSettlementWorkName] = useState("");
  const saveInProgressRef = useRef(false);

  const isEditMode = Boolean(editData);
  const isSettlementPaymentRow = editData?.source_type === "settlement_payment";
  const requiresAdminUnlock = false;
  const canSaveCurrentRow = true;

  useEffect(() => {
    const loadCategoryOptions = async () => {
      const { data, error } = await supabase
        .from("daily_cash_categories")
        .select("type, name")
        .eq("is_active", true)
        .order("type", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error || !data || data.length === 0) {
        setCategoryOptions(defaultCategoryOptions);
        return;
      }

      const nextOptions: Record<string, string[]> = {
        수입: [],
        고정비: [],
        변동비: [],
        내부이동: [],
      };

      data.forEach((row: any) => {
        const type = String(row.type ?? "");
        const name = String(row.name ?? "").trim();

        if (!name) return;
        nextOptions[type] = [...(nextOptions[type] ?? []), name];
      });

      setCategoryOptions({
        수입: nextOptions.수입.length ? nextOptions.수입 : defaultCategoryOptions.수입,
        고정비: nextOptions.고정비.length ? nextOptions.고정비 : defaultCategoryOptions.고정비,
        변동비: nextOptions.변동비.length ? nextOptions.변동비 : defaultCategoryOptions.변동비,
        내부이동: nextOptions.내부이동.length
          ? nextOptions.내부이동
          : defaultCategoryOptions.내부이동,
      });
    };

    void loadCategoryOptions();
  }, []);

  const selectedCategoryOptions = useMemo(() => {
    const options = categoryOptions[form.type] || [];

    if (form.category && !options.includes(form.category)) {
      return [form.category, ...options];
    }

    return options;
  }, [categoryOptions, form.category, form.type]);

  useEffect(() => {
    if (!editData) return;

    setForm({
      date: editData.date,
      account: normalizeAccountName(editData.account),
      type: editData.type,
      category: editData.category ?? "",
      content: editData.content ?? "",
      amount: String(editData.income || editData.expense || ""),
      memo: editData.memo ?? "",
    });
    setAdminUnlocked(false);
    setAdminPassword("");
    setAdminPasswordOpen(false);
    setSettlementWorkName("");
  }, [editData]);

  function canChangeForm() {
    return true;
  }

  function handleChange(key: keyof FormState, value: string) {
    if (!canChangeForm()) return;

    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleTypeChange(value: string) {
    if (!canChangeForm()) return;

    setForm((prev) => ({
      ...prev,
      type: value,
      category: "",
    }));
  }

  function handleSettlementLink() {
    if (!editData || !isUnconfirmedIncome(editData)) return;

    if (requiresAdminUnlock && !adminUnlocked) {
      alert("관리자 승인 후 변경할 수 있습니다.");
      return;
    }

    const workName = settlementWorkName.trim();
    if (!workName) {
      alert("연동할 작명을 입력하세요.");
      return;
    }

    onSelectMenu({
      id: "factory-settlement-repair-register",
      title: "정산등록",
      data: {
        workName,
        dailyCashLink: {
          dailyCashId: editData.id,
          date: editData.date,
          account: normalizeAccountName(editData.account),
          amount: Number(editData.income || editData.expense || 0),
          content: editData.content ?? "",
          memo: editData.memo ?? "",
        },
      },
    });
  }

  function handleReset() {
    if (!canChangeForm()) return;

    setForm({
      date: "",
      account: "",
      type: "",
      category: "",
      content: "",
      amount: "",
      memo: "",
    });
  }

  function handleAdminUnlock() {
    setAdminPassword("");
    setAdminPasswordOpen(true);
  }

  async function confirmAdminUnlock() {
    const password = adminPassword.trim();
    if (!password) return;

    const { data, error } = await supabase
      .from("app_users")
      .select("id")
      .eq("password", password)
      .eq("role", "ADMIN")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      alert("관리자 승인에 실패했습니다.");
      return;
    }

    setAdminUnlocked(true);
    setAdminPassword("");
    setAdminPasswordOpen(false);
    alert("관리자 승인이 완료되었습니다. 저장 후 다시 잠금 상태가 됩니다.");
  }

  async function canApplyDailyCashChangeImmediately(row: DailyCashRow) {
    if (row.source_type !== "settlement_payment") {
      return row.created_on === localDateText();
    }

    if (!row.source_work_name) return true;

    const { data, error } = await supabase
      .from("repair_settlements")
      .select("progress_status")
      .eq("work_name", row.source_work_name)
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return !isFinalizedStatus(data?.progress_status);
  }

  async function createDailyCashCorrectionRequest(
    row: DailyCashRow,
    payload: {
      date: string;
      account: string;
      type: string;
      category: string;
      content: string;
      income: number;
      expense: number;
      memo: string;
    },
    amount: number
  ) {
    const sourceKey = `daily_cash_correction:${row.id}`;
    const { data: existingRequest, error: existingRequestError } = await supabase
      .from("cash_change_requests")
      .select("id")
      .eq("source_key", sourceKey)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();

    if (existingRequestError) return existingRequestError;
    if (existingRequest) {
      alert("이미 관리자 승인 대기 중인 수정 요청이 있습니다.");
      return null;
    }

    const paymentId =
      Number(row.source_detail_id) ||
      Number(String(row.source_key ?? "").replace("settlement_payment:", ""));
    const [paymentType = payload.category, paymentDetail = ""] = String(
      payload.content || ""
    )
      .split("/")
      .map((value) => value.trim());

    const { error } = await supabase.from("cash_change_requests").insert({
      request_type: "daily_cash_correction",
      status: "pending",
      source_type: row.source_type ?? "daily_cash",
      source_work_name: row.source_work_name,
      source_detail_id: row.source_detail_id ?? null,
      source_key: sourceKey,
      target_table: "daily_cash",
      target_id: row.id,
      title: `${row.source_work_name ?? "일일입출금"} 입출금 수정 요청`,
      reason:
        row.source_type === "settlement_payment"
          ? "완결/종결 정산 연동 입출금 수정 요청"
          : "입력일이 지난 일일입출금 수정 요청",
      before_payload: {
        daily_cash: row,
      },
      requested_payload: {
        daily_cash: {
          ...payload,
          memo: [
            payload.memo,
            "수정승인",
          ]
            .filter(Boolean)
            .join(" / "),
        },
        settlement_payment:
          Number.isFinite(paymentId) && paymentId > 0
            ? {
                id: paymentId,
                payment_type: paymentType || payload.category,
                payment_detail: paymentDetail,
                payment_amount: payload.type === "수입" ? amount : 0,
                payment_date: payload.date || null,
                payment_method: normalizeAccountName(payload.account),
                payment_status: payload.date ? "수금" : "청구",
              }
            : null,
      },
      requested_by: user.user_id,
      requested_name: user.user_name,
    });

    return error ?? null;
  }

  async function handleSave() {
    if (saveInProgressRef.current) {
      return;
    }

    saveInProgressRef.current = true;
    setSaving(true);

    try {
    if (!form.date) {
      alert("일자를 입력하세요.");
      return;
    }

    if (!form.account) {
      alert("계정을 선택하세요.");
      return;
    }

    if (!form.type) {
      alert("구분을 선택하세요.");
      return;
    }

    const amount = Number(
  form.amount.replaceAll(",", "") || 0
);

    const payload = {
      date: form.date,
      account: normalizeAccountName(form.account),
      type: form.type,
      category: form.category,
      content: form.content,
      income: form.type === "수입" ? amount : 0,
expense:
  form.type === "고정비" ||
  form.type === "변동비" ||
  form.type === "내부이동"
    ? amount
    : 0,
      memo: form.memo,
    };

    let saveResult;

    if (editData) {
      let canApplyImmediately = false;

      try {
        canApplyImmediately = await canApplyDailyCashChangeImmediately(editData);
      } catch (error: any) {
        alert("수정 가능 여부 확인 실패: " + (error?.message ?? String(error)));
        return;
      }

      if (!canApplyImmediately) {
        const requestError = await createDailyCashCorrectionRequest(
          editData,
          payload,
          amount
        );

        if (requestError) {
          alert("수정 승인요청 저장 실패: " + requestError.message);
          return;
        }

        alert("관리자에게 수정 요청을 보냈습니다.");
        handleReset();
        setAdminUnlocked(false);
        return;
      }

      const updateQuery = supabase
        .from("daily_cash")
        .update(payload)
        .eq("id", editData.id);

      saveResult = await updateQuery.select("id");
    } else {
      saveResult = await supabase.from("daily_cash").insert({
        ...payload,
        created_on: localDateText(),
      });
    }
    const { error } = saveResult;

    if (error) {
      alert((isEditMode ? "수정 실패: " : "저장 실패: ") + error.message);
      return;
    }

    if (editData && (!saveResult.data || saveResult.data.length === 0)) {
      alert(
        adminUnlocked
          ? "수정할 입출금 내역을 찾지 못했습니다."
          : "입력 당일 내역 또는 최근 7일 이내 수입 미확인 내역만 수정할 수 있습니다."
      );
      return;
    }

    if (editData && isSettlementPaymentRow) {
      const paymentId =
        Number(editData.source_detail_id) ||
        Number(String(editData.source_key ?? "").replace("settlement_payment:", ""));
      const [paymentType = form.category, paymentDetail = ""] = String(
        form.content || ""
      )
        .split("/")
        .map((value) => value.trim());

      if (Number.isFinite(paymentId) && paymentId > 0) {
        const { error: paymentError } = await supabase
          .from("settlement_payments")
          .update({
            payment_type: paymentType || form.category,
            payment_detail: paymentDetail,
            payment_amount: form.type === "수입" ? amount : 0,
            payment_date: form.date || null,
            payment_method: normalizeAccountName(form.account),
            payment_status: form.date ? "수금" : "청구",
          })
          .eq("id", paymentId);

        if (paymentError) {
          alert("차량정산 연동 실패: " + paymentError.message);
          return;
        }
      }
    }

    alert(isEditMode ? "수정되었습니다." : "저장되었습니다.");
    handleReset();
    setAdminUnlocked(false);
    } finally {
      saveInProgressRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">
          {isEditMode ? "입출금수정" : "입출금등록"}
        </h3>
        <p className="text-sm text-slate-700">
          일일 입금 및 출금 내역을 등록하는 화면입니다.
        </p>
      </div>

      {requiresAdminUnlock && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-bold">관리자 승인 후 반영되는 입출금 내역입니다.</p>
              <p className="mt-1">
                저장하면 바로 반영하지 않고 입출금 승인요청으로 전달됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAdminUnlock}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:bg-slate-400"
              disabled={adminUnlocked}
            >
              {adminUnlocked ? "관리자 승인 완료" : "관리자 승인"}
            </button>
          </div>
        </section>
      )}

      {isSettlementPaymentRow && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-bold">차량정산에서 입력된 입출금 내역입니다.</p>
          <p className="mt-1">
            정산등록에서 입금수단과 금액을 수정한 뒤 저장하면 일일입출금에 반영됩니다.
          </p>
        </section>
      )}

      {editData && isUnconfirmedIncome(editData) && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <label className={labelClass}>차량정산 작명</label>
              <input
                className={inputClass}
                placeholder="2026-05-028"
                value={settlementWorkName}
                onChange={(event) => setSettlementWorkName(event.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={handleSettlementLink}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              차량정산으로 연동
            </button>
          </div>
          <p className="mt-2">
            미확인 입금이 차량정산 입금이면 작명을 입력해 정산등록으로 가져갈 수 있습니다.
          </p>
        </section>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className={labelClass}>일자</label>
          <input
            className={inputClass}
            type="date"
            value={form.date}
            onChange={(event) => handleChange("date", event.target.value)}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className={labelClass}>계정</label>
          <select
            className={inputClass}
            value={form.account}
            onChange={(event) => handleChange("account", event.target.value)}
          >
            <option value="">선택</option>
            <option>국민은행</option>
            <option>부산은행</option>
            <option>법인1층</option>
            <option>현금</option>
            <option>카드</option>
            <option>BLUE POINT</option>
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>구분</label>

  <select
  className={inputClass}
  value={form.type}
  onChange={(event) => {
    handleTypeChange(event.target.value);
  }}
>
    <option value="">선택</option>
    <option>수입</option>
    <option>고정비</option>
    <option>변동비</option>
    <option>내부이동</option>
  </select>
</div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>분류</label>

  <select
  className={inputClass}
  value={form.category}
  onChange={(event) =>
    handleChange("category", event.target.value)
  }
>
  <option value="">선택</option>

  {selectedCategoryOptions.map((item) => (
    <option key={item} value={item}>
      {item}
    </option>
  ))}
</select>
</div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className={labelClass}>내용</label>
          <input
            className={inputClass}
            placeholder="입출금 내용 입력"
            value={form.content}
            onChange={(event) => handleChange("content", event.target.value)}
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className={labelClass}>금액</label>
          <input
  className={inputClass}
  placeholder="0"
  inputMode="numeric"
  value={form.amount}
  onChange={(event) => {
    const rawValue = event.target.value.replaceAll(",", "");

    if (!/^\d*$/.test(rawValue)) {
      return;
    }

    const formattedValue = rawValue
      ? Number(rawValue).toLocaleString()
      : "";

    handleChange("amount", formattedValue);
  }}
/>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <label className={labelClass}>비고</label>
        <textarea
          className={`${inputClass} h-28 resize-none`}
          placeholder="비고 입력"
          value={form.memo}
          onChange={(event) => handleChange("memo", event.target.value)}
        />
      </section>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          초기화
        </button>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          title={
            canSaveCurrentRow
              ? undefined
              : isSettlementPaymentRow
                ? "차량정산에서 수정 후 저장하세요."
                : "관리자 승인 후 수정할 수 있습니다."
          }
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
        >
          {saving ? (isEditMode ? "수정 중..." : "저장 중...") : isEditMode ? "수정저장" : "저장"}
        </button>
      </div>

      {adminPasswordOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h4 className="text-lg font-bold text-slate-900">관리자 승인</h4>
            <p className="mt-2 text-sm text-slate-600">
              잠긴 일일입출금 내역을 수정하려면 관리자 비밀번호를 입력하세요.
            </p>
            <input
              className={inputClass}
              type="password"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  void confirmAdminUnlock();
                }
              }}
              autoFocus
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
                onClick={() => {
                  void confirmAdminUnlock();
                }}
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
