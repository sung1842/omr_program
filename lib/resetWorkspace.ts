import { ensureDefaultTemplate } from "@/lib/ensureDefaultTemplate";
import { emitWorkspaceReset } from "@/lib/scanEvents";
import { SCAN_SHEET_BUCKET } from "@/lib/sheetStorage";
import { createClient } from "@/lib/supabase/client";

type SupabaseClient = ReturnType<typeof createClient>;

async function collectStoragePaths(supabase: SupabaseClient, prefix = ""): Promise<string[]> {
  const { data, error } = await supabase.storage.from(SCAN_SHEET_BUCKET).list(prefix, {
    limit: 1000,
  });
  if (error || !data?.length) {
    return [];
  }
  const paths: string[] = [];
  for (const item of data) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      paths.push(...(await collectStoragePaths(supabase, path)));
      continue;
    }
    paths.push(path);
  }
  return paths;
}

async function emptyScanSheets(supabase: SupabaseClient) {
  const paths = await collectStoragePaths(supabase);
  for (let index = 0; index < paths.length; index += 100) {
    const chunk = paths.slice(index, index + 100);
    const { error } = await supabase.storage.from(SCAN_SHEET_BUCKET).remove(chunk);
    if (error) {
      throw new Error(error.message);
    }
  }
}

async function deleteAllRows(supabase: SupabaseClient, table: "scan_results" | "scan_jobs" | "templates") {
  const { error } = await supabase.from(table).delete().gte("created_at", "1970-01-01");
  if (error) {
    throw new Error(error.message);
  }
}

export async function resetOmrWorkspace(userId: string) {
  const supabase = createClient();
  await emptyScanSheets(supabase);

  const { error } = await supabase.rpc("reset_omr_workspace");
  if (error) {
    await deleteAllRows(supabase, "templates");
  }

  await ensureDefaultTemplate(userId);
  emitWorkspaceReset();
}
