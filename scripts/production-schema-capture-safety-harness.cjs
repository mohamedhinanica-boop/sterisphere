const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assessCaptureConfiguration, buildManifest, redact, validateSchemaCapture } = require("./validate-production-schema-capture.cjs");

const root = path.resolve(__dirname, "..");
const safeOutput = path.join(root, ".tmp", "schema-captures", "offline-test");
const captureSource = fs.readFileSync(path.join(__dirname, "capture-production-schema.ps1"), "utf8");
const validatorSource = fs.readFileSync(path.join(__dirname, "validate-production-schema-capture.cjs"), "utf8");
const base = {
  environment: "production",
  allowCapture: "true",
  projectRef: "abcdefghijklmnopqrst",
  password: "offline-placeholder",
  mode: "schema-only",
  outputPath: safeOutput,
  repositoryRoot: root,
};
const assess = (overrides) => assessCaptureConfiguration({ ...base, ...overrides });
const tests = [];
const test = (name, run) => tests.push({ name, run });
const issue = (result, code) => assert.ok(result.issues.includes(code), `${code} not found in ${result.issues.join(",")}`);

const ddl = `
CREATE SCHEMA public;
CREATE EXTENSION pgcrypto;
CREATE TABLE public.alpha (id uuid CONSTRAINT alpha_pk PRIMARY KEY);
CREATE VIEW public.alpha_view AS SELECT id FROM public.alpha;
CREATE MATERIALIZED VIEW public.alpha_materialized AS SELECT id FROM public.alpha;
CREATE SEQUENCE public.alpha_sequence;
CREATE FUNCTION public.bind_alpha() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.alpha(id) VALUES (gen_random_uuid());
END;
$$;
CREATE TRIGGER alpha_trigger BEFORE UPDATE ON public.alpha FOR EACH ROW EXECUTE FUNCTION public.bind_alpha();
CREATE UNIQUE INDEX alpha_id_idx ON public.alpha(id);
ALTER TABLE ONLY public.alpha ADD CONSTRAINT alpha_id_check CHECK (id IS NOT NULL);
ALTER TABLE public.alpha ENABLE ROW LEVEL SECURITY;
CREATE POLICY alpha_read ON public.alpha FOR SELECT USING (true);
GRANT EXECUTE ON FUNCTION public.bind_alpha() TO service_role;
REVOKE ALL ON FUNCTION public.bind_alpha() FROM public;
`;

