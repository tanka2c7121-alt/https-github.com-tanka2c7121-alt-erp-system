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
