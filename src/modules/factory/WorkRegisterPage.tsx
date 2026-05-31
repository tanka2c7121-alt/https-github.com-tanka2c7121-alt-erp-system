"use client";


import { supabase } from "../../lib/supabase";
import type { MenuItem } from "../../data/menuData";
import { useEffect, useState, type ChangeEvent } from "react";


const getInputStateClass = (value: string) =>
  value
    ? "border-blue-200 bg-blue-50"
    : "border-red-200 bg-red-50";
const inputClass =
  "mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none";

const textAreaClass =
  "min-h-[120px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
const labelClass = "text-sm font-semibold text-slate-800";
const workPhotoBucket = "work-photos";
const photoBatchSize = 10;

type WorkPhoto = {
  name: string;
  path: string;
  url: string;
};

type PendingWorkPhoto = {
  id: string;
  file: File;
  previewUrl: string;
};

type TextDetectorResult = {
  rawValue?: string;
};

type TextDetectorConstructor = new () => {
  detect: (source: ImageBitmap) => Promise<TextDetectorResult[]>;
};

type PhotoOcrResult = {
  carNumber?: string;
  mileage?: string;
  vin?: string;
  colorCode?: string;
};

type VehicleCatalogRow = {
  maker: string;
  model: string;
  color_code: string | null;
};

type BusinessCatalogRow = {
  item_type: string;
  name: string;
  phone_number: string | null;
  group_name: string | null;
};

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

const readPhotoText = async (file: File) => {
  const textDetector = (
    window as Window & { TextDetector?: TextDetectorConstructor }
  ).TextDetector;

  if (!textDetector) {
    return "";
  }

  const imageBitmap = await createImageBitmap(file);

  try {
    const detector = new textDetector();
    const results = await detector.detect(imageBitmap);

    return results
      .map((result) => result.rawValue ?? "")
      .filter(Boolean)
      .join(" ");
  } finally {
    imageBitmap.close();
  }
};

const parsePhotoText = (text: string): PhotoOcrResult => {
  const compactText = text.replace(/\s+/g, "").toUpperCase();
  const carNumberMatch = compactText.match(/\d{2,3}[가-힣]\d{4}/);
  const vinMatch = compactText.match(/[A-HJ-NPR-Z0-9]{17}/);
  const mileageCandidates = [...compactText.matchAll(/\d{4,7}(?=KM|킬로|K|$)/g)]
    .map((match) => Number(match[0]))
    .filter((value) => value >= 1000 && value <= 999999);
  const colorCodeMatch =
    compactText.match(/(?:COLOR|COLOUR|PAINT|칼라|컬러|색상)[A-Z0-9:-]*([A-Z0-9]{2,4})/) ??
    compactText.match(/\b[A-Z0-9]{2,4}\b/);

  return {
    carNumber: carNumberMatch?.[0],
    mileage:
      mileageCandidates.length > 0
        ? `${Math.max(...mileageCandidates).toLocaleString()} Km`
        : undefined,
    vin: vinMatch?.[0],
    colorCode: colorCodeMatch?.[1] ?? colorCodeMatch?.[0],
  };
};

const compressImage = (file: File) =>
  new Promise<File>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const maxSize = 1600;
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const width = Math.round(image.width * scale);
      const height = Math.round(image.height * scale);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        resolve(file);
        return;
      }

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, ".jpg"),
            {
              type: "image/jpeg",
              lastModified: Date.now(),
            }
          );

          resolve(compressedFile);
        },
        "image/jpeg",
        0.78
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("사진을 압축할 수 없습니다."));
    };

    image.src = objectUrl;
  });

const carModels: Record<string, string[]> = {
  현대: ["그랜저", "쏘나타", "아반떼", "투싼", "싼타페", "팰리세이드", "스타리아", "코나","베뉴","아이오닉5","아이오닉6","넥쏘","포터"],
  기아: ["K3", "K5","K7", "K8", "쏘렌토", "스포티지", "카니발", "모닝","니로","EV6","셀토스","쏘울","스토닉","레이","봉고3"],
  제네시스: ["G70", "G80", "G90", "GV60", "GV70", "GV80", "GV90"],
  쉐보레: ["스파크", "말리부", "트랙스", "트레일블레이저", "콜로라도", "타호", "서버밴", "실버라도", "볼트EV", "볼트EU"],
  르노: ["SM6", "QM6", "XM3", "아르카나", "콜레오스", "클리오", "SM3", "SM5", "SM7", "QM3", "QM6"],
  BMW: ["3시리즈", "5시리즈", "7시리즈", "X1", "X3", "X5", "X7", "Z4"],
  Benz: ["A클래스", "C클래스", "E클래스", "S클래스", "GLA", "GLC", "GLE", "GLS", "G클래스"],
};

const companyOptions: Record<string, string[]> = {
  보험: [
    "현대해상",
    "삼성화재",
    "DB손해보험",
    "KB손해보험",
    "메리츠화재",
    "흥국화재",
    "롯데손해보험",
    "하나손해보험",
    "한화손해보험",
    "캐롯손해보험",
    "화물공제",
    "렌터카공제",
    "택시공제",
    "개인택시공제",
    "전세버스공제",
    "버스공제",
    "배달서비스공제",
  ],
  캐피탈: ["KB캐피탈", "BNK캐피탈", "오릭스캐피탈", "오픈링크"],
  일반: ["해당없음", "바디케어"],
};

