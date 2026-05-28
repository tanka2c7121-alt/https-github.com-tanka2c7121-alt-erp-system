"use client";

import { useCallback, useEffect, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { supabase } from "../../lib/supabase";




type InboundStatusPageProps = {
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
  status: string;
};


export default function InboundStatusPage({
  onSelectMenu,
}: InboundStatusPageProps) {
  const [sortField, setSortField] = useState("work_name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [searchText, setSearchText] = useState("");
  const [workList, setWorkList] = useState<WorkItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 30;

  const loadWorkList = useCallback(async () => {
  const { data, error } = await supabase
  .from("work_orders")
  .select(`
    id,
    work_name,
    car_number,
    car_model,
    color_code,
    car_year,
    category,
    coverage_type,
    inbound_date,
    outbound_date,
    release_date
  `)
  
    .order("id", { ascending: false });

  if (error) {
    alert("입고현황 조회 실패: " + error.message);
    return;
  }



  console.log("입고현황 data:", data);

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
      status: item.release_date ? "출고완료" : "진행중",
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
   

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };
  const filteredList = [...workList]
  .sort((a, b) => {
    const aValue = String(
      a[sortField as keyof WorkItem] ?? ""
    );

    const bValue = String(
      b[sortField as keyof WorkItem] ?? ""
    );

    if (aValue < bValue)
      return sortOrder === "asc" ? -1 : 1;

    if (aValue > bValue)
      return sortOrder === "asc" ? 1 : -1;

    return 0;
  })

  
  
  .filter((item) => {

    // 출고완료 숨김
    if (item.status === "출고완료")
      return false;

    const keyword =
      searchText.trim().toLowerCase();

    if (!keyword) return true;

    return (
      item.work_name
        .toLowerCase()
        .includes(keyword) ||

      item.car_number
        .toLowerCase()
        .includes(keyword) ||

      item.car_model
        .toLowerCase()
        .includes(keyword)
    );
  });

  const totalPages = Math.ceil(
  filteredList.length / pageSize
);

const pagedList = filteredList.slice(
  (currentPage - 1) * pageSize,
  currentPage * pageSize
);


  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">입고현황</h3>
        <p className="text-sm text-slate-700">
          작업등록된 차량을 1행 요약으로 확인하는 화면입니다.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-end">
          <input
            className="w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            placeholder="작명 / 차량번호 / 차량명 검색"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}

          />
 
          <button
            type="button"
            onClick={() =>
              onSelectMenu({
                id: "factory-work-register",
                title: "작업등록",
              })
            }
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            새 작업등록
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-center">
            <thead>
              <tr className="h-8 text-[12px] leading-none">
  <th
    onClick={() => handleSort("id")}
    className="w-12 cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    번호
  </th>

  <th
    onClick={() => handleSort("work_name")}
    className="cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    작명
  </th>

  <th
    onClick={() => handleSort("car_number")}
    className="w-24 cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    차량번호
  </th>

  <th
    onClick={() => handleSort("car_model")}
    className="w-24 cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    차량명
  </th>

  <th
    onClick={() => handleSort("color_code")}
    className="w-20 cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    칼라코드
  </th>

  <th
    onClick={() => handleSort("car_year")}
    className="w-16 cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    차량연식
  </th>

  <th
    onClick={() => handleSort("category")}
    className="w-16 cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    구분
  </th>

  <th
    onClick={() => handleSort("coverage_type")}
    className="w-16 cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    담보
  </th>

  <th
    onClick={() => handleSort("status")}
    className="w-20 cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    상태
  </th>

  <th
    onClick={() => handleSort("inbound_date")}
    className="cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    입고일
  </th>

  <th
    onClick={() => handleSort("outbound_date")}
    className="cursor-pointer select-none border border-slate-300 bg-slate-100 px-2 py-0"
  >
    출고예정
  </th>

  <th className="w-28 border border-slate-300 bg-slate-100 px-2 py-0">
    관리
  </th>
</tr>
</thead>

            
  <tbody>
   {pagedList.map((item, index) => (
    <tr
      key={item.id}
      className="h-8 text-[12px] leading-none hover:bg-slate-50"
    >
      <td className="border border-slate-200 px-2 py-0 text-center">
        {index + 1}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.work_name}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.car_number}
      </td>

      <td className="border border-slate-200 px-2 py-0">
        {item.car_model}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.color_code}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.car_year}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.category}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.coverage_type}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.status}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.inbound_date}
      </td>

      <td className="border border-slate-200 px-2 py-0 text-center">
        {item.outbound_date}
      </td>

      <td className="border border-slate-200 px-2 py-0">
  <div className="flex items-center justify-center">
    <button
  type="button"
  onClick={() =>
    onSelectMenu({
      id: "factory-work-register",
      title: "작업등록",
      data: {
        workName: item.work_name,
      },
    })
  }
  className="rounded bg-blue-600 px-3 py-[2px] text-white hover:bg-blue-700"
>
  수정
</button>
  </div>
</td>
    </tr>
  ))}
</tbody>
          </table>
          <div className="mt-4 flex justify-center">
  <div className="flex items-center gap-2">

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
      onClick={() =>
        setCurrentPage((prev) =>
          Math.max(prev - 1, 1)
        )
      }
      disabled={currentPage === 1}
      className="rounded px-3 py-1 disabled:opacity-40"
    >
      {"<"}
    </button>

    {Array.from(
      { length: totalPages },
      (_, index) => index + 1
    ).map((page) => (
      <button
        key={page}
        type="button"
        onClick={() =>
          setCurrentPage(page)
        }
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
      onClick={() =>
        setCurrentPage((prev) =>
          Math.min(prev + 1, totalPages)
        )
      }
      disabled={currentPage === totalPages}
      className="rounded px-3 py-1 disabled:opacity-40"
    >
      {">"}
    </button>

    <button
      type="button"
      onClick={() =>
        setCurrentPage(totalPages)
      }
      disabled={currentPage === totalPages}
      className="rounded px-3 py-1 disabled:opacity-40"
    >
      {">>"}
    </button>

  </div>
</div>
        </div>
      </div>
    </div>
  );
}