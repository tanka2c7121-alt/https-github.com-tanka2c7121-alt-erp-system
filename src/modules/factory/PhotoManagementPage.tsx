"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { supabase } from "../../lib/supabase";
import { imageFilePattern, workPhotoBucket } from "./workPhotoFiles";

type PhotoManagementPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

type WorkOrder = {
  id: number;
  work_name: string;
  car_number: string;
  car_model: string;
  inbound_date: string;
  outbound_date: string | null;
  release_date: string | null;
  manager_name: string | null;
};

const getWorkPhotoFolder = (workName: string) =>
  workName.trim().replace(/[^0-9A-Za-z가-힣_-]/g, "_");

const shouldUseNasPhotoStorage = () => {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;

  return hostname === "192.168.1.103" || hostname.endsWith(".local");
};

export default function PhotoManagementPage({
  onSelectMenu,
}: PhotoManagementPageProps) {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<number, number>>({});
  const [searchText, setSearchText] = useState("");
  const [showReleased, setShowReleased] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("work_orders")
      .select(
        "id, work_name, car_number, car_model, inbound_date, outbound_date, release_date, manager_name"
      )
      .order("id", { ascending: false })
      .limit(300);

    setLoading(false);

    if (error) {
      alert("사진관리 목록 조회 실패: " + error.message);
      return;
    }

    setRows((data ?? []) as WorkOrder[]);
  }, []);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const keyword = searchText.trim();

    return rows.filter((row) => {
      if (!showReleased && row.release_date) return false;
      if (!keyword) return true;

      const text = [
        row.work_name,
        row.car_number,
        row.car_model,
        row.manager_name ?? "",
        row.inbound_date,
      ].join(" ");

      return text.includes(keyword);
    });
  }, [rows, searchText, showReleased]);

  useEffect(() => {
    let cancelled = false;

    const loadPhotoCounts = async () => {
      const targetRows = filteredRows.slice(0, 80);
      const nextCounts: Record<number, number> = {};

      await Promise.all(
        targetRows.map(async (row) => {
          const folder = getWorkPhotoFolder(row.work_name);

          if (!folder) {
            nextCounts[row.id] = 0;
            return;
          }

          if (shouldUseNasPhotoStorage()) {
            try {
              const response = await fetch(
                `/api/work-photos?folder=${encodeURIComponent(folder)}`
              );
              const result = (await response.json()) as {
                photos?: Array<{ path: string }>;
              };

              nextCounts[row.id] = result.photos?.length ?? 0;
            } catch {
              nextCounts[row.id] = 0;
            }

            return;
          }

          const { data } = await supabase.storage
            .from(workPhotoBucket)
            .list(folder, { limit: 100 });

          nextCounts[row.id] =
            data?.filter(
              (item) =>
                item.name &&
                !item.name.endsWith("/") &&
                !item.name.startsWith(".") &&
                imageFilePattern.test(item.name)
            ).length ?? 0;
        })
      );

      if (!cancelled) {
        setPhotoCounts(nextCounts);
      }
    };

    void loadPhotoCounts();

    return () => {
      cancelled = true;
    };
  }, [filteredRows]);

  const openWorkPhotos = (row: WorkOrder, openCamera = false) => {
    onSelectMenu({
      id: "factory-work-register",
      title: openCamera ? "사진촬영" : "사진관리",
      data: {
        workName: row.work_name,
        openCamera,
      },
    });
  };

  const activeCount = rows.filter((row) => !row.release_date).length;
  const releasedCount = rows.length - activeCount;

  return (
    <div className="space-y-5 text-slate-900">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">사진관리</h3>
          <p className="text-sm text-slate-700">
            차량을 선택해 작업사진을 추가, 확인, 다운로드, 삭제합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadRows()}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      <section className="grid grid-cols-3 gap-2 md:gap-3">
        <SummaryCard title="진행 차량" value={activeCount} tone="blue" />
        <SummaryCard title="출고 차량" value={releasedCount} tone="slate" />
        <SummaryCard title="표시 목록" value={filteredRows.length} tone="green" />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-3 md:p-4">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="작명 / 차량번호 / 차종 / 담당자 검색"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 md:w-80"
            />

            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={showReleased}
                onChange={(event) => setShowReleased(event.target.checked)}
                className="h-4 w-4"
              />
              출고 차량 포함
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-700">
                <th className="border border-slate-200 px-3 py-2 text-left">작명</th>
                <th className="border border-slate-200 px-3 py-2 text-left">차량</th>
                <th className="border border-slate-200 px-3 py-2 text-left">입고일</th>
                <th className="border border-slate-200 px-3 py-2 text-left">출고예정</th>
                <th className="border border-slate-200 px-3 py-2 text-center">사진</th>
                <th className="border border-slate-200 px-3 py-2 text-center">관리</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-slate-200 px-3 py-8 text-center text-slate-500"
                  >
                    사진관리 목록을 불러오는 중입니다.
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="border border-slate-200 px-3 py-8 text-center text-slate-500"
                  >
                    표시할 차량이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50">
                    <td className="border border-slate-200 px-3 py-2 font-semibold">
                      {row.work_name}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <div>{row.car_number}</div>
                      <div className="text-xs text-slate-500">{row.car_model}</div>
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      {row.inbound_date}
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      {row.outbound_date ?? ""}
                    </td>
                    <td className="border border-slate-200 px-3 py-2 text-center">
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                        {photoCounts[row.id] ?? 0}장
                      </span>
                    </td>
                    <td className="border border-slate-200 px-3 py-2">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openWorkPhotos(row)}
                          className="rounded border border-blue-300 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          사진관리
                        </button>
                        {!row.release_date && (
                          <button
                            type="button"
                            onClick={() => openWorkPhotos(row, true)}
                            className="rounded border border-green-300 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-50"
                          >
                            카메라
                          </button>
                        )}
                      </div>
                    </td>
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

function SummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: "blue" | "green" | "slate";
}) {
  const toneClass = {
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    green: "border-green-100 bg-green-50 text-green-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
  }[tone];

  return (
    <div className={`rounded-xl border p-3 md:p-4 ${toneClass}`}>
      <p className="text-xs font-semibold md:text-sm">{title}</p>
      <p className="mt-2 text-2xl font-bold md:text-3xl">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
