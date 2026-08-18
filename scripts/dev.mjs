import { spawn } from "node:child_process";

const children = [
  spawn("python", ["scripts/dev_omr_server.py"], { stdio: "inherit", shell: true }),
  spawn("npx", ["next", "dev"], { stdio: "inherit", shell: true }),
];

function stop() {
  for (const child of children) {
    child.kill();
  }
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

for (const child of children) {
  child.on("exit", (code) => {
    stop();
    process.exit(code ?? 1);
  });
}
