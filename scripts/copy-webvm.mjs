import fs from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const src = path.join(repoRoot, "webvm-main", "build");
const dest = path.join(repoRoot, "public", "webvm");

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(src))) {
  throw new Error(
    `WebVM build output not found at ${src}. Run: cd webvm-main && npm run build`
  );
}

await fs.rm(dest, { recursive: true, force: true });
await fs.mkdir(path.dirname(dest), { recursive: true });
await fs.cp(src, dest, { recursive: true });

console.log(`Copied WebVM build to ${dest}`);


