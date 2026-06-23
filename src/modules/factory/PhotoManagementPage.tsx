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

        {loading ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
            사진관리 폴더를 불러오는 중입니다.
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">
            표시할 사진 폴더가 없습니다.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            {filteredRows.map((row) => {
              const photoCount = photoCounts[row.id] ?? 0;
              const isReleased = Boolean(row.release_date);

              return (
                <article
                  key={row.id}
                  className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => openWorkPhotos(row)}
                    className="flex min-h-48 w-full flex-col p-0 text-left"
                  >
                    <div className="relative h-20 bg-blue-50">
                      <div className="absolute left-3 top-3 h-4 w-20 rounded-t-md bg-blue-200" />
                      <div className="absolute inset-x-3 bottom-3 top-6 rounded-md rounded-tl-sm bg-blue-400 shadow-inner transition group-hover:bg-blue-500" />
                      <div className="absolute right-4 top-4 rounded-full bg-white/90 px-2 py-1 text-xs font-black text-blue-700 shadow-sm">
                        {photoCount}장
                      </div>
                      {isReleased && (
                        <div className="absolute left-4 bottom-4 rounded-full bg-slate-900/80 px-2 py-1 text-[11px] font-bold text-white">
                          출고
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <div>
                        <h4 className="truncate text-sm font-black text-slate-900">
                          {row.work_name}
                        </h4>
                        <p className="mt-1 truncate text-xs font-semibold text-slate-600">
                          {row.car_number || "-"} / {row.car_model || "-"}
                        </p>
                      </div>

                      <div className="mt-auto space-y-1 text-xs text-slate-500">
                        <div className="flex justify-between gap-2">
                          <span>입고</span>
                          <span className="font-semibold text-slate-700">
                            {row.inbound_date || "-"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span>{isReleased ? "출고" : "예정"}</span>
                          <span className="font-semibold text-slate-700">
                            {row.release_date || row.outbound_date || "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="flex border-t border-slate-100 bg-slate-50">
                    <button
                      type="button"
                      onClick={() => openWorkPhotos(row)}
                      className="flex-1 px-2 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                    >
                      열기
                    </button>
                    {!isReleased && (
                      <button
                        type="button"
                        onClick={() => openWorkPhotos(row, true)}
                        className="flex-1 border-l border-slate-200 px-2 py-2 text-xs font-bold text-green-700 hover:bg-green-50"
                      >
                        카메라
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
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
