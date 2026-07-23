"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { isAddress } from "viem";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { createEvent, fundEvent, ApiError, type EventMode } from "@/lib/api";

const ACCEPTED_EXTENSIONS = ".csv,.txt";

export default function CreateEventPage() {
  const router = useRouter();
  const { token, organizer } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [walletsRaw, setWalletsRaw] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [mode, setMode] = useState<EventMode>("RANDOM_SPLIT");
  const [numWinners, setNumWinners] = useState(2);
  const [fixedAmount, setFixedAmount] = useState("");
  const [poolAmount, setPoolAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ input: string; reason: string }[] | null>(null);

  const wallets = walletsRaw
    .split(/[\n,]/)
    .map((w) => w.trim())
    .filter(Boolean);
  const invalidPreview = wallets.filter((w) => !isAddress(w));

  // What will actually be transferred into the event, distinct from topping
  // up the wallet itself (that happens separately via the deposit address on
  // the Dashboard) -- Fixed Amount mode derives it from numWinners x
  // per-winner amount; Random Split mode is entered directly below.
  const computedFixedTotal =
    mode === "FIXED_AMOUNT" && fixedAmount && numWinners > 0 ? Number(fixedAmount) * numWinners : null;
  const requiredAmount = mode === "RANDOM_SPLIT" ? Number(poolAmount || 0) : (computedFixedTotal ?? 0);
  const balance = Number(organizer?.usdcBalance ?? "0");
  const insufficientFunds = requiredAmount > 0 && balance < requiredAmount;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file name later
    if (!file) return;

    setUploadError(null);
    const text = await file.text();
    // Same tokenizer as the textarea (newline or comma separated) -- a plain
    // one-address-per-line .txt/.csv is the expected shape. A header row or
    // extra columns will just surface as "invalid format" entries below,
    // which stay editable in the textarea so the user can delete them.
    const parsed = text
      .split(/[\r\n,]/)
      .map((w) => w.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      setUploadError("File appears to be empty.");
      return;
    }

    setWalletsRaw((prev) => {
      const merged = prev.trim() ? `${prev.trim()}\n${parsed.join("\n")}` : parsed.join("\n");
      return merged;
    });
    setUploadedFileName(file.name);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError(null);
    setFieldErrors(null);

    try {
      const res = await createEvent(token, {
        wallets,
        mode,
        numWinners,
        fixedAmountPerWinner: mode === "FIXED_AMOUNT" ? fixedAmount : undefined,
      });
      // Fund immediately with the prize pool entered above, so the organizer
      // doesn't have to re-enter the amount on a separate screen.
      await fundEvent(token, res.id, mode === "RANDOM_SPLIT" ? poolAmount : undefined);
      router.push(`/dashboard/events/${res.id}`);
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        setFieldErrors(err.details);
      }
      setError(err instanceof Error ? err.message : "Failed to create event");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-1">Create a new event</h1>
      <p className="text-sm text-muted mb-6">
        Wallets, rules, and the prize pool are all set up here in one step.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="glass-card p-6">
          <label className="block text-sm font-medium text-white mb-2">
            Wallet list <span className="text-muted font-normal">(one address per line or comma-separated, max 200)</span>
          </label>

          <textarea
            value={walletsRaw}
            onChange={(e) => setWalletsRaw(e.target.value)}
            rows={6}
            placeholder="0xabc...&#10;0xdef..."
            className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm font-mono text-white placeholder:text-muted focus:outline-none focus:border-violet"
          />

          <div className="flex items-center justify-between flex-wrap gap-2 mt-3">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="neon-outline-btn flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white"
              >
                <Upload size={14} /> Upload .csv / .txt
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                onChange={handleFileUpload}
                className="hidden"
              />
              {uploadedFileName && (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-muted">
                  {uploadedFileName}
                  <button
                    type="button"
                    onClick={() => setUploadedFileName(null)}
                    aria-label="Clear uploaded file name"
                    className="hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>
            <div className="text-xs">
              <span className="text-muted">{wallets.length} address(es) detected</span>
              {invalidPreview.length > 0 && (
                <span className="text-red ml-2">{invalidPreview.length} invalid format</span>
              )}
            </div>
          </div>
          {uploadError && <p className="text-xs text-red mt-2">{uploadError}</p>}
          {fieldErrors && (
            <ul className="mt-3 space-y-1 text-xs text-red">
              {fieldErrors.map((fe, i) => (
                <li key={i}>
                  &quot;{fe.input}&quot; — {fe.reason === "duplicate" ? "duplicate address" : "invalid address format"}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-card p-6 space-y-4">
          <label className="block text-sm font-medium text-white">Reward mode</label>
          <div className="grid grid-cols-2 gap-3">
            <ModeOption
              label="Random Split"
              description="K winners chosen randomly, pot split randomly (max 60% per wallet)"
              selected={mode === "RANDOM_SPLIT"}
              onClick={() => setMode("RANDOM_SPLIT")}
            />
            <ModeOption
              label="Fixed Amount"
              description="K winners chosen randomly, each gets the same fixed amount"
              selected={mode === "FIXED_AMOUNT"}
              onClick={() => setMode("FIXED_AMOUNT")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Number of winners (K) <span className="text-muted font-normal">— minimum 2</span>
            </label>
            <input
              type="number"
              min={2}
              max={wallets.length || 200}
              value={numWinners}
              onChange={(e) => setNumWinners(Number(e.target.value))}
              className="w-32 rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet"
            />
          </div>

          {mode === "FIXED_AMOUNT" && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">Amount per winner (USDC)</label>
              <input
                type="text"
                inputMode="decimal"
                value={fixedAmount}
                onChange={(e) => setFixedAmount(e.target.value)}
                placeholder="e.g. 5.00"
                className="w-40 rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-sm text-white placeholder:text-muted focus:outline-none focus:border-violet"
              />
            </div>
          )}
        </div>

        <div className="glass-card p-6 space-y-3">
          <label className="block text-sm font-medium text-white">
            Prize pool <span className="text-muted font-normal">— transferred from your wallet balance into this event</span>
          </label>
          <p className="text-xs text-muted">
            Wallet balance: <span className="text-white font-medium">{organizer?.usdcBalance ?? "…"} USDC</span>{" "}
            <span className="opacity-70">(depositing into your wallet is a separate step, on the Dashboard)</span>
          </p>

          {mode === "RANDOM_SPLIT" ? (
            <div className="neon-rainbow-frame max-w-xs">
              <input
                type="text"
                inputMode="decimal"
                value={poolAmount}
                onChange={(e) => setPoolAmount(e.target.value)}
                placeholder="Total prize pool, e.g. 100.00"
                className="w-full bg-[#0a0a0f] px-4 py-3 text-base font-semibold text-white placeholder:text-muted placeholder:font-normal focus:outline-none"
              />
            </div>
          ) : (
            <div className="neon-rainbow-frame max-w-xs">
              <div className="w-full bg-[#0a0a0f] px-4 py-3 text-base font-semibold text-white">
                {computedFixedTotal !== null ? computedFixedTotal.toFixed(2) : "0.00"} USDC
                <span className="block text-xs font-normal text-muted mt-0.5">
                  {numWinners} winners × {fixedAmount || "0"} USDC
                </span>
              </div>
            </div>
          )}

          {insufficientFunds && (
            <p className="text-xs text-pink">
              Not enough balance yet — send more USDC to your wallet address on the Dashboard first.
            </p>
          )}
        </div>

        {error && <p className="text-sm text-red">{error}</p>}

        <Button
          type="submit"
          disabled={
            submitting ||
            wallets.length < 2 ||
            numWinners < 2 ||
            invalidPreview.length > 0 ||
            requiredAmount <= 0 ||
            insufficientFunds
          }
        >
          {submitting ? "Submitting on-chain…" : "Create & fund event"}
        </Button>
      </form>
    </div>
  );
}

function ModeOption({
  label,
  description,
  selected,
  onClick,
}: {
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-4 transition ${
        selected ? "border-violet bg-violet/10" : "border-white/10 hover:bg-white/5"
      }`}
    >
      <p className="font-medium text-white text-sm">{label}</p>
      <p className="text-xs text-muted mt-1">{description}</p>
    </button>
  );
}
