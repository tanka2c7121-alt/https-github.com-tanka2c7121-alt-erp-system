"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type LoginUser = {
  id: string | number;
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
};

type ClosedSettlementManagementPageProps = {
  user: LoginUser;
  onSelectMenu: (menu: MenuItem) => void;
};

type SettlementRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_model: string | null;
  insurance_company: string | null;
  progress_status: string | null;
  claim_amount: number | null;
  total_amount: number | null;
};

type QueryBuilder = any;

async function fetchAllRows<T>(
  tableName: string,
  selectQuery: string,
  configure?: (query: QueryBuilder) => QueryBuilder
): Promise<{ data: T[]; error: any }> {
  const pageSize = 1000;
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(tableName).select(selectQuery);

    if (configure) {
      query = configure(query);
    }

    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      return { data: rows, error };
    }

    rows.push(...((data ?? []) as T[]));

    if (!data || data.length < pageSize) {
      break;
    }
  }

  return { data: rows, error: null };
}

const normalizeText = (value: unknown) => String(value ?? "").trim();
const formatWon = (value: unknown) =>
  `${Number(value ?? 0).toLocaleString()}원`;
const currentDateText = localDateText();
const currentYear = currentDateText.slice(0, 4);
const currentMonth = currentDateText.slice(5, 7);

export default function ClosedSettlementManagementPage({
  user,
  onSelectMenu,
}: ClosedSettlementManagementPageProps) {
  const [rows, setRows] = useState<SettlementRow[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [unlockingId, setUnlockingId] = useState<number | null>(null);
  const isAdmin = user.role === "ADMIN";

  const loadRows = useCallback(async () => {
    setLoading(true);

    const { data, error } = await fetchAllRows<SettlementRow>(
      "repair_settlements",
      [
        "id",
        "work_name",
        "car_number",
        "car_model",
        "insurance_company",
        "progress_status",
        "claim_amount",
        "total_amount",
      ].join(", "),
      (query) => query.order("id", { ascending: false })
    );

    setLoading(false);

    if (error) {
      alert("종결 정산 조회 실패: " + error.message);
      return;
    }

    setRows(
      ((data ?? []) as SettlementRow[]).filter((row) =>
        normalizeText(row.progress_status).includes("종결")
      )
    );
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return rows
      .filter((row) => {
        const workName = normalizeText(row.work_name);
        if (!selectedYear) return true;
        return workName.startsWith(selectedYear);
      })
      .filter((row) => {
        const workName = normalizeText(row.work_name);
        if (!selectedMonth) return true;
        return workName.slice(5, 7) === selectedMonth;
      })
      .filter((row) => {
        if (!keyword) return true;

        return [
          row.work_name,
          row.car_number,
          row.car_model,
          row.insurance_company,
          row.progress_status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      });
  }, [rows, searchText, selectedMonth, selectedYear]);

  const yearOptions = useMemo(() => {
    return Array.from(
      new Set([
        currentYear,
        ...rows
          .map((row) => normalizeText(row.work_name).slice(0, 4))
          .filter(Boolean),
      ])
    ).sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const openSettlement = (workName: string) => {
    onSelectMenu({
      id: "factory-settlement-repair-register",
      title: "정산등록",
      data: { workName },
    });
  };

  const unlockSettlement = async (row: SettlementRow) => {
    const workName = normalizeText(row.work_name);

    if (!isAdmin || !workName) return;

    const ok = window.confirm(
      `${workName} 종결을 해제하고 완결 상태로 되돌릴까요?`
    );

    if (!ok) return;

    setUnlockingId(row.id);

    const { error } = await supabase
      .from("repair_settlements")
      .update({
        progress_status: "완결",
      })
      .eq("id", row.id);

    setUnlockingId(null);

    if (error) {
      alert("종결 해제 실패: " + error.message);
      return;
    }

    alert("종결을 해제했습니다. 정산등록에서 내용을 확인해 주세요.");
    await loadRows();
    openSettlement(workName);
  };

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-2xl font-bold">종결관리</h3>
          <p className="text-sm text-slate-600">
            종결 처리된 정산을 작명 기준으로 검색하고, 문제가 있을 때 관리자만 해제합니다.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700">
          종결 {rows.length.toLocaleString()}건
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedYear}
              onChange={(event) => setSelectedYear(event.target.value)}
            >
              <option value="">전체 년도</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}년
                </option>
              ))}
            </select>

            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            >
              <option value="">전체 월</option>
              {Array.from({ length: 12 }, (_, index) => {
                const month = String(index + 1).padStart(2, "0");

                return (
                  <option key={month} value={month}>
                    {index + 1}월
                  </option>
                );
              })}
            </select>

            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 sm:w-80"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="작명, 차량번호, 보험사 검색"
            />
          </div>
          <div className="text-sm font-semibold text-slate-600">
            조회 {filteredRows.length.toLocaleString()}건
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-left text-slate-700">
                <th className="border border-slate-200 px-3 py-2">작명</th>
                <th className="border border-slate-200 px-3 py-2">차량번호</th>
                <th className="border border-slate-200 px-3 py-2">차량명</th>
                <th className="border border-slate-200 px-3 py-2">보험사</th>
                <th className="border border-slate-200 px-3 py-2 text-right">청구금액</th>
                <th className="border border-slate-200 px-3 py-2 text-right">합계금액</th>
                <th className="border border-slate-200 px-3 py-2 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="border border-slate-200 px-3 py-8 text-center text-slate-500" colSpan={7}>
                    조회 중입니다.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td className="border border-slate-200 px-3 py-8 text-center text-slate-500" colSpan={7}>
                    표시할 종결 정산이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, index) => {
                  const workName = normalizeText(row.work_name);

                  return (
                    <tr key={`${row.id}-${workName}-${index}`} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-2 font-bold">{workName}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.car_number ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.car_model ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2">{row.insurance_company ?? ""}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right">{formatWon(row.claim_amount)}</td>
                      <td className="border border-slate-200 px-3 py-2 text-right">{formatWon(row.total_amount)}</td>
                      <td className="border border-slate-200 px-3 py-2">
                        <div className="flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => openSettlement(workName)}
                            className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            보기
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => void unlockSettlement(row)}
                              disabled={unlockingId === row.id}
                              className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {unlockingId === row.id ? "해제중" : "종결해제"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredRows.map((row, index) => {
            const workName = normalizeText(row.work_name);

            return (
              <div key={`${row.id}-${workName}-${index}`} className="rounded-xl border border-slate-200 p-4">
                <div className="font-bold text-slate-900">{workName}</div>
                <div className="mt-1 text-sm text-slate-600">
                  {row.car_number ?? ""} / {row.car_model ?? ""}
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {row.insurance_company ?? ""} / 청구 {formatWon(row.claim_amount)}
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => openSettlement(workName)}
                    className="flex-1 rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700"
                  >
                    보기
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => void unlockSettlement(row)}
                      disabled={unlockingId === row.id}
                      className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {unlockingId === row.id ? "해제중" : "종결해제"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
