import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { safeFileName } from "../../../../src/modules/factory/workPhotoFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const photosRoot = process.env.WORK_PHOTOS_DIR || path.join(process.cwd(), "work-photos");

const safeFolderName = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[^0-9A-Za-z가-힣_-]/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

const resolvePhotoPath = (relativePath: string) => {
  const normalized = relativePath.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);

  if (parts.length !== 2) return null;

  const folder = safeFolderName(parts[0]);
  const fileName = safeFileName(parts[1]);

  if (!folder || !fileName || folder !== parts[0] || fileName !== parts[1]) {
    return null;
  }

  const absolutePath = path.resolve(photosRoot, folder, fileName);
  const rootPath = path.resolve(photosRoot);

  return absolutePath.startsWith(`${rootPath}${path.sep}`) ? absolutePath : null;
};

const contentTypeFor = (fileName: string) => {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "bmp") return "image/bmp";
  return "image/jpeg";
};

export async function GET(request: NextRequest) {
  const relativePath = request.nextUrl.searchParams.get("path") ?? "";
  const filePath = resolvePhotoPath(relativePath);

  if (!filePath) {
    return NextResponse.json({ error: "잘못된 사진 경로입니다." }, { status: 400 });
  }

  try {
    const bytes = await readFile(filePath);
    const fileName = path.basename(filePath);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentTypeFor(fileName),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "사진을 찾을 수 없습니다." }, { status: 404 });
  }
}
