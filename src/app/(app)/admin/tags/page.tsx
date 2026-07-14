import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Button,
  Card,
  ErrorBanner,
  Input,
  Label,
  Select,
  TagBadge,
  TAG_TYPE_LABELS,
} from "@/components/ui";
import { requireMembership } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import type { TagTemplate } from "@/lib/types";
import { addTagTemplate, deleteTagTemplate, renameTagTemplate } from "../actions";

export default async function TagTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { team, membership } = await requireMembership();
  if (!can.manageTagTemplates(membership)) redirect("/dashboard");

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
        <form action={addTagTemplate} className="space-y-2">
          <div>
            <Label htmlFor="new_tag_type">種別</Label>
            <Select
              id="new_tag_type"
              name="tag_type"
              className="text-sm"
              defaultValue="action"
            >
              {Object.entries(TAG_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="new_tag_value">タグ名</Label>
            <Input
              id="new_tag_value"
              name="tag_value"
              required
              maxLength={60}
              placeholder="新しいタグ名"
              className="text-sm"
            />
          </div>
          <Button type="submit" className="w-full">
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
              <li key={t.id} className="flex items-center gap-2 py-2">
                {/* 名前変更: 入力欄+変更ボタン */}
                <form action={renameTagTemplate} className="flex flex-1 gap-2">
                  <input type="hidden" name="template_id" value={t.id} />
                  <Input
                    name="tag_value"
                    defaultValue={t.tag_value}
                    required
                    maxLength={60}
                    className="flex-1 text-sm"
                    aria-label="タグ名"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    className="min-h-10 shrink-0 px-3 text-xs"
                  >
                    変更
                  </Button>
                </form>
                {/* 削除 */}
                <form action={deleteTagTemplate}>
                  <input type="hidden" name="template_id" value={t.id} />
                  <Button
                    type="submit"
                    variant="danger"
                    className="min-h-10 shrink-0 px-3 text-xs"
                  >
                    削除
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </>
  );
}
