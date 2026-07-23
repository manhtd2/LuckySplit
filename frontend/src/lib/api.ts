const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status, body.details);
  }

  return res.json() as Promise<T>;
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

// ---- Auth (sign in with the organizer's own wallet) ----

export const getAuthNonce = (address: string) =>
  request<{ message: string }>(`/api/auth/nonce?address=${address}`);

export interface WalletLoginInput {
  address: string;
  signature: string;
  /** Only used the first time this address logs in; ignored for returning organizers. */
  displayName?: string;
}

export const walletLogin = (input: WalletLoginInput) =>
  request<OrganizerProfile>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });

// ---- Organizers ----

export interface OrganizerProfile {
  id: string;
  displayName: string;
  /** LuckySplit-custodied wallet that holds event funds -- separate from the login wallet. */
  walletAddress: string;
  usdcBalance?: string;
  creatorToken?: string;
}

export const getMe = (token: string) =>
  request<OrganizerProfile>("/api/organizers/me", { headers: authHeaders(token) });

export const getMyBalance = (token: string) =>
  request<{ usdcBalance: string }>("/api/organizers/me/balance", { headers: authHeaders(token) });

// ---- Events (organizer) ----

export type EventMode = "RANDOM_SPLIT" | "FIXED_AMOUNT";
export type EventState = "OPEN" | "FUNDED" | "COMMITTED" | "DISTRIBUTING" | "COMPLETED" | "CANCELLED";

export interface CreateEventInput {
  wallets: string[];
  mode: EventMode;
  numWinners: number;
  fixedAmountPerWinner?: string;
}

export const createEvent = (token: string, input: CreateEventInput) =>
  request<{ id: string; contractEventId: number; state: EventState; txHash: string }>("/api/events", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(input),
  });

export const fundEvent = (token: string, id: string, totalAmount?: string) =>
  request<{ id: string; state: EventState; totalDeposit: string; txHash: string }>(
    `/api/events/${id}/fund`,
    { method: "POST", headers: authHeaders(token), body: JSON.stringify({ totalAmount }) },
  );

export const startEvent = (token: string, id: string) =>
  request<{ id: string; state: EventState; targetBlock: string; txHash: string }>(
    `/api/events/${id}/start`,
    { method: "POST", headers: authHeaders(token) },
  );

export const cancelEvent = (token: string, id: string) =>
  request<{ id: string; state: EventState; txHash: string }>(`/api/events/${id}/cancel`, {
    method: "POST",
    headers: authHeaders(token),
  });

export interface WalletEntryDto {
  address: string;
  isWinner: boolean;
  paid: boolean;
  blocked: boolean;
  amount: string | null;
}

export interface TxDto {
  kind: string;
  txHash: string;
  status: string;
  createdAt: string;
  explorerUrl?: string;
}

export interface EventDetailDto {
  id: string;
  contractEventId: number | null;
  mode: EventMode;
  numWallets: number;
  numWinners: number;
  fixedAmountPerWinner: string | null;
  totalDeposit: string | null;
  state: EventState;
  targetBlock: string | null;
  createdAt: string;
  fundedAt: string | null;
  committedAt: string | null;
  revealedAt: string | null;
  completedAt: string | null;
  wallets: WalletEntryDto[];
  txs: TxDto[];
  organizer?: { id: string; displayName: string };
}

export const getMyEvent = (token: string, id: string) =>
  request<EventDetailDto>(`/api/events/${id}`, { headers: authHeaders(token) });

export interface MyEventSummary {
  id: string;
  contractEventId: number | null;
  mode: EventMode;
  numWallets: number;
  numWinners: number;
  totalDeposit: string | null;
  state: EventState;
  createdAt: string;
  completedAt: string | null;
}

export const getMyEvents = (token: string) =>
  request<MyEventSummary[]>("/api/events", { headers: authHeaders(token) });

// ---- Public ----

export interface PublicEventSummary {
  id: string;
  contractEventId: number | null;
  organizer: { id: string; displayName: string };
  mode: EventMode;
  numWallets: number;
  numWinners: number;
  state: EventState;
  createdAt: string;
  completedAt: string | null;
}

export const getPublicEvents = () => request<PublicEventSummary[]>("/api/public/events");

export const getPublicEvent = (id: string) => request<EventDetailDto>(`/api/public/events/${id}`);

export interface PublicOrganizerProfile {
  id: string;
  displayName: string;
  walletAddress: string;
  events: PublicEventSummary[];
}

export const getPublicOrganizer = (id: string) =>
  request<PublicOrganizerProfile>(`/api/public/organizers/${id}`);

export interface LeaderboardEntry {
  id: string;
  displayName: string;
  /** 6-decimal USDC base units, actually paid to winners (not gross deposit). */
  totalDistributed: string;
  eventCount: number;
}

export const getLeaderboard = () => request<LeaderboardEntry[]>("/api/public/leaderboard");
