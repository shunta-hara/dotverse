"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { UserProfile } from "@shared/types/api";

export default function RegisterPage() {
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await api.post<{ user: UserProfile }>("/auth/register", {
        username,
        email,
        password,
      });
      setUser(data.user);
      router.push("/world");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#1a1a2e] px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-3xl font-bold text-white">
          Dot<span className="text-blue-400">Verse</span>
        </h1>
        <p className="mb-8 text-center text-sm text-white/50">アカウントを作成して参加しよう</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ユーザー名 (2〜20文字)"
              required
              minLength={2}
              maxLength={20}
              className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-blue-400 focus:outline-none"
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            required
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-blue-400 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワード (8文字以上)"
            required
            minLength={8}
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder-white/30 focus:border-blue-400 focus:outline-none"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-blue-500 py-3 font-bold text-white hover:bg-blue-400 disabled:opacity-50"
          >
            {loading ? "登録中..." : "アカウント作成"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-white/50">
          既にアカウントをお持ちの方は{" "}
          <Link href="/login" className="text-blue-400 hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}