const formatPhoneNumber = (value: string) => {
  const numbers = value.replace(/[^0-9]/g, "");

  if (numbers.length < 4) return numbers;
  if (numbers.length < 8) return `${numbers.slice(0, 3)}-${numbers.slice(3)}`;

  return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7, 11)}`;
};

const formatMileage = (value: string) => {
  const numbers = value.replace(/[^0-9]/g, "");
  if (!numbers) return "";
  return `${Number(numbers).toLocaleString()} Km`;
};

function Field({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  options,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  value?: string;
  onChange?: (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => void;
  options?: string[];
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <label className={labelClass}>{label}</label>
      {options ? (
  <select
  className={`${getInputStateClass(String(value ?? ""))} ${inputClass}`}
    value={value}
    onChange={onChange}
  >
    <option value="">선택</option>

    {options.map((item) => (
      <option key={item} value={item}>
        {item}
      </option>
    ))}
  </select>
) : (
  <input
    type={type}
    className={`${getInputStateClass(String(value ?? ""))} ${inputClass}`}
    placeholder={placeholder}
    value={value}
    onChange={onChange}
  />
)}
    </div>
  );
}

type WorkRegisterPageProps = {
  onSelectMenu: (menu: MenuItem) => void;
  initialWorkName?: string;
};

export default function WorkRegisterPage({
  onSelectMenu,
  initialWorkName,
}: WorkRegisterPageProps) {
  const [workName, setWorkName] = useState("");
  const [carNumber, setCarNumber] = useState("");
  const [carYear, setCarYear] = useState("");
  const [vin, setVin] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [mileage, setMileage] = useState("");
  const [carMaker, setCarMaker] = useState("");
  const [carModel, setCarModel] = useState("");
  const [category, setCategory] = useState("");
  const [company, setCompany] = useState("");
  const [otherCompany, setOtherCompany] = useState("");
  const [coverageType, setCoverageType] = useState("");
  const [rentalCompany, setRentalCompany] = useState("");
  const [rentalPhoneNumber, setRentalPhoneNumber] = useState("");
  const [inboundDate, setInboundDate] = useState("");
  const [outboundDate, setOutboundDate] = useState("");
  const [towYn, setTowYn] = useState("N");
  const [deliveryYn, setDeliveryYn] = useState("N");
  const [partnerCompany, setPartnerCompany] = useState("");
  
  const [receiptNumber, setReceiptNumber] = useState(""); 
  const [ownReceiptNumber, setOwnReceiptNumber] = useState("");
  const [otherReceiptNumber, setOtherReceiptNumber] = useState("");

  const [faultRate, setFaultRate] = useState("");
  const [managerName, setManagerName] = useState("");
  const [ownManagerName, setOwnManagerName] = useState("");
  const [otherManagerName, setOtherManagerName] = useState("");

  const [vatYn, setVatYn] = useState("N");
  const [deductibleAmount, setDeductibleAmount] = useState("해당없음");
  const [message, setMessage] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [releaseDate, setReleaseDate] = useState("");
  const [workPhotos, setWorkPhotos] = useState<WorkPhoto[]>([]);
  const [pendingWorkPhotos, setPendingWorkPhotos] = useState<PendingWorkPhoto[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoOcrReading, setPhotoOcrReading] = useState(false);
  const [photoOcrMessage, setPhotoOcrMessage] = useState("");
  const [vehicleCatalog, setVehicleCatalog] = useState<VehicleCatalogRow[]>([]);
  const [businessCatalog, setBusinessCatalog] = useState<BusinessCatalogRow[]>([]);
  const pendingPhotoGroups = chunkArray(pendingWorkPhotos, photoBatchSize);

  const colorOptions: Record<string, string[]> = {
  "그랜저": ["A2B", "WC9", "T2G","TB7","V7S"],
  "쏘렌토": ["AGT", "SWP", "MZH"],
  "카니발": ["SNR", "SWP"],
  "니로": ["ABP", "SWP", "AGT"],
  "투싼": ["PKW","A5G"],
  "EV6": ["ABP", "SWP", "MZH"],
  "셀토스": ["ABP", "SWP", "MZH"],
  "쏘울": ["ABP", "SWP", "MZH"],
  "스토닉": ["ABP", "SWP", "MZH"],
  "레이": ["ABP", "SWP", "MZH"],
  "봉고3": ["ABP", "SWP", "MZH"],
  "아반떼": ["SAW","WAW","A5G","PE2"],
  "GV80": ["UYH","NRB","NCM"],
  "G80": ["SSS","UYH","PH3"],
  "코나": ["SAW"],
  "G90": ["HBK"],
  "G70": ["N5M", "RGY"],
  "스포티지": ["SWP"],
  "팰리세이드": ["RB5","P7V"],
  "GV70": ["SSS"],
  "K8": ["ABP","B4U"],
  "싼타페": ["W3A","WW2","PB2"],
  "쏘나타": ["T2G"],
  "K7":["STM"],
  "포터":["KG","ZV","OA"]
};

const catalogCarModels = vehicleCatalog.reduce<Record<string, string[]>>(
  (result, item) => {
    if (!result[item.maker]) {
      result[item.maker] = [];
    }

    if (!result[item.maker].includes(item.model)) {
      result[item.maker].push(item.model);
    }

    return result;
  },
  {}
);

const catalogColorOptions = vehicleCatalog.reduce<Record<string, string[]>>(
  (result, item) => {
    if (!item.color_code) {
      return result;
    }

    if (!result[item.model]) {
      result[item.model] = [];
    }

    if (!result[item.model].includes(item.color_code)) {
      result[item.model].push(item.color_code);
    }

    return result;
  },
  {}
);

const activeCarModels =
  Object.keys(catalogCarModels).length > 0 ? catalogCarModels : carModels;
const activeColorOptions =
  Object.keys(catalogColorOptions).length > 0 ? catalogColorOptions : colorOptions;

useEffect(() => {
  async function loadVehicleCatalog() {
    const { data, error } = await supabase
      .from("vehicle_catalog")
      .select("maker, model, color_code")
      .eq("is_active", true)
      .order("maker", { ascending: true })
      .order("model", { ascending: true })
      .order("color_code", { ascending: true });

    if (error) {
      return;
    }

    setVehicleCatalog((data ?? []) as VehicleCatalogRow[]);
  }

  void loadVehicleCatalog();
}, []);

useEffect(() => {
  async function loadBusinessCatalog() {
    const { data, error } = await supabase
      .from("business_catalog")
      .select("item_type, name, phone_number, group_name")
      .eq("is_active", true)
      .order("item_type", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      return;
    }

    setBusinessCatalog((data ?? []) as BusinessCatalogRow[]);
  }

  void loadBusinessCatalog();
}, []);

useEffect(() => {

  if (!initialWorkName) {
    return;
  }

  const targetName = initialWorkName;

  setTimeout(() => {
    setWorkName(targetName);
  }, 0);

  const loadData = async () => {
  try {
    await handleLoadWorkOrder(
      targetName,
      false
    );
  } catch (error) {
      console.error(
        "작업불러오기 오류:",
        error
      );
    }
  };

  void loadData();

}, [initialWorkName]);

useEffect(() => {
  if (initialWorkName) return;
  if (workName) return;

  async function setInitialNextWorkName() {
    const nextWorkName = await getNextWorkName();

    setTimeout(() => {
      setWorkName(nextWorkName);
    }, 0);
  }

  void setInitialNextWorkName();
}, [initialWorkName, workName]);

useEffect(() => {
  if (!workName) {
    setWorkPhotos([]);
    return;
  }

  void loadWorkPhotos(workName);
}, [workName]);

function getWorkPhotoFolder(targetWorkName = workName) {
  return targetWorkName.trim().replace(/[^0-9A-Za-z가-힣_-]/g, "_");
}

async function loadWorkPhotos(targetWorkName = workName) {
  const folder = getWorkPhotoFolder(targetWorkName);

  if (!folder) {
    setWorkPhotos([]);
    return;
  }

  const { data, error } = await supabase.storage
    .from(workPhotoBucket)
    .list(folder, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) {
    console.error("작업사진 조회 오류:", error);
    setWorkPhotos([]);
    return;
  }

  const photos = (data ?? [])
    .filter((item) => item.name && !item.name.endsWith("/"))
    .map((item) => {
      const path = `${folder}/${item.name}`;
      const publicUrl = supabase.storage
        .from(workPhotoBucket)
        .getPublicUrl(path).data.publicUrl;

      return {
        name: item.name,
        path,
        url: publicUrl,
      };
    });

  setWorkPhotos(photos);
}

async function handlePhotoCapture(event: ChangeEvent<HTMLInputElement>) {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";

  if (files.length === 0) {
    return;
  }

  if (files.length > photoBatchSize) {
    alert(`사진은 한 번에 ${photoBatchSize}장씩 나눠서 추가하세요.`);
  }

  const selectedFiles = files.slice(0, photoBatchSize);

  setPhotoOcrReading(true);
  setPhotoOcrMessage("");

  try {
    const nextPhotos = selectedFiles.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setPendingWorkPhotos((prev) => [...prev, ...nextPhotos]);

    for (const file of selectedFiles) {
      const photoText = await readPhotoText(file);
      const ocrResult = parsePhotoText(photoText);
      const appliedItems: string[] = [];

      if (!carNumber && ocrResult.carNumber) {
        setCarNumber(ocrResult.carNumber);
        appliedItems.push("차량번호");
      }

      if (!mileage && ocrResult.mileage) {
        setMileage(ocrResult.mileage);
        appliedItems.push("주행거리");
      }

      if (!vin && ocrResult.vin) {
        setVin(ocrResult.vin);
        appliedItems.push("차대번호");
      }

      if (!colorCode && ocrResult.colorCode) {
        setColorCode(ocrResult.colorCode);
        appliedItems.push("칼라코드");
      }

      if (photoText) {
        setPhotoOcrMessage(
          appliedItems.length > 0
            ? `${appliedItems.join(", ")} 후보를 자동 입력했습니다.`
            : "사진에서 글자는 읽었지만 자동 입력할 항목을 찾지 못했습니다."
        );
      } else {
        setPhotoOcrMessage(
          "이 브라우저는 사진 글자인식을 지원하지 않거나 글자를 찾지 못했습니다."
        );
      }
    }
  } catch (error) {
    setPhotoOcrMessage("사진은 저장 대기 중입니다. 글자인식은 일부 실패할 수 있습니다.");
  } finally {
    setPhotoOcrReading(false);
  }
}

async function uploadPendingWorkPhotos(targetWorkName = workName) {
  if (pendingWorkPhotos.length === 0) {
    return 0;
  }

  const folder = getWorkPhotoFolder(targetWorkName);

  if (!folder) {
    throw new Error("작명이 없어 사진을 저장할 수 없습니다.");
  }

  setPhotoUploading(true);

  try {
    for (const photo of pendingWorkPhotos) {
      const uploadFile = await compressImage(photo.file);
      const extension = uploadFile.name.split(".").pop() || "jpg";
      const filePath = `${folder}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}.${extension}`;

      const { error } = await supabase.storage
        .from(workPhotoBucket)
        .upload(filePath, uploadFile, {
          cacheControl: "3600",
          contentType: uploadFile.type || "image/jpeg",
          upsert: false,
        });

      if (error) {
        throw new Error(error.message);
      }
    }

    const uploadedCount = pendingWorkPhotos.length;
    pendingWorkPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    setPendingWorkPhotos([]);
    await loadWorkPhotos(targetWorkName);

    return uploadedCount;
  } finally {
    setPhotoUploading(false);
  }
}

function handleDeletePendingPhoto(photoId: string) {
  setPendingWorkPhotos((prev) => {
    const target = prev.find((photo) => photo.id === photoId);

    if (target) {
      URL.revokeObjectURL(target.previewUrl);
    }

    return prev.filter((photo) => photo.id !== photoId);
  });
}

async function handleDeletePhoto(photo: WorkPhoto) {
  if (!confirm("이 사진을 삭제할까요?")) {
    return;
  }

  const { error } = await supabase.storage
    .from(workPhotoBucket)
    .remove([photo.path]);

  if (error) {
    alert("사진 삭제 실패: " + error.message);
    return;
  }

  setWorkPhotos((prev) => prev.filter((item) => item.path !== photo.path));
}

 function handleReset() {
  setPhoneNumber("");
  setMileage("");
  setCarMaker("");
  setCarModel("");
  setCategory("");
  setCompany("");
  setOtherCompany("");
  setCoverageType("");
  setRentalCompany("");
  setRentalPhoneNumber("");
    
  setWorkName("");
  setCarNumber("");
  setCarYear("");
  setVin("");
  setColorCode("");

  setInboundDate("");
  setOutboundDate("");
  setReleaseDate("");

  setTowYn("N");
  setDeliveryYn("N");
  setPartnerCompany("");

  setReceiptNumber("");
  setOwnReceiptNumber("");
  setOtherReceiptNumber("");

  setFaultRate("");

  setManagerName("");
  setOwnManagerName("");
  setOtherManagerName("");

  setVatYn("N");
  setDeductibleAmount("해당없음");

  setMessage("");
  setWorkPhotos([]);
  pendingWorkPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
  setPendingWorkPhotos([]);

  setWorkRows(
    Array.from({ length: 19 }, () => ({
      side: "",
      part: "",
      work: "",
    }))
  );
}
async function handlePrint() {
  try {
    const currentWorkName = workName;

    const saved = await handleSave();

    if (!saved) {
      return;
    }

    onSelectMenu({
      id: "factory-work-print",
      title: "출력모드",
      data: {
        workName: currentWorkName,
      },
    });
  } catch (error) {
    console.error("출력 처리 오류:", error);
    alert("출력 처리 중 오류가 발생했습니다.");
  }
}
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
async function handleLoadWorkOrder(
  targetWorkName = workName,
  showAlert = true
) {
  if (!targetWorkName) {
    alert("작명을 입력하세요.");
    return;
  }

  const { data: order, error: orderError } = await supabase
    .from("work_orders")
    .select("*")
    .eq("work_name", targetWorkName)
    .single();

  if (orderError || !order) {
    alert("해당 작명을 찾을 수 없습니다.");
    return;
  }

  const { data: details, error: detailError } = await supabase
    .from("work_details")
    .select("*")
    .eq("work_name", targetWorkName)
    .order("line_no", { ascending: true });

  if (detailError) {
    alert("작업내용 조회 실패: " + detailError.message);
    return;
  }

  setCarMaker(order.car_maker ?? "");
  setCarModel(order.car_model ?? "");
  setCarNumber(order.car_number ?? "");
  setPhoneNumber(order.phone_number ?? "");
  setCarYear(order.car_year ?? "");
  setVin(order.vin ?? "");
  setMileage(order.mileage ?? "");
  setColorCode(order.color_code ?? "");

  setInboundDate(order.inbound_date ?? "");
  setOutboundDate(order.outbound_date ?? "");
  setReleaseDate(order.release_date ?? "");

  setRentalCompany(order.rental_company ?? "");
  setRentalPhoneNumber(order.rental_phone_number ?? "");
  setTowYn(order.tow_yn ?? "");
  setDeliveryYn(order.delivery_yn ?? "");
  setPartnerCompany(order.partner_company ?? "");

  setCategory(order.category ?? "");
  setCompany(order.insurance_company ?? "");
  setOtherCompany(order.other_insurance_company ?? "");
  setCoverageType(order.coverage_type ?? "");
  

  setReceiptNumber(order.receipt_number ?? "");
  setOwnReceiptNumber(order.own_receipt_number ?? "");
  setOtherReceiptNumber(order.other_receipt_number ?? "");

  setFaultRate(order.fault_rate ?? "");

  setManagerName(order.manager_name ?? "");
  setOwnManagerName(order.own_manager_name ?? "");
  setOtherManagerName(order.other_manager_name ?? "");

  setVatYn(order.vat_yn ?? "");
  setDeductibleAmount(order.deductible_amount ?? "");

  setMessage(order.message ?? "");
  

  const loadedRows = Array.from({ length: 19 }, (_, index) => {
    const detail = (details ?? []).find((item) => item.line_no === index + 1);

    return {
      side: detail?.side ?? "",
      part: detail?.part ?? "",
      work: detail?.work_type ?? "",
    };
  });

  setWorkRows(loadedRows);
  setIsEditMode(true);

  if (showAlert) {
    alert("불러왔습니다.");
  }
}

async function getNextWorkName() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const prefix = `${yyyy}-${mm}`;

  const { data, error } = await supabase
    .from("work_orders")
    .select("work_name")
    .like("work_name", `${prefix}-%`);

  if (error) {
    alert("다음 작명 조회 실패: " + error.message);
    return "";
  }

  const maxNumber = (data ?? []).reduce((max, item) => {
    const workName = item.work_name ?? "";
    const numberText = workName.replace(`${prefix}-`, "");
    const number = Number(numberText);

    return Number.isFinite(number) && number > max ? number : max;
  }, 0);

  return `${prefix}-${String(maxNumber + 1).padStart(3, "0")}`;
}

async function handleSave() {
  console.log("handleSave 시작");
  try {
    const targetWorkName = workName;

    if (!workName) {
      alert("작명을 입력하세요.");
      return false;
    }

    const orderPayload = {
      work_name: workName,
      car_maker: carMaker,
      car_model: carModel,
      car_number: carNumber,
      phone_number: phoneNumber,
      car_year: carYear,
      vin,
      mileage,
      color_code: colorCode,

      inbound_date: inboundDate || null,
      outbound_date: outboundDate || null,
      release_date: releaseDate || null,

      rental_company: rentalCompany,
      rental_phone_number: rentalPhoneNumber,
      tow_yn: towYn,
      delivery_yn: deliveryYn,
      partner_company: partnerCompany,

      category,
      insurance_company: company,
      other_insurance_company: otherCompany,
      coverage_type: coverageType,

      receipt_number: receiptNumber,
      own_receipt_number: ownReceiptNumber,
      other_receipt_number: otherReceiptNumber,

      fault_rate: faultRate,

      manager_name: managerName,
      own_manager_name: ownManagerName,
      other_manager_name: otherManagerName,

      vat_yn: vatYn,
      deductible_amount: deductibleAmount,

      message,
    };
console.log("orderPayload", orderPayload);


    const { error: orderError } = isEditMode
      ? await supabase
          .from("work_orders")
          .update(orderPayload)
          .eq("work_name", targetWorkName)
      : await supabase
          .from("work_orders")
          .insert([orderPayload]);

    if (orderError) {
      alert(
        isEditMode
          ? "작업등록 수정 실패: " + orderError.message
          : "작업등록 저장 실패: " + orderError.message
      );
      return false;
    }

console.log("orderError", orderError);



    if (isEditMode) {
      const { error: deleteDetailError } = await supabase
        .from("work_details")
        .delete()
        .eq("work_name", targetWorkName);

      if (deleteDetailError) {
        alert("기존 작업내용 삭제 실패: " + deleteDetailError.message);
        return false;
      }
    }

    const detailRows = workRows
      .filter((row) => row.side || row.part || row.work)
      .map((row, index) => ({
        work_name: workName,
        line_no: index + 1,
        side: row.side,
        part: row.part,
        work_type: row.work,
      }));

console.log("detailRows", detailRows);

    if (detailRows.length > 0) {
      const { error: detailError } = await supabase
        .from("work_details")
        .insert(detailRows);

      if (detailError) {
        alert("작업내용 저장 실패: " + detailError.message);
        return false;
      }
    }

    const uploadedPhotoCount = await uploadPendingWorkPhotos(targetWorkName);

    alert(
      `${isEditMode ? "수정되었습니다." : "저장되었습니다."}${
        uploadedPhotoCount > 0
          ? ` 사진 ${uploadedPhotoCount}장도 저장되었습니다.`
          : ""
      }`
    );



    return true;
  } catch (error) {
    console.error("작업 저장 오류:", error);
    alert("작업 저장 중 오류가 발생했습니다.");
    return false;
  }
}
 
  const rentalCompanies: Record<string, string> = {
  "": "",
  N: "",
  타렌트사용: "",
  스타렌터카: "010-9335-1694",
  SK렌터카: "",
  경인렌터카: "",
  중호렌터카: "010-5824-1257",
  라움렌터카: "",
  에이스렌터카: "",
};

const catalogRentalCompanies = businessCatalog
  .filter((item) => item.item_type === "rental")
  .reduce<Record<string, string>>((result, item) => {
    result[item.name] = item.phone_number ?? "";
    return result;
  }, {});

const activeRentalCompanies =
  Object.keys(catalogRentalCompanies).length > 0
    ? catalogRentalCompanies
    : rentalCompanies;

const activePartnerCompanies =
  businessCatalog.filter((item) => item.item_type === "partner").length > 0
    ? businessCatalog
        .filter((item) => item.item_type === "partner")
        .map((item) => item.name)
    : [
        "자력",
        "블루모터스",
        "KB캐피탈",
        "상동점",
        "상동점소개",
        "오릭스캐피탈",
        "BNK캐피탈",
        "오픈링크",
        "오부장",
        "경인렌터카",
      ];

const catalogCompanyOptions = businessCatalog
  .filter((item) => item.item_type === "insurer")
  .reduce<Record<string, string[]>>((result, item) => {
    const group = item.group_name || "보험";

    if (!result[group]) {
      result[group] = [];
    }

    if (!result[group].includes(item.name)) {
      result[group].push(item.name);
    }

    return result;
  }, {});

const activeCompanyOptions =
  Object.keys(catalogCompanyOptions).length > 0
    ? catalogCompanyOptions
    : companyOptions;

  const [workRows, setWorkRows] = useState(     
  Array.from({ length: 19 }, () => ({
    side: "",
    part: "",
    work: "",
  }))
);

  function handleWorkRowChange(
  index: number,
  key: "side" | "part" | "work",
  value: string
) {
  setWorkRows((prev) =>
    prev.map((row, rowIndex) =>
      rowIndex === index
        ? {
            ...row,
            [key]: value,
          }
        : row
    )
  );
}

function handleClearWorkRow(index: number) {
  setWorkRows((prev) =>
    prev.map((row, rowIndex) =>
      rowIndex === index
        ? {
            side: "",
            part: "",
            work: "",
          }
        : row
    )
  );
}
  return (
    <div className="space-y-6 text-slate-900">
      <div>
        <h3 className="text-xl font-bold text-slate-900">작업등록</h3>
        <p className="text-sm text-slate-700">
          입고 차량의 작업지시서를 등록하는 화면입니다.
        </p>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
  <div className="w-full sm:w-[260px]">
    <Field
      label="작명"
      placeholder="2026-05-001"
      value={workName}
      onChange={(e) =>
        setWorkName(formatWorkName(e.target.value))
      }
    />
  </div>

  <button
    type="button"
    onClick={() => handleLoadWorkOrder()}
    className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-800"
  >
    불러오기
  </button>
</div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <label className={labelClass}>작업사진</label>
            <p className="mt-1 text-xs text-slate-500">
              사진은 10장씩 나눠서 추가하고, 저장을 누르면 작명 폴더에 한 번에 저장됩니다.
            </p>
          </div>

          <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            {photoUploading || photoOcrReading ? "처리 중..." : "사진추가"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              disabled={photoUploading || photoOcrReading}
              onChange={handlePhotoCapture}
            />
          </label>
        </div>

        {photoOcrMessage && (
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
            {photoOcrMessage}
          </p>
        )}

        {pendingWorkPhotos.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-700">
                저장 대기 사진 {pendingWorkPhotos.length}장
              </p>
              <p className="text-xs text-slate-500">
                {pendingPhotoGroups.length}묶음, 아래 저장 버튼을 누르면 업로드됩니다.
              </p>
            </div>

            <div className="space-y-4">
              {pendingPhotoGroups.map((group, groupIndex) => (
                <div
                  key={`photo-group-${groupIndex}`}
                  className="rounded-xl border border-blue-100 bg-blue-50 p-3"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold text-blue-800">
                      {groupIndex + 1}번째 묶음
                    </p>
                    <p className="text-xs font-semibold text-blue-700">
                      {group.length}/{photoBatchSize}장
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 lg:grid-cols-10">
                    {group.map((photo) => (
                      <div
                        key={photo.id}
                        className="overflow-hidden rounded-lg border border-blue-200 bg-white"
                      >
                        <img
                          src={photo.previewUrl}
                          alt="저장 대기 사진"
                          className="h-24 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeletePendingPhoto(photo.id)}
                          className="w-full border-t border-blue-100 bg-white px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          빼기
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {workPhotos.length > 0 ? (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {workPhotos.map((photo) => (
              <div
                key={photo.path}
                className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
              >
                <a href={photo.url} target="_blank" rel="noreferrer">
                  <img
                    src={photo.url}
                    alt="작업사진"
                    className="h-28 w-full object-cover"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeletePhoto(photo);
                  }}
                  className="w-full border-t border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        ) : pendingWorkPhotos.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">등록된 사진이 없습니다.</p>
        ) : null}
      </section>

      
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-8 xl:gap-4">
      
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className={labelClass}>제조사</label>
          <select
            className={`${getInputStateClass(carMaker)} ${inputClass}`}
            value={carMaker}
            onChange={(e) => {
              setCarMaker(e.target.value);
              setCarModel("");
            }}
          >
            <option value="">제조사 선택</option>
            {Object.keys(activeCarModels).map((maker) => (
              <option key={maker} value={maker}>
                {maker}
              </option>
            ))}
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className={labelClass}>차량명</label>
          <select
            className={`${getInputStateClass(carModel)} ${inputClass}`}
            value={carModel}
            onChange={(e) => setCarModel(e.target.value)}
            disabled={!carMaker}
          >
            <option value="">
              {carMaker ? "차량 선택" : "제조사 먼저 선택"}
            </option>
            {(activeCarModels[carMaker] ?? []).map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        {/* 차량번호 */}
<Field
  label="차량번호"
  placeholder="123가4567"
  value={carNumber}
  onChange={(e) => setCarNumber(e.target.value)}
/>
  

{/* 전화번호 */}
<div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>전화번호</label>

  <input
  className={`${getInputStateClass(phoneNumber)} ${inputClass}`}
  placeholder="010-0000-0000"
  value={phoneNumber}
  onChange={(e) =>
    setPhoneNumber(formatPhoneNumber(e.target.value))
  }
  maxLength={13}
/>
</div>

        <Field
          label="차량연식"
          placeholder="2023"
          value={carYear}
          onChange={(e) => setCarYear(e.target.value)}
        />
        <Field
          label="VIN"
          placeholder="차대번호"
          value={vin}
          onChange={(e) => setVin(e.target.value)}
        />

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          
  <label className={labelClass}>주행거리</label>

  <input
  className={`${getInputStateClass(mileage)} ${inputClass}`}
  placeholder="120,000 Km"
  value={mileage}
  onChange={(e) =>
    setMileage(formatMileage(e.target.value))
  }
/>
</div>

        <Field
  label="칼라코드"
  value={colorCode}
  onChange={(e) => setColorCode(e.target.value)}
  options={activeColorOptions[carModel] || []}
/>
      </section>

      {/* 2번째 줄 */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-8 xl:gap-4">
        <Field
          label="입고일"
          type="date"
          value={inboundDate}
          onChange={(e) => setInboundDate(e.target.value)}
        />
        <Field
          label="출고예정"
          type="date"
          value={outboundDate}
          onChange={(e) => setOutboundDate(e.target.value)}
        />
        <Field
          label="출고일"
          type="date"
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
/>
        {/* 렌터카 업체 */}
<div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>렌터카 업체</label>

  <select
  className={`${getInputStateClass(rentalCompany)} ${inputClass}`}
  value={rentalCompany}
  onChange={(e) => {
  const value = e.target.value;

  setRentalCompany(value);

  if (value === "타렌트사용") {
    setRentalPhoneNumber("");
  } else {
    setRentalPhoneNumber(activeRentalCompanies[value] ?? "");
  }
}}
>
    <option value="">선택</option>
    {Object.keys(activeRentalCompanies)
      .filter((name) => name !== "")
      .map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
  </select>
</div>

{/* 렌터카 전화번호 */}
<div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>렌터카 전화번호</label>

  <input
  className={`${getInputStateClass(rentalPhoneNumber)} ${inputClass}`}
  value={rentalPhoneNumber}
  placeholder={
    rentalCompany === "타렌트사용"
      ? "렌터카 전화번호 입력"
      : "업체 선택 시 자동 표시"
  }
  onChange={(e) =>
  setRentalPhoneNumber(
    formatPhoneNumber(e.target.value)
  )
}
  readOnly={rentalCompany !== "타렌트사용"}
/>
</div>

{/* 견인 */}
<div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>견인</label>

  <select
    className={`${getInputStateClass(towYn)} ${inputClass}`}
    value={towYn}
    onChange={(e) => setTowYn(e.target.value)}
  >
    <option value="">선택</option>
    <option value="Y">Y</option>
    <option value="N">N</option>
  </select>
</div>

{/* 탁송 */}
<div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>탁송</label>

  <select
    className={`${getInputStateClass(deliveryYn)} ${inputClass}`}
    value={deliveryYn}
    onChange={(e) => setDeliveryYn(e.target.value)}
  >
    <option value="">선택</option>
    <option value="Y">Y</option>
    <option value="N">N</option>
  </select>
</div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>거래처</label>

  <select
  className={`${getInputStateClass(partnerCompany)} ${inputClass}`}
  value={partnerCompany}
  onChange={(e) => setPartnerCompany(e.target.value)}
>
  <option value="">거래처 선택</option>
  {activePartnerCompanies.map((name) => (
    <option key={name} value={name}>
      {name}
    </option>
  ))}
</select>
</div>
      </section>

      {/* 3번째 줄 */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-8 xl:gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className={labelClass}>구분</label>
          <select
            className={`${getInputStateClass(category)} ${inputClass}`}
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setCompany("");
            }}
          >
            <option value="">구분 선택</option>
            <option value="보험">보험</option>
            <option value="일반">일반</option>
            <option value="캐피탈">캐피탈</option>
          </select>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
         <label className={labelClass}>보험사</label>

         <select
           className={`${getInputStateClass(company)} ${inputClass}`}
           value={company}
           onChange={(e) => setCompany(e.target.value)}
           disabled={!category}
        >
         <option value="">
          {category ? "보험사 선택" : "구분 먼저 선택"}
         </option>

         {(activeCompanyOptions[category] ?? []).map((item) => (
         <option key={item} value={item}>
           {item}
         </option>
))}
     
      </select>

  {coverageType === "과실" && (
    <select
      className={`${getInputStateClass(otherCompany)} ${inputClass}`}
      value={otherCompany}
      onChange={(e) => setOtherCompany(e.target.value)}
      disabled={!category}
    >
      <option value="">상대보험사 선택</option>

      {(activeCompanyOptions["보험"] ?? []).map((item) => (
  <option key={item} value={item}>
    {item}
  </option>
))}
    </select>
  )}
</div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <label className={labelClass}>담보</label>
          <select
            className={`${getInputStateClass(coverageType)} ${inputClass}`}
            value={coverageType}
            onChange={(e) => setCoverageType(e.target.value)}
          >
            <option value="">담보 선택</option>
            <option value="과실">과실</option>
            <option value="자차">자차</option>
            <option value="대물">대물</option>
          </select>
        </div>

        {coverageType === "과실" ? (
  <>
    <div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>접수번호</label>

<input
  className={`${getInputStateClass(receiptNumber)} ${inputClass}`}
  placeholder="자차 접수번호"
  value={receiptNumber}
  onChange={(e) => setReceiptNumber(e.target.value)}
/>

<input
  className={`${getInputStateClass(otherReceiptNumber)} ${inputClass}`}
  placeholder="대물 접수번호"
  value={otherReceiptNumber}
  onChange={(e) => setOtherReceiptNumber(e.target.value)}
/>
  </div>


    <Field
      label="과실"
      placeholder="0%"
      value={faultRate}
      onChange={(e) => setFaultRate(e.target.value)}
    />

    <div className="rounded-xl border border-slate-200 bg-white p-4">
  <label className={labelClass}>담당자</label>

    <input
      className={`${getInputStateClass(ownManagerName)} ${inputClass}`}
      placeholder="자차 담당자"
      value={ownManagerName}
      onChange={(e) => setOwnManagerName(e.target.value)}
    />

    <input
      className={`${getInputStateClass(otherManagerName)} ${inputClass}`}
      placeholder="대물 담당자"
      value={otherManagerName}
      onChange={(e) => setOtherManagerName(e.target.value)}
    />
  </div>
 
  </>
) : (
  <>
    <Field
      label="접수번호"
      placeholder="접수번호"
      value={receiptNumber}
      onChange={(e) => setReceiptNumber(e.target.value)}
    />

    <Field
      label="과실"
      placeholder="0%"
      value={faultRate}
      onChange={(e) => setFaultRate(e.target.value)}
    />

    <Field
      label="담당자"
      placeholder="담당자명"
      value={managerName}
      onChange={(e) => setManagerName(e.target.value)}
    />
  </>
)}

<Field
  label="부가세"
  value={vatYn}
  onChange={(e) => setVatYn(e.target.value)}
  options={["Y", "N"]}
/>

<Field
  label="면책금(최소)"
  value={deductibleAmount}
  onChange={(e) => setDeductibleAmount(e.target.value)}
  options={["해당없음", "10만원", "20만원", "30만원", "33만원", "50만원", "55만원","60만원","66만원"]}
/>

 </section> 

      {/* 전달내용 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <textarea
          className={textAreaClass}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="고객 요청사항이나 특이사항 등을 입력하세요."
        />
      </section>

      {/* 작업내용 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between">
          <label className={labelClass}>작업내용</label>
          
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] table-fixed border-collapse">
            <thead>
              <tr className="bg-slate-100">
                <th className="w-16 border border-slate-300 px-2 py-2 text-center text-sm font-semibold text-slate-800">
                  좌우
                </th>
                <th className="w-[44%] border border-slate-300 px-3 py-2 text-left text-sm font-semibold text-slate-800">
                  부위
                </th>
                <th className="w-[28%] border border-slate-300 px-3 py-2 text-left text-sm font-semibold text-slate-800">
                  작업내용
                </th>
                <th className="w-16 border border-slate-300 px-2 py-2 text-center text-sm font-semibold text-slate-800">
                  삭제
                </th>
              </tr>
            </thead>

            <tbody>
              {workRows.map((row, index) => (
  <tr key={index}>
    <td className="border border-slate-300 p-1.5">
      <select
        className={`${getInputStateClass(row.side)} ${inputClass}`}
        value={row.side}
        onChange={(e) =>
          handleWorkRowChange(index, "side", e.target.value)
        }
      >
        <option value="">선택</option>
        <option>좌</option>
        <option>우</option>
        <option>양쪽</option>
        <option>-</option>
      </select>
    </td>

    <td className="border border-slate-300 p-2">
      <input
  list={index >= 16 ? undefined : "part-options"}
  className={`${getInputStateClass(row.part)} ${inputClass}`}
  value={row.part}
  onChange={(e) => handleWorkRowChange(index, "part", e.target.value)}
  placeholder={index >= 16 ? "부위 직접 입력" : "부위 입력 또는 선택"}
/>

<datalist id="part-options">
  <option value="프론트범퍼" />
  <option value="후드" />
  <option value="헤드램프" />
  <option value="프론트펜더" />
  <option value="프론트패널" />
  <option value="프론트서스펜션" />
  <option value="프론트 휠" />
  <option value="프론트필러" />
  <option value="프론트도어" />
  <option value="리어도어" />
  <option value="센터필러" />
  <option value="사이드스텝(몰딩)" />
  <option value="리어범퍼" />
  <option value="컴비램프" />
  <option value="트렁크(백도어)" />
  <option value="리어쿼터패널" />
  <option value="리어쿼터인너(휠하우스)" />
  <option value="프론트윈드실드(전면유리)" />
  <option value="리어글라스(후면유리)" />
  <option value="엔진" />
  <option value="엔진언더커버" />
  <option value="프론트휠하우스" />
  <option value="프론트사이드멤버" />
  <option value="서브프레임" />
  <option value="대쉬패널" />
  <option value="백패널" />
  <option value="리어사이드멤버" />
  <option value="트렁크바닥패널" />
  <option value="리어크로스멤버" />
  <option value="리어서스펜션" />
  <option value="리어 휠" />
  <option value="라디에이터" />
  <option value="컨덴샤" />
  <option value="크래쉬패드" />
  <option value="안전벨트(프론트)" />
  <option value="안전벨트(리어)" />
  <option value="프론트시트" />
  <option value="리어시트" />
  <option value="에어컨가스" />
  <option value="운전석에어백" />
  <option value="조수석에어백" />
  <option value="니에어백" />
  <option value="프론트레이더(전방레이다)" />
  <option value="전방감지센서" />
  <option value="후방감지센서" />
  <option value="휠 얼라이먼트" />
</datalist>
    </td>

    <td className="border border-slate-300 p-2">
      <select
        className={`${getInputStateClass(row.work)} ${inputClass}`}
        value={row.work}
        onChange={(e) =>
          handleWorkRowChange(index, "work", e.target.value)
        }
      >
        <option value="">선택</option>
        <option>교환</option>
        <option>판금</option>
        <option>도장</option>
        <option>탈부착</option>
        <option>수리</option>
        <option>조정</option>
      </select>
    </td>

    <td className="border border-slate-300 p-1.5 text-center">
      <button
        type="button"
        onClick={() => handleClearWorkRow(index)}
        className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
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

      <div className="flex justify-end gap-2">
  <button
    type="button"
    onClick={() => {
  void handleSave();
}}
    className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
  >
    {isEditMode ? "수정 후 저장" : "저장"}
  </button>

  <button
  type="button"
  onClick={() => {
  void handlePrint();
}}
  className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
>
  출력
</button>
</div>
    </div>
    
  )
}
