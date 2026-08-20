"use client";

import { useState } from "react";

type Props = {
  name: string;
  onNameChange: (value: string) => void;
  fileName: string | null;
  loadingFile: boolean;
  hasImage: boolean;
  onPickClick: () => void;
  onDropFile: (file: File | undefined) => void;
};

export function StepUpload({
  name,
  onNameChange,
  fileName,
  loadingFile,
  hasImage,
  onPickClick,
  onDropFile,
}: Props) {
  const [dragOver, setDragOver] = useState(false);
  const title = loadingFile
    ? "양식을 불러오는 중..."
    : fileName
      ? fileName
      : "빈 설문 PDF / 이미지를 놓으세요";

  return (
    <div className="space-y-4">
      <label className="wizard-field">
        Name
        <input
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          className="wizard-input"
          placeholder="예: 주민제안 마을의제 투표"
        />
      </label>
      <div className="wizard-field">
        Form
        <button
          type="button"
          onClick={onPickClick}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            onDropFile(event.dataTransfer.files[0]);
          }}
          className={`wizard-drop ${dragOver ? "is-over" : ""}`}
        >
          <span className="wizard-drop-title">{title}</span>
          <span className="wizard-hint">
            JPG, PNG, PDF를 올릴 수 있습니다. PDF는 첫 페이지만 템플릿으로 씁니다.
            {hasImage && !loadingFile ? " 업로드됨." : ""}
          </span>
        </button>
      </div>
    </div>
  );
}
