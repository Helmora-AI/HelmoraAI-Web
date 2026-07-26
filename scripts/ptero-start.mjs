import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";

const env = panelEnvironment();
if (!existsSync("dist/index.html")) {
  runNpm(["ci", "--ignore-scripts"], env);
  runNpm(["run", "build"], env);
}
const app = spawn(process.execPath, ["scripts/serve.mjs"], { env, stdio: "inherit" });
app.once("exit", (code) => { process.exitCode = code ?? 0; });
process.once("SIGINT", () => app.kill("SIGTERM"));
process.once("SIGTERM", () => app.kill("SIGTERM"));

function runNpm(args, childEnv) {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error("npm_execpath is unavailable; start this script with `npm run ptero:start`.");
  const result = spawnSync(process.execPath, [cli, ...args], { env: childEnv, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function panelEnvironment() {
  const entries = Object.entries(process.env);
  entries.push(["HELMORA_WEB_HOST", process.env.HELMORA_WEB_HOST || "0.0.0.0"]);
  const port = process.env.HELMORA_WEB_PORT || process.env.SERVER_PORT || process.env.PORT;
  if (port) entries.push(["HELMORA_WEB_PORT", port]);
  if (process.platform !== "win32") return Object.fromEntries(entries);
  const env = Object.fromEntries(entries.filter(([key]) => key.toLowerCase() !== "path"));
  const path = entries.find(([key]) => key === "Path")?.[1] ?? entries.find(([key]) => key.toLowerCase() === "path")?.[1];
  return path ? { ...env, Path: path } : env;
}
