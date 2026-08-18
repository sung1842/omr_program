import { compressForOmr } from "@/lib/compressImage";
import type { createClient } from "@/lib/supabase/client";

export const SCAN_SHEET_BUCKET = "scan-sheets";

type SupabaseClient = ReturnType<typeof createClient>;

export async function uploadScanSheet(
  supabase: SupabaseClient,
  userId: string,
  resultId: string,
  file: File,
): Promise<string | null> {
  try {
    const { blob, tooLarge } = await compressForOmr(file);
    if (tooLarge) {
      return null;
    }
    const path = `${userId}/${resultId}.jpg`;
    const { error } = await supabase.storage.from(SCAN_SHEET_BUCKET).upload(path, blob, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (error) {
      return null;
    }
    return path;
  } catch {
    return null;
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
  if (!error && data?.signedUrl) {
    return data.signedUrl;
  }
  const publicUrl = supabase.storage.from(SCAN_SHEET_BUCKET).getPublicUrl(path).data.publicUrl;
  return publicUrl || null;
}
