import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

type PackageManifest = {
  readonly devEngines?: {
    readonly runtime?: {
      readonly name?: string;
      readonly onFail?: string;
      readonly version?: string;
    };
  };
  readonly engines?: { readonly node?: string };
  readonly packageManager?: string;
  readonly scripts?: Readonly<Record<string, string>>;
};

function readRepositoryFile(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function packageManifest(): PackageManifest {
  return JSON.parse(readRepositoryFile("package.json")) as PackageManifest;
}

describe("maintainability guardrails", () => {
  it("enforces the declared Node and pnpm runtime contract", () => {
    const manifest = packageManifest();

    expect(manifest.packageManager).toBe("pnpm@11.24.0");
    expect(manifest.engines?.node).toBe("26.x");
    expect(manifest.devEngines?.runtime).toEqual({
      name: "node",
      version: "26.x",
      onFail: "error",
    });
  });

  it("routes every canonical check through format, graph-aware lint, unit, and browser checks", () => {
    const { scripts } = packageManifest();

    expect(scripts?.check).toBe(
      "pnpm run tsc && pnpm run format:check && pnpm run lint && pnpm run test",
    );
    expect(scripts?.lint).toContain("eslint . --max-warnings=0");
    expect(scripts?.lint).toContain(
      "depcruise --config .dependency-cruiser.mts",
    );
    expect(scripts?.test).toBe("vitest run && pnpm run test:browser");
    expect(scripts?.["test:browser"]).toBe("playwright test --retries=0");
  });

  it("reserves a dedicated preview port for Playwright browser checks", () => {
    const configuration = readRepositoryFile("playwright.config.ts");

    expect(configuration).toContain('baseURL: "http://127.0.0.1:4174"');
    expect(configuration).toContain("--host 127.0.0.1 --port 4174");
    expect(configuration).toContain("port: 4174");
    expect(configuration).not.toContain("4173");
  });

  it("keeps the resolved dependency graph policy active for the real repository", () => {
    const configuration = readRepositoryFile(".dependency-cruiser.mts");

    expect(configuration).toContain('parser: "tsc"');
    expect(configuration).toContain('fileName: "tsconfig.json"');
    expect(configuration).toContain('name: "no-circular"');
    expect(configuration).toContain('name: "not-to-unresolvable"');
    expect(configuration).toContain('name: "not-to-test"');
    expect(configuration).toContain('name: "domain-not-to-outer-modules"');
    expect(configuration).toContain('name: "storage-not-to-application-or-ui"');
    expect(configuration).toContain('name: "ui-not-to-storage"');
  });

  it("makes pull requests and main pushes run one non-retrying repository gate", () => {
    const workflow = readRepositoryFile(
      ".github/workflows/repository-gate.yml",
    );

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:\n    branches:\n      - main");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("jobs:\n  check:");
    expect(workflow).toContain("pnpm install --frozen-lockfile");
    expect(workflow).toContain("playwright install --with-deps chromium");
    expect(workflow).toContain("pnpm run check");
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain("playwright-failure-evidence");
  });
});
