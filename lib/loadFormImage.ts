export const FORM_FILE_ACCEPT =
  "image/jpeg,image/png,image/webp,image/bmp,application/pdf,.jpg,.jpeg,.png,.webp,.bmp,.pdf";

export function isPdfFile(file: File) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isSupportedFormFile(file: File) {
  if (isPdfFile(file)) {
    return true;
  }
  if (file.type.startsWith("image/")) {
    return !/tiff|heic|heif/i.test(file.type);
  }
  return /\.(png|jpe?g|webp|bmp)$/i.test(file.name);
}

function loadImageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 열 수 없습니다."));
    image.src = url;
  });
}

export async function loadPdfPagesAsFiles(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<File[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const base = file.name.replace(/\.pdf$/i, "") || "scan";
  const pages: File[] = [];
  for (let number = 1; number <= pdf.numPages; number += 1) {
    onProgress?.(number - 1, pdf.numPages);
    const blob = await renderPdfPage(pdf, number);
    const suffix = pdf.numPages === 1 ? ".jpg" : `-p${number}.jpg`;
    pages.push(new File([blob], `${base}${suffix}`, { type: "image/jpeg" }));
    onProgress?.(number, pdf.numPages);
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }
  if (pages.length === 0) {
    throw new Error("PDF에서 페이지를 읽지 못했습니다.");
  }
  return pages;
}

async function renderPdfPage(pdf: { getPage: (n: number) => Promise<any> }, number: number) {
  const page = await pdf.getPage(number);
  const base = page.getViewport({ scale: 1 });
  // Match later OMR compress (1800px). Rendering at 2400 then shrinking was wasted time.
  const scale = Math.min(1.8, 1800 / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("PDF를 그릴 수 없습니다.");
  }
  await page.render({ canvasContext: context, viewport, canvas }).promise;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => {
        if (!next) {
          reject(new Error("PDF 페이지를 이미지로 바꾸지 못했습니다."));
          return;
        }
        resolve(next);
      },
      "image/jpeg",
      0.85,
    );
  });
  return blob;
}

async function pdfFirstPageToImage(file: File) {
  const pages = await loadPdfPagesAsFiles(file);
  return loadImageFromUrl(URL.createObjectURL(pages[0]));
}

export async function loadFormImage(file: File) {
  if (!isSupportedFormFile(file)) {
    throw new Error("JPG, PNG, WEBP, PDF만 올릴 수 있습니다.");
  }
  if (isPdfFile(file)) {
    return pdfFirstPageToImage(file);
  }
  return loadImageFromUrl(URL.createObjectURL(file));
}
