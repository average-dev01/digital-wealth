/**
 * Generates the non-English message catalogues with DeepL.
 *
 *   pnpm --filter frontend translate          # every locale
 *   pnpm --filter frontend translate ar       # just one
 *
 * This runs on demand, never at request time — the app only ever reads the
 * JSON this produces, so live traffic costs nothing and doesn't depend on
 * DeepL being reachable.
 *
 * Two properties make it safe to re-run:
 *   - Only keys whose English text changed are sent, so a re-run after editing
 *     one sentence costs a few characters rather than the whole site.
 *   - Anything in `<locale>.overrides.json` is never overwritten, so a human
 *     correction to a risk disclaimer survives future runs.
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = path.join(__dirname, "..", "messages");

/** DeepL target codes. English is the source and is never generated. */
const TARGETS: Record<string, string> = { ar: "AR", fr: "FR", es: "ES" };

const DEEPL_URL_FREE = "https://api-free.deepl.com/v2/translate";
const DEEPL_URL_PRO = "https://api.deepl.com/v2/translate";

/** DeepL caps a request; keep batches well under it. */
const BATCH_SIZE = 50;

type Flat = Record<string, string>;
type Nested = { [key: string]: string | Nested };

function flatten(obj: Nested, prefix = ""): Flat {
  const out: Flat = {};
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[full] = value;
    else Object.assign(out, flatten(value, full));
  }
  return out;
}

/** Rebuilds nesting from dotted keys, following `shape` so key order matches en.json. */
function unflatten(flat: Flat, shape: Nested): Nested {
  const out: Nested = {};
  for (const [key, value] of Object.entries(shape)) {
    if (typeof value === "string") {
      const translated = flat[key];
      if (translated !== undefined) out[key] = translated;
    } else {
      const nested = unflatten(prefixed(flat, key), value);
      if (Object.keys(nested).length > 0) out[key] = nested;
    }
  }
  return out;
}

function prefixed(flat: Flat, prefix: string): Flat {
  const out: Flat = {};
  const head = `${prefix}.`;
  for (const [key, value] of Object.entries(flat)) {
    if (key.startsWith(head)) out[key.slice(head.length)] = value;
  }
  return out;
}

async function readJson(file: string): Promise<Nested> {
  if (!existsSync(file)) return {};
  const raw = await readFile(file, "utf8");
  return raw.trim() ? (JSON.parse(raw) as Nested) : {};
}

/**
 * ICU placeholders (`{amount}`) and rich-text tags (`<b>…</b>`) must come back
 * untouched. Wrapping them in <x> and enabling xml tag handling tells DeepL to
 * carry them through verbatim instead of translating or reordering them away.
 */
const PLACEHOLDER = /(\{[^}]+\}|<\/?[a-zA-Z][^>]*>)/g;

function protect(text: string): string {
  return text.replace(PLACEHOLDER, (match) => `<x>${match}</x>`);
}

function unprotect(text: string): string {
  return text.replace(/<x>(.*?)<\/x>/g, "$1");
}

async function translateBatch(texts: string[], target: string, key: string): Promise<string[]> {
  const url = key.endsWith(":fx") ? DEEPL_URL_FREE : DEEPL_URL_PRO;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: texts.map(protect),
      source_lang: "EN",
      target_lang: target,
      tag_handling: "xml",
      ignore_tags: ["x"],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`DeepL ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);
  }

  const data = (await res.json()) as { translations: { text: string }[] };
  return data.translations.map((t) => unprotect(t.text));
}

async function run(): Promise<void> {
  const key = process.env["DEEPL_API_KEY"];
  if (!key) {
    console.error(
      "DEEPL_API_KEY is not set.\n" +
        "Add it to frontend/.env — see frontend/.env.example. Free keys end in ':fx'.",
    );
    process.exit(1);
  }

  const requested = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const locales = requested.length > 0 ? requested : Object.keys(TARGETS);

  const source = await readJson(path.join(MESSAGES_DIR, "en.json"));
  const sourceFlat = flatten(source);
  const totalKeys = Object.keys(sourceFlat).length;

  for (const locale of locales) {
    const target = TARGETS[locale];
    if (!target) {
      console.error(`Unknown locale "${locale}". Known: ${Object.keys(TARGETS).join(", ")}`);
      process.exitCode = 1;
      continue;
    }

    const file = path.join(MESSAGES_DIR, `${locale}.json`);
    const existing = flatten(await readJson(file));
    const overrides = flatten(await readJson(path.join(MESSAGES_DIR, `${locale}.overrides.json`)));

    // A key is re-sent only when English changed since the last run. The
    // previous English is tracked alongside the translation.
    const previousSource = flatten(
      await readJson(path.join(MESSAGES_DIR, `.${locale}.source.json`)),
    );

    const stale = Object.keys(sourceFlat).filter(
      (k) =>
        overrides[k] === undefined &&
        (existing[k] === undefined || previousSource[k] !== sourceFlat[k]),
    );

    if (stale.length === 0) {
      console.log(
        `${locale}: up to date (${totalKeys} keys, ${Object.keys(overrides).length} overridden)`,
      );
      continue;
    }

    const chars = stale.reduce((n, k) => n + (sourceFlat[k]?.length ?? 0), 0);
    console.log(`${locale}: translating ${stale.length}/${totalKeys} keys (${chars} chars)…`);

    const translated: Flat = { ...existing };
    for (let i = 0; i < stale.length; i += BATCH_SIZE) {
      const batch = stale.slice(i, i + BATCH_SIZE);
      const results = await translateBatch(
        batch.map((k) => sourceFlat[k]!),
        target,
        key,
      );
      batch.forEach((k, index) => {
        translated[k] = results[index]!;
      });
    }

    // Overrides win over anything DeepL produced.
    Object.assign(translated, overrides);

    await writeFile(file, JSON.stringify(unflatten(translated, source), null, 2) + "\n", "utf8");
    // Snapshot the English that produced this file, so the next run can diff.
    await writeFile(
      path.join(MESSAGES_DIR, `.${locale}.source.json`),
      JSON.stringify(unflatten(sourceFlat, source), null, 2) + "\n",
      "utf8",
    );

    console.log(`${locale}: wrote ${path.relative(process.cwd(), file)}`);
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
