export const workPhotoBucket = "work-photos";
export const photoBatchSize = 10;
export const imageFilePattern = /\.(avif|bmp|gif|heic|heif|jpeg|jpg|png|webp)$/i;

const windowsReservedFileNames = /^(con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(\..*)?$/i;

export function safeFileName(name: string, fallback = "photo.jpg") {
  const fallbackExtension = fallback.includes(".")
    ? fallback.slice(fallback.lastIndexOf("."))
    : ".jpg";
  const normalizedName = name
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+/, "")
    .replace(/[.\s_]+$/g, "")
    .slice(0, 120);
  const withFallback = normalizedName || fallback.replace(/[\\/:*?"<>|]/g, "_");
  const withSafeReservedName = windowsReservedFileNames.test(withFallback)
    ? `photo_${withFallback}`
    : withFallback;

  return imageFilePattern.test(withSafeReservedName)
    ? withSafeReservedName
    : `${withSafeReservedName}${fallbackExtension}`;
}

export const getDownloadFileName = (photo: { name: string }, index: number) =>
  `${String(index + 1).padStart(2, "0")}_${safeFileName(
    photo.name,
    `photo-${index + 1}.jpg`
  )}`;

const getPhotoExtension = (name: string) => {
  const safeName = safeFileName(name, "photo.jpg");
  const extensionIndex = safeName.lastIndexOf(".");

  return extensionIndex >= 0 ? safeName.slice(extensionIndex) : ".jpg";
};

const formatPhotoTimestamp = (date: Date) => {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
};

export function getStoredWorkPhotoFileName({
  carNumber,
  workName,
  originalName,
  index,
  date = new Date(),
}: {
  carNumber?: string | null;
  workName?: string | null;
  originalName: string;
  index: number;
  date?: Date;
}) {
  const baseName = (carNumber ?? "").trim() || (workName ?? "").trim() || "photo";
  const sequence = String(index + 1).padStart(2, "0");
  const extension = getPhotoExtension(originalName);

  return safeFileName(
    `${baseName}_${formatPhotoTimestamp(date)}_${sequence}${extension}`,
    `photo-${sequence}.jpg`
  );
}
