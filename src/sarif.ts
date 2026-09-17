import * as core from '@actions/core'
import * as fs from 'fs'

export const GITHUB_MAX_RESULTS_PER_RUN = 25000
export const SARIF_OUTPUT_FILE = 'codescan.sarif'

/**
 * Parse a SARIF JSON string and write a single `codescan.sarif` to `outputFile`.
 *
 * - When the first run's result count is within `maxResultsPerRun` the raw
 *   `data` string is written as-is (no re-serialisation, preserving original bytes).
 * - When the count exceeds the limit the results are split into multiple SARIF
 *   *runs* within the same file — each run holds at most `maxResultsPerRun`
 *   results and carries the full `tool` metadata so it is a valid standalone run.
 *   A single file with multiple runs is one upload → one category, which avoids
 *   the GitHub Code Scanning "multiple uploads with the same category" rejection.
 */
export function writeSarifFiles(
  data: string,
  outputFile: string,
  maxResultsPerRun: number
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sarif: any = JSON.parse(data)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs: any[] = sarif.runs || []

  if (
    runs.length > 0 &&
    runs[0].results &&
    runs[0].results.length > maxResultsPerRun
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allResults: any[] = runs[0].results
    const totalChunks = Math.ceil(allResults.length / maxResultsPerRun)
    core.debug(
      `[CS] SARIF contains ${allResults.length} results — splitting into ${totalChunks} runs of up to ${maxResultsPerRun} results each`
    )

    const splitRuns = []
    for (let i = 0; i < totalChunks; i++) {
      splitRuns.push({
        ...runs[0],
        results: allResults.slice(i * maxResultsPerRun, (i + 1) * maxResultsPerRun)
      })
    }

    fs.writeFileSync(outputFile, JSON.stringify({...sarif, runs: splitRuns}))
    core.debug(
      `[CS] Saved codescan.sarif with ${totalChunks} runs of up to ${maxResultsPerRun} results each`
    )
  } else {
    // Within limit — write raw bytes unchanged
    fs.writeFileSync(outputFile, data)
    core.debug(
      '[CS] The SARIF file with CodeScan analysis results has been saved'
    )
  }
}
