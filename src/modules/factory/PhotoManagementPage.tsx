"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
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

const getPhotoSortDate = (row: WorkOrder) =>
  row.release_date || row.outbound_date || "";
const isTodayOutboundRow = (row: WorkOrder, today: string) =>
  row.release_date === today || (!row.release_date && row.outbound_date === today);
const comparePhotoRows = (today: string) => (left: WorkOrder, right: WorkOrder) => {
  const leftToday = isTodayOutboundRow(left, today);
  const rightToday = isTodayOutboundRow(right, today);

  if (leftToday !== rightToday) return leftToday ? -1 : 1;

  const leftDate = getPhotoSortDate(left);
  const rightDate = getPhotoSortDate(right);

  if (leftDate !== rightDate) {
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    return leftDate.localeCompare(rightDate);
  }

  return right.id - left.id;
};

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
  const [loading, setLoading] = useState(true);

  const loadRows = useCallback(async () => {
    setLoading(true);
    const today = localDateText();

    const { data, error } = await supabase
      .from("work_orders")
      .select(
        "id, work_name, car_number, car_model, inbound_date, outbound_date, release_date, manager_name"
      )
      .or(`release_date.is.null,release_date.eq.${today}`)
      .order("outbound_date", { ascending: true })
      .order("id", { ascending: false })
      .limit(500);

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
    const today = localDateText();

    return rows
      .filter((row) => {
        if (row.release_date && row.release_date !== today) return false;
        if (!keyword) return true;

        const text = [
          row.work_name,
          row.car_number,
          row.car_model,
          row.manager_name ?? "",
          row.inbound_date,
          row.outbound_date ?? "",
          row.release_date ?? "",
        ].join(" ");

        return text.includes(keyword);
      })
      .sort(comparePhotoRows(today));
  }, [rows, searchText]);

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

  const today = localDateText();
  const activeRows = rows.filter((row) => !row.release_date);
  const dueTodayCount = rows.filter((row) =>
    isTodayOutboundRow(row, today)
  ).length;

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

      <section className="grid grid-cols-2 gap-2 md:gap-3">
        <SummaryCard title="진행 차량" value={activeRows.length} tone="blue" />
        <SummaryCard title="금일 출고예정" value={dueTodayCount} tone="green" />
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
              const isDueToday = isTodayOutboundRow(row, today);

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
                      {isDueToday && (
                        <div className="absolute left-4 bottom-4 rounded-full bg-green-700 px-2 py-1 text-[11px] font-bold text-white">
                          금일 출고
                        </div>
                      )}
                    </div>

                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <div>
                        <h4 className="truncate text-lg font-black leading-tight text-slate-950">
                          {row.car_number || "-"}
                        </h4>
                        <p className="mt-1 truncate text-sm font-bold text-slate-700">
                          {row.car_model || "-"}
                        </p>
                        <p className="mt-1 truncate text-[11px] font-semibold text-slate-400">
                          {row.work_name}
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
                          <span>예정</span>
                          <span className="font-semibold text-slate-700">
                            {row.outbound_date || "-"}
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
                    <button
                      type="button"
                      onClick={() => openWorkPhotos(row, true)}
                      className="flex-1 border-l border-slate-200 px-2 py-2 text-xs font-bold text-green-700 hover:bg-green-50"
                    >
                      카메라
                    </button>
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
