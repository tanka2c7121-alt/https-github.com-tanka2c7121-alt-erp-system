"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { supabase } from "../../lib/supabase";

type OutboundStatusPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

type WorkItem = {
  id: number;
  work_name: string;
  car_number: string;
  car_model: string;
  color_code: string;
  car_year: string;
  category: string;
  coverage_type: string;
  inbound_date: string;
  outbound_date: string;
  release_date: string;
  status: string;
};

const pageSize = 30;

export default function OutboundStatusPage({
  onSelectMenu,
}: OutboundStatusPageProps) {
  const [sortField, setSortField] = useState<keyof WorkItem>("release_date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [searchText, setSearchText] = useState("");
  const [workList, setWorkList] = useState<WorkItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const loadWorkList = useCallback(async () => {
    const { data, error } = await supabase
      .from("work_orders")
      .select(
        "id, work_name, car_number, car_model, color_code, car_year, category, coverage_type, inbound_date, outbound_date, release_date"
      )
      .not("release_date", "is", null)
      .order("release_date", { ascending: false });

    if (error) {
      alert("출고현황 조회 실패: " + error.message);
      return;
    }

    setWorkList(
      (data ?? []).map((item) => ({
        id: item.id,
        work_name: item.work_name ?? "",
        car_number: item.car_number ?? "",
        car_model: item.car_model ?? "",
        color_code: item.color_code ?? "",
        car_year: item.car_year ?? "",
        category: item.category ?? "",
        coverage_type: item.coverage_type ?? "",
        inbound_date: item.inbound_date ?? "",
        outbound_date: item.outbound_date ?? "",
        release_date: item.release_date ?? "",
        status: "출고완료",
      }))
    );
  }, []);

  useEffect(() => {
    void loadWorkList();

    const handleFocus = () => {
      void loadWorkList();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [loadWorkList]);

  const handleSort = (field: keyof WorkItem) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
      return;
    }

    setSortField(field);
    setSortOrder("asc");
  };

  const filteredList = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return [...workList]
      .filter((item) => {
        if (!keyword) return true;

        return [
          item.work_name,
          item.car_number,
          item.car_model,
          item.color_code,
          item.category,
          item.coverage_type,
          item.inbound_date,
          item.release_date,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => {
        const aValue = String(a[sortField] ?? "");
        const bValue = String(b[sortField] ?? "");

        if (aValue < bValue) return sortOrder === "asc" ? -1 : 1;
        if (aValue > bValue) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
  }, [searchText, sortField, sortOrder, workList]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedList = filteredList.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize
  );

  const headers: Array<{ key: keyof WorkItem; label: string; className?: string }> = [
    { key: "id", label: "번호", className: "w-12" },
    { key: "work_name", label: "작명" },
    { key: "car_number", label: "차량번호", className: "w-24" },
    { key: "car_model", label: "차량명", className: "w-24" },
    { key: "color_code", label: "컬러코드", className: "w-20" },
    { key: "car_year", label: "차량연식", className: "w-20" },
    { key: "category", label: "구분", className: "w-16" },
    { key: "coverage_type", label: "담보", className: "w-16" },
    { key: "status", label: "상태", className: "w-20" },
    { key: "inbound_date", label: "입고일" },
    { key: "outbound_date", label: "출고예정" },
    { key: "release_date", label: "출고일" },
  ];

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">출고현황</h3>
        <p className="text-sm text-slate-700">
          출고일이 입력된 차량만 확인하는 화면입니다.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            총 {filteredList.length.toLocaleString()}대
          </div>

          <input
            className="w-80 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="작명 / 차량번호 / 차량명 / 출고일 검색"
            value={searchText}
            onChange={(event) => {
              setSearchText(event.target.value);
              setCurrentPage(1);
            }}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr className="h-8 text-[12px] leading-none">
                {headers.map((header) => (
                  <th
                    key={header.key}
                    onClick={() => handleSort(header.key)}
                    className={[
                      "cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-1",
                      header.className ?? "",
                      sortField === header.key ? "text-blue-700" : "",
                    ].join(" ")}
                  >
                    {header.label}
                  </th>
                ))}
                <th className="w-28 border border-slate-300 bg-slate-100 px-2 py-1">
                  관리
                </th>
              </tr>
            </thead>

            <tbody>
              {pagedList.length === 0 ? (
                <tr>
                  <td
                    colSpan={headers.length + 1}
                    className="border border-slate-200 px-3 py-8 text-sm text-slate-500"
                  >
                    조회된 출고 차량이 없습니다.
                  </td>
                </tr>
              ) : (
                pagedList.map((item, index) => (
                  <tr
                    key={item.id}
                    className="h-8 text-[12px] leading-none hover:bg-slate-50"
                  >
                    <td className="border border-slate-200 px-2 py-1">
                      {(safeCurrentPage - 1) * pageSize + index + 1}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.work_name}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.car_number}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.car_model}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.color_code}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.car_year}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.category}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.coverage_type}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.status}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.inbound_date}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.outbound_date}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      {item.release_date}
                    </td>
                    <td className="border border-slate-200 px-2 py-1">
                      <button
                        type="button"
                        onClick={() =>
                          onSelectMenu({
                            id: "factory-work-register",
                            title: "작업등록",
                            data: { workName: item.work_name },
                          })
                        }
                        className="rounded bg-blue-600 px-3 py-[2px] text-white hover:bg-blue-700"
                      >
                        수정
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-center">
          <div className="flex items-center gap-2">
            <PageButton disabled={safeCurrentPage === 1} onClick={() => setCurrentPage(1)}>
              {"<<"}
            </PageButton>
            <PageButton
              disabled={safeCurrentPage === 1}
              onClick={() => setCurrentPage(Math.max(safeCurrentPage - 1, 1))}
            >
              {"<"}
            </PageButton>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map(
              (page) => (
                <button
                  key={page}
                  type="button"
                  onClick={() => setCurrentPage(page)}
                  className={
                    safeCurrentPage === page
                      ? "rounded bg-blue-600 px-3 py-1 text-white"
                      : "rounded px-3 py-1"
                  }
                >
                  {page}
                </button>
              )
            )}

            <PageButton
              disabled={safeCurrentPage === totalPages}
              onClick={() =>
                setCurrentPage(Math.min(safeCurrentPage + 1, totalPages))
              }
            >
              {">"}
            </PageButton>
            <PageButton
              disabled={safeCurrentPage === totalPages}
              onClick={() => setCurrentPage(totalPages)}
            >
              {">>"}
            </PageButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded px-3 py-1 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
