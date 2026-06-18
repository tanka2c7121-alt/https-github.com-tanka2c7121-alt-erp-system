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

type VehicleMakerRow = {
  id: number;
  name: string;
  is_active: boolean;
};

type VehicleModelRow = {
  id: number;
  maker_id: number;
  name: string;
  is_active: boolean;
  vehicle_makers?: {
    name: string;
  } | null;
};

type VehicleColorCodeRow = {
  id: number;
  model_id: number;
  code: string;
  color_name: string | null;
  is_active: boolean;
  vehicle_models?: {
    name: string;
    vehicle_makers?: {
      name: string;
    } | null;
  } | null;
};

type BusinessCatalogRow = {
  id: number;
  item_type: string;
  name: string;
  phone_number: string | null;
  group_name: string | null;
  is_active: boolean;
};

type DailyCashCategoryRow = {
  id: number;
  type: string;
  name: string;
  sort_order: number | null;
  is_active: boolean;
};

type TabId =
  | "vehicleMaker"
  | "vehicleModel"
  | "vehicleColor"
  | "vehicle"
  | "rental"
  | "partner"
  | "insurer"
  | "dailyCashCategory";

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "vehicleMaker", label: "제조사" },
  { id: "vehicleModel", label: "차량" },
  { id: "vehicleColor", label: "칼라코드" },
  { id: "rental", label: "렌터카업체" },
  { id: "partner", label: "거래처" },
  { id: "insurer", label: "보험사" },
  { id: "dailyCashCategory", label: "입출금분류" },
];

const dailyCashTypes = ["수입", "고정비", "변동비", "내부이동"];

