export default {
  forbidden: [
    {
      name: "no-circular",
      comment: "Dependencies must not form a cycle.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      comment: "Internal dependencies must resolve to a module on disk.",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-test",
      comment:
        "Production, build, and repository configuration modules must not import tests.",
      severity: "error",
      from: {
        path: "^(src|build)/|^(vite\\.config\\.ts|vitest\\.config\\.ts|playwright\\.config\\.ts|eslint\\.config\\.js)$",
      },
      to: { path: "^tests/" },
    },
    {
      name: "domain-not-to-outer-modules",
      comment:
        "Domain code is independent of application, storage, UI, and Rules Reference modules.",
      severity: "error",
      from: { path: "^src/domain/" },
      to: { path: "^src/(app|storage|ui|rules-reference)/" },
    },
    {
      name: "storage-not-to-application-or-ui",
      comment:
        "Storage may depend on domain code but not application or UI modules.",
      severity: "error",
      from: { path: "^src/storage/" },
      to: { path: "^src/(app|ui)/" },
    },
    {
      name: "ui-not-to-storage",
      comment:
        "UI code reaches storage through application operations, never directly.",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { path: "^src/storage/" },
    },
    {
      name: "application-to-domain-or-storage",
      comment:
        "Application code may depend only on application, domain, storage, and readiness modules.",
      severity: "error",
      from: { path: "^src/app/" },
      to: { pathNot: "^src/(app|domain|storage)(/|$)|^src/readiness\\.ts$" },
    },
    {
      name: "ui-to-application",
      comment:
        "UI code may depend on application, UI, domain, and Rules Reference modules.",
      severity: "error",
      from: { path: "^src/ui/" },
      to: { pathNot: "^src/(app|ui|domain|rules-reference)/" },
    },
    {
      name: "application-not-to-ui",
      comment: "Application code must not depend on UI implementation modules.",
      severity: "error",
      from: { path: "^src/app/" },
      to: { path: "^src/ui/" },
    },
  ],
  options: {
    includeOnly:
      "^(src|tests|build)/|^(vite\\.config\\.ts|vitest\\.config\\.ts|playwright\\.config\\.ts|eslint\\.config\\.js)$",
    doNotFollow: { path: "node_modules" },
    parser: "tsc",
    tsConfig: { fileName: "tsconfig.json" },
  },
};
