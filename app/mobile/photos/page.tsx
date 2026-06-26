"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

import { supabaseAuthPassword } from "../../../src/lib/authPassword";
import { supabase } from "../../../src/lib/supabase";

type WorkOrderRow = {
  id: number;
  work_name: string | null;
  car_number: string | null;
  car_maker: string | null;
  car_model: string | null;
  category: string | null;
  insurance_company: string | null;
  other_insurance_company: string | null;
  manager_name: string | null;
  own_manager_name: string | null;
  other_manager_name: string | null;
  inbound_date: string | null;
  release_date: string | null;
};

type WorkPhoto = {
  name: string;
  path: string;
  url: string;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const getWorkPhotoFolder = (workName: string) =>
  workName.trim().replace(/[^0-9A-Za-z가-힣_-]/g, "_");

const isNasHost = () => {
  if (typeof window === "undefined") return false;

  const hostname = window.location.hostname;

  return hostname === "192.168.1.103" || hostname.endsWith(".local");
};

function drawPhotoWatermark(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  text: string
) {
  const label = text.trim();

  if (!label) return;

  const fontSize = Math.max(28, Math.round(width * 0.04));
  const paddingX = Math.round(fontSize * 0.55);
  const paddingY = Math.round(fontSize * 0.35);
  const margin = Math.round(fontSize * 0.45);

  context.save();
  context.font = `800 ${fontSize}px Arial, sans-serif`;
  context.textBaseline = "bottom";

  const textWidth = context.measureText(label).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  const left = margin;
  const top = height - margin - boxHeight;

  context.fillStyle = "rgba(15, 23, 42, 0.68)";
  context.fillRect(left, top, boxWidth, boxHeight);
  context.strokeStyle = "rgba(255, 255, 255, 0.45)";
  context.lineWidth = Math.max(2, Math.round(fontSize * 0.06));
  context.strokeRect(left, top, boxWidth, boxHeight);
  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.shadowColor = "rgba(0, 0, 0, 0.45)";
  context.shadowBlur = Math.round(fontSize * 0.14);
  context.fillText(label, left + paddingX, top + boxHeight - paddingY);
  context.restore();
}

async function compressImage(file: File, watermarkText = "") {
  if (!file.type.startsWith("image/")) return file;

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("사진을 읽지 못했습니다."));
      nextImage.src = objectUrl;
    });
    const maxSize = 1920;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const width = Math.round(image.width * scale);
    const height = Math.round(image.height * scale);
    const canvas = document.createElement("canvas");

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);
    drawPhotoWatermark(context, width, height, watermarkText);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86)
    );

    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function MobilePhotoUploadPage() {
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [works, setWorks] = useState<WorkOrderRow[]>([]);
  const [query, setQuery] = useState("");
  const [selectedWork, setSelectedWork] = useState<WorkOrderRow | null>(null);
  const [photos, setPhotos] = useState<WorkPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedWorkName = normalizeText(selectedWork?.work_name);
  const nasHost = isNasHost();

  useEffect(() => {
    if (!authenticated) return;

    const loadWorks = async () => {
      setLoading(true);
      setMessage("");

      const { data, error } = await supabase
        .from("work_orders")
        .select(
          [
            "id",
            "work_name",
            "car_number",
            "car_maker",
            "car_model",
            "category",
            "insurance_company",
            "other_insurance_company",
            "manager_name",
            "own_manager_name",
            "other_manager_name",
            "inbound_date",
            "release_date",
          ].join(", ")
        )
        .order("id", { ascending: false })
        .limit(500);

      if (error) {
        setMessage(`작업 목록 조회 실패: ${error.message}`);
      } else {
        setWorks(
          ((data ?? []) as unknown as WorkOrderRow[]).filter(
            (work) => normalizeText(work.inbound_date) && !normalizeText(work.release_date)
          )
        );
      }

      setLoading(false);
    };

    void loadWorks();
  }, [authenticated]);

  async function handleLogin() {
    const normalizedLoginId = loginId.trim().toLowerCase();

    if (!normalizedLoginId || !loginPassword) {
      setMessage("아이디와 비밀번호를 입력하세요.");
      return;
    }

    setLoading(true);
    setMessage("");

    const passwordCandidates = Array.from(
      new Set([loginPassword, supabaseAuthPassword(loginPassword)])
    );
    let authUserId = "";
    let authErrorMessage = "";

    for (const authPassword of passwordCandidates) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedLoginId,
        password: authPassword,
      });

      if (data.user) {
        authUserId = data.user.id;
        break;
      }

      authErrorMessage = error?.message ?? "";
    }

    if (!authUserId) {
      setLoading(false);
      setMessage(
        `로그인 실패${authErrorMessage ? `: ${authErrorMessage}` : ""}`
      );
      return;
    }

    const { data: profile, error } = await supabase
      .from("app_users")
      .select("id, is_active")
      .or(`auth_uid.eq.${authUserId},user_id.eq.${normalizedLoginId}`)
      .maybeSingle();

    if (error || !profile) {
      setLoading(false);
      setMessage("직원 정보를 확인하지 못했습니다.");
      return;
    }

    if (!profile.is_active) {
      setLoading(false);
      setMessage("관리자 승인 후 사용할 수 있는 계정입니다.");
      return;
    }

    setAuthenticated(true);
    setLoading(false);
  }

  async function loadPhotos(workName: string) {
    const folder = getWorkPhotoFolder(workName);

    if (!folder) {
      setPhotos([]);
      return;
    }

    const response = await fetch(`/api/work-photos?folder=${encodeURIComponent(folder)}`);

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const result = (await response.json()) as { photos?: WorkPhoto[] };
    setPhotos(result.photos ?? []);
  }

  const filteredWorks = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    if (!keyword) return works.slice(0, 30);

    return works
      .filter((work) =>
        [
          work.work_name,
          work.car_number,
          work.car_maker,
          work.car_model,
          work.insurance_company,
          work.other_insurance_company,
          work.manager_name,
          work.own_manager_name,
          work.other_manager_name,
        ]
          .map((value) => normalizeText(value).toLowerCase())
          .some((value) => value.includes(keyword))
      )
      .slice(0, 30);
  }, [query, works]);

  async function selectWork(work: WorkOrderRow) {
    setSelectedWork(work);
    setMessage("");

    try {
      await loadPhotos(normalizeText(work.work_name));
    } catch (error) {
      setMessage(
        `사진 조회 실패${
          error instanceof Error && error.message ? `: ${error.message}` : ""
        }`
      );
    }
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (!selectedWorkName || files.length === 0) return;

    setUploading(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("folder", getWorkPhotoFolder(selectedWorkName));

      for (const file of files) {
        const uploadFile = await compressImage(
          file,
          normalizeText(selectedWork?.car_number)
        );
        formData.append("files", uploadFile, uploadFile.name);
      }

      const response = await fetch("/api/work-photos", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      await loadPhotos(selectedWorkName);
      setMessage(`사진 ${files.length}장 저장 완료`);
    } catch (error) {
      setMessage(
        `사진 저장 실패${
          error instanceof Error && error.message ? `: ${error.message}` : ""
        }`
      );
    } finally {
      setUploading(false);
    }
  }

  const managerName =
    normalizeText(selectedWork?.manager_name) ||
    normalizeText(selectedWork?.own_manager_name) ||
    normalizeText(selectedWork?.other_manager_name);

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-black">현장 사진</h1>
            <p className="text-xs font-semibold text-slate-500">NAS TEST SERVER</p>
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              nasHost ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}
          >
            {nasHost ? "NAS 저장" : "확인 필요"}
          </div>
        </div>
      </div>

      <section className="space-y-3 px-4 py-4">
        {!authenticated ? (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
            <div>
              <label className="text-xs font-bold text-slate-500">아이디</label>
              <input
                value={loginId}
                onChange={(event) => setLoginId(event.target.value)}
                placeholder="이메일 아이디"
                className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-semibold outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500">비밀번호</label>
              <input
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                type="password"
                placeholder="비밀번호"
                className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-semibold outline-none focus:border-blue-500"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleLogin();
                }}
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={() => void handleLogin()}
              className="h-12 w-full rounded-lg bg-slate-950 text-base font-black text-white disabled:bg-slate-400"
            >
              {loading ? "확인 중" : "로그인"}
            </button>
          </div>
        ) : null}

        {authenticated ? (
          <>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="차량번호, 작명, 차종, 담당자 검색"
          className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-base font-semibold outline-none focus:border-blue-500"
        />

        {message && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
            {message}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg bg-white px-4 py-6 text-center text-sm font-semibold text-slate-500">
            작업 목록 불러오는 중
          </div>
        ) : (
          <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white">
            {filteredWorks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                입고 후 출고되지 않은 작업 차량이 없습니다.
              </div>
            ) : (
              filteredWorks.map((work) => {
              const workName = normalizeText(work.work_name);
              const active = selectedWorkName === workName;

              return (
                <button
                  key={work.id}
                  type="button"
                  onClick={() => void selectWork(work)}
                  className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 ${
                    active ? "bg-blue-50" : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-base font-black">{normalizeText(work.car_number) || "-"}</span>
                    <span className="text-xs font-bold text-slate-500">{workName}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-600">
                    {[work.car_maker, work.car_model].map(normalizeText).filter(Boolean).join(" ")}
                  </div>
                </button>
              );
              })
            )}
          </div>
        )}
          </>
        ) : null}
      </section>

      {authenticated && selectedWork && (
        <section className="space-y-4 px-4 pb-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-bold text-slate-500">{selectedWorkName}</div>
            <div className="mt-1 text-2xl font-black">{normalizeText(selectedWork.car_number) || "-"}</div>
            <div className="mt-2 text-sm font-semibold text-slate-600">
              {[selectedWork.car_maker, selectedWork.car_model]
                .map(normalizeText)
                .filter(Boolean)
                .join(" ") || "-"}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-500">
              <div>구분: {normalizeText(selectedWork.category) || "-"}</div>
              <div>담당: {managerName || "-"}</div>
              <div>입고: {normalizeText(selectedWork.inbound_date) || "-"}</div>
              <div>출고: {normalizeText(selectedWork.release_date) || "-"}</div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={handleUpload}
          />

          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="h-14 w-full rounded-lg bg-blue-600 text-base font-black text-white shadow-sm disabled:bg-slate-400"
          >
            {uploading ? "저장 중" : "사진 촬영/선택"}
          </button>

          <div className="grid grid-cols-2 gap-3">
            {photos.map((photo) => (
              <a
                key={photo.path}
                href={photo.url}
                target="_blank"
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- NAS photos are served by the local API. */}
                <img src={photo.url} alt={photo.name} className="aspect-square w-full object-cover" />
                <div className="truncate px-2 py-2 text-xs font-semibold text-slate-600">
                  {photo.name}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
