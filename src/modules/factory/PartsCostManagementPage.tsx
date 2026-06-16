"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type LoginUser = {
  user_id: string;
  user_name: string;
  role: UserRole;
};

type PartsCostManagementPageProps = {
  user: LoginUser;
};

type PartCostEntry = {
  id: number;
  use_date: string;
  supplier_name: string;
  work_name: string | null;
  part_name: string;
  amount: number;
  memo: string | null;
  created_name: string | null;
  created_at: string;
};

type SettlementStatus =
  | "입력중"
  | "거래처확인중"
  | "금액확정"
  | "결제예약"
  | "결제완료";

type MonthlySettlement = {
  id: number;
  usage_month: string;
  supplier_name: string;
  calculated_amount: number;
  confirmed_amount: number;
  status: SettlementStatus;
  payment_due_date: string | null;
  payment_method: string | null;
  paid_at: string | null;
  confirm_memo: string | null;
};

type SupplierSummary = {
  supplierName: string;
  entryCount: number;
  calculatedAmount: number;
  confirmedAmount: number;
  status: SettlementStatus;
  paymentDueDate: string;
  paymentMethod: string;
  paidAt: string;
  confirmMemo: string;
  settlement?: MonthlySettlement;
};

type FormState = {
  useDate: string;
  supplierName: string;
  workName: string;
  partName: string;
  amount: string;
  memo: string;
};

const today = localDateText();
const currentYear = today.slice(0, 4);
const currentMonth = today.slice(5, 7);
const initialForm: FormState = {
  useDate: today,
  supplierName: "",
  workName: "",
  partName: "",
  amount: "",
  memo: "",
};
const knownPartSuppliers = [
  "태양상사",
  "유진사",
  "태오",
  "KGM",
  "거성",
  "일광",
  "혜성",
  "동륭",
  "인비전스",
  "광명유리",
  "종합상사",
  "금강종합부품",
];
const paymentMethods = ["국민은행", "부산은행", "카드", "현금", "법인1층"];

const formatWon = (amount: number) => amount.toLocaleString();
const parseAmount = (value: string) => Number(value.replace(/\D/g, "") || 0);
const formatAmountInput = (value: string) => {
  const amount = parseAmount(value);
  return amount > 0 ? amount.toLocaleString() : "";
};
const getMonthRange = (monthText: string) => {
  const [year, month] = monthText.split("-").map(Number);
  const endDate = new Date(year, month, 0).getDate();

  return {
    startDate: `${monthText}-01`,
    endDate: `${monthText}-${String(endDate).padStart(2, "0")}`,
  };
};
const getNextMonthEndDate = (monthText: string) => {
  const [year, month] = monthText.split("-").map(Number);
  const date = new Date(year, month + 1, 0);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, "0");
  const nextDay = String(date.getDate()).padStart(2, "0");

  return `${nextYear}-${nextMonth}-${nextDay}`;
};

