#!/usr/bin/env node
// /review8 PASS 시 실행. 현재 working-tree 상태의 해시를
// .claude/.review8-hash 에 기록해 commit 게이트가 허용하도록 한다.

import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

function sh(cmd, cwd) {
  return execSync(cmd, { encoding: "utf-8", cwd, stdio: ["ignore", "pipe", "pipe"] });
}

try {
  const repoRoot = sh("git rev-parse --show-toplevel").trim();
  const head = sh("git rev-parse HEAD", repoRoot).trim();
  const status = sh("git status --porcelain -z", repoRoot);
  const diffTracked = sh("git diff HEAD", repoRoot);
  // untracked files 내용은 실질적으로 status --porcelain 으로 감지 (파일명 변경) + diff HEAD (수정된 파일)
  const hash = createHash("sha256")
    .update(`${head}\n${status}\n${diffTracked}`)
    .digest("hex");

  const markFile = join(repoRoot, ".claude", ".review8-hash");
  mkdirSync(dirname(markFile), { recursive: true });
  writeFileSync(markFile, `${hash}\n`);
  process.stdout.write(`[review8-mark] PASS 기록됨 — ${hash.slice(0, 12)}\n`);
} catch (e) {
  process.stderr.write(`[review8-mark] 실패: ${e?.message ?? e}\n`);
  process.exit(1);
}
