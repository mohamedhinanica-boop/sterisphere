const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_ENVIRONMENT = "production";
const REQUIRED_MODE = "schema-only";
const PROJECT_REF_PATTERN = /^[a-z0-9]{8,40}$/;

function isPathInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assessCaptureConfiguration({ environment, allowCapture, projectRef, password, mode, outputPath, repositoryRoot }) {
  const issues = [];
  if (environment !== REQUIRED_ENVIRONMENT) issues.push("environment_not_production");
  if (allowCapture !== "true") issues.push("production_capture_opt_in_missing");
  if (!projectRef || !PROJECT_REF_PATTERN.test(projectRef)) issues.push("production_project_ref_missing_or_invalid");
  if (!password) issues.push("production_database_credentials_missing");
  if (mode !== REQUIRED_MODE) issues.push("schema_only_mode_required");

  const safeRoot = path.resolve(repositoryRoot, ".tmp", "schema-captures");
  const resolvedOutput = path.resolve(outputPath || repositoryRoot);
  if (!isPathInside(resolvedOutput, safeRoot)) issues.push("unsafe_output_path");

  return {
    allowed: issues.length === 0,
    issues,
    mode: REQUIRED_MODE,
    projectRef: projectRef && PROJECT_REF_PATTERN.test(projectRef) ? projectRef : null,
    outputPath: resolvedOutput,
    schemaCategories: ["public", "extensions", "auth-structure", "storage-structure"],
  };
}

function redact(value, secrets = []) {
  let result = String(value ?? "");
  for (const secret of secrets.filter(Boolean)) result = result.split(String(secret)).join("[REDACTED]");
  result = result.replace(/\b(postgres(?:ql)?):\/\/([^\s:/]+):([^\s@]+)@/gi, "$1://$2:[REDACTED]@");
  result = result.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_JWT]");
  result = result.replace(/\b(sb_(?:secret|publishable)_[A-Za-z0-9_-]+)\b/g, "[REDACTED_SUPABASE_KEY]");
  return result;
}

function maskDollarQuotedBodies(sql) {
  const output = [...sql];
  const tagPattern = /\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/g;
  let opening;
  while ((opening = tagPattern.exec(sql))) {
    const closingIndex = sql.indexOf(opening[0], tagPattern.lastIndex);
    if (closingIndex < 0) break;
    for (let index = tagPattern.lastIndex; index < closingIndex; index += 1) {
      if (output[index] !== "\n" && output[index] !== "\r") output[index] = " ";
    }
    tagPattern.lastIndex = closingIndex + opening[0].length;
  }
  return output.join("");
}

function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, (value) => value.replace(/[^\r\n]/g, " "))
    .replace(/--[^\r\n]*/g, (value) => " ".repeat(value.length));
}