export default function PartsCostManagementPage({
  user,
}: PartsCostManagementPageProps) {
  const [activeTab, setActiveTab] = useState<"daily" | "monthly" | "payment">(
    "daily"
  );
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [entries, setEntries] = useState<PartCostEntry[]>([]);
  const [settlements, setSettlements] = useState<MonthlySettlement[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>(knownPartSuppliers);
  const [workOptions, setWorkOptions] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>(initialForm);
  const [searchText, setSearchText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmInputs, setConfirmInputs] = useState<Record<string, string>>({});
  const [memoInputs, setMemoInputs] = useState<Record<string, string>>({});
  const [methodInputs, setMethodInputs] = useState<Record<string, string>>({});

  const selectedUsageMonth = `${selectedYear}-${selectedMonth}`;
  const paymentDueDate = getNextMonthEndDate(selectedUsageMonth);

  const loadEntries = useCallback(async () => {
    const { startDate, endDate } = getMonthRange(selectedUsageMonth);
    const { data, error } = await supabase
      .from("part_cost_entries")
      .select("*")
      .gte("use_date", startDate)
      .lte("use_date", endDate)
      .order("use_date", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      alert(
        "부품대 내역 조회 실패: " +
          error.message +
          "\n\nsupabase_parts_cost_management.sql을 먼저 실행했는지 확인해 주세요."
      );
      return;
    }

    setEntries((data ?? []) as PartCostEntry[]);
  }, [selectedUsageMonth]);

  const loadSettlements = useCallback(async () => {
    const { data, error } = await supabase
      .from("part_cost_monthly_settlements")
      .select("*")
      .eq("usage_month", selectedUsageMonth)
      .order("supplier_name", { ascending: true });

    if (error) {
      setSettlements([]);
      return;
    }

    setSettlements((data ?? []) as MonthlySettlement[]);
  }, [selectedUsageMonth]);

  const loadOptions = useCallback(async () => {
    const [{ data: catalog }, { data: workOrders }] = await Promise.all([
      supabase
        .from("business_catalog")
        .select("name")
        .eq("item_type", "partner")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("work_orders")
        .select("work_name")
        .order("id", { ascending: false })
        .limit(300),
    ]);

    const catalogNames = ((catalog ?? []) as Array<{ name: string | null }>)
      .map((row) => row.name?.trim())
      .filter((name): name is string => Boolean(name));
    const workNames = ((workOrders ?? []) as Array<{ work_name: string | null }>)
      .map((row) => row.work_name?.trim())
      .filter((name): name is string => Boolean(name));

    setSupplierOptions(
      Array.from(new Set([...knownPartSuppliers, ...catalogNames])).sort((a, b) =>
        a.localeCompare(b, "ko")
      )
    );
    setWorkOptions(Array.from(new Set(workNames)));
  }, []);

  useEffect(() => {
    void loadEntries();
    void loadSettlements();
  }, [loadEntries, loadSettlements]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const supplierSummaries = useMemo(() => {
    const map = new Map<string, SupplierSummary>();

    entries.forEach((entry) => {
      const current =
        map.get(entry.supplier_name) ??
        ({
          supplierName: entry.supplier_name,
          entryCount: 0,
          calculatedAmount: 0,
          confirmedAmount: 0,
          status: "입력중",
          paymentDueDate,
          paymentMethod: "",
          paidAt: "",
          confirmMemo: "",
        } satisfies SupplierSummary);

      current.entryCount += 1;
      current.calculatedAmount += Number(entry.amount ?? 0);
      map.set(entry.supplier_name, current);
    });

    settlements.forEach((settlement) => {
      const current =
        map.get(settlement.supplier_name) ??
        ({
          supplierName: settlement.supplier_name,
          entryCount: 0,
          calculatedAmount: Number(settlement.calculated_amount ?? 0),
          confirmedAmount: 0,
          status: "입력중",
          paymentDueDate,
          paymentMethod: "",
          paidAt: "",
          confirmMemo: "",
        } satisfies SupplierSummary);

      current.settlement = settlement;
      current.status = settlement.status;
      current.confirmedAmount = Number(settlement.confirmed_amount ?? 0);
      current.paymentDueDate = settlement.payment_due_date ?? paymentDueDate;
      current.paymentMethod = settlement.payment_method ?? "";
      current.paidAt = settlement.paid_at ?? "";
      current.confirmMemo = settlement.confirm_memo ?? "";
      map.set(settlement.supplier_name, current);
    });

    return Array.from(map.values())
      .map((summary) => ({
        ...summary,
        confirmedAmount:
          summary.confirmedAmount > 0
            ? summary.confirmedAmount
            : summary.calculatedAmount,
      }))
      .sort((a, b) => b.calculatedAmount - a.calculatedAmount);
  }, [entries, paymentDueDate, settlements]);

  const totals = useMemo(() => {
    return supplierSummaries.reduce(
      (result, row) => ({
        calculated: result.calculated + row.calculatedAmount,
        confirmed: result.confirmed + row.confirmedAmount,
        unpaid:
          result.unpaid + (row.status === "결제완료" ? 0 : row.confirmedAmount),
      }),
      { calculated: 0, confirmed: 0, unpaid: 0 }
    );
  }, [supplierSummaries]);

  const filteredEntries = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return entries;

    return entries.filter((entry) =>
      [
        entry.use_date,
        entry.supplier_name,
        entry.work_name ?? "",
        entry.part_name,
        entry.memo ?? "",
        entry.created_name ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [entries, searchText]);

  const yearOptions = useMemo(() => {
    const baseYear = Number(currentYear);
    return Array.from({ length: 5 }, (_, index) => String(baseYear - 2 + index))
      .sort((a, b) => b.localeCompare(a));
  }, []);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveEntry = async () => {
    const amount = parseAmount(form.amount);

    if (!form.useDate || !form.supplierName.trim() || !form.partName.trim() || amount <= 0) {
      alert("사용일자, 거래처, 부품내용, 금액을 입력하세요.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("part_cost_entries").insert({
      use_date: form.useDate,
      supplier_name: form.supplierName.trim(),
      work_name: form.workName.trim() || null,
      part_name: form.partName.trim(),
      amount,
      memo: form.memo.trim() || null,
      created_by: user.user_id,
      created_name: user.user_name,
    });
    setSaving(false);

    if (error) {
      alert("부품대 저장 실패: " + error.message);
      return;
    }

    setForm((prev) => ({
      ...initialForm,
      useDate: prev.useDate,
      supplierName: prev.supplierName,
    }));
    await loadEntries();
  };

  const deleteEntry = async (entry: PartCostEntry) => {
    if (!confirm(`${entry.supplier_name} ${formatWon(Number(entry.amount))}원 내역을 삭제할까요?`)) {
      return;
    }

    const { error } = await supabase
      .from("part_cost_entries")
      .delete()
      .eq("id", entry.id);

    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }

    await loadEntries();
  };

  const upsertSettlement = async (
    summary: SupplierSummary,
    patch: Partial<MonthlySettlement>
  ) => {
    const amount = Number(
      patch.confirmed_amount ??
        summary.settlement?.confirmed_amount ??
        summary.confirmedAmount ??
        summary.calculatedAmount
    );

    const { error } = await supabase
      .from("part_cost_monthly_settlements")
      .upsert(
        {
          usage_month: selectedUsageMonth,
          supplier_name: summary.supplierName,
          calculated_amount: summary.calculatedAmount,
          confirmed_amount: amount,
          status: patch.status ?? summary.status,
          payment_due_date: patch.payment_due_date ?? summary.paymentDueDate,
          payment_method:
            (patch.payment_method ?? summary.paymentMethod) || null,
          paid_at: (patch.paid_at ?? summary.paidAt) || null,
          confirm_memo: (patch.confirm_memo ?? summary.confirmMemo) || null,
          created_by: user.user_id,
          created_name: user.user_name,
        },
        { onConflict: "usage_month,supplier_name" }
      );

    if (error) {
      alert("월별정산 저장 실패: " + error.message);
      return;
    }

    await loadSettlements();
  };

  const startReview = (summary: SupplierSummary) =>
    upsertSettlement(summary, {
      status: "거래처확인중",
      confirmed_amount: summary.confirmedAmount,
      payment_due_date: summary.paymentDueDate,
    });

  const confirmAmount = (summary: SupplierSummary) => {
    const amount = parseAmount(
      confirmInputs[summary.supplierName] || String(summary.confirmedAmount)
    );

    if (amount <= 0) {
      alert("확정금액을 입력하세요.");
      return;
    }

    return upsertSettlement(summary, {
      status: "금액확정",
      confirmed_amount: amount,
      payment_due_date: summary.paymentDueDate,
      confirm_memo: memoInputs[summary.supplierName] ?? summary.confirmMemo,
    });
  };

  const schedulePayment = (summary: SupplierSummary) =>
    upsertSettlement(summary, {
      status: "결제예약",
      confirmed_amount: summary.confirmedAmount,
      payment_due_date: summary.paymentDueDate,
      payment_method:
        methodInputs[summary.supplierName] || summary.paymentMethod || "국민은행",
    });

  const completePayment = (summary: SupplierSummary) =>
    upsertSettlement(summary, {
      status: "결제완료",
      confirmed_amount: summary.confirmedAmount,
      payment_due_date: summary.paymentDueDate,
      payment_method:
        methodInputs[summary.supplierName] || summary.paymentMethod || "국민은행",
      paid_at: localDateText(),
    });

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h3 className="text-2xl font-bold">부품대관리</h3>
          <p className="text-sm text-slate-600">
            매일 사용한 부품대를 입력하고, 월초 거래처 확인 후 다음달 말일 결제까지 관리합니다.
          </p>
        </div>
        <MonthSelector
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          yearOptions={yearOptions}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SummaryCard title="입력합계" value={`${formatWon(totals.calculated)}원`} />
        <SummaryCard title="확정합계" value={`${formatWon(totals.confirmed)}원`} />
        <SummaryCard title="미결제" value={`${formatWon(totals.unpaid)}원`} />
        <SummaryCard title="결제예정일" value={paymentDueDate} />
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">
        <TabButton active={activeTab === "daily"} onClick={() => setActiveTab("daily")}>
          일일입력
        </TabButton>
        <TabButton active={activeTab === "monthly"} onClick={() => setActiveTab("monthly")}>
          월별정산
        </TabButton>
        <TabButton active={activeTab === "payment"} onClick={() => setActiveTab("payment")}>
          결제관리
        </TabButton>
      </div>

      {activeTab === "daily" && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-6">
            <Field label="사용일자">
              <input
                type="date"
                className={inputClass}
                value={form.useDate}
                onChange={(event) => updateForm("useDate", event.target.value)}
              />
            </Field>
            <Field label="거래처">
              <input
                className={inputClass}
                list="part-supplier-options"
                value={form.supplierName}
                onChange={(event) => updateForm("supplierName", event.target.value)}
                placeholder="예: 태양상사"
              />
            </Field>
            <Field label="작명/차량">
              <input
                className={inputClass}
                list="part-work-options"
                value={form.workName}
                onChange={(event) => updateForm("workName", event.target.value)}
                placeholder="선택"
              />
            </Field>
            <Field label="부품내용">
              <input
                className={inputClass}
                value={form.partName}
                onChange={(event) => updateForm("partName", event.target.value)}
                placeholder="예: 범퍼, 몰딩"
              />
            </Field>
            <Field label="금액">
              <input
                className={`${inputClass} text-right`}
                value={form.amount}
                onChange={(event) =>
                  updateForm("amount", formatAmountInput(event.target.value))
                }
                placeholder="0"
              />
            </Field>
            <Field label="비고">
              <input
                className={inputClass}
                value={form.memo}
                onChange={(event) => updateForm("memo", event.target.value)}
                placeholder="메모"
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveEntry}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "저장중..." : "부품대 저장"}
            </button>
          </div>

          <datalist id="part-supplier-options">
            {supplierOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <datalist id="part-work-options">
            {workOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </section>
      )}

      {activeTab === "daily" && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h4 className="font-bold text-slate-900">일일 입력 내역</h4>
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:w-80"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="거래처, 작명, 부품내용 검색"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  <HeaderCell>사용일자</HeaderCell>
                  <HeaderCell>거래처</HeaderCell>
                  <HeaderCell>작명/차량</HeaderCell>
                  <HeaderCell>부품내용</HeaderCell>
                  <HeaderCell>금액</HeaderCell>
                  <HeaderCell>입력자</HeaderCell>
                  <HeaderCell>비고</HeaderCell>
                  <HeaderCell>관리</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="border border-slate-200 px-3 py-10 text-center text-slate-500">
                      입력된 부품대 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <BodyCell>{entry.use_date}</BodyCell>
                      <BodyCell strong>{entry.supplier_name}</BodyCell>
                      <BodyCell>{entry.work_name ?? "-"}</BodyCell>
                      <BodyCell>{entry.part_name}</BodyCell>
                      <BodyCell align="right">{formatWon(Number(entry.amount))}</BodyCell>
                      <BodyCell>{entry.created_name ?? "-"}</BodyCell>
                      <BodyCell>{entry.memo ?? "-"}</BodyCell>
                      <BodyCell>
                        <button
                          type="button"
                          onClick={() => void deleteEntry(entry)}
                          className="rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </BodyCell>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === "monthly" && (
        <MonthlySettlementTable
          rows={supplierSummaries}
          confirmInputs={confirmInputs}
          memoInputs={memoInputs}
          onConfirmInputChange={(supplier, value) =>
            setConfirmInputs((prev) => ({ ...prev, [supplier]: value }))
          }
          onMemoInputChange={(supplier, value) =>
            setMemoInputs((prev) => ({ ...prev, [supplier]: value }))
          }
          onStartReview={startReview}
          onConfirmAmount={confirmAmount}
        />
      )}

      {activeTab === "payment" && (
        <PaymentManagementTable
          rows={supplierSummaries}
          methodInputs={methodInputs}
          paymentMethods={paymentMethods}
          onMethodChange={(supplier, value) =>
            setMethodInputs((prev) => ({ ...prev, [supplier]: value }))
          }
          onSchedulePayment={schedulePayment}
          onCompletePayment={completePayment}
        />
      )}
    </div>
  );
}

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";

