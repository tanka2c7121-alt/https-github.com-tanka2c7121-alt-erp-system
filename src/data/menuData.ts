export type MenuItem = {
  id: string;
  title: string;
  roles?: Array<"ADMIN" | "STAFF">;

  data?: {
    workName?: string;
    nextWorkName?: string;

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
        title: "입고현황",
        children: [
          { id: "factory-work-register", title: "작업등록" },
        ],
      },
      { id: "factory-outbound", title: "출고현황" },
      {
        id: "factory-settlement",
        title: "정산관리",
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
        ],
      },
    ],
  },
  {
    id: "sales",
    title: "매출현황",
    children: [
      { id: "sales-insurance", title: "보험매출" },
      { id: "sales-general", title: "일반매출" },
      { id: "sales-card", title: "카드매입" },
      { id: "sales-blue", title: "BLUE포인트" },
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
    ],
  },
];
