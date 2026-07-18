"use client";

import { useEffect, useRef } from "react";

// フォームの入力内容を端末(localStorage)に自動保存し、次に開いたとき
// 復元する。長い入力の途中で画面を離れても、戻れば続きから書ける。
// 使い方: 対象の <form> の中にこの部品を1つ置くだけ(storageKeyは一意に)。
//   <form action={...}><FormDraft storageKey="proposal-new" /> ...</form>
// 送信できたら下書きは消す。新規作成フォーム(初期値が空)向け。
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export default function FormDraft({ storageKey }: { storageKey: string }) {
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const form = anchorRef.current?.closest("form");
    if (!form) return;
    const key = `kgtv-draft-${storageKey}`;

    const fields = (): Field[] =>
      Array.from(form.elements).filter(
        (el): el is Field =>
          (el instanceof HTMLInputElement ||
            el instanceof HTMLTextAreaElement ||
            el instanceof HTMLSelectElement) &&
          Boolean(el.name) &&
          el.type !== "hidden" &&
          el.type !== "password" &&
          el.type !== "file" &&
          el.type !== "submit" &&
          el.type !== "button"
      );

    // ---- 復元 ----
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && typeof saved === "object") {
        for (const el of fields()) {
          const v = saved[el.name];
          if (v === undefined) continue;
          if (el instanceof HTMLInputElement && el.type === "checkbox") {
            if (typeof v === "boolean") el.checked = v;
          } else if (el instanceof HTMLInputElement && el.type === "radio") {
            el.checked = el.value === v;
          } else if (v !== "") {
            el.value = String(v);
          }
        }
      }
    } catch {
      // 壊れた下書きは無視して通常の空フォームで始める
    }

    // ---- 保存 / クリア ----
    const save = () => {
      const data: Record<string, string | boolean> = {};
      for (const el of fields()) {
        if (el instanceof HTMLInputElement && el.type === "checkbox") {
          data[el.name] = el.checked;
        } else if (el instanceof HTMLInputElement && el.type === "radio") {
          if (el.checked) data[el.name] = el.value;
        } else {
          data[el.name] = el.value;
        }
      }
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch {
        // 保存不可でも入力自体は続けられる
      }
    };
    const clear = () => {
      try {
        localStorage.removeItem(key);
      } catch {
        // 消せなくても支障はない
      }
    };

    form.addEventListener("input", save);
    form.addEventListener("change", save);
    form.addEventListener("submit", clear);
    return () => {
      form.removeEventListener("input", save);
      form.removeEventListener("change", save);
      form.removeEventListener("submit", clear);
    };
  }, [storageKey]);

  return <span ref={anchorRef} hidden aria-hidden />;
}
