import { describe, expect, it } from "vitest";

import { cliCommand, cliPrefix } from "./cli-invocation.ts";

describe("cliPrefix", () => {
  it("prints commands the way the CLI was started", () => {
    expect(cliPrefix({}, "/home/me/.npm/_npx/1a2b/node_modules/uni/dist-server/uni.js")).toBe("npx uni");
    expect(cliPrefix({ npm_command: "exec" }, "/repo/node_modules/vitest/vitest.mjs"), "another tool run by npx").toBe("uni");
    expect(cliPrefix({ npm_lifecycle_event: "omb" }, "/repo/server/uni.ts")).toBe("pnpm omb");
    expect(cliPrefix({ OMB_CLI_PREFIX: "docker compose exec omb uni" }, "/app/dist-server/uni.js")).toBe("docker compose exec omb uni");
    expect(cliPrefix({}, "/usr/lib/node_modules/uni/dist-server/uni.js")).toBe("uni");
    expect(cliCommand("pair", {}, "C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\9\\node_modules\\uni\\x.js")).toBe("npx uni pair");
  });
});
