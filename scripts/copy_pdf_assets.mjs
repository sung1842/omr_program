import fs from "node:fs";
import path from "node:path";

const src = path.join("node_modules", "pdfjs-dist");
const publicDir = "public";

function copyDir(from, to) {
  if (!fs.existsSync(from)) {
    throw new Error(`pdfjs-dist에 ${from} 폴더가 없습니다.`);
  }
  fs.rmSync(to, { recursive: true, force: true });
  fs.cpSync(from, to, { recursive: true });
  return fs.readdirSync(to).length;
}

fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(
  path.join(src, "build", "pdf.worker.min.mjs"),
  path.join(publicDir, "pdf.worker.min.mjs"),
);

// Korean ballots use CID-keyed fonts. Without these files pdf.js silently skips
// every Hangul glyph and the rendered page keeps only lines and shapes.
const cmaps = copyDir(path.join(src, "cmaps"), path.join(publicDir, "pdfjs", "cmaps"));
const fonts = copyDir(
  path.join(src, "standard_fonts"),
  path.join(publicDir, "pdfjs", "standard_fonts"),
);
// Copier PDFs store filled marks in a CCITT overlay. pdf.js 6 decodes that
// through jbig2.wasm; without it the browser raster is a washed JPEG and OMR
// reports every circle blank ("선택 없음").
const wasm = copyDir(path.join(src, "wasm"), path.join(publicDir, "pdfjs", "wasm"));

console.log(`pdf.js assets ready: worker, cmaps ${cmaps}, standard_fonts ${fonts}, wasm ${wasm}`);
