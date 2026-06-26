import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

import { imageFilePattern, safeFileName } from "../../../src/modules/factory/workPhotoFiles";

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

const getAvailablePhotoFilePath = async (folderPath: string, requestedName: string) => {
  const safeName = safeFileName(requestedName, "photo.jpg");
  const extensionIndex = safeName.lastIndexOf(".");
  const baseName = extensionIndex >= 0 ? safeName.slice(0, extensionIndex) : safeName;
  const extension = extensionIndex >= 0 ? safeName.slice(extensionIndex) : ".jpg";

  for (let index = 0; index < 1000; index += 1) {
    const fileName =
      index === 0 ? safeName : safeFileName(`${baseName}_${index + 1}${extension}`);
    const filePath = path.join(folderPath, fileName);

    try {
      await stat(filePath);
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return filePath;
      }

      throw error;
    }
  }

  return path.join(
    folderPath,
    safeFileName(`${baseName}_${Date.now()}${extension}`, "photo.jpg")
  );
};

export async function GET(request: NextRequest) {
  const folder = safeFolderName(request.nextUrl.searchParams.get("folder"));

  if (!folder) {
    return NextResponse.json({ photos: [] });
  }

  const folderPath = path.join(photosRoot, folder);

  try {
    const entries = await readdir(folderPath, { withFileTypes: true });
    const photos = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && imageFilePattern.test(entry.name))
        .map(async (entry) => {
          const relativePath = `${folder}/${entry.name}`;
          const fileStat = await stat(path.join(folderPath, entry.name));

          return {
            name: entry.name,
            path: relativePath,
            url: `/api/work-photos/file?path=${encodeURIComponent(relativePath)}`,
            createdAt: fileStat.mtimeMs,
          };
        })
    );

    photos.sort((left, right) => right.createdAt - left.createdAt);

    return NextResponse.json({
      photos: photos.map((photo) => ({
        name: photo.name,
        path: photo.path,
        url: photo.url,
        createdAt: photo.createdAt,
      })),
    });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ photos: [] });
    }

    console.error("NAS photo list failed:", error);
    return NextResponse.json({ error: "사진 목록을 불러오지 못했습니다." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const folder = safeFolderName(formData.get("folder"));
  const files = formData.getAll("files").filter((value): value is File => value instanceof File);

  if (!folder) {
    return NextResponse.json({ error: "작명이 없어 사진을 저장할 수 없습니다." }, { status: 400 });
  }

  if (files.length === 0) {
    return NextResponse.json({ uploaded: 0 });
  }

  const folderPath = path.join(photosRoot, folder);
  await mkdir(folderPath, { recursive: true });

  for (const file of files) {
    const filePath = await getAvailablePhotoFilePath(folderPath, file.name);
    const bytes = Buffer.from(await file.arrayBuffer());

    await writeFile(filePath, bytes);
  }

  return NextResponse.json({ uploaded: files.length });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { paths?: string[] } | null;
  const paths = Array.isArray(body?.paths) ? body.paths : [];

  for (const relativePath of paths) {
    const filePath = resolvePhotoPath(relativePath);

    if (filePath) {
      await rm(filePath, { force: true });
    }
  }

  return NextResponse.json({ deleted: paths.length });
}
