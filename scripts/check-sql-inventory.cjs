const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const planPath = path.join(root, "docs", "architecture", "staging-schema-synchronization-plan.md");
const plan = fs.readFileSync(planPath, "utf8");
const documentedNames = [...plan.matchAll(/^\| `([^`]+\.sql)` \|/gm)].map((match) => match[1]);
const documented = documentedNames.map((name) => fs.existsSync(path.join(root, name))
  ? name
  : path.join("docs", "architecture", name).replaceAll("\\", "/"));

function findSql(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if ([".git", ".next", "node_modules", ".tmp"].includes(entry.name)) return [];
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return findSql(full);
    return entry.name.endsWith(".sql") ? [path.relative(root, full).replaceAll("\\", "/")] : [];
  });
}

const actual = findSql(root).sort();
const expected = [...documented].sort();
const missingFromPlan = actual.filter((name) => !expected.includes(name));
const missingFromDisk = expected.filter((name) => !actual.includes(name));
if (documentedNames.length !== 60 || actual.length !== 60 || missingFromPlan.length || missingFromDisk.length) {
  process.stderr.write(`${JSON.stringify({ ok: false, documented: documentedNames.length, actual: actual.length, missingFromPlan, missingFromDisk }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ ok: true, documented: 60, actual: 60, classificationSource: "docs/architecture/staging-schema-synchronization-plan.md" })}\n`);
}
