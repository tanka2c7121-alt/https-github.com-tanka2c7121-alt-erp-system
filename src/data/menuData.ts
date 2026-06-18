import type { UserRole } from "../types/roles";

export type MenuItem = {
  id: string;
  title: string;
  roles?: UserRole[];
  departments?: string[];

  data?: {
    workName?: string;
    nextWorkName?: string;
    openCamera?: boolean;
    autoPrint?: boolean;

    [key: string]: unknown;
  };

  children?: MenuItem[];
};

export const menuData: MenuItem[] = [
  {
    id: "dashboard",
    title: "업무홈",
  },
  {
    id: "employee",
    title: "직원현황",
  },
  {
    id: "factory",
    title: "공장현황",
    children: [
      {
        id: "factory-inbound",
        title: "입고관리",
        children: [
          { id: "factory-work-register", title: "작업등록" },
        ],
      },
      {
        id: "factory-outbound",
        title: "출고관리",
        children: [
          { id: "factory-release-list", title: "출고리스트" },
          { id: "factory-deductible-management", title: "면책금관리" },
        ],
      },
      {
        id: "factory-settlement",
        title: "정산관리",
        roles: ["ADMIN", "CHIEF"],
        children: [
          {
            id: "factory-settlement-repair",
            title: "차량정산",
            children: [
              { id: "factory-settlement-repair-register", title: "정산등록" },
            ],
          },
          {
            id: "factory-settlement-daily-cash",
            title: "일일입출금",
            children: [
              {
                id: "factory-settlement-daily-cash-register",
                title: "입출금등록",
              },
            ],
          },
          {
            id: "factory-parts-cost-management",
            title: "부품대관리",
          },
        ],
      },
    ],
  },
  {
    id: "sales",
    title: "매출현황",
    roles: ["ADMIN", "CHIEF"],
    children: [
      {
        id: "sales-insurance",
        title: "보험매출",
        children: [{ id: "sales-insurance-payment", title: "보험입금내역" }],
      },
      { id: "sales-capital", title: "캐피탈매출" },
      { id: "sales-general", title: "일반매출" },
      { id: "sales-partner", title: "거래처매출" },
      { id: "sales-card", title: "카드매출" },
      { id: "sales-blue", title: "BLUE POINT 매출" },
    ],
  },
  {
    id: "factory-settlement-pending",
    title: "미결관리",
    roles: ["ADMIN", "CHIEF"],
    children: [
      { id: "factory-settlement-pending-insurance", title: "청구처별 미결 리스트" },
    ],
  },
  {
    id: "factory-settlement-complete-management",
    title: "완결관리",
    roles: ["ADMIN", "CHIEF"],
    children: [
      { id: "sales-partner-support", title: "입고지원관리" },
    ],
  },
  {
    id: "documents",
    title: "문서관리",
    children: [
      { id: "documents-expense-request", title: "지출결의서" },
      { id: "documents-attendance-request", title: "근태신청서" },
      { id: "documents-incident-report", title: "경위서" },
    ],
  },
  {
    id: "settings",
    title: "설정관리",
    children: [
      {
        id: "employee-manage",
        title: "직원관리",
        roles: ["ADMIN"],
      },
      {
        id: "vehicle-catalog",
        title: "기초자료관리",
      },
      {
        id: "part-supplier-management",
        title: "업체등록",
      },
    ],
  },
];

