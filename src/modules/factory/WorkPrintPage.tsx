"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type WorkOrder = {
  work_name: string;
  car_number: string;
  car_model: string;
  color_code: string;
  car_year: string;
  mileage: string;
  vin: string;
  vat_yn: string;
  tow_yn: string;
  inbound_date: string;
  outbound_date: string;
  release_date: string;
  phone_number: string;
  category: string;
  insurance_company: string;
  coverage_type: string;
  receipt_number: string;
  other_receipt_number: string;
  manager_name: string;
  rental_company: string;
  rental_phone_number: string;
  deductible_amount: string;
  message: string;
  partner_company: string;
  other_insurance_company: string;
  other_manager_name: string;
};

type WorkDetail = {
  line_no: number;
  side: string;
  part: string;
  work_type: string;
};
function formatWorkName(value: string) {
  const numbers = value.replace(/\D/g, "");

  if (numbers.length <= 4) {
    return numbers;
  }

  if (numbers.length <= 6) {
    return `${numbers.slice(0, 4)}-${numbers.slice(4)}`;
  }

  return `${numbers.slice(0, 4)}-${numbers.slice(4, 6)}-${numbers.slice(6, 9)}`;
}

export default function WorkPrintPage({
  workName,
}: {
  workName?: string;
}) {
  const [searchWorkName, setSearchWorkName] = useState(workName ?? "");
  const [order, setOrder] = useState<WorkOrder | null>(null);
  const [details, setDetails] = useState<WorkDetail[]>([]);

  async function handleLoadPrintData(
    targetWorkName = searchWorkName,
    printAfterLoad = false
  ) {
    if (!targetWorkName) {
      alert("?묐챸???낅젰?섏꽭??");
      return;
    }

    const { data: orderData, error: orderError } = await supabase
      .from("work_orders")
      .select("*")
      .eq("work_name", targetWorkName)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (orderError || !orderData) {
      alert("?묒뾽 ?곗씠?곕? 李얠쓣 ???놁뒿?덈떎.");
      return;
    }

    const { data: detailData, error: detailError } = await supabase
      .from("work_details")
      .select("*")
      .eq("work_name", targetWorkName)
      .order("line_no", { ascending: true });

    if (detailError) {
      alert("?묒뾽?댁슜 議고쉶 ?ㅽ뙣: " + detailError.message);
      return;
    }

    setOrder(orderData);
    setDetails(detailData ?? []);

    if (printAfterLoad) {
      setTimeout(() => {
        window.print();
      }, 300);
    }
  }

  useEffect(() => {
    if (!workName) return;

    setSearchWorkName(workName);

    void handleLoadPrintData(workName, true);
  }, [workName]);

  return (
    <div className="print-area flex min-h-screen items-center justify-center bg-slate-200 p-6 print:block print:bg-white print:p-0">
    
      <div
        className="mx-auto bg-white text-slate-900 shadow-lg print:m-0 print:shadow-none"
        style={{
          width: "190mm",
          minHeight: "275mm",
          padding: "7mm",
        }}
      >
        <div className="no-print mb-4 flex justify-end gap-2">
  <input
    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
    placeholder="?묐챸 ?낅젰"
    value={searchWorkName}
    onChange={(e) =>
  setSearchWorkName(
    formatWorkName(e.target.value)
  )
}
  />

  <button
    type="button"
    onClick={() => void handleLoadPrintData()}
    className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white"
  >
    遺덈윭?ㅺ린
  </button>

  <button
    type="button"
    onClick={() => window.print()}
    className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
  >
    ?몄뇙
  </button>
</div>

        <div className="border border-slate-900 p-3">
  <div className="mb-6 flex items-start justify-between">
    <div className="flex-1 text-center">
      <h1 className="text-3xl font-bold tracking-widest">
        ?묒뾽吏?쒖꽌
      </h1>

      <p className="mt-1 text-sm font-semibold">
        ?좏씎?꾨??쒕퉬??ERP
      </p>
    </div>

    <div className="min-w-[150px] rounded-lg border-2 border-slate-800 px-2 py-[2px]">
  <div className="flex items-center justify-center border-b border-slate-300 pb-[1px]">
    <span className="text-xl font-black tracking-wider text-slate-900">
      {order?.work_name || "\u00A0"}
    </span>
  </div>

  <div className="mt-1 flex items-center justify-center">
    <span className="text-xl font-black text-slate-900">
      {order?.category || "\u00A0"}
    </span>
  </div>
</div>
    </div>

<table className="w-full border-collapse text-[12px] leading-none text-center">
  <tbody>
<tr>
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    李⑤웾踰덊샇
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle ">
    {order?.car_number || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    李⑤웾紐?
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.car_model || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    李⑤웾?곗떇
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.car_year || "\u00A0"}
  </td>
</tr>

<tr>
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    VIN
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.vin || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    二쇳뻾嫄곕━
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.mileage || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    移쇰씪肄붾뱶
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.color_code || "\u00A0"}
  </td>
</tr>

<tr>
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    ?낃퀬??
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.inbound_date || "\u00A0"}
  </td>
    
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    異쒓퀬?덉젙
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.outbound_date || "\u00A0"}
  </td>
  
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    異쒓퀬??
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.release_date || "\u00A0"}
  </td>
