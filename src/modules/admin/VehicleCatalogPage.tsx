"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type VehicleCatalogRow = {
  id: number;
  maker: string;
  model: string;
  color_code: string | null;
  is_active: boolean;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";

export default function VehicleCatalogPage() {
  const [rows, setRows] = useState<VehicleCatalogRow[]>([]);
  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [searchText, setSearchText] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRows = async () => {
    const { data, error } = await supabase
      .from("vehicle_catalog")
      .select("id, maker, model, color_code, is_active")
      .order("maker", { ascending: true })
      .order("model", { ascending: true })
      .order("color_code", { ascending: true });

    if (error) {
      alert("차량목록 조회 실패: " + error.message);
      return;
    }

    setRows((data ?? []) as VehicleCatalogRow[]);
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const visibleRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) {
      return rows;
    }

    return rows.filter((row) =>
      [row.maker, row.model, row.color_code ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [rows, searchText]);

  const resetForm = () => {
    setMaker("");
    setModel("");
    setColorCode("");
  };

  const handleAdd = async () => {
    const nextMaker = maker.trim();
    const nextModel = model.trim();
    const nextColorCode = colorCode.trim().toUpperCase();

    if (!nextMaker || !nextModel) {
      alert("제조사와 차량명을 입력하세요.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("vehicle_catalog").insert({
      maker: nextMaker,
      model: nextModel,
      color_code: nextColorCode || null,
      is_active: true,
    });

    setSaving(false);

    if (error) {
      alert("차량목록 추가 실패: " + error.message);
      return;
    }

    resetForm();
    void loadRows();
  };

  const toggleActive = async (row: VehicleCatalogRow) => {
    const { error } = await supabase
      .from("vehicle_catalog")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      alert("상태 변경 실패: " + error.message);
      return;
    }

    void loadRows();
  };

  const deleteRow = async (row: VehicleCatalogRow) => {
    if (!confirm(`${row.maker} ${row.model} ${row.color_code ?? ""} 항목을 삭제할까요?`)) {
      return;
    }

    const { error } = await supabase
      .from("vehicle_catalog")
      .delete()
      .eq("id", row.id);

    if (error) {
      alert("삭제 실패: " + error.message);
      return;
    }

    void loadRows();
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">차량목록관리</h3>
        <p className="mt-1 text-sm text-slate-600">
          작업등록에서 사용할 제조사, 차량명, 칼라코드를 추가합니다.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className={inputClass}
            placeholder="제조사 예: 현대"
            value={maker}
            onChange={(event) => setMaker(event.target.value)}
          />
          <input
            className={inputClass}
            placeholder="차량명 예: 그랜저"
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
          <input
            className={inputClass}
            placeholder="칼라코드 예: A2B"
            value={colorCode}
            onChange={(event) => setColorCode(event.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              void handleAdd();
            }}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
          >
            {saving ? "추가 중..." : "목록추가"}
          </button>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-700">
          총 {visibleRows.length.toLocaleString()}개
        </p>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-72"
          placeholder="제조사, 차량명, 칼라코드 검색"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead className="bg-slate-100">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">
                  제조사
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">
                  차량명
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">
                  칼라코드
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">
                  사용
                </th>
                <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="border-b border-slate-100 px-3 py-2 text-sm">
                    {row.maker}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">
                    {row.model}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-sm">
                    {row.color_code || "-"}
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        void toggleActive(row);
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        row.is_active
                          ? "bg-blue-50 text-blue-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {row.is_active ? "사용중" : "중지"}
                    </button>
                  </td>
                  <td className="border-b border-slate-100 px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        void deleteRow(row);
                      }}
                      className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
