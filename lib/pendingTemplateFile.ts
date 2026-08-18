let pending: File | null = null;

export function setPendingTemplateFile(file: File) {
  pending = file;
}

export function takePendingTemplateFile() {
  const file = pending;
  pending = null;
  return file;
}