</tr>

<tr>
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    怨좉컼 ?곕씫泥?
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.phone_number || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    ?뚰꽣移댁뾽泥?
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.rental_company || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    ?낆껜 ?곕씫泥?
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.rental_phone_number || "\u00A0"}
  </td>
</tr>

<tr>
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    蹂댄뿕??
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.insurance_company || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    ?묒닔踰덊샇
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.receipt_number || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    ?대낫
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.coverage_type || "\u00A0"}
  </td>
</tr>

<tr>
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    ?곷? 蹂댄뿕??
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.other_insurance_company || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    ?묒닔踰덊샇2
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.other_receipt_number || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    硫댁콉湲?
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.deductible_amount || "\u00A0"}
  </td>
</tr>

<tr>
  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    遺媛??
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.vat_yn || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    寃ъ씤
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.tow_yn || "\u00A0"}
  </td>

  <th className="w-20 border border-slate-900 bg-slate-100 px-2 py-0 align-middle">
    嫄곕옒泥?
  </th>
  <td className="h-8 border border-slate-900 px-2 py-0 align-middle whitespace-nowrap overflow-hidden">
    {order?.partner_company || "\u00A0"}
  </td>
</tr>

  </tbody>
</table>

          <div className="mt-3">
            <div className="border border-slate-900 bg-slate-100 p-2 text-sm font-bold">
              ?꾨떖?댁슜
            </div>
            <div className="min-h-16 border-x border-b border-slate-900 p-3 text-sm">
              {order?.message || "\u00A0"}
            </div>
          </div>

          <div className="mt-3">
            <div className="border border-slate-900 bg-slate-100 p-2 text-sm font-bold">
              ?묒뾽?댁슜
            </div>

            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="w-20 border border-slate-900 bg-slate-100 p-2">醫뚯슦</th>
                  <th className="border border-slate-900 bg-slate-100 p-2">부위</th>
                  <th className="w-16 border border-slate-900 bg-slate-100 px-2 py-1 text-center ">?묒뾽</th>
                </tr>
              </thead>
              <tbody>
  {[
  ...details.map((item) => [
    item.side,
    item.part,
    item.work_type,
  ]),
  ...Array.from({ length: Math.max(0, 19 - details.length) }, () => [
    ["", "", ""],
    ["", "", ""],

    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],

    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],

    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
    ["", "", ""],
 
  ]),
].map((row, index) => (
    <tr key={index} className="h-6 text-[12px] leading-none">
  <td className="border border-slate-900 px-2 py-0 text-center align-middle">
    {row[0] || "\u00A0"}
  </td>

  <td className="border border-slate-900 px-2 py-0 align-middle">
    {row[1] || "\u00A0"}
  </td>

  <td className="border border-slate-900 px-2 py-0 text-center align-middle">
    {row[2] || "\u00A0"}
  </td>
</tr>
  ))}
</tbody>
            </table>
                    </div>
        </div>
      </div>
    </div>
  );
}
