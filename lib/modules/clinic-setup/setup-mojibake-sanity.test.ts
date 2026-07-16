import { readFileSync } from "node:fs";

export interface SetupMojibakeSanityScenario {
  name: string;
  passed: boolean;
  message: string;
}

export interface SetupMojibakeSanityHarnessResult {
  passed: boolean;
  scenarios: readonly SetupMojibakeSanityScenario[];
}

const SETUP_PAGE_PATH = "app/setup/page.tsx";
const MOJIBAKE_FRAGMENTS = ["\u00c3", "\u00c2", "\u00e2\u20ac", "\u00c6", "\ufffd"] as const;

export function runSetupMojibakeSanityHarness(): SetupMojibakeSanityHarnessResult {
  const source = readFileSync(SETUP_PAGE_PATH, "utf8");
  const scenarios = [
    scenarioNoMojibakeFragments(source),
    scenarioSteriAiRecommendationCopy(source),
    scenarioWorkstationLabels(source),
    scenarioSterilizerAssignedWorkstationOptions(source),
    scenarioGeneratedWorkstationNamesRemainStable(source),
    scenarioLocalDraftSubmissionSourceIsClean(source),
  ];

  return {
    passed: scenarios.every((scenario) => scenario.passed),
    scenarios,
  };
}

function scenarioNoMojibakeFragments(source: string): SetupMojibakeSanityScenario {
  const hits = MOJIBAKE_FRAGMENTS.filter((fragment) => source.includes(fragment));
  return expectScenario("setup page contains no mojibake fragments", hits.length === 0, hits.join(","));
}

function scenarioSteriAiRecommendationCopy(source: string): SetupMojibakeSanityScenario {
  const expected = [
    "Steri AI Recommendation",
    "Based on your clinic profile, SteriSphere recommends:",
    "- 1 Reception Desk",
    "- 1 Sterilization Room",
    "- 6 Treatment Rooms",
  ];
  return expectScenario("Steri AI text renders as normal UTF-8/ASCII copy", includesAll(source, expected), missing(source, expected).join(","));
}

function scenarioWorkstationLabels(source: string): SetupMojibakeSanityScenario {
  const expected = [
    "Reception Desk",
    "Sterilization Room",
    "Treatment Room",
  ];
  return expectScenario("workstation labels are readable", includesAll(source, expected), missing(source, expected).join(","));
}

function scenarioSterilizerAssignedWorkstationOptions(source: string): SetupMojibakeSanityScenario {
  const expected = [
    "Assigned Workstation",
    "Not assigned",
    " - Sterilization",
  ];
  return expectScenario("sterilizer assigned-workstation options are readable", includesAll(source, expected), missing(source, expected).join(","));
}

function scenarioGeneratedWorkstationNamesRemainStable(source: string): SetupMojibakeSanityScenario {
  const expected = [
    "const id = `${category.id}-${index + 1}`;",
    "? `${category.singularName} ${index + 1}`",
    ": category.singularName;",
  ];
  return expectScenario("generated workstation names remain stable", includesAll(source, expected), missing(source, expected).join(","));
}

function scenarioLocalDraftSubmissionSourceIsClean(source: string): SetupMojibakeSanityScenario {
  const setupDraftMarkers = ["localSetupDraft", "workstations", "sterilizers", "providerShells"];
  const hasDraftSource = setupDraftMarkers.some((marker) => source.includes(marker));
  const hasCorruptSubmissionSource = MOJIBAKE_FRAGMENTS.some((fragment) => source.includes(fragment));
  return expectScenario("local setup draft source contains no corrupted text", hasDraftSource && !hasCorruptSubmissionSource, JSON.stringify({ hasDraftSource, hasCorruptSubmissionSource }));
}

function includesAll(source: string, values: readonly string[]): boolean {
  return missing(source, values).length === 0;
}

function missing(source: string, values: readonly string[]): readonly string[] {
  return values.filter((value) => !source.includes(value));
}

function expectScenario(name: string, passed: boolean, message: string): SetupMojibakeSanityScenario {
  return { name, passed, message };
}
