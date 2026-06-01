"use client";

import { create } from "zustand";
import type { UserProfile } from "@shared/types/api";

interface AuthState {
  user: UserProfile | null;
  setUser: (user: UserProfile | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
}));
