"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { DOT_RADIUS } from "@shared/constants";
import type { UserProfile } from "@shared/types/api";

interface PublicProfile {
  username: string;
  speechCount: number;
  sizeLevel: 1 | 2 | 3 | 4;
  profile: string;
  isSupporter: boolean;
  createdAt: string;
  lastActiveAt: string;
  lands: { id: string; name: string }[];
}

export default function ProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const authUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const isOwnProfile = authUser?.username === username;

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error, setError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Initialize auth state if missing (e.g. after page refresh)
  useEffect(() => {
    if (!authUser) {
      api.get<{ user: UserProfile }>("/auth/me")
        .then((data) => setUser(data.user))
        .catch(() => {});
    }
  }, [authUser, setUser]);

  useEffect(() => {
    api.get<{ user: PublicProfile }>(`/users/${username}`)
      .then((data) => {
        setProfile(data.user);
        setEditBio(data.user.profile);
      })
      .catch(() => setError("ユーザーが見つかりません"));
  }, [username]);

  const saveBio = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await api.patch("/users/me", { profile: editBio });
      setProfile((p) => (p ? { ...p, profile: editBio } : p));
      setEditMode(false);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setSaveError(err.message ?? "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const dotRadius = profile ? DOT_RADIUS[profile.sizeLevel] : 4;
  const svgSize = dotRadius * 2 + 8;

  return (
    <main className="min-h-screen bg-[#1a1a2e] px-4 py-8">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/world" className="text-sm text-white/50 hover:text-white transition-colors">
            ← ワールドへ戻る
          </Link>
          <span className="text-xl font-bold text-white">
            Dot<span className="text-blue-400">Verse</span>
          </span>
        </div>

        {error && !profile && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-center text-red-400">
            {error}
          </div>
        )}

        {!profile && !error && (
          <div className="text-center text-white/40 py-16">読み込み中...</div>
        )}

        {profile && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            {/* Avatar + name */}
            <div className="flex items-center gap-4 mb-6">
              <svg
                width={svgSize}
                height={svgSize}
                viewBox={`0 0 ${svgSize} ${svgSize}`}
                aria-hidden
              >
                <circle
                  cx={dotRadius + 4}
                  cy={dotRadius + 4}
                  r={dotRadius}
                  fill="#4A90E2"
                />
              </svg>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-white">{profile.username}</h1>
                  {profile.isSupporter && (
                    <span className="text-yellow-400 text-sm">★ サポーター</span>
                  )}
                </div>
                <p className="text-sm text-white/50">
                  Lv{profile.sizeLevel} · {profile.speechCount.toLocaleString()}発言
                </p>
              </div>
            </div>

            {/* Profile bio */}
            <div className="mb-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
                プロフィール
              </h2>
              {editMode ? (
                <div>
                  <textarea
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value.slice(0, 100))}
                    rows={4}
                    autoFocus
                    className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-white/40 placeholder-white/30"
                    placeholder="自己紹介を書いてください..."
                  />
                  <p className="text-xs text-white/30 mt-1 text-right">{editBio.length}/100</p>
                  {saveError && (
                    <p className="text-xs text-red-400 mt-1">{saveError}</p>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={saveBio}
                      disabled={saving}
                      className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-40"
                    >
                      {saving ? "保存中..." : "保存"}
                    </button>
                    <button
                      onClick={() => {
                        setEditMode(false);
                        setEditBio(profile.profile);
                        setSaveError("");
                      }}
                      className="rounded-lg px-4 py-1.5 text-sm text-white/60 hover:text-white"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-white/70 min-h-[2em] whitespace-pre-wrap">
                  {profile.profile || (
                    <span className="italic text-white/30">まだプロフィールがありません</span>
                  )}
                </p>
              )}
            </div>

            {/* Lands */}
            {profile.lands.length > 0 && (
              <div className="mb-6">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
                  保有している土地 ({profile.lands.length})
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {profile.lands.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-center gap-2 text-sm text-white/70"
                    >
                      <span className="h-2 w-2 rounded-sm bg-blue-400/40 flex-shrink-0" />
                      {l.name}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Joined date */}
            <p className="text-xs text-white/25 mb-4">
              参加: {new Date(profile.createdAt).toLocaleDateString("ja-JP")}
            </p>

            {/* Edit own profile button */}
            {isOwnProfile && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
              >
                プロフィールを編集
              </button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
