#!/usr/bin/env node
// PreToolUse 게이트: Bash 로 `git commit` 을 실행하려 할 때,
// 현재 working-tree 상태가 /review8 PASS 마커와 일치하는지 확인.
// 일치하지 않으면 tool 실행을 차단하고 Claude 에게 "/review8 먼저" 를 지시.
//
// 입력 (stdin JSON): { tool_name, tool_input: { command, ... }, ... }
// 출력: 차단 시 stdout 에 {"decision":"block","reason":"..."} — Claude 피드백용.

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

function sh(cmd, cwd) {
  return execSync(cmd, { encoding: "utf-8", cwd, stdio: ["ignore", "pipe", "pipe"] });
}

// `git commit` 을 포함하는지 감지. 복합 명령 (&&, ||, ;, |) 및 `git -C <path> commit` 고려.
// 따옴표 안의 문자열은 제외 — `echo "how to git commit"` 같은 케이스 오탐 방지.
function containsGitCommit(command) {
  if (typeof command !== "string" || command.length === 0) return false;
  const stripped = command
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
  const segments = stripped.split(/&&|\|\||;|\||\n/).map((s) => s.trim());
  return segments.some((seg) => {
    const words = seg.split(/\s+/);
    if (words[0] !== "git") return false;
    let i = 1;
    if (words[i] === "-C" && words[i + 1]) i += 2;
    return words[i] === "commit";
  });
}

function emitBlock(reason) {
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason,
      systemMessage: "🛑 review8 게이트: /review8 PASS 없이 커밋 시도 차단",
    })
  );
  process.exit(0);
}

(async () => {
  try {
    const raw = await readStdin();
    let evt = {};
    try {
      evt = JSON.parse(raw);
    } catch {
      process.exit(0);
    }

    if (evt.tool_name !== "Bash") process.exit(0);
    const command = evt.tool_input?.command ?? "";
    if (!containsGitCommit(command)) process.exit(0);

    // git 저장소 확인
    let repoRoot = "";
    try {
      repoRoot = sh("git rev-parse --show-toplevel").trim();
    } catch {
      process.exit(0); // git 저장소 아니면 게이트 미적용
    }

    const head = sh("git rev-parse HEAD", repoRoot).trim();
    const status = sh("git status --porcelain -z", repoRoot);
    const diffTracked = sh("git diff HEAD", repoRoot);
    const current = createHash("sha256")
      .update(`${head}\n${status}\n${diffTracked}`)
      .digest("hex");

    const markFile = join(repoRoot, ".claude", ".review8-hash");
    const mark = existsSync(markFile) ? readFileSync(markFile, "utf-8").trim() : "";

    if (mark === current) {
      // 통과 — /review8 가 현재 상태를 검증했음
      process.exit(0);
    }

    const reason = [
      "🚨 커밋 차단됨 — /review8 의무 검증이 필요합니다.",
      "",
      mark
        ? "현재 working-tree 상태가 마지막 /review8 PASS 시점과 다릅니다 (코드가 변경됨)."
        : "이 브랜치에서 아직 /review8 을 PASS 한 기록이 없습니다.",
      "",
      "✅ 해야 할 일:",
      "1. `/review8` 을 실행해 8인 병렬 검증 (보안·SEO·성능·UX·유지보수·품질·아키텍처·타입)",
      "2. CRITICAL/WARNING 이 있으면 모두 수정한 뒤 /review8 재실행",
      "3. PASS 표시가 기록된 뒤 다시 이 `git commit` 시도",
      "",
      "절차 파일: .claude/commands/review8.md",
      "게이트 우회 금지 — 편법 사용 시 MEMORY.md 규칙 위반.",
    ].join("\n");

    emitBlock(reason);
  } catch (e) {
    // 게이트 실행 오류는 fail-open — 개발 흐름 차단하지 않음
    process.stderr.write(`[review8-gate] warning: ${e?.message ?? e}\n`);
    process.exit(0);
  }
})();
