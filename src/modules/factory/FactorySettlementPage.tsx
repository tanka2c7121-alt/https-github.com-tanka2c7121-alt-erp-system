"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { supabase } from "../../lib/supabase";




type FactorySettlementPageProps = {
  view?: "all" | "complete" | "pending" | "deductible";
  onSelectMenu: (menu: MenuItem) => void;
};

type SettlementItem = {
  id: number;
  work_name: string;
  car_number: string;
  car_model: string;
  category: string;
  coverage_type: string;
  company: string;
  deductible_amount: string;
  status: "완결" | "미결";
  chargeAmount: number;
  paidAmount: number;
};

const formatWon = (amount: number) => amount.toLocaleString();

export default function FactorySettlementPage({
  view = "all",
  onSelectMenu,
}: FactorySettlementPageProps) {
  const [settlementList, setSettlementList] = useState<SettlementItem[]>([]);
  const [deductiblePaidWorkNames, setDeductiblePaidWorkNames] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");

  const [sortField, setSortField] = useState<keyof SettlementItem>("work_name");
const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

const handleSort = (field: keyof SettlementItem) => {
  if (sortField === field) {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  } else {
    setSortField(field);
    setSortOrder("asc");
  }
};

  const loadSettlementList = useCallback(async () => {
    const { data, error } = await supabase
      .from("work_orders")
      .select(`
        id,
        work_name,
        car_number,
        car_model,
        category,
        coverage_type,
        insurance_company,
        partner_company,
        deductible_amount,
        release_date
      `)
      .order("id", { ascending: false });

    if (error) {
      alert("차량정산 조회 실패: " + error.message);
      return;
    }
    const { data: settlementRows } = await supabase
  .from("repair_settlements")
  .select("work_name, progress_status");

    const { data: deductiblePaymentRows } = await supabase
      .from("settlement_payments")
      .select("work_name")
      .eq("payment_type", "면책금")
      .not("payment_date", "is", null);

  const settlementMap = new Map(
  (settlementRows ?? []).map((row) => [
    row.work_name,
    row.progress_status,
  ])
);

    setDeductiblePaidWorkNames(
      new Set(
        (deductiblePaymentRows ?? [])
          .map((row) => row.work_name)
          .filter(Boolean)
      )
    );

    setSettlementList(
      (data ?? []).map((item) => ({
        id: item.id,
        work_name: item.work_name ?? "",
        car_number: item.car_number ?? "",
        car_model: item.car_model ?? "",
        category: item.category ?? "",
        coverage_type: item.coverage_type ?? "",
        company: item.insurance_company || item.partner_company || "",
        deductible_amount: item.deductible_amount ?? "",
        status: settlementMap.get(item.work_name) ?? "미결",
        chargeAmount: 0,
        paidAmount: 0,
      }))
    );
  }, []);

  useEffect(() => {
    void loadSettlementList();
  }, [loadSettlementList]);

  const filteredList = useMemo(() => {
  const keyword = searchText.trim().toLowerCase();

  return [...settlementList]
    .sort((a, b) => {
      const aValue = String(a[sortField] ?? "");
      const bValue = String(b[sortField] ?? "");

      if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
      if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;

      return 0;
    })
    .filter((item) => {
      if (view === "all" && item.status === "완결") return false;
      if (view === "complete" && item.status !== "완결") return false;
      if (view === "pending" && item.status !== "미결") return false;

      if (!keyword) return true;

      return (
        item.work_name.toLowerCase().includes(keyword) ||
        item.car_number.toLowerCase().includes(keyword) ||
        item.car_model.toLowerCase().includes(keyword) ||
        item.company.toLowerCase().includes(keyword)
      );
    });
}, [settlementList, searchText, view, sortField, sortOrder]);

  const totalCount = settlementList.length;
  const pendingCount = settlementList.filter((item) => item.status === "미결").length;
  const completeCount = settlementList.filter((item) => item.status === "완결").length;
  const deductibleTargetItems = settlementList.filter((item) =>
    ["자차", "과실"].includes(item.coverage_type)
  );
  const deductibleTargetCount = deductibleTargetItems.length;
  const deductibleCompleteCount = deductibleTargetItems.filter((item) =>
    deductiblePaidWorkNames.has(item.work_name)
  ).length;

  const pageTitle =
    view === "complete"
      ? "완결 정산"
      : view === "pending"
        ? "미결 정산"
        : view === "deductible"
          ? "면책금 관리"
          : "차량정산";

  const [currentPage, setCurrentPage] = useState(1);
const pageSize = 30;

const totalPages = Math.ceil(filteredList.length / pageSize);

const pagedList = filteredList.slice(
  (currentPage - 1) * pageSize,
  currentPage * pageSize
);

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">{pageTitle}</h3>
        <p className="text-sm text-slate-700">
          작업별 청구금액, 입금금액, 미수금, 면책금을 확인하는 화면입니다.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">전체</p>
          <p className="mt-2 text-2xl font-bold">{totalCount}건</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">미결</p>
          <p className="mt-2 text-2xl font-bold text-red-600">{pendingCount}건</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">완결</p>
          <p className="mt-2 text-2xl font-bold text-green-600">{completeCount}건</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold text-slate-700">면책금</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">
            {deductibleCompleteCount} / {deductibleTargetCount}건
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <input
            className="w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="작명 / 차량번호 / 보험사 검색"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />

          <button
            type="button"
            onClick={() =>
              onSelectMenu({
                id: "factory-settlement-repair-register",
                title: "정산등록",
              })
            }
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            정산등록
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th
                  onClick={() => handleSort("work_name")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  작명
                </th>
                <th
                  onClick={() => handleSort("car_number")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  차량번호
                </th>
                <th
                  onClick={() => handleSort("car_model")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  차량명
                </th>
                <th
                  onClick={() => handleSort("category")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  구분
                </th>
                <th
                  onClick={() => handleSort("company")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  보험사
                </th>
                <th
                  onClick={() => handleSort("chargeAmount")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  청구금액
                </th>
                <th
                  onClick={() => handleSort("paidAmount")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  입금금액
                </th>
                <th className="border border-slate-300 px-3 py-2">
                  미수금
                </th>
                <th
                  onClick={() => handleSort("deductible_amount")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  면책금
                </th>
                <th
                  onClick={() => handleSort("status")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  상태
                </th>
                <th
                  onClick={() => handleSort("id")}
                  className="cursor-pointer select-none border border-slate-300 px-3 py-2">
                  관리
                </th>
              </tr>
            </thead>

            <tbody>
              {pagedList.map((item) => {
                const unpaidAmount = item.chargeAmount - item.paidAmount;

                return (
                  <tr key={item.id} className="hover:bg-blue-50">
                    <td className="border border-slate-300 px-3 py-2 font-semibold">
                      {item.work_name}
                    </td>
                    <td className="border border-slate-300 px-3 py-2">{item.car_number}</td>
                    <td className="border border-slate-300 px-3 py-2">{item.car_model}</td>
                    <td className="border border-slate-300 px-3 py-2 text-center">{item.category}</td>
                    <td className="border border-slate-300 px-3 py-2">{item.company}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">{formatWon(item.chargeAmount)}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right">{formatWon(item.paidAmount)}</td>
                    <td className="border border-slate-300 px-3 py-2 text-right font-semibold text-red-600">
                      {formatWon(unpaidAmount)}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-right text-blue-600">
                      {item.deductible_amount || "-"}
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center">
                      <span
                        className={
                          item.status === "완결"
                            ? "rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700"
                            : "rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700"
                        }
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="border border-slate-300 px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectMenu({
                            id: "factory-settlement-repair-register",
                            title: "정산등록",
                            data: { workName: item.work_name },
                          })
                        }
                        className="rounded border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50"
                      >
                        수정
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredList.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="border border-slate-300 px-3 py-10 text-center text-slate-500"
                  >
                    표시할 정산 데이터가 없습니다.
                  </td>
                </tr>
              )}
             
            </tbody>
          </table>
          <div className="mt-4 flex w-full items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="rounded px-3 py-1 disabled:opacity-40"
                >
                 {"<<"}
                 </button>

                 <button
                   type="button"
                   onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                   disabled={currentPage === 1}
                   className="rounded px-3 py-1 disabled:opacity-40"
                >
                 {"<"}
                </button>

                {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                 <button
                   key={page}
                   type="button"
                   onClick={() => setCurrentPage(page)}
                   className={
                   currentPage === page
                  ? "rounded bg-blue-600 px-3 py-1 text-white"
                  : "rounded px-3 py-1"
                }
                  >
                 {page}
                </button>
              ))}

                <button
                  type="button"
                   onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                   disabled={currentPage === totalPages}
                   className="rounded px-3 py-1 disabled:opacity-40"
                >
                  {">"}
                </button>

                <button
                   type="button"
                   onClick={() => setCurrentPage(totalPages)}
                   disabled={currentPage === totalPages}
                   className="rounded px-3 py-1 disabled:opacity-40"
                    >
                  {">>"}
                </button>
              </div>
           </div>
       </div>
    </div>
  );
}
