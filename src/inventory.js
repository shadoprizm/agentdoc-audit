export const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", ".next", ".venv", "venv", "coverage", ".vercel", ".cache"]);

export function includePath(path) {
  const parts = path.split("/");
  if (parts.some((part) => IGNORED_DIRECTORIES.has(part))) return false;
  const name = parts.at(-1);
  if (/^\.env(?:$|\.)/.test(name) && name !== ".env.example") return false;
  return !/\.(?:pem|key|p12|pfx)$/i.test(name);
}

export function needsContent(path) {
  return /(^|\/)(?:package\.json|Makefile|\.env\.example)$/.test(path);
}
