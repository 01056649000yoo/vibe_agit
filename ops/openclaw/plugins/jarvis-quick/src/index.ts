import { execFile } from "node:child_process";
import { Type } from "typebox";
import { defineToolPlugin } from "openclaw/plugin-sdk/tool-plugin";
import { textResult } from "openclaw/plugin-sdk/tool-results";

// 텔레그램 슬래시 명령(/task, /memo, /cal, /proj, /done, /pdf)을 모델을 거치지 않고 곧바로 자비스 통합 명령에 넘긴다.
// 스킬 머리말의 `command-dispatch: tool` + `command-tool: jarvis_quick` 이 이 도구를 부른다(2026-10-13).
// 실행은 고정된 스크립트 하나뿐이고, 셸을 거치지 않으며(execFile), 명령 이름은 아래 목록만 받는다.
const PYTHON = "/usr/bin/python3";
const JARVIS = "/Users/seunghyeonmaegmini/Jarvis_Brain_Local/scripts/jarvis.py";
const KINDS = new Set(["task", "done", "memo", "proj", "cal", "pdf"]);

function runJarvis(kind: string, raw: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      PYTHON,
      ["-B", JARVIS, "quick", kind, raw],
      { timeout: 110_000, maxBuffer: 1024 * 1024, signal, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } },
      (error, stdout, stderr) => {
        const out = String(stdout || "").trim();
        if (out) return resolve(out);
        const err = String(stderr || "").trim().split("\n").filter(Boolean).slice(-1)[0];
        resolve(error ? `실행하지 못했습니다: ${err || error.message}`.slice(0, 300) : "결과가 없습니다.");
      },
    );
  });
}

export default defineToolPlugin({
  id: "jarvis-quick",
  name: "Jarvis Quick",
  description: "Run the Jarvis unified command from Telegram slash commands without a model turn.",
  tools: (tool) => [
    tool({
      name: "jarvis_quick",
      label: "Jarvis Quick",
      description: "Run a Jarvis quick command (task, done, memo, proj, cal, pdf) from its raw slash-command text.",
      parameters: Type.Object({
        command: Type.String({ description: "Raw text after the slash command." }),
        commandName: Type.String({ description: "Slash command name: task, done, memo, proj, cal or pdf." }),
        skillName: Type.Optional(Type.String({ description: "Skill that declared the command." })),
      }),
      async execute({ command, commandName }, _config, context) {
        const kind = String(commandName || "").replace(/^\//, "").trim().toLowerCase();
        if (!KINDS.has(kind)) return textResult(`알 수 없는 명령입니다: ${commandName}`, { ok: false });
        const text = await runJarvis(kind, String(command ?? ""), context?.signal);
        return textResult(text, { kind, text });
      },
    }),
  ],
});
