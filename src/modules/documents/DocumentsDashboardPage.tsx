"use client";

import type { MenuItem } from "../../data/menuData";

type DocumentsDashboardPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
};

const documentItems = [
  {
    id: "documents-expense-request",
    title: "지출결의서",
    description: "영수증과 지출 내용을 신청하고 승인 상태를 확인합니다.",
  },
  {
    id: "documents-attendance-request",
    title: "근태신청서",
    description: "휴가, 반차, 조퇴, 외근 등 근태 신청과 승인 내역을 관리합니다.",
  },
  {
    id: "documents-incident-report",
    title: "경위서",
    description: "발생 경위와 조치 내용을 작성하고 확인 상태를 관리합니다.",
  },
];

export default function DocumentsDashboardPage({
  onSelectMenu,
}: DocumentsDashboardPageProps) {
  return (
    <div className="space-y-5 text-slate-900">
      <div>
        <h3 className="text-2xl font-bold">문서관리</h3>
        <p className="text-sm text-slate-600">
          작성하거나 확인할 문서 업무를 선택하세요.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {documentItems.map((item) => (
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
