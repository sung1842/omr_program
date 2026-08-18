import type { createClient } from "@/lib/supabase/client";

export const SCAN_SHEET_BUCKET = "scan-sheets";
export const SOURCE_MAX_BYTES = 50 * 1024 * 1024;

type SupabaseClient = ReturnType<typeof createClient>;

const EXTENSION_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  bmp: "image/bmp",
};

function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function contentTypeOf(file: File) {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type;
  }
  return EXTENSION_TYPES[extensionOf(file.name)] ?? "application/octet-stream";
}

export function isPdfPath(path: string | null | undefined) {
  return Boolean(path && /\.pdf$/i.test(path));
}

/**
 * Stores the upload exactly as it arrived. Re-encoding here is what previously
 * dropped page content, so the bytes are never touched on the way to storage.
 */
export async function uploadSourceFile(
  supabase: SupabaseClient,
  userId: string,
  sourceId: string,
  file: File,
): Promise<string | null> {
  if (file.size > SOURCE_MAX_BYTES) {
    console.error("source too large for storage", file.name, file.size);
    return null;
  }
  const extension = extensionOf(file.name) || "bin";
  const path = `${userId}/sources/${sourceId}.${extension}`;
  const { error } = await supabase.storage.from(SCAN_SHEET_BUCKET).upload(path, file, {
    contentType: contentTypeOf(file),
    upsert: true,
  });
  if (error) {
    console.error("source upload failed", error.message);
    return null;
  }
  return path;
}

export async function removeScanSheet(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<void> {
  if (!path) {
    return;
  }
  const { error } = await supabase.storage.from(SCAN_SHEET_BUCKET).remove([path]);
  if (error) {
    console.error("scan sheet delete failed", error.message);
  }
}

export async function removeScanSheets(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  const list = paths.filter(Boolean);
  if (list.length === 0) {
    return;
  }
  const { error } = await supabase.storage.from(SCAN_SHEET_BUCKET).remove(list);
  if (error) {
    console.error("scan sheet cleanup failed", error.message);
  }
}

export async function signedSheetUrl(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) {
    return null;
  }
  const { data, error } = await supabase.storage
    .from(SCAN_SHEET_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    console.error("scan sheet signed url failed", error?.message);
    return null;
  }
  return data.signedUrl;
}
