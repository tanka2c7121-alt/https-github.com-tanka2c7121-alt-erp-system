"use client";

import type { MenuItem } from "../../data/menuData";
import type { UserRole } from "../../types/roles";

type SettingsDashboardPageProps = {
  userRole: UserRole;
  onSelectMenu: (menu: MenuItem) => void;
};

const settingItems = [
  {
    id: "employee-manage",
    title: "직원관리",
    description: "직원 계정, 권한, 사용 여부를 관리합니다.",
    roles: ["ADMIN"] as UserRole[],
  },
  {
    id: "vehicle-catalog",
    title: "기초자료관리",
    description: "차량, 렌터카업체, 거래처, 보험사 목록을 관리합니다.",
  },
  {
    id: "part-supplier-management",
    title: "업체등록",
    description: "부품대관리에서 사용할 업체명, 사업자번호, 연락처, 이메일을 관리합니다.",
  },
];

export default function SettingsDashboardPage({
  userRole,
  onSelectMenu,
}: SettingsDashboardPageProps) {
  const visibleItems = settingItems.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">설정관리</h3>
        <p className="text-sm text-slate-600">
          시스템 사용에 필요한 관리 메뉴를 선택하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {visibleItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() =>
              onSelectMenu({
                id: item.id,
                title: item.title,
              })
            }
            className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
          >
            <div className="text-lg font-bold text-slate-900">{item.title}</div>
            <div className="mt-2 text-sm text-slate-600">{item.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
