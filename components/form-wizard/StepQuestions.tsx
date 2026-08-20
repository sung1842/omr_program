"use client";

import { Check, Plus, Trash2 } from "lucide-react";

export type QuestionDraft = {
  id: string;
  label: string;
  min_select: number;
  max_select: number;
  exclusive: boolean;
  hasRegion: boolean;
  circleCount: number;
};

type Props = {
  questions: QuestionDraft[];
  activeId: string | null;
  detecting: boolean;
  editCircles: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onLabelChange: (id: string, label: string) => void;
  onMinChange: (id: string, value: number) => void;
  onMaxChange: (id: string, value: number) => void;
  onExclusiveChange: (id: string, exclusive: boolean) => void;
  onDetect: () => void;
  onToggleEditCircles: (next: boolean) => void;
};

export function StepQuestions({
  questions,
  activeId,
  detecting,
  editCircles,
  onSelect,
  onAdd,
  onRemove,
  onLabelChange,
  onMinChange,
  onMaxChange,
  onExclusiveChange,
  onDetect,
  onToggleEditCircles,
}: Props) {
  const active = questions.find((question) => question.id === activeId) ?? null;

  return (
    <div className="space-y-4">
      <p className="wizard-hint">
        한 문항에 기표 열 상자 하나를 그립니다. 제목·최소·최대를 넣은 뒤 그 상자 안에서만 원을
        찾습니다. 틀린 원만 원 수정에서 고칩니다.
      </p>
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[0.6875rem] font-semibold tracking-wide text-white/60">Questions</h2>
        <button type="button" onClick={onAdd} className="wizard-add">
          <Plus className="size-3" strokeWidth={2.4} />
          Add
        </button>
      </div>
      <ul className="space-y-2">
        {questions.map((question, index) => (
          <li key={question.id}>
            <button
              type="button"
              onClick={() => onSelect(question.id)}
              className={`wizard-q-item ${activeId === question.id ? "is-active" : ""}`}
            >
              {question.label || `문항 ${index + 1}`}
              <span className="ml-2 text-white/45">
                {question.hasRegion ? "box" : "no box"} · {question.circleCount} circles
              </span>
            </button>
          </li>
        ))}
      </ul>
      {active ? (
        <div className="space-y-2 rounded-xl border border-white/12 bg-white/5 p-2.5">
          <label className="wizard-field">
            Title
            <input
              value={active.label}
              onChange={(event) => onLabelChange(active.id, event.target.value)}
              className="wizard-input"
            />
          </label>
          <div className="wizard-choice-row">
            <button
              type="button"
              className={`wizard-choice ${active.exclusive ? "is-on" : ""}`}
              onClick={() => onExclusiveChange(active.id, true)}
            >
              <span className="wizard-choice-mark">
                {active.exclusive ? <Check className="size-2.5" strokeWidth={3} /> : null}
              </span>
              Single
            </button>
            <button
              type="button"
              className={`wizard-choice ${!active.exclusive ? "is-on" : ""}`}
              onClick={() => onExclusiveChange(active.id, false)}
            >
              <span className="wizard-choice-mark">
                {!active.exclusive ? <Check className="size-2.5" strokeWidth={3} /> : null}
              </span>
              Multiple
            </button>
          </div>
          <label className="wizard-field">
            Min
            <input
              type="number"
              min={0}
              value={active.min_select}
              onChange={(event) => onMinChange(active.id, Math.max(0, Number(event.target.value) || 0))}
              className="wizard-input"
            />
          </label>
          <label className="wizard-field">
            Max
            <input
              type="number"
              min={0}
              disabled={active.exclusive}
              value={active.exclusive ? 1 : active.max_select}
              onChange={(event) => onMaxChange(active.id, Math.max(0, Number(event.target.value) || 0))}
              className="wizard-input"
            />
          </label>
          <button
            type="button"
            disabled={detecting || !active.hasRegion}
            onClick={onDetect}
            className="wizard-nav-btn is-next w-full"
          >
            {detecting ? "Finding..." : "Find circles"}
          </button>
          <div className="wizard-steps">
            <button
              type="button"
              onClick={() => onToggleEditCircles(false)}
              className={`wizard-step ${!editCircles ? "is-active" : ""}`}
            >
              Box
            </button>
            <button
              type="button"
              onClick={() => onToggleEditCircles(true)}
              className={`wizard-step ${editCircles ? "is-active" : ""}`}
            >
              Circles
            </button>
          </div>
          <button type="button" onClick={() => onRemove(active.id)} className="wizard-delete">
            <Trash2 className="size-3" strokeWidth={2.2} />
            Delete
          </button>
        </div>
      ) : (
        <p className="text-xs text-white/50">문항 추가로 첫 상자를 만드세요.</p>
      )}
    </div>
  );
}
