"use client";

// リアルタイムスタッツ入力画面。
// - シュート: 選手→種別→結果の3タップ / その他: 選手→アクションの2タップ
// - イベントはまずローカルキュー(state + localStorage)に積み、
//   オンライン時にバックグラウンドでSupabaseへ同期する(楽観的UI)
// - Undo: 未同期ならキューから取り消し、同期済みならDELETEをキューに積む

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { createClient } from "@/lib/supabase/client";
import {
  describeEvent,
  GK_RESULT_LABELS,
  QUARTER_LABELS,
  QUARTERS,
  SHOT_RESULT_LABELS,
  SHOT_SUBTYPE_LABELS,
  type GkResult,
  type Quarter,
  type RosterEntry,
  type ShotResult,
  type ShotSubtype,
  type StatsEvent,
} from "@/lib/stats";

interface Member {
  user_id: string;
  name: string;
}

interface Props {
  matchId: string;
  teamId: string;
  matchTitle: string;
  members: Member[];
  initialRoster: RosterEntry[];
  initialEvents: StatsEvent[];
}

type PendingOp =
  | { kind: "insert"; event: StatsEvent }
  | { kind: "delete"; id: string };

const opsKey = (matchId: string) => `kgtv-stats-ops-${matchId}`;

function loadOps(matchId: string): PendingOp[] {
  try {
    return JSON.parse(localStorage.getItem(opsKey(matchId)) ?? "[]");
  } catch {
    return [];
  }
}

const FIELD_ACTIONS: {
  label: string;
  type: StatsEvent["type"];
  subtype?: string;
}[] = [
  { label: "アシスト", type: "assist" },
  { label: "カット", type: "cut" },
  { label: "E誘発", type: "drawn_exclusion", subtype: "exclusion" },
  { label: "P誘発", type: "drawn_exclusion", subtype: "penalty" },
  { label: "退水", type: "exclusion" },
  { label: "OF", type: "offensive_foul" },
  { label: "パスミス", type: "miss", subtype: "pass" },
  { label: "キープミス", type: "miss", subtype: "keep" },
  { label: "他ミス", type: "miss", subtype: "other" },
];

