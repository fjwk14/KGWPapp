// 画面遷移直後、ページのデータ取得が終わるまで表示するスケルトン。
// これが無いと遷移中に画面が固まって見えるため、体感速度改善のために設置する。
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-5 w-32 rounded bg-slate-200" />
      <div className="h-24 rounded-xl bg-slate-100" />
      <div className="h-24 rounded-xl bg-slate-100" />
      <div className="h-24 rounded-xl bg-slate-100" />
    </div>
  );
}