function lineAt(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function validateSchemaCapture(sql) {
  const findings = [];
  const structural = stripComments(maskDollarQuotedBodies(sql));
  const addMatches = (pattern, code, source = structural) => {
    for (const match of source.matchAll(pattern)) findings.push({ code, line: lineAt(source, match.index) });
  };

  addMatches(/^\s*INSERT\s+INTO\b/gim, "top_level_insert_statement");
  addMatches(/^\s*COPY\s+[^;\r\n]+\s+FROM\s+stdin\s*;/gim, "copy_from_stdin_data");
  addMatches(/^\s*(?:INSERT\s+INTO|COPY)\s+(?:ONLY\s+)?(?:"?auth"?\.)?"?users"?\b/gim, "auth_users_data");
  addMatches(/^\s*(?:INSERT\s+INTO|COPY)\s+(?:ONLY\s+)?(?:"?public"?\.)?"?(?:patients|clinics|providers|patient_traces|audit_logs|clinical_hardware_devices)"?\b/gim, "sensitive_application_data");
  addMatches(/\bpostgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@/gi, "credential_bearing_connection_url", sql);
  addMatches(/\b(?:password|passwd|pwd)\s*=\s*['"][^'"\r\n]+['"]/gi, "database_password_literal", sql);
  addMatches(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "jwt_token_literal", sql);
  addMatches(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g, "supabase_key_literal", sql);

  findings.sort((left, right) => left.line - right.line || left.code.localeCompare(right.code));
  return { valid: findings.length === 0, findings };
}

function cleanIdentifier(value) {
  return value.trim().replace(/"/g, "").replace(/\s+/g, " ");
}

function uniqueSorted(values) {
  return [...new Set(values.map(cleanIdentifier).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function collect(sql, pattern, group = 1) {
  return [...sql.matchAll(pattern)].map((match) => match[group]);
}

function buildManifest(sources) {
  const orderedSources = [...sources].sort((a, b) => a.name.localeCompare(b.name));
  const sql = orderedSources.map((source) => source.sql).join("\n");
  const structural = stripComments(maskDollarQuotedBodies(sql));
  const qualified = '((?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)(?:\\.(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*))?)';
  const objects = {
    schemas: uniqueSorted(collect(structural, /\bCREATE\s+SCHEMA(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:AUTHORIZATION\s+\S+\s+)?("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)/gi)),
    extensions: uniqueSorted(collect(structural, /\bCREATE\s+EXTENSION(?:\s+IF\s+NOT\s+EXISTS)?\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)/gi)),
    tables: uniqueSorted(collect(structural, new RegExp(`\\bCREATE\\s+(?:UNLOGGED\\s+)?TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${qualified}`, "gi"))),
    views: uniqueSorted(collect(structural, new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?VIEW\\s+${qualified}`, "gi"))),
    materializedViews: uniqueSorted(collect(structural, new RegExp(`\\bCREATE\\s+MATERIALIZED\\s+VIEW\\s+${qualified}`, "gi"))),
    sequences: uniqueSorted(collect(structural, new RegExp(`\\bCREATE\\s+SEQUENCE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${qualified}`, "gi"))),
    functions: uniqueSorted(collect(structural, new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${qualified}\\s*\\(`, "gi"))),
    triggers: uniqueSorted([...structural.matchAll(new RegExp(`\\bCREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)[\\s\\S]*?\\bON\\s+${qualified}`, "gi"))].map((match) => `${match[2]}.${match[1]}`)),
    indexes: uniqueSorted(collect(structural, /\bCREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+CONCURRENTLY)?(?:\s+IF\s+NOT\s+EXISTS)?\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)/gi)),
    constraints: uniqueSorted([
      ...[...structural.matchAll(new RegExp(`\\bALTER\\s+TABLE(?:\\s+ONLY)?\\s+${qualified}[\\s\\S]*?\\bADD\\s+CONSTRAINT\\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`, "gi"))].map((match) => `${match[1]}.${match[2]}`),
      ...collect(structural, /\bCONSTRAINT\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\s+(?:PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|EXCLUDE)\b/gi),
    ]),
    rlsEnabledTables: uniqueSorted(collect(structural, new RegExp(`\\bALTER\\s+TABLE(?:\\s+ONLY)?\\s+${qualified}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "gi"))),
    policies: uniqueSorted([...structural.matchAll(new RegExp(`\\bCREATE\\s+POLICY\\s+("[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)\\s+ON\\s+${qualified}`, "gi"))].map((match) => `${match[2]}.${match[1]}`)),
    grants: [],
    revokes: [],
  };

  for (const match of structural.matchAll(new RegExp(`\\b(GRANT|REVOKE)\\s+[\\s\\S]*?\\bON\\s+(TABLE|FUNCTION|SEQUENCE|SCHEMA)\\s+${qualified}`, "gi"))) {
    const entry = `${match[2].toUpperCase()} ${cleanIdentifier(match[3])}`;
    objects[match[1].toUpperCase() === "GRANT" ? "grants" : "revokes"].push(entry);
  }
  objects.grants = uniqueSorted(objects.grants);
  objects.revokes = uniqueSorted(objects.revokes);
  objects.rpcCandidates = objects.functions.filter((name) => name.startsWith("public."));

  const counts = Object.fromEntries(Object.entries(objects).map(([key, values]) => [key, values.length]));
  return { formatVersion: 1, captureKind: "schema-only", sourceFiles: orderedSources.map((source) => path.basename(source.name)), counts, objects };
}

function parseArguments(args) {
  const parsed = { inputs: [] };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--input") parsed.inputs.push(args[++index]);
    else if (args[index] === "--manifest") parsed.manifest = args[++index];
    else if (args[index] === "--output") parsed.output = args[++index];
    else throw new Error(`Unsupported argument: ${args[index]}`);
  }
  return parsed;
}

function runCli() {
  const [command, ...args] = process.argv.slice(2);
  const parsed = parseArguments(args);
  const repositoryRoot = path.resolve(__dirname, "..");
  if (command === "preflight") {
    const result = assessCaptureConfiguration({
      environment: process.env.STERISPHERE_SCHEMA_CAPTURE_ENVIRONMENT,
      allowCapture: process.env.STERISPHERE_ALLOW_PRODUCTION_SCHEMA_CAPTURE,
      projectRef: process.env.STERISPHERE_PRODUCTION_PROJECT_REF,
      password: process.env.STERISPHERE_PRODUCTION_DB_PASSWORD,
      mode: process.env.STERISPHERE_SCHEMA_CAPTURE_MODE || REQUIRED_MODE,
      outputPath: parsed.output,
      repositoryRoot,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.allowed ? 0 : 2;
    return;
  }
  if (command === "validate") {
    if (!parsed.inputs.length || !parsed.manifest) throw new Error("validate requires --input and --manifest");
    const sources = parsed.inputs.map((input) => ({ name: input, sql: fs.readFileSync(input, "utf8") }));
    const findings = sources.flatMap((source) => validateSchemaCapture(source.sql).findings.map((finding) => ({ file: path.basename(source.name), ...finding })));
    if (findings.length) {
      process.stderr.write(`${JSON.stringify({ valid: false, findings })}\n`);
      process.exitCode = 3;
      return;
    }
    const manifest = buildManifest(sources);
    fs.writeFileSync(parsed.manifest, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    process.stdout.write(`${JSON.stringify({ valid: true, manifest: path.resolve(parsed.manifest), counts: manifest.counts })}\n`);
    return;
  }
  throw new Error("Expected command: preflight or validate");
}

if (require.main === module) {
  try { runCli(); } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: "schema_capture_tool_failed", message: redact(error instanceof Error ? error.message : error) })}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assessCaptureConfiguration, buildManifest, redact, validateSchemaCapture };