export default function LiveScreen({
  matchId,
  teamId,
  matchTitle,
  members,
  initialRoster,
  initialEvents,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [roster, setRoster] = useState<RosterEntry[]>(initialRoster);
  const [editingRoster, setEditingRoster] = useState(initialRoster.length === 0);

  const [events, setEvents] = useState<StatsEvent[]>(initialEvents);
  const [ops, setOps] = useState<PendingOp[]>([]);
  const [quarter, setQuarter] = useState<Quarter>(1);
  const [extraMan, setExtraMan] = useState(false);
  const [selected, setSelected] = useState<RosterEntry | null>(null);
  const [shotSubtype, setShotSubtype] = useState<ShotSubtype | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [locked, setLocked] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const flushing = useRef(false);
  const opsRef = useRef<PendingOp[]>([]);

  // ---------- オフラインキュー ----------

  useEffect(() => {
    // 初回: 前回セッションの未同期分を復元
    const restored = loadOps(matchId);
    if (restored.length > 0) {
      setOps(restored);
      setEvents((prev) => {
        const known = new Set(prev.map((e) => e.id));
        const restoredInserts = restored
          .filter((o): o is Extract<PendingOp, { kind: "insert" }> => o.kind === "insert")
          .map((o) => o.event)
          .filter((e) => !known.has(e.id));
        return [...prev, ...restoredInserts];
      });
    }
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [matchId]);

  useEffect(() => {
    opsRef.current = ops;
    try {
      localStorage.setItem(opsKey(matchId), JSON.stringify(ops));
    } catch {
      // localStorage不可でもメモリキューで動作継続
    }
  }, [ops, matchId]);

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    const snapshot = opsRef.current;
    if (snapshot.length === 0) return;
    flushing.current = true;
    try {
      const inserts = snapshot
        .filter((o): o is Extract<PendingOp, { kind: "insert" }> => o.kind === "insert")
        .map((o) => ({ ...o.event, team_id: teamId }));
      const deletes = snapshot
        .filter((o): o is Extract<PendingOp, { kind: "delete" }> => o.kind === "delete")
        .map((o) => o.id);

      if (inserts.length > 0) {
        // idはクライアント生成UUID。再送してもonConflictで冪等
        const { error } = await supabase
          .from("stats_events")
          .upsert(inserts, { onConflict: "id", ignoreDuplicates: true });
        if (error) throw error;
      }
      if (deletes.length > 0) {
        const { error } = await supabase
          .from("stats_events")
          .delete()
          .in("id", deletes);
        if (error) throw error;
      }
      setOps((prev) => prev.filter((o) => !snapshot.includes(o)));
      // 直後に同期状態を参照する処理(試合終了)のためrefも即時更新する
      opsRef.current = opsRef.current.filter((o) => !snapshot.includes(o));
    } catch {
      // オフライン/一時エラー: キューに残して次回再試行
    } finally {
      flushing.current = false;
    }
  }, [supabase, teamId]);

  useEffect(() => {
    const timer = setInterval(flush, 4000);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", flush);
    };
  }, [flush]);

  // ---------- イベント記録 ----------

  const feedback = useCallback((message: string) => {
    try {
      navigator.vibrate?.(15);
    } catch {
      // 非対応端末は無視
    }
    setFlash(message);
    setTimeout(() => setFlash(null), 900);
  }, []);

  const record = useCallback(
    (
      partial: Pick<StatsEvent, "type"> &
        Partial<Pick<StatsEvent, "player_id" | "subtype" | "result" | "is_extra_man">>
    ) => {
      if (locked) return;
      setLocked(true);
      setTimeout(() => setLocked(false), 300);

      const event: StatsEvent = {
        id: crypto.randomUUID(),
        match_id: matchId,
        quarter,
        player_id: partial.player_id ?? null,
        type: partial.type,
        subtype: partial.subtype ?? null,
        result: partial.result ?? null,
        is_extra_man: partial.is_extra_man ?? false,
      };
      setEvents((prev) => [...prev, event]);
      setOps((prev) => [...prev, { kind: "insert", event }]);

      // E状態の自動制御: 誘発でON、自チーム得点でOFF
      if (event.type === "drawn_exclusion" && event.subtype === "exclusion") {
        setExtraMan(true);
      }
      if (event.type === "shot" && event.result === "goal") {
        setExtraMan(false);
      }

      feedback(describeEvent(event, nameOf));
      setSelected(null);
      setShotSubtype(null);
      setTimeout(flush, 50);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, matchId, quarter, feedback, flush]
  );

  const removeEvent = useCallback(
    (id: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setOps((prev) => {
        const pendingInsert = prev.find(
          (o) => o.kind === "insert" && o.event.id === id
        );
        if (pendingInsert) {
          // まだ同期していない → キューから取り下げるだけ
          return prev.filter((o) => o !== pendingInsert);
        }
        return [...prev, { kind: "delete", id }];
      });
      setTimeout(flush, 50);
    },
    [flush]
  );

  const undo = useCallback(() => {
    const last = events[events.length - 1];
    if (last) removeEvent(last.id);
  }, [events, removeEvent]);

  // 試合終了: 未同期分を送ってから、スコアと勝敗を試合情報に反映する。
  // 動画は後日でよい(このボタンで当日の記録作業は完結する)
  const [finishing, setFinishing] = useState(false);
  const finishMatch = useCallback(async () => {
    let forGoals = 0;
    let against = 0;
    for (const e of events) {
      if (e.type === "shot" && e.result === "goal") forGoals += 1;
      if (e.type === "gk_faced" && e.result === "goal_against") against += 1;
      if (e.type === "opponent_goal") against += 1;
    }
    if (
      !window.confirm(
        `試合終了として ${forGoals} - ${against} を試合情報に反映します。よろしいですか?`
      )
    ) {
      return;
    }
    setFinishing(true);
    try {
      // 進行中のflushと競合しても取りこぼさないよう数回試す
      for (let i = 0; i < 3 && opsRef.current.length > 0; i++) {
        await flush();
        if (opsRef.current.length > 0) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }
      if (opsRef.current.length > 0) {
        window.alert(
          "未同期の記録があります。電波のある場所でこの画面を開き直してから、もう一度お試しください(記録は端末に保存されています)。"
        );
        return;
      }
      const result =
        forGoals > against ? "win" : forGoals < against ? "lose" : "draw";
      const { error } = await supabase
        .from("matches")
        .update({ score_for: forGoals, score_against: against, result })
        .eq("id", matchId);
      if (error) throw error;
      router.push(`/matches/${matchId}/scoresheet`);
    } catch {
      window.alert(
        "スコアを反映できませんでした(オフラインの可能性があります)。あとで試合詳細の「編集」からも設定できます。"
      );
    } finally {
      setFinishing(false);
    }
  }, [events, flush, supabase, matchId, router]);

  // ---------- 派生値 ----------

  const nameOf = useCallback(
    (userId: string | null) => {
      if (!userId) return "チーム";
      const r = roster.find((x) => x.user_id === userId);
      return r ? `#${r.cap_number} ${r.name}` : "不明";
    },
    [roster]
  );

  const score = useMemo(() => {
    let forGoals = 0;
    let against = 0;
    for (const e of events) {
      if (e.type === "shot" && e.result === "goal") forGoals += 1;
      if (e.type === "gk_faced" && e.result === "goal_against") against += 1;
      if (e.type === "opponent_goal") against += 1;
    }
    return { for: forGoals, against };
  }, [events]);

  const pendingCount = ops.length;
  const recent = events.slice(-3).reverse();
  const fieldPlayers = roster.filter((r) => !r.is_gk);
  const gks = roster.filter((r) => r.is_gk);

  // ---------- 出場メンバー編集 ----------

  if (editingRoster) {
    return (
      <RosterEditor
        matchId={matchId}
        teamId={teamId}
        members={members}
        initial={roster}
        onSaved={(saved) => {
          setRoster(saved);
          setEditingRoster(false);
        }}
      />
    );
  }

  // ---------- メイン画面 ----------

  return (
    <div className="space-y-3 pb-40">
      {/* ヘッダー: ピリオド / スコア / E */}
      <div className="sticky top-[49px] z-10 -mx-4 space-y-2 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center justify-between">
          <p className="truncate text-xs text-slate-500">{matchTitle}</p>
          <span
            data-testid="sync-indicator"
            className={clsx(
              "rounded-full px-2 py-0.5 text-[10px]",
              pendingCount > 0
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700"
            )}
          >
            {pendingCount > 0
              ? `未同期 ${pendingCount}件${online ? "" : " (オフライン)"}`
              : "同期済み"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-1 rounded-lg bg-slate-100 p-0.5">
            {QUARTERS.map((q) => (
              <button
                key={q}
                onClick={() => setQuarter(q)}
                className={clsx(
                  "min-h-11 flex-1 rounded-md text-sm font-semibold",
                  quarter === q ? "bg-brand-600 text-white" : "text-slate-600"
                )}
              >
                {QUARTER_LABELS[q]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-2xl font-bold" data-testid="score">
            {score.for} <span className="text-slate-400">-</span> {score.against}
          </p>
          <button
            onClick={() => setExtraMan((v) => !v)}
            data-testid="extra-toggle"
            className={clsx(
              "min-h-11 rounded-lg px-4 text-sm font-bold",
              extraMan
                ? "bg-amber-500 text-white"
                : "border border-slate-300 text-slate-400"
            )}
          >
            E {extraMan ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      {flash && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✓ {flash}
        </div>
      )}

      {/* 選手グリッド */}
      <div className="grid grid-cols-4 gap-2">
        {fieldPlayers.map((r) => (
          <button
            key={r.user_id}
            onClick={() => {
              setSelected(r);
              setShotSubtype(null);
            }}
            className={clsx(
              "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 font-bold",
              selected?.user_id === r.user_id
                ? "border-brand-600 bg-brand-50"
                : "border-slate-200 bg-white"
            )}
          >
            <span className="text-xl">{r.cap_number}</span>
            <span className="max-w-full truncate px-1 text-[10px] font-normal text-slate-500">
              {r.name}
            </span>
          </button>
        ))}
        {gks.map((r) => (
          <button
            key={r.user_id}
            onClick={() => {
              setSelected(r);
              setShotSubtype(null);
            }}
            className={clsx(
              "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 font-bold",
              selected?.user_id === r.user_id
                ? "border-emerald-600 bg-emerald-50"
                : "border-emerald-300 bg-emerald-50/50"
            )}
          >
            <span className="text-xl text-emerald-700">{r.cap_number}</span>
            <span className="max-w-full truncate px-1 text-[10px] font-normal text-emerald-600">
              GK {r.name}
            </span>
          </button>
        ))}
      </div>

      {/* チームイベント */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => record({ type: "attack_end_no_shot" })}
          className="min-h-11 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700"
        >
          攻撃終了(シュートなし)
        </button>
        <button
          onClick={() => record({ type: "opponent_goal" })}
          className="min-h-11 rounded-lg border border-red-200 bg-red-50 text-sm font-semibold text-red-700"
        >
          相手得点
        </button>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={() => setEditingRoster(true)}
          className="text-xs text-slate-400 underline"
        >
          出場メンバーを変更
        </button>
        <button
          onClick={() => setShowLog(true)}
          className="text-xs text-brand-600 underline"
        >
          イベントログ({events.length})
        </button>
      </div>

      {/* 試合終了: スコア・勝敗を試合情報に反映(動画は後日でOK) */}
      <button
        onClick={finishMatch}
        disabled={finishing}
        data-testid="finish-match"
        className="min-h-11 w-full rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 disabled:opacity-50"
      >
        {finishing ? "反映中..." : "🏁 試合終了(スコアを試合情報に反映)"}
      </button>

      {/* アクションパネル(選手選択時) */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-2xl rounded-t-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-bold">
              #{selected.cap_number} {selected.name}
              {selected.is_gk && (
                <span className="ml-1 text-sm text-emerald-600">GK</span>
              )}
            </span>
            <button
              onClick={() => {
                setSelected(null);
                setShotSubtype(null);
              }}
              className="min-h-11 px-3 text-slate-400"
            >
              ✕ 閉じる
            </button>
          </div>

          {selected.is_gk ? (
            // GK: 2タップ(選手→結果)
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(GK_RESULT_LABELS) as GkResult[]).map((res) => (
                <button
                  key={res}
                  onClick={() =>
                    record({
                      type: "gk_faced",
                      player_id: selected.user_id,
                      result: res,
                    })
                  }
                  className={clsx(
                    "min-h-14 rounded-lg text-sm font-bold",
                    res === "goal_against" && "bg-red-100 text-red-700",
                    res === "block" && "bg-emerald-100 text-emerald-700",
                    res === "off_target" && "bg-slate-100 text-slate-700"
                  )}
                >
                  {GK_RESULT_LABELS[res]}
                </button>
              ))}
            </div>
          ) : shotSubtype ? (
            // シュート結果: 3タップ目
            <div>
              <p className="mb-2 text-sm text-slate-500">
                {SHOT_SUBTYPE_LABELS[shotSubtype]}シュートの結果
                {extraMan && <span className="ml-1 font-bold text-amber-600">(E)</span>}
              </p>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(SHOT_RESULT_LABELS) as ShotResult[]).map((res) => (
                  <button
                    key={res}
                    onClick={() =>
                      record({
                        type: "shot",
                        player_id: selected.user_id,
                        subtype: shotSubtype,
                        result: res,
                        is_extra_man: extraMan,
                      })
                    }
                    className={clsx(
                      "min-h-14 rounded-lg text-lg font-bold",
                      res === "goal" && "bg-emerald-500 text-white",
                      res === "miss" && "bg-slate-200 text-slate-700",
                      res === "blocked" && "bg-amber-100 text-amber-700"
                    )}
                  >
                    {SHOT_RESULT_LABELS[res]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setShotSubtype(null)}
                className="mt-2 text-xs text-slate-400 underline"
              >
                ← 種別を選び直す
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* シュート種別: 2タップ目(直接表示で計3タップを守る) */}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-500">
                  シュート{extraMan && <span className="ml-1 text-amber-600">(E中)</span>}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(SHOT_SUBTYPE_LABELS) as ShotSubtype[]).map((st) => (
                    <button
                      key={st}
                      onClick={() => setShotSubtype(st)}
                      className="min-h-12 rounded-lg bg-brand-50 text-sm font-semibold text-brand-700"
                    >
                      {SHOT_SUBTYPE_LABELS[st]}
                    </button>
                  ))}
                </div>
              </div>
              {/* 1タップ確定アクション: 計2タップ */}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-500">アクション</p>
                <div className="grid grid-cols-3 gap-2">
                  {FIELD_ACTIONS.map((a) => (
                    <button
                      key={a.label}
                      onClick={() =>
                        record({
                          type: a.type,
                          player_id: selected.user_id,
                          subtype: a.subtype,
                        })
                      }
                      className="min-h-12 rounded-lg bg-slate-100 text-sm font-semibold text-slate-700"
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 直近イベント + Undo(選手パネル非表示時) */}
      {!selected && (
        <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-2xl border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur">
          <div className="flex items-start justify-between gap-2">
            <ul className="min-w-0 flex-1 space-y-0.5 text-xs text-slate-600">
              {recent.length === 0 && (
                <li className="text-slate-400">選手をタップして記録を開始</li>
              )}
              {recent.map((e) => (
                <li key={e.id} className="truncate">
                  <span className="mr-1 rounded bg-slate-100 px-1">
                    {QUARTER_LABELS[e.quarter]}
                  </span>
                  {describeEvent(e, nameOf)}
                </li>
              ))}
            </ul>
            <button
              onClick={undo}
              disabled={events.length === 0}
              className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 disabled:opacity-40"
            >
              ↩ 元に戻す
            </button>
          </div>
        </div>
      )}

      {/* イベントログモーダル */}
      {showLog && (
        <div className="fixed inset-0 z-30 flex flex-col bg-white">
          <div className="flex items-center justify-between border-b border-slate-200 p-4">
            <h2 className="font-bold">イベントログ({events.length}件)</h2>
            <button
              onClick={() => setShowLog(false)}
              className="min-h-11 px-3 text-slate-400"
            >
              ✕ 閉じる
            </button>
          </div>
          <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto p-4">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  <span className="mr-1 rounded bg-slate-100 px-1 text-xs">
                    {QUARTER_LABELS[e.quarter]}
                  </span>
                  {describeEvent(e, nameOf)}
                </span>
                <button
                  onClick={() => removeEvent(e.id)}
                  className="min-h-10 shrink-0 rounded px-2 text-xs text-red-600"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- 出場メンバー編集 ----------

function RosterEditor({
  matchId,
  teamId,
  members,
  initial,
  onSaved,
}: {
  matchId: string;
  teamId: string;
  members: Member[];
  initial: RosterEntry[];
  onSaved: (roster: RosterEntry[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [entries, setEntries] = useState<Map<string, { cap: number; isGk: boolean }>>(
    () =>
      new Map(
        initial.map((r) => [r.user_id, { cap: r.cap_number, isGk: r.is_gk }])
      )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextCap = () => {
    const used = new Set([...entries.values()].map((e) => e.cap));
    for (let n = 1; n <= 99; n++) if (!used.has(n)) return n;
    return 99;
  };

  const toggle = (userId: string) => {
    setEntries((prev) => {
      const next = new Map(prev);
      if (next.has(userId)) next.delete(userId);
      else next.set(userId, { cap: nextCap(), isGk: false });
      return next;
    });
  };

  const update = (userId: string, patch: Partial<{ cap: number; isGk: boolean }>) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const cur = next.get(userId);
      if (cur) next.set(userId, { ...cur, ...patch });
      return next;
    });
  };

  const save = async () => {
    setError(null);
    if (entries.size === 0) {
      setError("出場メンバーを1人以上選択してください");
      return;
    }
    const caps = [...entries.values()].map((e) => e.cap);
    if (new Set(caps).size !== caps.length) {
      setError("帽子番号が重複しています");
      return;
    }
    setSaving(true);
    try {
      // 入れ替え: 既存を消してから登録(メンバー変更に対応)
      const { error: delError } = await supabase
        .from("match_rosters")
        .delete()
        .eq("match_id", matchId);
      if (delError) throw delError;
      const rows = [...entries.entries()].map(([user_id, e]) => ({
        match_id: matchId,
        team_id: teamId,
        user_id,
        cap_number: e.cap,
        is_gk: e.isGk,
      }));
      const { error: insError } = await supabase.from("match_rosters").insert(rows);
      if (insError) throw insError;
      onSaved(
        rows
          .map((r) => ({
            user_id: r.user_id,
            name: members.find((m) => m.user_id === r.user_id)?.name ?? "不明",
            cap_number: r.cap_number,
            is_gk: r.is_gk,
          }))
          .sort((a, b) => a.cap_number - b.cap_number)
      );
    } catch (e) {
      setError(
        `保存に失敗しました(通信環境を確認してください): ${e instanceof Error ? e.message : ""}`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 pb-24">
      <h2 className="font-bold">出場メンバーを選択</h2>
      <p className="text-xs text-slate-500">
        タップで選択し、帽子番号とGKを設定してください(通常13人+GK)。
      </p>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {members.map((m) => {
          const entry = entries.get(m.user_id);
          return (
            <li key={m.user_id} className="flex items-center gap-2 p-3">
              <button
                onClick={() => toggle(m.user_id)}
                className={clsx(
                  "min-h-11 flex-1 rounded-lg px-3 text-left text-sm font-semibold",
                  entry ? "bg-brand-50 text-brand-700" : "text-slate-500"
                )}
              >
                {entry ? "✓ " : ""}
                {m.name}
              </button>
              {entry && (
                <>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={entry.cap}
                    onChange={(e) =>
                      update(m.user_id, { cap: Number(e.target.value) })
                    }
                    className="w-16 rounded-lg border border-slate-300 px-2 py-2 text-center text-sm"
                    aria-label={`${m.name}の帽子番号`}
                  />
                  <button
                    onClick={() => update(m.user_id, { isGk: !entry.isGk })}
                    className={clsx(
                      "min-h-11 rounded-lg px-3 text-xs font-bold",
                      entry.isGk
                        ? "bg-emerald-500 text-white"
                        : "border border-slate-300 text-slate-400"
                    )}
                  >
                    GK
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <button
        onClick={save}
        disabled={saving}
        className="fixed inset-x-4 bottom-16 z-20 mx-auto min-h-12 max-w-2xl rounded-lg bg-brand-600 font-semibold text-white disabled:opacity-50"
      >
        {saving ? "保存中..." : `この${entries.size}人で開始`}
      </button>
    </div>
  );
}
