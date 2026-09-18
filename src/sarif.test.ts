import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  writeSarifFiles,
  GITHUB_MAX_RESULTS_PER_RUN,
  SARIF_OUTPUT_FILE
} from './sarif'

jest.mock('@actions/core')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(id: number): object {
  return {ruleId: `rule-${id}`, message: {text: `msg ${id}`}}
}

function makeSarif(resultCount: number): object {
  const results = Array.from({length: resultCount}, (_, i) => makeResult(i))
  return {
    $schema: 'https://example.com/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {driver: {name: 'CodeScan', rules: [{id: 'rule-0'}]}},
        results
      }
    ]
  }
}

function readSarif(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeSarifFiles', () => {
  let tmpFile: string

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `sarif-test-${Date.now()}.sarif`)
  })

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
    jest.clearAllMocks()
  })

  // ── within-limit paths ───────────────────────────────────────────────────

  it('SARIF_OUTPUT_FILE constant equals codescan.sarif', () => {
    expect(SARIF_OUTPUT_FILE).toBe('codescan.sarif')
  })

  it('writes a single run when results are below the limit', () => {
    const data = JSON.stringify(makeSarif(100))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs).toHaveLength(1)
    expect(written.runs[0].results).toHaveLength(100)
  })

  it('writes raw bytes unchanged (no re-serialisation) when within limit', () => {
    const data = JSON.stringify(makeSarif(10), null, 2)
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const rawOnDisk = fs.readFileSync(tmpFile, 'utf-8')
    expect(rawOnDisk).toBe(data)
  })

  it('writes a single run when results equal the limit exactly', () => {
    const data = JSON.stringify(makeSarif(GITHUB_MAX_RESULTS_PER_RUN))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs).toHaveLength(1)
  })

  it('writes a single run when results array is empty', () => {
    const data = JSON.stringify(makeSarif(0))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs).toHaveLength(1)
  })

  it('writes the file when runs array is empty', () => {
    const data = JSON.stringify({$schema: 'x', version: '2.1.0', runs: []})
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    expect(fs.existsSync(tmpFile)).toBe(true)
  })

  it('writes the file when runs key is absent', () => {
    const data = JSON.stringify({$schema: 'x', version: '2.1.0'})
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    expect(fs.existsSync(tmpFile)).toBe(true)
  })

  it('writes the file when results key is absent on run', () => {
    const data = JSON.stringify({
      $schema: 'x',
      version: '2.1.0',
      runs: [{tool: {driver: {name: 'CodeScan', rules: []}}}]
    })
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    expect(fs.existsSync(tmpFile)).toBe(true)
  })

  // ── splitting paths — always one file, multiple runs ─────────────────────

  it('splits into two runs when results is one over the limit', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN + 1
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs).toHaveLength(2)
    expect(written.runs[0].results).toHaveLength(GITHUB_MAX_RESULTS_PER_RUN)
    expect(written.runs[1].results).toHaveLength(1)
  })

  it('splits evenly when results is exactly 2× the limit', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN * 2
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs).toHaveLength(2)
    expect(written.runs[0].results).toHaveLength(GITHUB_MAX_RESULTS_PER_RUN)
    expect(written.runs[1].results).toHaveLength(GITHUB_MAX_RESULTS_PER_RUN)
  })

  it('produces correct number of runs for a large result set', () => {
    // 249,780 results → ceil(249780/25000) = 10 runs
    const total = 249780
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs).toHaveLength(10)

    const totalWritten = written.runs.reduce(
      (sum: number, r: any) => sum + r.results.length,
      0
    )
    expect(totalWritten).toBe(total)
  })

  it('no run exceeds the limit', () => {
    const data = JSON.stringify(makeSarif(62500))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    for (const run of written.runs) {
      expect(run.results.length).toBeLessThanOrEqual(GITHUB_MAX_RESULTS_PER_RUN)
    }
  })

  it('preserves result order across runs', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN + 5
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs[0].results[GITHUB_MAX_RESULTS_PER_RUN - 1].ruleId).toBe(
      `rule-${GITHUB_MAX_RESULTS_PER_RUN - 1}`
    )
    expect(written.runs[1].results[0].ruleId).toBe(
      `rule-${GITHUB_MAX_RESULTS_PER_RUN}`
    )
  })

  // ── metadata preservation ────────────────────────────────────────────────

  it('copies $schema and version into the output file', () => {
    const data = JSON.stringify(makeSarif(GITHUB_MAX_RESULTS_PER_RUN + 1))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.$schema).toBe('https://example.com/sarif-schema-2.1.0.json')
    expect(written.version).toBe('2.1.0')
  })

  it('copies tool.driver.rules into every run', () => {
    const data = JSON.stringify(makeSarif(GITHUB_MAX_RESULTS_PER_RUN + 1))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    for (const run of written.runs) {
      expect(run.tool.driver.rules).toEqual([{id: 'rule-0'}])
    }
  })

  it('assigns unique runAutomationDetails.id to each split run', () => {
    const data = JSON.stringify(makeSarif(GITHUB_MAX_RESULTS_PER_RUN + 1))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs[0].runAutomationDetails.id).toBe('codescan/chunk-1')
    expect(written.runs[1].runAutomationDetails.id).toBe('codescan/chunk-2')
  })

  it('does not add runAutomationDetails when within limit', () => {
    const data = JSON.stringify(makeSarif(100))
    writeSarifFiles(data, tmpFile, GITHUB_MAX_RESULTS_PER_RUN)

    const written = readSarif(tmpFile)
    expect(written.runs[0].runAutomationDetails).toBeUndefined()
  })

  // ── error handling ───────────────────────────────────────────────────────

  it('throws on invalid JSON input', () => {
    expect(() =>
      writeSarifFiles('not-json', tmpFile, GITHUB_MAX_RESULTS_PER_RUN)
    ).toThrow()
  })
})
