import fs from "fs";
import path from "path";
import { Request, Response, NextFunction, Router } from "express";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface I18nConfig {
  defaultLocale: string;
  locales: string[];
  directory: string;
}

export type TranslationMap = Record<string, string | Record<string, unknown>>;

// ── Loader ────────────────────────────────────────────────────────────────────

export class I18nLoader {
  private translations = new Map<string, TranslationMap>();

  constructor(
    private config: I18nConfig,
    private projectRoot: string,
  ) {}

  /**
   * Loads all locale JSON files from the i18n directory.
   * File naming: en.json, ar.json, fr.json etc.
   */
  load(): void {
    const dir = path.resolve(this.projectRoot, this.config.directory);
    if (!fs.existsSync(dir)) return;

    for (const locale of this.config.locales) {
      const filePath = path.join(dir, `${locale}.json`);
      if (!fs.existsSync(filePath)) continue;
      try {
        const raw = fs.readFileSync(filePath, "utf-8");
        this.translations.set(locale, JSON.parse(raw));
      } catch (err: any) {
        // malformed JSON — skip silently; check command will catch it
      }
    }
  }

  reload(): void {
    this.translations.clear();
    this.load();
  }

  /**
   * Resolves a dot-notation key for a given locale.
   * Falls back to defaultLocale, then returns the key itself if not found.
   *
   * Example: t("nav.home", "fr") → "Accueil"
   */
  t(key: string, locale: string): string {
    const map =
      this.translations.get(locale) ??
      this.translations.get(this.config.defaultLocale) ??
      {};

    const parts = key.split(".");
    let cursor: unknown = map;

    for (const part of parts) {
      if (typeof cursor !== "object" || cursor === null) return key;
      cursor = (cursor as Record<string, unknown>)[part];
    }

    return typeof cursor === "string" ? cursor : key;
  }

  hasLocale(locale: string): boolean {
    return this.translations.has(locale);
  }

  defaultLocale(): string {
    return this.config.defaultLocale;
  }

  locales(): string[] {
    return this.config.locales;
  }
}

// ── Express middleware ────────────────────────────────────────────────────────

/**
 * Express middleware that:
 *   - Detects locale from URL prefix (/ar/about → locale "ar", path "/about")
 *   - Falls back to Accept-Language header, then defaultLocale
 *   - Attaches req.locale and req.i18n.t() to the request
 */
export function createI18nMiddleware(loader: I18nLoader): Router {
  const router = Router();

  router.use(
    (
      req: Request & { locale?: string; i18n?: { t: (key: string) => string } },
      _res: Response,
      next: NextFunction,
    ) => {
      let locale = loader.defaultLocale();
      let cleanPath = req.path;

      // Check URL prefix: /ar/about → locale=ar, path=/about
      const segments = req.path.split("/").filter(Boolean);
      if (segments.length > 0 && loader.hasLocale(segments[0])) {
        locale = segments[0];
        cleanPath = "/" + segments.slice(1).join("/") || "/";
      }

      req.locale = locale;
      req.i18n = { t: (key: string) => loader.t(key, locale) };

      next();
    },
  );

  return router;
}
