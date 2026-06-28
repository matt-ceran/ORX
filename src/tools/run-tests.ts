import { runTestTarget, type RunTestOptions, type TestRunResult } from "../testing/index.js";

export type RunTestsOptions = RunTestOptions;
export type RunTestsResult = TestRunResult;

export async function runTestsTool(options: RunTestsOptions): Promise<RunTestsResult> {
  return runTestTarget(options);
}
