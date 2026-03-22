import path from "path";
import * as esbuild from "esbuild";

export interface BundleResult {
  code: string;
  warnings: string[];
}

/**
 * Bundles a client-side JS/TS entry file in-memory via esbuild.
 * Used by the dev server to inline scripts into HTML responses.
 */
export async function bundleScript(
  entryFile: string,
  projectRoot: string,
): Promise<BundleResult> {
  const resolved = path.resolve(projectRoot, entryFile);

  const result = await esbuild.build({
    entryPoints: [resolved],
    bundle: true,
    write: false, // in-memory only
    format: "iife", // safe for browsers, no module system needed
    platform: "browser",
    target: ["es2017"],
    minify: false,
    sourcemap: false,
  });

  return {
    code: result.outputFiles[0]?.text ?? "",
    warnings: result.warnings.map((w) => w.text),
  };
}

/**
 * Bundles a client-side entry file and writes the result to disk.
 * Used by `xplus build` — output goes to `.xp/packed/` then referenced
 * from the emitted HTML.
 */
export async function bundleScriptToFile(
  entryFile: string,
  outFile: string,
  projectRoot: string,
): Promise<void> {
  const resolved = path.resolve(projectRoot, entryFile);

  await esbuild.build({
    entryPoints: [resolved],
    outfile: outFile,
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2017"],
    minify: true,
  });
}
