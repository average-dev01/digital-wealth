"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, KeyRound } from "lucide-react";

import { submitAccountKeyword } from "@/lib/api/accountKeyword";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/useAuth";
import { useDateTimeFormat } from "@/hooks/useDateTimeFormat";
import { cn } from "@/lib/utils";

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export default function AccountKeyword() {
  const t = useTranslations("accountKeyword");
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const dateFormat = useDateTimeFormat();
  const [value, setValue] = useState("");

  const mutation = useMutation({
    mutationFn: (keyword: string) => submitAccountKeyword(keyword),
    onSuccess: () => {
      toast.success(t("toast.success"));
      // The keyword rides on the session, so refreshing ["me"] flips the page
      // into its locked view.
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setValue("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("toast.error")),
  });

  const existing = profile?.account_keyword ?? null;
  const setAt = profile?.account_keyword_set_at ?? null;

  const wordCount = countWords(value);
  // 12 or 24 is the expected shape, but it is only an indication — submission
  // is never blocked on it (any non-empty value is accepted).
  const expectedLength = wordCount === 12 || wordCount === 24;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      {existing ? (
        <div className="surface-panel space-y-4 p-6">
          <div className="flex items-center gap-2 text-sm text-success">
            <KeyRound className="size-4" aria-hidden />
            <span>{t("lockedTitle")}</span>
          </div>
          <p className="num break-words rounded-lg border border-border bg-muted/40 p-4 text-sm">
            {existing}
          </p>
          {setAt && (
            <p className="text-xs text-muted-foreground">
              {t("setOn", { date: dateFormat.format(new Date(setAt)) })}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{t("lockedNote")}</p>
        </div>
      ) : (
        <form
          className="surface-panel space-y-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim() === "") return;
            mutation.mutate(value);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="account-keyword">{t("label")}</Label>
            <Textarea
              id="account-keyword"
              rows={4}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("placeholder")}
              className="num"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t("hint")}</p>
              <p
                className={cn(
                  "flex items-center gap-1 text-xs",
                  expectedLength ? "text-success" : "text-muted-foreground",
                )}
              >
                {expectedLength && <Check className="size-3" aria-hidden />}
                {t("wordCount", { count: wordCount })}
              </p>
            </div>
          </div>

          <Button type="submit" disabled={value.trim() === "" || mutation.isPending}>
            {mutation.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
