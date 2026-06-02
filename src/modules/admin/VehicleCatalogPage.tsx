"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import type { UserRole } from "../../types/roles";

type LoginUser = {
  user_id: string;
  user_name: string;
  department?: string | null;
  approval_role?: string | null;
  role: UserRole;
};

type VehicleCatalogRow = {
  id: number;
  maker: string;
  model: string;
  color_code: string | null;
  is_active: boolean;
};

type BusinessCatalogRow = {
  id: number;
  item_type: string;
  name: string;
  phone_number: string | null;
  group_name: string | null;
  is_active: boolean;
};

type TabId = "vehicle" | "rental" | "partner" | "insurer";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "vehicle", label: "차량목록" },
  { id: "rental", label: "렌터카업체" },
  { id: "partner", label: "거래처" },
  { id: "insurer", label: "보험사" },
];

const catalogErrorMessage = (action: string, message: string) => {
  const policyHint =
    "관리부 직원인데도 실패하면 Supabase SQL Editor에서 supabase_fix_admin_dept_rls.sql을 실행해 주세요.";

  return `${action}: ${message}\n\n${policyHint}`;
};

export default function VehicleCatalogPage({ user }: { user: LoginUser }) {
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [checking, setChecking] = useState(false);
  const canManageCatalog =
    user.role === "ADMIN" ||
    user.department?.trim() === "관리부" ||
    user.approval_role?.trim() === "관리부" ||
    user.approval_role?.trim() === "관리자";

  if (!verified) {
    return (
      <PasswordCheck
        user={user}
        password={password}
        checking={checking}
        onPasswordChange={setPassword}
        onCheckingChange={setChecking}
        onVerified={() => setVerified(true)}
      />
    );
  }

  return <CatalogManager canManage={canManageCatalog} />;
}

function PasswordCheck({
  user,
  password,
  checking,
  onPasswordChange,
  onCheckingChange,
  onVerified,
}: {
  user: LoginUser;
  password: string;
  checking: boolean;
  onPasswordChange: (value: string) => void;
  onCheckingChange: (value: boolean) => void;
  onVerified: () => void;
}) {
  const handleCheck = async () => {
    if (!password) {
      alert("비밀번호를 입력하세요.");
      return;
    }

    onCheckingChange(true);

    const { data, error } = await supabase
      .from("app_users")
      .select("id")
      .eq("user_id", user.user_id)
      .eq("password", password)
      .eq("is_active", true)
      .single();

    onCheckingChange(false);

    if (error || !data) {
      alert("비밀번호가 맞지 않습니다.");
      return;
    }

    onVerified();
  };

  return (
    <div className="mx-auto max-w-md rounded-xl border border-slate-200 bg-white p-6 text-slate-900">
      <h3 className="text-xl font-bold">기초자료관리 확인</h3>
      <p className="mt-2 text-sm text-slate-600">
        제조사, 렌터카업체, 거래처, 보험사 목록을 수정하려면 비밀번호를 한 번 더 입력하세요.
      </p>
      <input
        type="password"
        className="mt-5 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm"
        placeholder="현재 비밀번호"
        value={password}
        onChange={(event) => onPasswordChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            void handleCheck();
          }
        }}
      />
      <button
        type="button"
        onClick={() => {
          void handleCheck();
        }}
        disabled={checking}
        className="mt-3 w-full rounded-lg bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
      >
        {checking ? "확인 중..." : "확인 후 들어가기"}
      </button>
    </div>
  );
}

