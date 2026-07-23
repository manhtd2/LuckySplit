"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe, getMyBalance, getAuthNonce, walletLogin, type OrganizerProfile } from "./api";
import { connectBrowserWallet, signMessageWithBrowserWallet } from "./walletBrowser";

const STORAGE_KEY = "luckysplit_creator_token";

interface AuthState {
  loading: boolean;
  token: string | null;
  organizer: OrganizerProfile | null;
  /**
   * Connects the user's own browser wallet (e.g. MetaMask), has them sign a
   * one-time nonce to prove ownership, then signs in. `displayName` is only
   * used the first time this address logs in -- LuckySplit creates its own
   * Circle-custodied wallet for that organizer at that point, separate from
   * the login wallet, which never holds or moves event funds.
   */
  loginWithWallet: (displayName?: string) => Promise<void>;
  refreshBalance: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [organizer, setOrganizer] = useState<OrganizerProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Deferred via queueMicrotask so state updates don't happen synchronously
    // in the effect body (react-hooks/set-state-in-effect) -- this is a
    // one-time session hydration from localStorage, not a render loop.
    queueMicrotask(() => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setLoading(false);
        return;
      }
      setToken(stored);
      getMe(stored)
        .then(setOrganizer)
        .catch(() => {
          localStorage.removeItem(STORAGE_KEY);
          setToken(null);
        })
        .finally(() => setLoading(false));
    });
  }, []);

  async function loginWithWallet(displayName?: string) {
    const address = await connectBrowserWallet();
    const { message } = await getAuthNonce(address);
    const signature = await signMessageWithBrowserWallet(address, message);
    const profile = await walletLogin({ address, signature, displayName });
    localStorage.setItem(STORAGE_KEY, profile.creatorToken!);
    setToken(profile.creatorToken!);
    setOrganizer(profile);
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setOrganizer(null);
  }

  async function refreshBalance() {
    if (!token) return;
    const { usdcBalance } = await getMyBalance(token);
    setOrganizer((prev) => (prev ? { ...prev, usdcBalance } : prev));
  }

  return (
    <AuthContext.Provider value={{ loading, token, organizer, loginWithWallet, refreshBalance, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