const firstRelation = <T,>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const catalogErrorMessage = (action: string, message: string) => {
  const policyHint =
    "관리부 직원인데도 실패하면 Supabase SQL Editor에서 supabase_rls_auth.sql과 해당 기초자료 SQL을 다시 실행해 주세요.";

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
        제조사, 렌터카업체, 거래처, 보험사, 입출금 분류 목록을 수정하려면 비밀번호를 한 번 더 입력하세요.
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
  const [activeTab, setActiveTab] = useState<TabId>("vehicleMaker");
  const [vehicleRows, setVehicleRows] = useState<VehicleCatalogRow[]>([]);
  const [vehicleMakerRows, setVehicleMakerRows] = useState<VehicleMakerRow[]>([]);
  const [vehicleModelRows, setVehicleModelRows] = useState<VehicleModelRow[]>([]);
  const [vehicleColorCodeRows, setVehicleColorCodeRows] = useState<
    VehicleColorCodeRow[]
  >([]);
  const [businessRows, setBusinessRows] = useState<BusinessCatalogRow[]>([]);
  const [dailyCashCategoryRows, setDailyCashCategoryRows] = useState<
    DailyCashCategoryRow[]
  >([]);
  const [maker, setMaker] = useState("");
  const [selectedMakerId, setSelectedMakerId] = useState("");
  const [model, setModel] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [colorName, setColorName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [groupName, setGroupName] = useState("보험");
  const [dailyCashType, setDailyCashType] = useState("수입");
  const [dailyCashCategoryName, setDailyCashCategoryName] = useState("");
  const [searchText, setSearchText] = useState("");
  const [saving, setSaving] = useState(false);

  const loadRows = async () => {
    const [
      vehicleResult,
      vehicleMakerResult,
      vehicleModelResult,
      vehicleColorCodeResult,
      businessResult,
      dailyCashCategoryResult,
    ] = await Promise.all([
      supabase
        .from("vehicle_catalog")
        .select("id, maker, model, color_code, is_active")
        .order("maker", { ascending: true })
        .order("model", { ascending: true })
        .order("color_code", { ascending: true }),
      supabase
        .from("vehicle_makers")
        .select("id, name, is_active")
        .order("name", { ascending: true }),
      supabase
        .from("vehicle_models")
        .select("id, maker_id, name, is_active, vehicle_makers(name)")
        .order("name", { ascending: true }),
      supabase
        .from("vehicle_color_codes")
        .select("id, model_id, code, color_name, is_active, vehicle_models(name, vehicle_makers(name))")
        .order("code", { ascending: true }),
      supabase
        .from("business_catalog")
        .select("id, item_type, name, phone_number, group_name, is_active")
        .order("item_type", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("daily_cash_categories")
        .select("id, type, name, sort_order, is_active")
        .order("type", { ascending: true })
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true }),
    ]);

    if (vehicleResult.error) {
      alert("차량목록 조회 실패: " + vehicleResult.error.message);
    } else {
      setVehicleRows((vehicleResult.data ?? []) as VehicleCatalogRow[]);
    }

    if (vehicleMakerResult.error) {
      setVehicleMakerRows([]);
    } else {
      setVehicleMakerRows((vehicleMakerResult.data ?? []) as VehicleMakerRow[]);
    }

    if (vehicleModelResult.error) {
      setVehicleModelRows([]);
    } else {
      setVehicleModelRows(
        ((vehicleModelResult.data ?? []) as any[]).map((row) => ({
          id: row.id,
          maker_id: row.maker_id,
          name: row.name,
          is_active: row.is_active,
          vehicle_makers: firstRelation(row.vehicle_makers),
        }))
      );
    }

    if (vehicleColorCodeResult.error) {
      setVehicleColorCodeRows([]);
    } else {
      setVehicleColorCodeRows(
        ((vehicleColorCodeResult.data ?? []) as any[]).map((row) => {
          const model = firstRelation(row.vehicle_models) as any;

          return {
            id: row.id,
            model_id: row.model_id,
            code: row.code,
            color_name: row.color_name,
            is_active: row.is_active,
            vehicle_models: model
              ? {
                  name: model.name,
                  vehicle_makers: firstRelation(model.vehicle_makers),
                }
              : null,
          };
        })
      );
    }

    if (businessResult.error) {
      alert("업체목록 조회 실패: " + businessResult.error.message);
    } else {
      setBusinessRows((businessResult.data ?? []) as BusinessCatalogRow[]);
    }

    if (dailyCashCategoryResult.error) {
      alert(
        catalogErrorMessage(
          "입출금분류 조회 실패",
          dailyCashCategoryResult.error.message
        )
      );
      setDailyCashCategoryRows([]);
    } else {
      setDailyCashCategoryRows(
        (dailyCashCategoryResult.data ?? []) as DailyCashCategoryRow[]
      );
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

  const visibleVehicleMakerRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return vehicleMakerRows;

    return vehicleMakerRows.filter((row) =>
      row.name.toLowerCase().includes(keyword)
    );
  }, [searchText, vehicleMakerRows]);

  const visibleVehicleModelRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return vehicleModelRows
      .filter((row) => !selectedMakerId || String(row.maker_id) === selectedMakerId)
      .filter((row) => {
        const makerName = row.vehicle_makers?.name ?? "";
        const text = [makerName, row.name].join(" ").toLowerCase();

        return !keyword || text.includes(keyword);
      });
  }, [searchText, selectedMakerId, vehicleModelRows]);

  const visibleVehicleColorCodeRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    return vehicleColorCodeRows
      .filter((row) => {
        if (!selectedModelId) return true;
        return String(row.model_id) === selectedModelId;
      })
      .filter((row) => {
        if (!selectedMakerId) return true;

        const model = vehicleModelRows.find(
          (modelRow) => modelRow.id === row.model_id
        );

        return model ? String(model.maker_id) === selectedMakerId : true;
      })
      .filter((row) => {
        const makerName = row.vehicle_models?.vehicle_makers?.name ?? "";
        const modelName = row.vehicle_models?.name ?? "";
        const text = [makerName, modelName, row.code, row.color_name ?? ""]
          .join(" ")
          .toLowerCase();

        return !keyword || text.includes(keyword);
      });
  }, [
    searchText,
    selectedMakerId,
    selectedModelId,
    vehicleColorCodeRows,
    vehicleModelRows,
  ]);

  const activeVehicleMakers = vehicleMakerRows.filter((row) => row.is_active);
  const modelsForSelectedMaker = vehicleModelRows.filter(
    (row) => !selectedMakerId || String(row.maker_id) === selectedMakerId
  );

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

  const visibleDailyCashCategoryRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();

    if (!keyword) return dailyCashCategoryRows;

    return dailyCashCategoryRows.filter((row) =>
      [row.type, row.name].join(" ").toLowerCase().includes(keyword)
    );
  }, [dailyCashCategoryRows, searchText]);

  const resetForm = () => {
    setMaker("");
    setSelectedMakerId("");
    setModel("");
    setSelectedModelId("");
    setColorCode("");
    setColorName("");
    setBusinessName("");
    setPhoneNumber("");
    setGroupName(activeTab === "insurer" ? "보험" : "");
    setDailyCashType("수입");
    setDailyCashCategoryName("");
  };

  const handleAddVehicleMaker = async () => {
    const nextMaker = maker.trim();

    if (!nextMaker) {
      alert("제조사를 입력하세요.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("vehicle_makers").insert({
      name: nextMaker,
      is_active: true,
    });

    setSaving(false);

    if (error) {
      alert(catalogErrorMessage("제조사 추가 실패", error.message));
      return;
    }

    resetForm();
    void loadRows();
  };

  const handleAddVehicleModel = async () => {
    const makerId = Number(selectedMakerId);
    const nextModel = model.trim();

    if (!makerId || !nextModel) {
      alert("제조사와 차량명을 선택/입력하세요.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("vehicle_models").insert({
      maker_id: makerId,
      name: nextModel,
      is_active: true,
    });

    setSaving(false);

    if (error) {
      alert(catalogErrorMessage("차량 추가 실패", error.message));
      return;
    }

    resetForm();
    void loadRows();
  };

  const handleAddVehicleColorCode = async () => {
    const modelId = Number(selectedModelId);
    const nextColorCode = colorCode.trim().toUpperCase();
    const nextColorName = colorName.trim();

    if (!modelId || !nextColorCode) {
      alert("차량과 칼라코드를 선택/입력하세요.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("vehicle_color_codes").insert({
      model_id: modelId,
      code: nextColorCode,
      color_name: nextColorName || null,
      is_active: true,
    });

    setSaving(false);

    if (error) {
      alert(catalogErrorMessage("칼라코드 추가 실패", error.message));
      return;
    }

    resetForm();
    void loadRows();
  };

  const handleAddBusiness = async () => {
    const nextName = businessName.trim();
    const nextPhoneNumber = phoneNumber.trim();
    const nextGroupName =
      activeTab === "insurer" || activeTab === "partner" ? groupName : "";

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

  const handleAddDailyCashCategory = async () => {
    const nextType = dailyCashType.trim();
    const nextName = dailyCashCategoryName.trim();

    if (!nextType || !nextName) {
      alert("구분과 분류명을 입력하세요.");
      return;
    }

    setSaving(true);

    const { error } = await supabase.from("daily_cash_categories").insert({
      type: nextType,
      name: nextName,
      is_active: true,
    });

    setSaving(false);

    if (error) {
      alert(catalogErrorMessage("입출금분류 추가 실패", error.message));
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

  const toggleVehicleMakerActive = async (row: VehicleMakerRow) => {
    const { error } = await supabase
      .from("vehicle_makers")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("제조사 상태 변경 실패", error.message));
      return;
    }

    void loadRows();
  };

  const toggleVehicleModelActive = async (row: VehicleModelRow) => {
    const { error } = await supabase
      .from("vehicle_models")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("차량 상태 변경 실패", error.message));
      return;
    }

    void loadRows();
  };

  const toggleVehicleColorCodeActive = async (row: VehicleColorCodeRow) => {
    const { error } = await supabase
      .from("vehicle_color_codes")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("칼라코드 상태 변경 실패", error.message));
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

  const toggleDailyCashCategoryActive = async (row: DailyCashCategoryRow) => {
    const { error } = await supabase
      .from("daily_cash_categories")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("입출금분류 상태 변경 실패", error.message));
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

  const deleteVehicleMaker = async (row: VehicleMakerRow) => {
    if (!confirm(`${row.name} 제조사를 삭제할까요? 연결된 차량과 칼라코드도 함께 삭제됩니다.`)) {
      return;
    }

    const { error } = await supabase.from("vehicle_makers").delete().eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("제조사 삭제 실패", error.message));
      return;
    }

    void loadRows();
  };

  const deleteVehicleModel = async (row: VehicleModelRow) => {
    if (!confirm(`${row.vehicle_makers?.name ?? ""} ${row.name} 차량을 삭제할까요? 연결된 칼라코드도 함께 삭제됩니다.`)) {
      return;
    }

    const { error } = await supabase.from("vehicle_models").delete().eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("차량 삭제 실패", error.message));
      return;
    }

    void loadRows();
  };

  const deleteVehicleColorCode = async (row: VehicleColorCodeRow) => {
    if (!confirm(`${row.vehicle_models?.name ?? ""} ${row.code} 칼라코드를 삭제할까요?`)) {
      return;
    }

    const { error } = await supabase
      .from("vehicle_color_codes")
      .delete()
      .eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("칼라코드 삭제 실패", error.message));
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

  const deleteDailyCashCategory = async (row: DailyCashCategoryRow) => {
    if (!confirm(`${row.type} / ${row.name} 항목을 삭제할까요?`)) {
      return;
    }

    const { error } = await supabase
      .from("daily_cash_categories")
      .delete()
      .eq("id", row.id);

    if (error) {
      alert(catalogErrorMessage("입출금분류 삭제 실패", error.message));
      return;
    }

    void loadRows();
  };

  const currentCount =
    activeTab === "vehicleMaker"
      ? visibleVehicleMakerRows.length
      : activeTab === "vehicleModel"
        ? visibleVehicleModelRows.length
        : activeTab === "vehicleColor"
          ? visibleVehicleColorCodeRows.length
          : activeTab === "vehicle"
      ? visibleVehicleRows.length
      : activeTab === "dailyCashCategory"
        ? visibleDailyCashCategoryRows.length
        : visibleBusinessRows.length;

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-xl font-bold">기초자료관리</h3>
        <p className="mt-1 text-sm text-slate-600">
          작업등록과 입출금등록에서 사용할 차량, 업체, 보험사, 입출금 분류 목록을 관리합니다.
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
        {activeTab === "vehicleMaker" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              className={inputClass}
              placeholder="제조사 예: 현대"
              value={maker}
              onChange={(event) => setMaker(event.target.value)}
            />
            <div />
            <div />
            <button
              type="button"
              onClick={() => {
                void handleAddVehicleMaker();
              }}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
            >
              {saving ? "추가 중..." : "제조사추가"}
            </button>
          </div>
        ) : activeTab === "vehicleModel" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <select
              className={inputClass}
              value={selectedMakerId}
              onChange={(event) => setSelectedMakerId(event.target.value)}
            >
              <option value="">제조사 선택</option>
              {activeVehicleMakers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="차량명 예: 그랜저"
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
            <div />
            <button
              type="button"
              onClick={() => {
                void handleAddVehicleModel();
              }}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
            >
              {saving ? "추가 중..." : "차량추가"}
            </button>
          </div>
        ) : activeTab === "vehicleColor" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <select
              className={inputClass}
              value={selectedMakerId}
              onChange={(event) => {
                setSelectedMakerId(event.target.value);
                setSelectedModelId("");
              }}
            >
              <option value="">제조사 선택</option>
              {activeVehicleMakers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <select
              className={inputClass}
              value={selectedModelId}
              onChange={(event) => setSelectedModelId(event.target.value)}
              disabled={!selectedMakerId}
            >
              <option value="">
                {selectedMakerId ? "차량 선택" : "제조사 먼저 선택"}
              </option>
              {modelsForSelectedMaker.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="칼라코드 예: A2B"
              value={colorCode}
              onChange={(event) => setColorCode(event.target.value)}
            />
            <input
              className={inputClass}
              placeholder="색상명"
              value={colorName}
              onChange={(event) => setColorName(event.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                void handleAddVehicleColorCode();
              }}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-slate-400"
            >
              {saving ? "추가 중..." : "칼라코드추가"}
            </button>
          </div>
        ) : activeTab === "dailyCashCategory" ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <select
              className={inputClass}
              value={dailyCashType}
              onChange={(event) => setDailyCashType(event.target.value)}
            >
              {dailyCashTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="분류명 예: 기타지출"
              value={dailyCashCategoryName}
              onChange={(event) => setDailyCashCategoryName(event.target.value)}
            />
            <div />
            <button
              type="button"
              onClick={() => {
                void handleAddDailyCashCategory();
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
            ) : activeTab === "partner" ? (
              <select
                className={inputClass}
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              >
                <option value="">일반 거래처</option>
                <option value="입고지원">입고지원 대상</option>
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

      {activeTab === "vehicleMaker" ? (
        <VehicleMakerTable
          rows={visibleVehicleMakerRows}
          canManage={canManage}
          onToggle={toggleVehicleMakerActive}
          onDelete={deleteVehicleMaker}
        />
      ) : activeTab === "vehicleModel" ? (
        <VehicleModelTable
          rows={visibleVehicleModelRows}
          canManage={canManage}
          onToggle={toggleVehicleModelActive}
          onDelete={deleteVehicleModel}
        />
      ) : activeTab === "vehicleColor" ? (
        <VehicleColorCodeTable
          rows={visibleVehicleColorCodeRows}
          canManage={canManage}
          onToggle={toggleVehicleColorCodeActive}
          onDelete={deleteVehicleColorCode}
        />
      ) : activeTab === "vehicle" ? (
        <VehicleTable
          rows={visibleVehicleRows}
          canManage={canManage}
          onToggle={toggleVehicleActive}
          onDelete={deleteVehicle}
        />
      ) : activeTab === "dailyCashCategory" ? (
        <DailyCashCategoryTable
          rows={visibleDailyCashCategoryRows}
          canManage={canManage}
          onToggle={toggleDailyCashCategoryActive}
          onDelete={deleteDailyCashCategory}
        />
      ) : (
        <BusinessTable
          rows={visibleBusinessRows}
          canManage={canManage}
          showGroup={activeTab === "insurer" || activeTab === "partner"}
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

function VehicleMakerTable({
  rows,
  canManage,
  onToggle,
  onDelete,
}: {
  rows: VehicleMakerRow[];
  canManage: boolean;
  onToggle: (row: VehicleMakerRow) => Promise<void>;
  onDelete: (row: VehicleMakerRow) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">제조사</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">사용</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">{row.name}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <StatusButton
                    active={row.is_active}
                    onClick={canManage ? () => void onToggle(row) : undefined}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <DeleteButton disabled={!canManage} onClick={() => void onDelete(row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VehicleModelTable({
  rows,
  canManage,
  onToggle,
  onDelete,
}: {
  rows: VehicleModelRow[];
  canManage: boolean;
  onToggle: (row: VehicleModelRow) => Promise<void>;
  onDelete: (row: VehicleModelRow) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">제조사</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">차량명</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">사용</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2 text-sm">{row.vehicle_makers?.name ?? "-"}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">{row.name}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <StatusButton
                    active={row.is_active}
                    onClick={canManage ? () => void onToggle(row) : undefined}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <DeleteButton disabled={!canManage} onClick={() => void onDelete(row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function VehicleColorCodeTable({
  rows,
  canManage,
  onToggle,
  onDelete,
}: {
  rows: VehicleColorCodeRow[];
  canManage: boolean;
  onToggle: (row: VehicleColorCodeRow) => Promise<void>;
  onDelete: (row: VehicleColorCodeRow) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">제조사</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">차량명</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">칼라코드</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">색상명</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">사용</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2 text-sm">
                  {row.vehicle_models?.vehicle_makers?.name ?? "-"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-sm">
                  {row.vehicle_models?.name ?? "-"}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">{row.code}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-sm">{row.color_name || "-"}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <StatusButton
                    active={row.is_active}
                    onClick={canManage ? () => void onToggle(row) : undefined}
                  />
                </td>
                <td className="border-b border-slate-100 px-3 py-2 text-center">
                  <DeleteButton disabled={!canManage} onClick={() => void onDelete(row)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DeleteButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
    >
      삭제
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

function DailyCashCategoryTable({
  rows,
  canManage,
  onToggle,
  onDelete,
}: {
  rows: DailyCashCategoryRow[];
  canManage: boolean;
  onToggle: (row: DailyCashCategoryRow) => Promise<void>;
  onDelete: (row: DailyCashCategoryRow) => Promise<void>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">구분</th>
              <th className="border-b border-slate-200 px-3 py-2 text-left text-sm font-semibold">분류</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">사용</th>
              <th className="border-b border-slate-200 px-3 py-2 text-center text-sm font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50">
                <td className="border-b border-slate-100 px-3 py-2 text-sm">{row.type}</td>
                <td className="border-b border-slate-100 px-3 py-2 text-sm font-semibold">{row.name}</td>
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
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="border-b border-slate-100 px-3 py-8 text-center text-sm text-slate-500"
                >
                  등록된 입출금 분류가 없습니다.
                </td>
              </tr>
            )}
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
