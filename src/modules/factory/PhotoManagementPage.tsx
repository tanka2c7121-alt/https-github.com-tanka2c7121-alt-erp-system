"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { MenuItem } from "../../data/menuData";
import { localDateText } from "../../lib/date";
import { supabase } from "../../lib/supabase";
import {
  getDownloadFileName,
  imageFilePattern,
  workPhotoBucket,
} from "./workPhotoFiles";

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

type ProgressTone = "red" | "orange" | "blue" | "green" | "emerald";
type PhotoSortOrder = "desc" | "asc";

type FolderPhoto = {
  name: string;
  path: string;
  url: string;
  createdAt?: number | string | null;
};

type PhotoViewerFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<{
    getFileHandle: (
      name: string,
      options?: { create?: boolean }
    ) => Promise<{
      createWritable: () => Promise<{
        write: (data: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>;
  }>;
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

const progressToneClasses: Record<
  ProgressTone,
  { bar: string; bg: string; text: string }
> = {
  red: {
    bar: "bg-red-500",
    bg: "bg-red-50",
    text: "text-red-700",
  },
  orange: {
    bar: "bg-orange-500",
    bg: "bg-orange-50",
    text: "text-orange-700",
  },
  blue: {
    bar: "bg-blue-500",
    bg: "bg-blue-50",
    text: "text-blue-700",
  },
  green: {
    bar: "bg-green-500",
    bg: "bg-green-50",
    text: "text-green-700",
  },
  emerald: {
    bar: "bg-emerald-600",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
  },
};

const progressStages = [
  { from: 0, to: 0, label: "입고사진", min: 0, max: 0 },
  { from: 1, to: 5, label: "탈거", min: 1, max: 15 },
  { from: 6, to: 10, label: "판금", min: 16, max: 39 },
  { from: 11, to: 15, label: "퍼티/샌딩", min: 40, max: 55 },
  { from: 16, to: 20, label: "마스킹", min: 56, max: 65 },
  { from: 21, to: 25, label: "도장", min: 66, max: 70 },
  { from: 26, to: 30, label: "조립", min: 71, max: 80 },
  { from: 31, to: 35, label: "광택/세차", min: 81, max: 99 },
] as const;

const interpolateProgress = (
  photoCount: number,
  stage: (typeof progressStages)[number]
) => {
  if (stage.min === stage.max) return stage.max;

  const stagePhotoCount = photoCount - stage.from + 1;
  const stageSlots = stage.to - stage.from + 1;

  return Math.round(
    stage.min + ((stagePhotoCount - 1) / (stageSlots - 1)) * (stage.max - stage.min)
  );
};

const getProgressTone = (percent: number): ProgressTone => {
  if (percent >= 100) return "emerald";
  if (percent >= 71) return "green";
  if (percent >= 40) return "blue";
  if (percent >= 16) return "orange";
  return "red";
};

const getPhotoProgress = (photoCount: number) => {
  if (photoCount >= 36) {
    return {
      label: "완료사진",
      percent: 100,
      tone: "emerald" as ProgressTone,
    };
  }

  const stage =
    progressStages.find(
      (item) => photoCount >= item.from && photoCount <= item.to
    ) ?? progressStages[0];
  const percent = interpolateProgress(photoCount, stage);

  return {
    label: stage.label,
    percent,
    tone: getProgressTone(percent),
  };
};

const shouldUseNasPhotoStorage = () => {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;

  return hostname === "192.168.1.103" || hostname.endsWith(".local");
};

function getDefaultPhotoViewerFrame(): PhotoViewerFrame {
  if (typeof window === "undefined") {
    return { left: 80, top: 60, width: 960, height: 680 };
  }

  const width = Math.min(Math.max(window.innerWidth * 0.78, 520), 1120);
  const height = Math.min(Math.max(window.innerHeight * 0.78, 380), 820);

  return {
    left: Math.max((window.innerWidth - width) / 2, 12),
    top: Math.max((window.innerHeight - height) / 2, 12),
    width,
    height,
  };
}

function constrainPhotoViewerFrame(frame: PhotoViewerFrame): PhotoViewerFrame {
  if (typeof window === "undefined") {
    return frame;
  }

  const margin = 12;
  const minWidth = Math.min(420, window.innerWidth - margin * 2);
  const minHeight = Math.min(300, window.innerHeight - margin * 2);
  const width = Math.min(
    Math.max(frame.width, minWidth),
    window.innerWidth - margin * 2
  );
  const height = Math.min(
    Math.max(frame.height, minHeight),
    window.innerHeight - margin * 2
  );

  return {
    left: Math.min(Math.max(frame.left, margin), window.innerWidth - width - margin),
    top: Math.min(Math.max(frame.top, margin), window.innerHeight - height - margin),
    width,
    height,
  };
}

export default function PhotoManagementPage({
  onSelectMenu,
}: PhotoManagementPageProps) {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<number, number>>({});
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<WorkOrder | null>(null);
  const [folderPhotos, setFolderPhotos] = useState<FolderPhoto[]>([]);
  const [folderPhotosLoading, setFolderPhotosLoading] = useState(false);
  const [photoSortOrder, setPhotoSortOrder] = useState<PhotoSortOrder>("desc");
  const [selectedPhotoPaths, setSelectedPhotoPaths] = useState<string[]>([]);
  const [folderPopupFrame, setFolderPopupFrame] = useState<PhotoViewerFrame>(() =>
    getDefaultPhotoViewerFrame()
  );
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number | null>(null);
  const [photoViewerFrame, setPhotoViewerFrame] = useState<PhotoViewerFrame>(() =>
    getDefaultPhotoViewerFrame()
  );

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

  const loadFolderPhotos = async (row: WorkOrder) => {
    const folder = getWorkPhotoFolder(row.work_name);

    setSelectedFolder(row);
    setFolderPhotos([]);
    setSelectedPhotoPaths([]);
    setFolderPopupFrame(getDefaultPhotoViewerFrame());
    setPhotoViewerIndex(null);
    setFolderPhotosLoading(true);

    try {
      if (shouldUseNasPhotoStorage()) {
        const response = await fetch(
          `/api/work-photos?folder=${encodeURIComponent(folder)}`
        );
        const result = (await response.json()) as { photos?: FolderPhoto[] };

        setFolderPhotos(result.photos ?? []);
        return;
      }

      const { data, error } = await supabase.storage
        .from(workPhotoBucket)
        .list(folder, { limit: 300, sortBy: { column: "created_at", order: "desc" } });

      if (error) {
        alert("사진 목록 조회 실패: " + error.message);
        return;
      }

      const photoPaths = (data ?? [])
        .filter(
          (item) =>
            item.name &&
            !item.name.endsWith("/") &&
            !item.name.startsWith(".") &&
            imageFilePattern.test(item.name)
        )
        .map((item) => `${folder}/${item.name}`);

      if (photoPaths.length === 0) {
        setFolderPhotos([]);
        return;
      }

      const { data: signedUrls, error: signedUrlError } = await supabase.storage
        .from(workPhotoBucket)
        .createSignedUrls(photoPaths, 60 * 60);

      if (signedUrlError) {
        alert("사진 URL 생성 실패: " + signedUrlError.message);
        return;
      }

      setFolderPhotos(
        photoPaths.map((path, index) => {
          const item = data?.find((entry) => path.endsWith(`/${entry.name}`));

          return {
            name: path.split("/").pop() ?? `photo-${index + 1}.jpg`,
            path,
            url: signedUrls?.[index]?.signedUrl ?? "",
            createdAt: item?.created_at ?? item?.updated_at ?? null,
          };
        })
      );
    } finally {
      setFolderPhotosLoading(false);
    }
  };

  const sortedFolderPhotos = useMemo(() => {
    const timestamp = (photo: FolderPhoto) => {
      if (typeof photo.createdAt === "number") return photo.createdAt;
      if (photo.createdAt) {
        const parsed = new Date(photo.createdAt).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      }

      return 0;
    };

    return [...folderPhotos].sort((left, right) => {
      const dateCompare = timestamp(left) - timestamp(right);

      if (dateCompare !== 0) {
        return photoSortOrder === "asc" ? dateCompare : -dateCompare;
      }

      return photoSortOrder === "asc"
        ? left.name.localeCompare(right.name)
        : right.name.localeCompare(left.name);
    });
  }, [folderPhotos, photoSortOrder]);

  const selectedFolderPhotos = sortedFolderPhotos.filter((photo) =>
    selectedPhotoPaths.includes(photo.path)
  );

  const activeViewerPhoto =
    photoViewerIndex === null ? null : sortedFolderPhotos[photoViewerIndex] ?? null;

  useEffect(() => {
    setSelectedPhotoPaths((prev) =>
      prev.filter((path) => folderPhotos.some((photo) => photo.path === path))
    );
  }, [folderPhotos]);

  const openPhotoViewer = (photoPath?: string) => {
    if (sortedFolderPhotos.length === 0) {
      alert("볼 사진이 없습니다.");
      return;
    }

    const nextIndex = photoPath
      ? sortedFolderPhotos.findIndex((photo) => photo.path === photoPath)
      : 0;

    setPhotoViewerFrame(getDefaultPhotoViewerFrame());
    setPhotoViewerIndex(nextIndex >= 0 ? nextIndex : 0);
  };

  const movePhotoViewer = (direction: 1 | -1) => {
    if (sortedFolderPhotos.length === 0) {
      setPhotoViewerIndex(null);
      return;
    }

    setPhotoViewerIndex((currentIndex) => {
      const safeIndex = currentIndex ?? 0;
      return (
        (safeIndex + direction + sortedFolderPhotos.length) %
        sortedFolderPhotos.length
      );
    });
  };

  const togglePhotoSelection = (photo: FolderPhoto) => {
    setSelectedPhotoPaths((prev) =>
      prev.includes(photo.path)
        ? prev.filter((path) => path !== photo.path)
        : [...prev, photo.path]
    );
  };

  const selectAllPhotos = () => {
    setSelectedPhotoPaths(sortedFolderPhotos.map((photo) => photo.path));
  };

  const clearPhotoSelection = () => {
    setSelectedPhotoPaths([]);
  };

  const downloadPhotosWithBrowser = (photos: FolderPhoto[]) => {
    photos.forEach((photo, index) => {
      setTimeout(() => {
        const link = document.createElement("a");
        link.href = photo.url;
        link.download = getDownloadFileName(photo, index);
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }, index * 200);
    });
  };

  const downloadSelectedPhotosToFolder = async () => {
    if (selectedFolderPhotos.length === 0) {
      alert("다운로드할 사진을 선택하세요.");
      return;
    }

    const directoryPicker = (window as DirectoryPickerWindow).showDirectoryPicker;

    if (!directoryPicker) {
      alert("이 브라우저는 폴더 선택 저장을 지원하지 않습니다. 기본 다운로드로 저장합니다.");
      downloadPhotosWithBrowser(selectedFolderPhotos);
      return;
    }

    try {
      const directoryHandle = await directoryPicker();

      for (let index = 0; index < selectedFolderPhotos.length; index += 1) {
        const photo = selectedFolderPhotos[index];
        const response = await fetch(photo.url);

        if (!response.ok) {
          throw new Error(`${photo.name} 다운로드 실패`);
        }

        const blob = await response.blob();
        const fileHandle = await directoryHandle.getFileHandle(
          getDownloadFileName(photo, index),
          { create: true }
        );
        const writable = await fileHandle.createWritable();

        await writable.write(blob);
        await writable.close();
      }

      alert(`선택한 사진 ${selectedFolderPhotos.length}장을 저장했습니다.`);
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;

      alert("폴더 저장에 실패해 기본 다운로드로 저장합니다.");
      downloadPhotosWithBrowser(selectedFolderPhotos);
    }
  };

  const deleteWorkPhotos = async (paths: string[]) => {
    if (paths.length === 0) return "";

    if (shouldUseNasPhotoStorage()) {
      const response = await fetch("/api/work-photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paths }),
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        return result?.error ?? "NAS 사진 삭제에 실패했습니다.";
      }

      return "";
    }

    const { error } = await supabase.storage.from(workPhotoBucket).remove(paths);

    return error?.message ?? "";
  };

  const deleteSelectedPhotos = async () => {
    if (selectedFolderPhotos.length === 0) {
      alert("삭제할 사진을 선택하세요.");
      return;
    }

    if (!confirm(`선택한 사진 ${selectedFolderPhotos.length}장을 삭제할까요?`)) {
      return;
    }

    const paths = selectedFolderPhotos.map((photo) => photo.path);
    const errorMessage = await deleteWorkPhotos(paths);

    if (errorMessage) {
      alert("사진 삭제 실패: " + errorMessage);
      return;
    }

    setFolderPhotos((prev) => prev.filter((photo) => !paths.includes(photo.path)));
    setSelectedPhotoPaths([]);
    setPhotoViewerIndex(null);

    if (selectedFolder) {
      setPhotoCounts((prev) => ({
        ...prev,
        [selectedFolder.id]: Math.max((prev[selectedFolder.id] ?? 0) - paths.length, 0),
      }));
    }
  };

  const startFolderPopupMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = folderPopupFrame;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setFolderPopupFrame(
        constrainPhotoViewerFrame({
          ...startFrame,
          left: startFrame.left + moveEvent.clientX - startX,
          top: startFrame.top + moveEvent.clientY - startY,
        })
      );
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startFolderPopupResize = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = folderPopupFrame;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setFolderPopupFrame(
        constrainPhotoViewerFrame({
          ...startFrame,
          width: startFrame.width + moveEvent.clientX - startX,
          height: startFrame.height + moveEvent.clientY - startY,
        })
      );
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startPhotoViewerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = photoViewerFrame;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setPhotoViewerFrame(
        constrainPhotoViewerFrame({
          ...startFrame,
          left: startFrame.left + moveEvent.clientX - startX,
          top: startFrame.top + moveEvent.clientY - startY,
        })
      );
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const startPhotoViewerResize = (
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startFrame = photoViewerFrame;

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setPhotoViewerFrame(
        constrainPhotoViewerFrame({
          ...startFrame,
          width: startFrame.width + moveEvent.clientX - startX,
          height: startFrame.height + moveEvent.clientY - startY,
        })
      );
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const openWorkCamera = (row: WorkOrder) => {
    onSelectMenu({
      id: "factory-work-register",
      title: "사진촬영",
      data: {
        workName: row.work_name,
        openCamera: true,
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
              const progress = getPhotoProgress(photoCount);
              const progressTone = progressToneClasses[
                isDueToday && progress.percent < 80 ? "red" : progress.tone
              ];

              return (
                <article
                  key={row.id}
                  className="group overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => void loadFolderPhotos(row)}
                    className="flex min-h-48 w-full flex-col p-0 text-left"
                  >
                    <div className={`relative h-20 ${progressTone.bg}`}>
                      <div className="absolute left-3 top-3 h-4 w-20 rounded-t-md bg-white/70 shadow-sm" />
                      <div className="absolute inset-x-3 bottom-3 top-6 overflow-hidden rounded-md rounded-tl-sm bg-white/75 shadow-inner">
                        <div
                          className={`h-full ${progressTone.bar} transition-all group-hover:brightness-95`}
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                      <div className="absolute inset-x-5 top-8 flex min-w-0 items-center justify-between gap-2 text-xs font-black text-slate-900">
                        <span className="min-w-0 truncate">{progress.label}</span>
                        <span className="shrink-0">{progress.percent}%</span>
                      </div>
                      <div
                        className={`absolute right-4 top-4 rounded-full bg-white/90 px-2 py-1 text-xs font-black ${progressTone.text} shadow-sm`}
                      >
                        {photoCount}장
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col gap-2 p-3">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="min-w-0 truncate text-lg font-black leading-tight text-slate-950">
                            {row.car_number || "-"}
                          </h4>
                          {isDueToday && (
                            <span className="shrink-0 rounded-full bg-slate-950 px-2 py-1 text-[11px] font-bold text-white">
                              {progress.percent < 80 ? "출고임박" : "금일 출고"}
                            </span>
                          )}
                        </div>
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
                      onClick={() => void loadFolderPhotos(row)}
                      className="flex-1 px-2 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50"
                    >
                      열기
                    </button>
                    <button
                      type="button"
                      onClick={() => openWorkCamera(row)}
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

      {selectedFolder && (
        <div className="fixed inset-0 z-50 overscroll-contain bg-slate-950/60">
          <div
            className="absolute flex min-h-0 flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
            style={{
              left: folderPopupFrame.left,
              top: folderPopupFrame.top,
              width: folderPopupFrame.width,
              height: folderPopupFrame.height,
            }}
            onWheelCapture={(event) => {
              const target = event.target as HTMLElement;

              event.stopPropagation();

              if (!target.closest("[data-folder-popup-scroll]")) {
                event.preventDefault();
              }
            }}
          >
            <div
              className="flex cursor-move flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between"
              onPointerDown={startFolderPopupMove}
            >
              <div className="min-w-0">
                <h4 className="truncate text-lg font-black text-slate-950">
                  {selectedFolder.car_number || "-"} 사진 폴더
                </h4>
                <p className="mt-1 truncate text-sm font-semibold text-slate-500">
                  {selectedFolder.work_name} / {selectedFolder.car_model || "-"}
                </p>
              </div>

              <div
                className="flex flex-wrap items-center gap-2"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="flex overflow-hidden rounded-lg border border-slate-300">
                  <button
                    type="button"
                    onClick={() => setPhotoSortOrder("desc")}
                    className={
                      photoSortOrder === "desc"
                        ? "bg-blue-600 px-3 py-2 text-xs font-bold text-white"
                        : "bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    }
                  >
                    내림차순
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoSortOrder("asc")}
                    className={
                      photoSortOrder === "asc"
                        ? "bg-blue-600 px-3 py-2 text-xs font-bold text-white"
                        : "border-l border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    }
                  >
                    오름차순
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => void loadFolderPhotos(selectedFolder)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  새로고침
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolder(null);
                    setFolderPhotos([]);
                    setSelectedPhotoPaths([]);
                    setPhotoViewerIndex(null);
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700"
                >
                  닫기
                </button>
              </div>
            </div>

            <div
              data-folder-popup-scroll
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
            >
              {folderPhotosLoading ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-14 text-center text-sm font-semibold text-slate-500">
                  사진 목록을 불러오는 중입니다.
                </div>
              ) : sortedFolderPhotos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-14 text-center text-sm font-semibold text-slate-500">
                  이 폴더에 등록된 사진이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-bold text-slate-600">
                      전체 {sortedFolderPhotos.length}장 / 선택 {selectedFolderPhotos.length}장
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={selectAllPhotos}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        전체 선택
                      </button>
                      <button
                        type="button"
                        onClick={clearPhotoSelection}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        선택 해제
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void downloadSelectedPhotosToFolder();
                        }}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        선택 다운로드
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void deleteSelectedPhotos();
                        }}
                        className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        선택 삭제
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                    {sortedFolderPhotos.map((photo, index) => {
                      const selected = selectedPhotoPaths.includes(photo.path);

                      return (
                        <button
                          type="button"
                          key={photo.path}
                          onClick={() => openPhotoViewer(photo.path)}
                          className={`group relative overflow-hidden rounded-lg border bg-white text-left shadow-sm hover:border-blue-300 hover:shadow-md ${
                            selected
                              ? "border-blue-500 ring-2 ring-blue-200"
                              : "border-slate-200"
                          }`}
                        >
                          <span className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded bg-white/95 shadow">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePhotoSelection(photo)}
                              onClick={(event) => event.stopPropagation()}
                              className="h-4 w-4 accent-blue-600"
                            />
                          </span>
                          {/* eslint-disable-next-line @next/next/no-img-element -- NAS and Supabase photos are runtime URLs. */}
                          <img
                            src={photo.url}
                            alt={photo.name}
                            className="aspect-square w-full bg-slate-100 object-cover transition group-hover:scale-[1.02]"
                          />
                          <div className="space-y-1 px-2 py-2">
                            <p className="truncate text-xs font-bold text-slate-800">
                              {photo.name}
                            </p>
                            <p className="text-[11px] font-semibold text-slate-400">
                              {index + 1} / {sortedFolderPhotos.length}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="사진 폴더 창 크기 조절"
              onPointerDown={startFolderPopupResize}
              className="group absolute bottom-2 right-2 h-7 w-7 cursor-nwse-resize rounded-br-xl opacity-80 transition hover:opacity-100"
            >
              <span className="absolute bottom-0 right-0 h-5 w-5 overflow-hidden rounded-br-xl border-b-[3px] border-r-[3px] border-slate-300 text-transparent shadow-[2px_2px_3px_rgba(15,23,42,0.12)] transition group-hover:border-slate-500" />
            </button>
          </div>
        </div>
      )}

      {activeViewerPhoto && (
        <div
          className="fixed inset-0 z-[60] overscroll-contain bg-slate-950/80"
          onWheelCapture={(event) => {
            event.preventDefault();
            event.stopPropagation();
            movePhotoViewer(event.deltaY > 0 ? 1 : -1);
          }}
        >
          <div
            className="absolute flex min-h-0 flex-col overflow-hidden rounded-xl border border-white/70 bg-white shadow-2xl"
            style={{
              left: photoViewerFrame.left,
              top: photoViewerFrame.top,
              width: photoViewerFrame.width,
              height: photoViewerFrame.height,
            }}
          >
            <div
              className="flex cursor-move flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 p-3"
              onPointerDown={startPhotoViewerMove}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {activeViewerPhoto.name}
                </p>
                <p className="text-xs text-slate-500">
                  {(photoViewerIndex ?? 0) + 1} / {sortedFolderPhotos.length}
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => movePhotoViewer(-1)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  이전
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => movePhotoViewer(1)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  다음
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setPhotoViewerIndex(null)}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  닫기
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-100 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- Viewer shows NAS and Supabase runtime URLs. */}
              <img
                src={activeViewerPhoto.url}
                alt={activeViewerPhoto.name}
                className="max-h-full max-w-full object-contain"
              />
            </div>
            <button
              type="button"
              aria-label="사진 보기 창 크기 조절"
              onPointerDown={startPhotoViewerResize}
              className="group absolute bottom-2 right-2 h-7 w-7 cursor-nwse-resize rounded-br-xl opacity-80 transition hover:opacity-100"
            >
              <span className="absolute bottom-0 right-0 h-5 w-5 overflow-hidden rounded-br-xl border-b-[3px] border-r-[3px] border-slate-300 text-transparent shadow-[2px_2px_3px_rgba(15,23,42,0.12)] transition group-hover:border-slate-500" />
            </button>
          </div>
        </div>
      )}
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
