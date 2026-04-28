import React, { useEffect, useMemo, useRef, useState } from "react";
import type { FlagletteStats } from "../lib/stats";
import { formatCountdown, msUntilMidnight } from "../utils/date";

type ModalTrigger = "auto" | "manual";

interface TodayResult {
  won: boolean;
  guesses: number; // 1..6 (loss should still pass 6)
}

interface StatsModalProps {
  open: boolean;
  stats: FlagletteStats;
  trigger?: ModalTrigger;
  todayResult?: TodayResult | null;
  onClose: () => void;
  onShareResult: () => void;
  onPlayFirstGame?: () => void;
}

interface AnimatedNumberProps {
  value: number;
  suffix?: string;
  durationMs?: number;
}

const distributionLabels = ["1", "2", "3", "4", "5", "6", "X"] as const;

function getStreakEmoji(streak: number): string {
  if (streak >= 100) return "🔥🔥🔥";
  if (streak >= 30) return "🔥🔥";
  if (streak >= 7) return "🔥";
  return "";
}

function clampDistributionIndex(result: TodayResult): number {
  if (!result.won) return 6;
  return Math.min(5, Math.max(0, Math.floor(result.guesses) - 1));
}

function AnimatedNumber({
  value,
  suffix = "",
  durationMs = 400,
}: AnimatedNumberProps): JSX.Element {
  const [displayValue, setDisplayValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = 0;
    const to = Math.max(0, Math.floor(value));
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (to - from) * eased);
      setDisplayValue(next);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return (
    <span className="text-[1.65rem] leading-none font-bold tracking-tight text-white">
      {displayValue}
      {suffix}
    </span>
  );
}

export default function StatsModal({
  open,
  stats,
  trigger = "manual",
  todayResult = null,
  onClose,
  onShareResult,
  onPlayFirstGame,
}: StatsModalProps): JSX.Element | null {
  const [countdown, setCountdown] = useState<string>(formatCountdown(msUntilMidnight()));
  const winRate = useMemo(() => {
    if (stats.totalPlayed <= 0) return null;
    return Math.round((stats.totalWon / stats.totalPlayed) * 100);
  }, [stats.totalPlayed, stats.totalWon]);
  const streakEmoji = getStreakEmoji(stats.currentStreak);
  const maxDistribution = Math.max(1, ...stats.guessDistribution);
  const highlightedIndex =
    todayResult == null ? null : clampDistributionIndex(todayResult);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => {
      setCountdown(formatCountdown(msUntilMidnight()));
    }, 1000);
    setCountdown(formatCountdown(msUntilMidnight()));
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;

  const isEmpty = stats.totalPlayed === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stats-modal-title"
      data-trigger={trigger}
      onClick={onClose}
    >
      <section
        className="w-full max-w-[560px] rounded-t-2xl border border-zinc-700 bg-zinc-900 p-4 text-zinc-200 shadow-2xl sm:rounded-2xl sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close statistics"
            className="rounded px-2 py-1 text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
          <h2 id="stats-modal-title" className="text-base font-semibold text-white">
            Statistics
          </h2>
        </header>

        {isEmpty ? (
          <div className="rounded-xl border border-zinc-700 bg-zinc-950/60 px-4 py-6 text-center">
            <p className="text-sm text-zinc-300">
              Your stats will appear after your first Flaglette.
            </p>
            {onPlayFirstGame ? (
              <button
                type="button"
                onClick={onPlayFirstGame}
                className="mt-4 rounded-md bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
              >
                Play today&apos;s puzzle
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 rounded-xl border border-zinc-700 bg-zinc-950/60 p-3 text-center">
              <div>
                <AnimatedNumber value={stats.totalPlayed} />
                <p className="mt-1 text-[11px] text-zinc-400">Played</p>
              </div>
              <div>
                <AnimatedNumber value={stats.totalWon} />
                <p className="mt-1 text-[11px] text-zinc-400">Won</p>
              </div>
              <div>
                {winRate == null ? (
                  <span className="text-[1.65rem] leading-none font-bold tracking-tight text-white">
                    —
                  </span>
                ) : (
                  <AnimatedNumber value={winRate} suffix="%" />
                )}
                <p className="mt-1 text-[11px] text-zinc-400">Win Rate</p>
              </div>
              <div>
                <AnimatedNumber value={stats.currentStreak} />
                <p className="mt-1 text-[11px] text-zinc-400">
                  Streak {streakEmoji ? ` ${streakEmoji}` : ""}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="mb-2 text-sm font-medium text-zinc-200">
                Guess Distribution
              </h3>
              <div className="space-y-1.5">
                {distributionLabels.map((label, index) => {
                  const count = stats.guessDistribution[index];
                  const widthPct = Math.max(2, Math.round((count / maxDistribution) * 100));
                  const isToday = highlightedIndex === index;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-3 text-xs text-zinc-400">{label}</span>
                      <div className="relative h-5 flex-1 overflow-hidden rounded bg-zinc-800">
                        <div
                          className={`h-full ${
                            isToday ? "bg-emerald-500" : "bg-zinc-500"
                          }`}
                          style={{ width: `${count === 0 ? 1 : widthPct}%` }}
                        />
                      </div>
                      <span className="min-w-5 text-right text-xs text-zinc-300">
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="mt-4 border-t border-zinc-700 pt-3 text-sm text-zinc-300">
              Max Streak:{" "}
              <span className="font-semibold text-white">{stats.maxStreak}</span>
            </p>
          </>
        )}

        <div className="mt-4 border-t border-zinc-700 pt-3 text-center">
          <p className="text-xs uppercase tracking-[0.1em] text-zinc-400">
            Next Flaglette in
          </p>
          <p className="mt-1 font-mono text-xl font-semibold text-white">{countdown}</p>
          <button
            type="button"
            onClick={onShareResult}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 px-4 text-sm font-semibold text-zinc-100 hover:bg-zinc-700"
          >
            📤 Share Result
          </button>
        </div>
      </section>
    </div>
  );
}
