"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type PartSupplier = {
  id: number;
  supplier_name: string;
  business_number: string | null;
  phone_number: string | null;
  email: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
};

type FormState = {
  supplierName: string;
  businessNumber: string;
  phoneNumber: string;
  email: string;
  memo: string;
};

type LoginUser = {
  user_id: string;
  user_name: string;
};

const emptyForm: FormState = {
  supplierName: "",
  businessNumber: "",
  phoneNumber: "",
  email: "",
  memo: "",
};

const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";

export default function PartSupplierManagementPage({
  user,
}: {
  user: LoginUser;
}) {
  const [rows, setRows] = useState<PartSupplier[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("part_suppliers")
      .select("*")
      .order("supplier_name", { ascending: true });

    if (error) {
      alert(
        "업체 조회 실패: " +
          error.message +
          "\n\nsupabase_parts_cost_management.sql을 먼저 실행했는지 확인해 주세요."
      );
      return;
    }

    setRows((data ?? []) as PartSupplier[]);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const visibleRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) =>
      [
        row.supplier_name,
        row.business_number ?? "",
        row.phone_number ?? "",
        row.email ?? "",
        row.memo ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [rows, searchText]);

  const updateForm = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const saveSupplier = async () => {
    if (!form.supplierName.trim()) {
      alert("업체명을 입력하세요.");
      return;
    }

    setSaving(true);
    const payload = {
      supplier_name: form.supplierName.trim(),
      business_number: form.businessNumber.trim() || null,
      phone_number: form.phoneNumber.trim() || null,
      email: form.email.trim() || null,
      memo: form.memo.trim() || null,
      created_by: user.user_id,
      created_name: user.user_name,
    };
    const { error } = editingId
      ? await supabase.from("part_suppliers").update(payload).eq("id", editingId)
      : await supabase.from("part_suppliers").insert(payload);
    setSaving(false);

    if (error) {
      alert("업체 저장 실패: " + error.message);
      return;
    }

    resetForm();
    await loadRows();
  };

  const editSupplier = (row: PartSupplier) => {
    setEditingId(row.id);
    setForm({
      supplierName: row.supplier_name,
      businessNumber: row.business_number ?? "",
      phoneNumber: row.phone_number ?? "",
      email: row.email ?? "",
      memo: row.memo ?? "",
    });
  };

  const toggleActive = async (row: PartSupplier) => {
    const { error } = await supabase
      .from("part_suppliers")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      alert("상태 변경 실패: " + error.message);
      return;
    }

    await loadRows();
  };

  const deleteSupplier = async (row: PartSupplier) => {
    if (!confirm(`${row.supplier_name} 업체를 삭제할까요?`)) return;

    const { error } = await supabase
      .from("part_suppliers")
      .delete()
      .eq("id", row.id);

    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }

    await loadRows();
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">업체등록</h3>
        <p className="text-sm text-slate-600">
          부품대관리에서 사용할 부품대리점/업체 정보를 등록합니다.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Field label="업체명">
            <input
              className={inputClass}
              value={form.supplierName}
              onChange={(event) => updateForm("supplierName", event.target.value)}
              placeholder="예: 태양상사"
            />
          </Field>
          <Field label="사업자번호">
            <input
              className={inputClass}
              value={form.businessNumber}
              onChange={(event) => updateForm("businessNumber", event.target.value)}
              placeholder="000-00-00000"
            />
          </Field>
          <Field label="연락처">
            <input
              className={inputClass}
              value={form.phoneNumber}
              onChange={(event) => updateForm("phoneNumber", event.target.value)}
              placeholder="010-0000-0000"
            />
          </Field>
          <Field label="이메일">
            <input
              className={inputClass}
              value={form.email}
              onChange={(event) => updateForm("email", event.target.value)}
              placeholder="email@example.com"
            />
          </Field>
          <Field label="비고">
            <input
              className={inputClass}
              value={form.memo}
              onChange={(event) => updateForm("memo", event.target.value)}
              placeholder="정산 메모"
            />
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              취소
            </button>
          )}
          <button
            type="button"
            onClick={() => void saveSupplier()}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "저장중..." : editingId ? "수정저장" : "업체등록"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h4 className="font-bold text-slate-900">등록 업체</h4>
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:w-80"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="업체명, 사업자번호, 연락처 검색"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <HeaderCell>업체명</HeaderCell>
                <HeaderCell>사업자번호</HeaderCell>
                <HeaderCell>연락처</HeaderCell>
                <HeaderCell>이메일</HeaderCell>
                <HeaderCell>비고</HeaderCell>
                <HeaderCell>상태</HeaderCell>
                <HeaderCell>관리</HeaderCell>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border border-slate-200 px-3 py-10 text-center text-slate-500">
                    등록된 업체가 없습니다.
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <BodyCell strong>{row.supplier_name}</BodyCell>
                    <BodyCell>{row.business_number ?? "-"}</BodyCell>
                    <BodyCell>{row.phone_number ?? "-"}</BodyCell>
                    <BodyCell>{row.email ?? "-"}</BodyCell>
                    <BodyCell>{row.memo ?? "-"}</BodyCell>
                    <BodyCell>
                      <span
                        className={[
                          "rounded-full px-2 py-1 text-xs font-bold",
                          row.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-slate-100 text-slate-500",
                        ].join(" ")}
                      >
                        {row.is_active ? "사용" : "중지"}
                      </span>
                    </BodyCell>
                    <BodyCell>
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => editSupplier(row)}
                          className="rounded border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          {row.is_active ? "중지" : "사용"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteSupplier(row)}
                          className="rounded border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          삭제
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
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="text-sm font-semibold text-slate-800">
      {label}
      {children}
    </label>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return <th className="border border-slate-200 px-2 py-2 text-center">{children}</th>;
}

function BodyCell({
  children,
  strong = false,
}: {
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <td className={`border border-slate-200 px-2 py-2 text-center ${strong ? "font-semibold" : ""}`}>
      {children}
    </td>
  );
}
