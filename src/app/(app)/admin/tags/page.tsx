import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Select,
  TagBadge,
  TAG_TYPE_LABELS,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { TagTemplate } from "@/lib/types";
import { addTagTemplate, toggleTagTemplate } from "../actions";

export default async function TagTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { team, membership } = await requireMembership();
  if (!can.manageTagTemplates(membership.role)) redirect("/dashboard");

  const supabase = await createClient();
  const { data } = await supabase
    .from("tag_templates")
    .select("*")
    .eq("team_id", team.id)
    .order("tag_type")
    .order("sort_order");
  const templates = (data ?? []) as TagTemplate[];

  const grouped = templates.reduce<Record<string, TagTemplate[]>>((acc, t) => {
    (acc[t.tag_type] ??= []).push(t);
    return acc;
  }, {});

  return (
    <>
      <Link href="/admin" className="text-xs text-brand-600 underline">
        ← チーム管理
      </Link>
      <h1 className="text-lg font-bold">タグテンプレート管理</h1>
      <ErrorBanner message={error} />

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-600">タグを追加</h2>
        <form action={addTagTemplate} className="flex gap-2">
          <Select name="tag_type" className="w-32 shrink-0 text-sm" defaultValue="action">
            {Object.entries(TAG_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            name="tag_value"
            required
            maxLength={60}
            placeholder="新しいタグ名"
            className="flex-1 text-sm"
          />
          <Button type="submit" className="shrink-0">
            追加
          </Button>
        </form>
      </Card>

      {Object.entries(grouped).map(([tagType, items]) => (
        <Card key={tagType} className="space-y-2">
          <h2 className="text-sm font-semibold">
            <TagBadge tagType={tagType}>
              {TAG_TYPE_LABELS[tagType] ?? tagType}
            </TagBadge>
          </h2>
          <ul className="divide-y divide-slate-100">
            {items.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span className={t.is_active ? "" : "text-slate-400 line-through"}>
                  {t.tag_value}
                </span>
                <form action={toggleTagTemplate}>
                  <input type="hidden" name="template_id" value={t.id} />
                  <input type="hidden" name="is_active" value={String(t.is_active)} />
                  <button className="text-xs text-brand-600 underline">
                    {t.is_active ? "無効化" : "有効化"}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
