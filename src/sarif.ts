import * as core from '@actions/core'
import * as fs from 'fs'

export const GITHUB_MAX_RESULTS_PER_RUN = 25000
export const SARIF_OUTPUT_DIR = 'codescan-sarif'

/**
 * Parse a SARIF JSON string and write it to `outputDir`.
 *
 * - When the first run's result count is within `maxResultsPerRun` the raw
 *   `data` string is written as-is to `<outputDir>/codescan.sarif` (no
 *   re-serialisation, preserving the original bytes).
 * - When the count exceeds the limit the results are split into sequential
 *   chunks and written as `<outputDir>/codescan-001.sarif`,
 *   `<outputDir>/codescan-002.sarif`, … Each chunk file carries the full
 *   top-level SARIF metadata (`$schema`, `version`) and the complete
 *   `tool.driver.rules` section so every file is a self-contained, valid
 *   SARIF document.
 *
 * The directory is assumed to already exist (caller's responsibility).
 */
export function writeSarifFiles(
  data: string,
  outputDir: string,
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
    core.info(
      `[CS] SARIF contains ${allResults.length} results — splitting into ${totalChunks} file(s) of up to ${maxResultsPerRun} results`
    )
    for (let i = 0; i < totalChunks; i++) {
      const chunkResults = allResults.slice(
        i * maxResultsPerRun,
        (i + 1) * maxResultsPerRun
      )
      const chunkSarif = {
        ...sarif,
        runs: [{...runs[0], results: chunkResults}]
      }
      const filename = `${outputDir}/codescan-${String(i + 1).padStart(3, '0')}.sarif`
      fs.writeFileSync(filename, JSON.stringify(chunkSarif))
      core.debug(`[CS] Saved ${filename} with ${chunkResults.length} results`)
    }
  } else {
    // Within limit — write raw bytes unchanged
    fs.writeFileSync(`${outputDir}/codescan.sarif`, data)
    core.debug(
      '[CS] The SARIF file with CodeScan analysis results has been saved'
    )
  }
}
