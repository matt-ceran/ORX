import { resolve } from "node:path";

export function resolveToolPath(path: string, cwd: string = process.cwd()): string {
  return resolve(cwd, path);
}

export function errorFromUnknown(error: unknown, fallbackCode = "ERROR", path?: string) {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : fallbackCode;
    return {
      code,
      message: error.message,
      path,
    };
  }

  return {
    code: fallbackCode,
    message: String(error),
    path,
  };
}
