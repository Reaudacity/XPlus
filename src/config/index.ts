import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import { XPlusConfig } from "../types";

const DEFAULTS: XPlusConfig = {
  name: "X+ Application",
  description: "Built with X+",
  router: {
    directory: "app",
  },
  components: {
    directory: "components",
  },
  plugins: [],
  middleware: [],
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
    directory: "i18n",
  },
};

export function loadConfig(configPath: string): XPlusConfig {
  const resolved = path.resolve(process.cwd(), configPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, "utf-8");
  const parsed = yaml.load(raw) as Partial<XPlusConfig>;

  return {
    ...DEFAULTS,
    ...parsed,
    router: {
      ...DEFAULTS.router,
      ...(parsed?.router ?? {}),
    },
    components: {
      ...DEFAULTS.components,
      ...(parsed?.components ?? {}),
    },
    plugins: parsed?.plugins ?? [],
    middleware: parsed?.middleware ?? [],
    i18n: {
      ...DEFAULTS.i18n,
      ...(parsed?.i18n ?? {}),
    },
  };
}

export function findConfig(startDir = process.cwd()): string | null {
  const candidates = ["xplus.yml", "xplus.yaml"];
  for (const name of candidates) {
    const p = path.join(startDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
