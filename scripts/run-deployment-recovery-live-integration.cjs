const { loadEnvConfig } = require("@next/env");
const fs = require("fs");
const Module = require("module");
const ts = require("typescript");

loadEnvConfig(process.cwd());
require.extensions[".ts"] = function transpile(module, filename) {
  module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, filename);
};
const load = Module._load;
Module._load = (request, parent, isMain) => request === "server-only" ? {} : load(request, parent, isMain);

(async () => {
  const { runDeploymentRecoveryLiveIntegrationFromEnvironment } = require("../lib/modules/deployment/deployment-recovery-live-integration-runner.ts");
  const result = await runDeploymentRecoveryLiveIntegrationFromEnvironment(process.env);
  console.log(JSON.stringify({
    ok: result.ok,
    status: result.status,
    message: result.message,
    fixtureOwner: result.fixtureOwner,
    recoveryKey: result.recoveryKey,
    canonicalPayloadHash: result.canonicalPayloadHash,
    conflictingPayloadHash: result.conflictingPayloadHash,
    persistedStatus: result.persisted?.status ?? null,
    reusedStatus: result.reused?.status ?? null,
    conflictStatus: result.conflict?.status ?? null,
    immutableReplayStatus: result.immutableReplay?.status ?? null,
    repositoryCalls: result.repositoryCalls,
    rollbackItems: result.rollbackItems,
    cleanup: result.cleanup,
    downstream: result.downstream,
    safetyIssueCode: result.safety.issueCode,
  }, null, 2));
  if (!result.ok) process.exitCode = 1;
})().catch(() => {
  console.error("Isolated recovery persistence integration runner failed safely.");
  process.exitCode = 1;
});
