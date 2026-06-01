"use client";

import { useState } from "react";
import { LAND_CELL_SIZE, LAND_SIZE_MASU } from "@shared/constants";
import type { LandSummary } from "@shared/types/socket";
import { api } from "@/lib/api";
import { useGameStore } from "@/store/gameStore";

type Modal = "land" | "sign" | null;

export function PlaceMenu() {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  const openModal = (m: Modal) => {
    setOpen(false);
    setModal(m);
  };

  return (
    <>
      {/* メニューボタン */}
      <div className="fixed right-4 bottom-16 z-10 flex flex-col items-end gap-2">
        {open && (
          <div className="flex flex-col gap-2 rounded-xl border border-white/20 bg-black/80 p-3 backdrop-blur text-sm">
            <button
              onClick={() => openModal("land")}
              className="flex items-center gap-2 text-white hover:text-yellow-300 whitespace-nowrap"
            >
              🌐 土地を取得
            </button>
            <button
              onClick={() => openModal("sign")}
              className="flex items-center gap-2 text-white hover:text-yellow-300 whitespace-nowrap"
            >
              📋 看板を設置
            </button>
          </div>
        )}
        <button
          onClick={() => setOpen((o) => !o)}
          className="h-10 w-10 rounded-full border-2 border-white/30 bg-black/70 text-white text-xl shadow-lg backdrop-blur hover:bg-white/10"
          title="設置メニュー"
        >
          {open ? "✕" : "+"}
        </button>
      </div>

      {modal === "land" && <PlaceLandModal onClose={() => setModal(null)} />}
      {modal === "sign" && <PlaceSignModal onClose={() => setModal(null)} />}
    </>
  );
}

/* ─── 土地取得モーダル ─── */
function PlaceLandModal({ onClose }: { onClose: () => void }) {
  const self = useGameStore((s) => s.self);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!self) return null;

  const xMasu = Math.floor(self.x / LAND_CELL_SIZE);
  const yMasu = Math.floor(self.y / LAND_CELL_SIZE);
  const maxMasu = 200 - LAND_SIZE_MASU;
  const outOfBounds = xMasu < 0 || xMasu > maxMasu || yMasu < 0 || yMasu > maxMasu;

  const submit = async () => {
    if (!name.trim()) { setError("土地名を入力してください"); return; }
    if (outOfBounds) { setError("この位置には土地を設置できません"); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/lands", {
        x: xMasu,
        y: yMasu,
        name: name.trim(),
        description: description.trim(),
      });
      onClose();
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      if (err.code === "LAND_OVERLAP") setError("この場所にはすでに土地が存在します");
      else if (err.code === "LIMIT_EXCEEDED") setError("土地の保有上限に達しています");
      else setError(err.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="🌐 土地を取得" onClose={onClose}>
      <p className="text-xs text-white/40 mb-3">
        設置位置: ({xMasu}, {yMasu}) — {LAND_SIZE_MASU}×{LAND_SIZE_MASU}マス固定
      </p>
      {outOfBounds && (
        <p className="text-xs text-red-400 mb-2">ワールド端付近のため設置できません。少し移動してください。</p>
      )}
      <Field label="土地名 *" maxLength={100}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 100))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="例: AIラボ"
          className={inputCls}
        />
      </Field>
      <Field label={`説明 (${description.length}/500)`} maxLength={500}>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 500))}
          placeholder="任意の説明文"
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </Field>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <ModalActions onCancel={onClose} onSubmit={submit} loading={loading} submitLabel="取得する" />
    </Modal>
  );
}

/* ─── 看板設置モーダル ─── */
function PlaceSignModal({ onClose }: { onClose: () => void }) {
  const self = useGameStore((s) => s.self);
  const lands = useGameStore((s) => s.lands);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!self) return null;

  const xMasu = Math.floor(self.x / LAND_CELL_SIZE);
  const yMasu = Math.floor(self.y / LAND_CELL_SIZE);

  const myLand: LandSummary | undefined = lands.find(
    (l) =>
      l.ownerId === self.userId &&
      xMasu >= l.x && xMasu < l.x + l.width &&
      yMasu >= l.y && yMasu < l.y + l.height
  );

  const submit = async () => {
    if (!title.trim()) { setError("タイトルを入力してください"); return; }
    if (!myLand) { setError("自分の土地の上に立ってください"); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/signs", {
        landId: myLand.id,
        x: xMasu,
        y: yMasu,
        title: title.trim(),
        content: content.trim(),
      });
      onClose();
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      if (err.code === "LIMIT_EXCEEDED") setError("看板の保有上限に達しています");
      else setError(err.message ?? "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="📋 看板を設置" onClose={onClose}>
      {myLand ? (
        <p className="text-xs text-green-400 mb-3">設置先: {myLand.name}</p>
      ) : (
        <p className="text-xs text-yellow-400 mb-3">⚠ 自分の土地の上に移動してから設置してください</p>
      )}
      <Field label="タイトル *" maxLength={100}>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 100))}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="例: ここでAIについて語ろう"
          className={inputCls}
        />
      </Field>
      <Field label={`内容 (${content.length}/500)`} maxLength={500}>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value.slice(0, 500))}
          placeholder="任意の詳細説明"
          rows={3}
          className={`${inputCls} resize-none`}
        />
      </Field>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <ModalActions onCancel={onClose} onSubmit={submit} loading={loading} submitLabel="設置する" disabled={!myLand} />
    </Modal>
  );
}

/* ─── 共通パーツ ─── */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[360px] max-w-[90vw] rounded-2xl border border-white/20 bg-[#12121f] p-5 shadow-2xl">
        <h2 className="mb-4 text-base font-bold text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; maxLength?: number; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs text-white/50">{label}</label>
      {children}
    </div>
  );
}

function ModalActions({
  onCancel,
  onSubmit,
  loading,
  submitLabel,
  disabled,
}: {
  onCancel: () => void;
  onSubmit: () => void;
  loading: boolean;
  submitLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 flex justify-end gap-2">
      <button
        onClick={onCancel}
        className="rounded-lg px-4 py-2 text-sm text-white/60 hover:text-white"
      >
        キャンセル
      </button>
      <button
        onClick={onSubmit}
        disabled={loading || disabled}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40"
      >
        {loading ? "送信中…" : submitLabel}
      </button>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-white/40 focus:outline-none";
