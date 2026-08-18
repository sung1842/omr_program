import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|pdfjs/|pdf.worker.min.mjs|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mjs|bcmap|pfb|ttf|otf|woff2?|wasm)$).*)",
  ],
};