function CatalogManager({ canManage }: { canManage: boolean }) {
  const [activeTab, setActiveTab] = useState<TabId>("vehicle");
  const [vehicleRows, setVehicleRows] = useState<VehicleCatalogRow[]>([]);
  const [businessRows, setBusinessRows] = useState<BusinessCatalogRow[]>([]);
  const [maker, setMaker] = useState("");
  const [model, setModel] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [groupName, setGroupName] = useState("보험");
  const [searchText, setSearchText] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRows = async () => {
    const [vehicleResult, businessResult] = await Promise.all([
      supabase
        .from("vehicle_catalog")
        .select("id, maker, model, color_code, is_active")
        .order("maker", { ascending: true })
        .order("model", { ascending: true })
        .order("color_code", { ascending: true }),
      supabase
        .from("business_catalog")
        .select("id, item_type, name, phone_number, group_name, is_active")
        .order("item_type", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (vehicleResult.error) {
      alert("차량목록 조회 실패: " + vehicleResult.error.message);
    } else {
      setVehicleRows((vehicleResult.data ?? []) as VehicleCatalogRow[]);
    }

    if (businessResult.error) {
      alert("업체목록 조회 실패: " + businessResult.error.message);
    } else {
      setBusinessRows((businessResult.data ?? []) as BusinessCatalogRow[]);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const visibleVehicleRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return vehicleRows;

    return vehicleRows.filter((row) =>
      [row.maker, row.model, row.color_code ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [searchText, vehicleRows]);

  const visibleBusinessRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    const typeRows = businessRows.filter((row) => row.item_type === activeTab);

    if (!keyword) return typeRows;

    return typeRows.filter((row) =>
      [row.name, row.phone_number ?? "", row.group_name ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [activeTab, businessRows, searchText]);

  const resetForm = () => {
    setMaker("");
    setModel("");
    setColorCode("");
    setBusinessName("");
    setPhoneNumber("");
    setGroupName(activeTab === "insurer" ? "보험" : "");
  };

  const handleAddVehicle = async () => {
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
      alert(catalogErrorMessage("차량목록 추가 실패", error.message));
      return;
    }

    resetForm();
    void loadRows();
  };

  const handleAddBusiness = async () => {
    const nextName = businessName.trim();
    const nextPhoneNumber = phoneNumber.trim();
    const nextGroupName = activeTab === "insurer" ? groupName : "";

    if (!nextName) {
      alert("목록명을 입력하세요.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("business_catalog").insert({
      item_type: activeTab,
      name: nextName,
      phone_number: nextPhoneNumber || null,
      group_name: nextGroupName || null,
      is_active: true,
    });

    setSaving(false);

    if (error) {
      alert(catalogErrorMessage("목록 추가 실패", error.message));
      return;
    }

    resetForm();
    void loadRows();
  };

  const toggleVehicleActive = async (row: VehicleCatalogRow) => {
    const { error } = await supabase
      .from("vehicle_catalog")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("상태 변경 실패", error.message));
      return;
    }

    void loadRows();
  };

  const toggleBusinessActive = async (row: BusinessCatalogRow) => {
    const { error } = await supabase
      .from("business_catalog")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("상태 변경 실패", error.message));
      return;
    }

    void loadRows();
  };

  const deleteVehicle = async (row: VehicleCatalogRow) => {
    if (!confirm(`${row.maker} ${row.model} ${row.color_code ?? ""} 항목을 삭제할까요?`)) {
      return;
    }

    const { error } = await supabase.from("vehicle_catalog").delete().eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("삭제 실패", error.message));
      return;
    }

    void loadRows();
  };

  const deleteBusiness = async (row: BusinessCatalogRow) => {
    if (!confirm(`${row.name} 항목을 삭제할까요?`)) {
      return;
    }

    const { error } = await supabase.from("business_catalog").delete().eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("삭제 실패", error.message));
      return;
    }

    void loadRows();
  };

  const currentCount =
    activeTab === "vehicle" ? visibleVehicleRows.length : visibleBusinessRows.length;

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">기초자료관리</h3>
        <p className="mt-1 text-sm text-slate-600">
          작업등록에서 사용할 차량, 렌터카업체, 거래처, 보험사 목록을 관리합니다.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id);
              setSearchText("");
              resetForm();
            }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              activeTab === tab.id
                ? "bg-blue-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {canManage ? (
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        {activeTab === "vehicle" ? (
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
                void handleAddVehicle();
              }}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
            >
              {saving ? "추가 중..." : "목록추가"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              className={inputClass}
              placeholder={
                activeTab === "rental"
                  ? "렌터카업체명"
                  : activeTab === "partner"
                    ? "거래처명"
                    : "보험사명"
              }
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
            {activeTab === "rental" ? (
              <input
                className={inputClass}
                placeholder="전화번호"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
              />
            ) : (
              <div />
            )}
            {activeTab === "insurer" ? (
              <select
                className={inputClass}
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              >
                <option value="보험">보험</option>
                <option value="캐피탈">캐피탈</option>
                <option value="일반">일반</option>
              </select>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={() => {
                void handleAddBusiness();
              }}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
            >
              {saving ? "추가 중..." : "목록추가"}
            </button>
          </div>
        )}
      </section>
      ) : (
        <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          기초자료는 조회만 가능합니다. 목록 추가, 사용상태 변경, 삭제는 관리자 또는 관리부만 가능합니다.
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-semibold text-slate-700">
          총 {currentCount.toLocaleString()}개
        </p>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-72"
          placeholder="검색"
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
        />
      </div>

      {activeTab === "vehicle" ? (
        <VehicleTable
          rows={visibleVehicleRows}
          canManage={canManage}
          onToggle={toggleVehicleActive}
          onDelete={deleteVehicle}
        />
      ) : (
        <BusinessTable
          rows={visibleBusinessRows}
          canManage={canManage}
          showGroup={activeTab === "insurer"}
          showPhone={activeTab === "rental"}
          onToggle={toggleBusinessActive}
          onDelete={deleteBusiness}
        />
      )}
    </div>
  );
}

function StatusButton({ active, onClick }: { active: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
      } ${onClick ? "" : "cursor-default"}`}
    >
      {active ? "사용중" : "중지"}
    </button>
  );
}

function VehicleTable({
  rows,
  canManage,
  onToggle,
  onDelete,
}: {
  rows: VehicleCatalogRow[];
  canManage: boolean;
  onToggle: (row: VehicleCatalogRow) => Promise<void>;
  onDelete: (row: VehicleCatalogRow) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">제조사</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">차량명</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">칼라코드</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">사용</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2 text-sm">{row.maker}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">{row.model}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-sm">{row.color_code || "-"}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <StatusButton
                    active={row.is_active}
                    onClick={canManage ? () => void onToggle(row) : undefined}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (canManage) void onDelete(row);
                    }}
                    disabled={!canManage}
                    className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
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
  );
}

function BusinessTable({
  rows,
  canManage,
  showGroup,
  showPhone,
  onToggle,
  onDelete,
}: {
  rows: BusinessCatalogRow[];
  canManage: boolean;
  showGroup: boolean;
  showPhone: boolean;
  onToggle: (row: BusinessCatalogRow) => Promise<void>;
  onDelete: (row: BusinessCatalogRow) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">이름</th>
              {showPhone && (
                <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">전화번호</th>
              )}
              {showGroup && (
                <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">구분</th>
              )}
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">사용</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">{row.name}</td>
                {showPhone && (
                  <td className="border-b border-slate-100 px-3 py-2 text-sm">{row.phone_number || "-"}</td>
                )}
                {showGroup && (
                  <td className="border-b border-slate-100 px-3 py-2 text-sm">{row.group_name || "-"}</td>
                )}
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <StatusButton
                    active={row.is_active}
                    onClick={canManage ? () => void onToggle(row) : undefined}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (canManage) void onDelete(row);
                    }}
                    disabled={!canManage}
                    className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
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
  );
}
