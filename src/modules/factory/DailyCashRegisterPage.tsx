"use client";

import { useEffect, useMemo, useState } from "react";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";

const labelClass = "text-sm font-semibold text-slate-800";

const normalizeAccountName = (value: string) =>
  value.trim().toUpperCase().includes("BLUE") || value.includes("블루")
    ? "BLUE POINT"
    : value;

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
};

type DailyCashRegisterPageProps = {
  editData?: DailyCashRow;
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

  const isEditMode = Boolean(editData);
  const canEditCurrentRow =
    !editData || editData.created_on === localDateText();

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
  }, [editData]);

  function handleChange(key: keyof FormState, value: string) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function handleReset() {
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

  async function handleSave() {
    if (editData && !canEditCurrentRow) {
      alert("입력한 당일 내역만 수정할 수 있습니다.");
      return;
    }

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

    const saveResult = editData
      ? await supabase
          .from("daily_cash")
          .update(payload)
          .eq("id", editData.id)
          .eq("created_on", localDateText())
          .select("id")
      : await supabase.from("daily_cash").insert({
          ...payload,
          created_on: localDateText(),
        });
    const { error } = saveResult;

    if (error) {
      alert((isEditMode ? "수정 실패: " : "저장 실패: ") + error.message);
      return;
    }

    if (editData && (!saveResult.data || saveResult.data.length === 0)) {
      alert("입력한 당일 내역만 수정할 수 있습니다.");
      return;
    }

    alert(isEditMode ? "수정되었습니다." : "저장되었습니다.");
    handleReset();
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
    handleChange("type", event.target.value);
    handleChange("category", "");
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
          disabled={!canEditCurrentRow}
          title={
            canEditCurrentRow
              ? undefined
              : "입력한 당일 내역만 수정할 수 있습니다."
          }
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
        >
          {isEditMode ? "수정저장" : "저장"}
        </button>
      </div>
    </div>
  );
}