test("missing production opt-in blocks", () => issue(assess({ allowCapture: undefined }), "production_capture_opt_in_missing"));
test("unknown environment blocks", () => issue(assess({ environment: "unknown" }), "environment_not_production"));
test("missing project reference blocks", () => issue(assess({ projectRef: undefined }), "production_project_ref_missing_or_invalid"));
test("missing credentials blocks", () => issue(assess({ password: undefined }), "production_database_credentials_missing"));
test("data capture mode blocks", () => issue(assess({ mode: "data-only" }), "schema_only_mode_required"));
test("schema-only mode allowed", () => assert.equal(assess({}).allowed, true));
test("unsafe output path blocks", () => issue(assess({ outputPath: path.join(root, "docs", "capture.sql") }), "unsafe_output_path"));
test("safe temporary output path allowed", () => assert.equal(assess({ outputPath: safeOutput }).allowed, true));
test("secrets are redacted", () => {
  const password = ["do", "not", "print"].join("-");
  const url = `postgresql://postgres:${password}@db.example.invalid/postgres`;
  const output = redact(`${url} ${password}`, [password]);
  assert.equal(output.includes(password), false);
  assert.match(output, /REDACTED/);
});
test("INSERT statements rejected", () => assert.ok(validateSchemaCapture("INSERT INTO public.alpha VALUES (1);").findings.some((finding) => finding.code === "top_level_insert_statement")));
test("COPY data rejected", () => assert.ok(validateSchemaCapture("COPY public.alpha (id) FROM stdin;\n1\n\\.\n").findings.some((finding) => finding.code === "copy_from_stdin_data")));
test("auth user data rejected", () => assert.ok(validateSchemaCapture("COPY auth.users (id) FROM stdin;\n1\n\\.\n").findings.some((finding) => finding.code === "auth_users_data")));
test("credential URLs rejected", () => {
  const credentialUrl = ["postgresql", "://user", ":password", "@db.example.invalid/postgres"].join("");
  assert.ok(validateSchemaCapture(`-- ${credentialUrl}`).findings.some((finding) => finding.code === "credential_bearing_connection_url"));
});
test("DDL accepted", () => assert.equal(validateSchemaCapture("CREATE TABLE public.alpha (id uuid); ALTER TABLE public.alpha ADD CONSTRAINT alpha_pk PRIMARY KEY (id);").valid, true));
test("policy DDL accepted", () => assert.equal(validateSchemaCapture("CREATE POLICY alpha_read ON public.alpha FOR SELECT USING (true);").valid, true));
test("function DDL accepted", () => assert.equal(validateSchemaCapture(ddl).valid, true));
test("grant and revoke DDL accepted", () => assert.equal(validateSchemaCapture("GRANT SELECT ON TABLE public.alpha TO service_role; REVOKE ALL ON TABLE public.alpha FROM public;").valid, true));
test("deterministic manifest ordering", () => {
  const manifest = buildManifest([{ name: "z.sql", sql: ddl }, { name: "a.sql", sql: "CREATE TABLE public.zeta(id uuid);" }]);
  assert.deepEqual(manifest.sourceFiles, ["a.sql", "z.sql"]);
  assert.deepEqual(manifest.objects.tables, [...manifest.objects.tables].sort());
});
test("repeated manifest generation stable", () => {
  const sources = [{ name: "production-public-schema.sql", sql: ddl }];
  assert.equal(JSON.stringify(buildManifest(sources)), JSON.stringify(buildManifest(sources)));
});
test("no database write commands generated", () => {
  assert.match(captureSource, /--schema-only/);
  assert.doesNotMatch(captureSource, /--data-only|\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i);
});
test("no db push generated", () => assert.doesNotMatch(captureSource, /\bsupabase\s+db\s+push\b/i));
test("no reset generated", () => assert.doesNotMatch(captureSource, /\b(?:supabase\s+db\s+reset|reset\s+database)\b/i));
test("no restore generated", () => assert.doesNotMatch(captureSource, /\b(?:pg_restore|restore\s+database)\b/i));
test("no migration repair generated", () => assert.doesNotMatch(captureSource, /\bsupabase\s+migration\s+repair\b/i));
test("no staging modification", () => assert.doesNotMatch(captureSource, /STERISPHERE_STAGING|--linked|--local/i));
test("no Production modification", () => assert.doesNotMatch(captureSource, /^\s*&?\s*(?:psql|supabase)\b|\bCREATE\s+(?:TABLE|FUNCTION)|\bALTER\s+TABLE\b/im));
test("no runtime registration", () => assert.doesNotMatch(captureSource + validatorSource, /handlerRegistry|registerHandler|executionStepOrchestrator/i));
test("no Setup integration", () => assert.doesNotMatch(captureSource + validatorSource, /app[\\/]setup|setupComplete/i));
test("no client bundle exposure", () => assert.doesNotMatch(captureSource + validatorSource, /NEXT_PUBLIC_|use client/i));
test("no secrets committed", () => {
  const changedSources = [captureSource, validatorSource].join("\n");
  assert.doesNotMatch(changedSources, /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/);
  assert.doesNotMatch(changedSources, /\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@/i);
});

let passed = 0;
for (const [index, current] of tests.entries()) {
  try {
    current.run();
    passed += 1;
    process.stdout.write(`PASS ${index + 1}/${tests.length} ${current.name}\n`);
  } catch (error) {
    process.stderr.write(`FAIL ${index + 1}/${tests.length} ${current.name}: ${error instanceof Error ? error.message : error}\n`);
  }
}
process.stdout.write(`Production schema capture safety harness: ${passed}/${tests.length}\n`);
if (passed !== tests.length) process.exitCode = 1;