function MonthSelector({
  selectedYear,
  selectedMonth,
  yearOptions,
  onYearChange,
  onMonthChange,
}: {
  selectedYear: string;
  selectedMonth: string;
  yearOptions: string[];
  onYearChange: (value: string) => void;
  onMonthChange: (value: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <select
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        value={selectedYear}
        onChange={(event) => onYearChange(event.target.value)}
      >
        {yearOptions.map((year) => (
          <option key={year} value={year}>
            {year}년
          </option>
        ))}
      </select>
      <select
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
        value={selectedMonth}
        onChange={(event) => onMonthChange(event.target.value)}
      >
        {Array.from({ length: 12 }, (_, index) => {
          const month = String(index + 1).padStart(2, "0");
          return (
            <option key={month} value={month}>
              {index + 1}월
            </option>
          );
        })}
      </select>
    </div>
  );
}

function MonthlySettlementTable({
  rows,
  confirmInputs,
  memoInputs,
  onConfirmInputChange,
  onMemoInputChange,
  onStartReview,
  onConfirmAmount,
}: {
  rows: SupplierSummary[];
  confirmInputs: Record<string, string>;
  memoInputs: Record<string, string>;
  onConfirmInputChange: (supplier: string, value: string) => void;
  onMemoInputChange: (supplier: string, value: string) => void;
  onStartReview: (summary: SupplierSummary) => void;
  onConfirmAmount: (summary: SupplierSummary) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 font-bold text-slate-900">월별 거래처 정산</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1020px] border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <HeaderCell>거래처</HeaderCell>
              <HeaderCell>입력건수</HeaderCell>
              <HeaderCell>입력합계</HeaderCell>
              <HeaderCell>확정금액</HeaderCell>
              <HeaderCell>상태</HeaderCell>
              <HeaderCell>확인메모</HeaderCell>
              <HeaderCell>처리</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-slate-200 px-3 py-10 text-center text-slate-500">
                  정산할 부품대 내역이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.supplierName} className="hover:bg-slate-50">
                  <BodyCell strong>{row.supplierName}</BodyCell>
                  <BodyCell>{row.entryCount.toLocaleString()}건</BodyCell>
                  <BodyCell align="right">{formatWon(row.calculatedAmount)}</BodyCell>
                  <td className="border border-slate-200 px-2 py-2">
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1 text-right text-sm"
                      value={
                        confirmInputs[row.supplierName] ??
                        formatWon(row.confirmedAmount)
                      }
                      onChange={(event) =>
                        onConfirmInputChange(
                          row.supplierName,
                          formatAmountInput(event.target.value)
                        )
                      }
                    />
                  </td>
                  <BodyCell>
                    <StatusBadge status={row.status} />
                  </BodyCell>
                  <td className="border border-slate-200 px-2 py-2">
                    <input
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      value={memoInputs[row.supplierName] ?? row.confirmMemo}
                      onChange={(event) =>
                        onMemoInputChange(row.supplierName, event.target.value)
                      }
                      placeholder="거래처 확인 메모"
                    />
                  </td>
                  <BodyCell>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void onStartReview(row)}
                        className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50"
                      >
                        확인중
                      </button>
                      <button
                        type="button"
                        onClick={() => void onConfirmAmount(row)}
                        className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        금액확정
                      </button>
                    </div>
                  </BodyCell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PaymentManagementTable({
  rows,
  methodInputs,
  paymentMethods,
  onMethodChange,
  onSchedulePayment,
  onCompletePayment,
}: {
  rows: SupplierSummary[];
  methodInputs: Record<string, string>;
  paymentMethods: string[];
  onMethodChange: (supplier: string, value: string) => void;
  onSchedulePayment: (summary: SupplierSummary) => void;
  onCompletePayment: (summary: SupplierSummary) => void;
}) {
  const paymentRows = rows.filter((row) => row.confirmedAmount > 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 font-bold text-slate-900">결제관리</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <HeaderCell>거래처</HeaderCell>
              <HeaderCell>확정금액</HeaderCell>
              <HeaderCell>결제예정일</HeaderCell>
              <HeaderCell>결제방법</HeaderCell>
              <HeaderCell>결제완료일</HeaderCell>
              <HeaderCell>상태</HeaderCell>
              <HeaderCell>처리</HeaderCell>
            </tr>
          </thead>
          <tbody>
            {paymentRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-slate-200 px-3 py-10 text-center text-slate-500">
                  확정된 결제 대상이 없습니다.
                </td>
              </tr>
            ) : (
              paymentRows.map((row) => (
                <tr key={row.supplierName} className="hover:bg-slate-50">
                  <BodyCell strong>{row.supplierName}</BodyCell>
                  <BodyCell align="right">{formatWon(row.confirmedAmount)}</BodyCell>
                  <BodyCell>{row.paymentDueDate}</BodyCell>
                  <td className="border border-slate-200 px-2 py-2">
                    <select
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                      value={methodInputs[row.supplierName] ?? row.paymentMethod ?? "국민은행"}
                      onChange={(event) =>
                        onMethodChange(row.supplierName, event.target.value)
                      }
                    >
                      {paymentMethods.map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </td>
                  <BodyCell>{row.paidAt || "-"}</BodyCell>
                  <BodyCell>
                    <StatusBadge status={row.status} />
                  </BodyCell>
                  <BodyCell>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void onSchedulePayment(row)}
                        className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                      >
                        결제예약
                      </button>
                      <button
                        type="button"
                        onClick={() => void onCompletePayment(row)}
                        className="rounded bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                      >
                        결제완료
                      </button>
                    </div>
                  </BodyCell>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="text-sm font-semibold text-slate-800">
      {label}
      {children}
    </label>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-lg px-4 py-2 text-sm font-semibold",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-500">{title}</p>
      <p className="mt-2 text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return <th className="border border-slate-200 px-2 py-2 text-center">{children}</th>;
}

function BodyCell({
  align = "center",
  children,
  strong = false,
}: {
  align?: "center" | "right";
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <td
      className={[
        "border border-slate-200 px-2 py-2",
        align === "right" ? "text-right" : "text-center",
        strong ? "font-semibold" : "",
      ].join(" ")}
    >
      {children}
    </td>
  );
}

function StatusBadge({ status }: { status: SettlementStatus }) {
  const className =
    status === "결제완료"
      ? "bg-green-100 text-green-700"
      : status === "결제예약"
        ? "bg-blue-100 text-blue-700"
        : status === "금액확정"
          ? "bg-indigo-100 text-indigo-700"
          : status === "거래처확인중"
            ? "bg-amber-100 text-amber-700"
            : "bg-slate-100 text-slate-600";

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${className}`}>
      {status}
    </span>
  );
}
