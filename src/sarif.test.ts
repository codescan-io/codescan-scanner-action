import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as core from '@actions/core'
import {writeSarifFiles, GITHUB_MAX_RESULTS_PER_RUN} from './sarif'

jest.mock('@actions/core')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResult(id: number) {
  return {ruleId: `rule-${id}`, message: {text: `msg ${id}`}}
}

function makeSarif(resultCount: number, extra: object = {}) {
  const results = Array.from({length: resultCount}, (_, i) => makeResult(i))
  return {
    $schema: 'https://example.com/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {driver: {name: 'CodeScan', rules: [{id: 'rule-0'}]}},
        results,
        ...extra
      }
    ]
  }
}

function readSarif(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('writeSarifFiles', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sarif-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true})
    jest.clearAllMocks()
  })

  // ── within-limit paths ───────────────────────────────────────────────────

  it('writes a single codescan.sarif when results are below the limit', () => {
    const data = JSON.stringify(makeSarif(100))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir)
    expect(files).toEqual(['codescan.sarif'])

    const written = readSarif(path.join(tmpDir, 'codescan.sarif'))
    expect(written.runs[0].results).toHaveLength(100)
  })

  it('writes raw bytes unchanged (no re-serialisation) when within limit', () => {
    // Deliberately include whitespace that JSON.stringify would strip out
    const sarif = makeSarif(10)
    const data = JSON.stringify(sarif, null, 2)
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const rawOnDisk = fs.readFileSync(
      path.join(tmpDir, 'codescan.sarif'),
      'utf-8'
    )
    expect(rawOnDisk).toBe(data)
  })

  it('writes a single codescan.sarif when results equal the limit exactly', () => {
    const data = JSON.stringify(makeSarif(GITHUB_MAX_RESULTS_PER_RUN))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir)
    expect(files).toEqual(['codescan.sarif'])
  })

  it('writes a single codescan.sarif when results array is empty', () => {
    const data = JSON.stringify(makeSarif(0))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir)
    expect(files).toEqual(['codescan.sarif'])
  })

  it('writes a single codescan.sarif when runs array is empty', () => {
    const data = JSON.stringify({$schema: 'x', version: '2.1.0', runs: []})
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir)
    expect(files).toEqual(['codescan.sarif'])
  })

  it('writes a single codescan.sarif when runs key is absent', () => {
    const data = JSON.stringify({$schema: 'x', version: '2.1.0'})
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir)
    expect(files).toEqual(['codescan.sarif'])
  })

  it('writes a single codescan.sarif when results key is absent on run', () => {
    const data = JSON.stringify({
      $schema: 'x',
      version: '2.1.0',
      runs: [{tool: {driver: {name: 'CodeScan', rules: []}}}]
    })
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir)
    expect(files).toEqual(['codescan.sarif'])
  })

  // ── splitting paths ──────────────────────────────────────────────────────

  it('splits into two files when results is one over the limit', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN + 1
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir).sort()
    expect(files).toEqual(['codescan-001.sarif', 'codescan-002.sarif'])

    const chunk1 = readSarif(path.join(tmpDir, 'codescan-001.sarif'))
    const chunk2 = readSarif(path.join(tmpDir, 'codescan-002.sarif'))
    expect(chunk1.runs[0].results).toHaveLength(GITHUB_MAX_RESULTS_PER_RUN)
    expect(chunk2.runs[0].results).toHaveLength(1)
  })

  it('splits evenly when results is exactly 2× the limit', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN * 2
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir).sort()
    expect(files).toEqual(['codescan-001.sarif', 'codescan-002.sarif'])

    const chunk1 = readSarif(path.join(tmpDir, 'codescan-001.sarif'))
    const chunk2 = readSarif(path.join(tmpDir, 'codescan-002.sarif'))
    expect(chunk1.runs[0].results).toHaveLength(GITHUB_MAX_RESULTS_PER_RUN)
    expect(chunk2.runs[0].results).toHaveLength(GITHUB_MAX_RESULTS_PER_RUN)
  })

  it('produces correct number of chunk files for a large result set', () => {
    // 249,780 results → ceil(249780/25000) = 10 files
    const total = 249780
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir).sort()
    expect(files).toHaveLength(10)
    expect(files[0]).toBe('codescan-001.sarif')
    expect(files[9]).toBe('codescan-010.sarif')

    // All results accounted for
    const totalWritten = files.reduce((sum, f) => {
      const sarif = readSarif(path.join(tmpDir, f))
      return sum + sarif.runs[0].results.length
    }, 0)
    expect(totalWritten).toBe(total)
  })

  it('no chunk exceeds the limit', () => {
    const total = 62500 // 3 chunks: 25000 + 25000 + 12500
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const files = fs.readdirSync(tmpDir).sort()
    for (const f of files) {
      const sarif = readSarif(path.join(tmpDir, f))
      expect(sarif.runs[0].results.length).toBeLessThanOrEqual(
        GITHUB_MAX_RESULTS_PER_RUN
      )
    }
  })

  it('preserves result order across chunks', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN + 5
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    const chunk1 = readSarif(path.join(tmpDir, 'codescan-001.sarif'))
    const chunk2 = readSarif(path.join(tmpDir, 'codescan-002.sarif'))

    // Last result of chunk1 should be rule-(25000-1), first of chunk2 rule-25000
    expect(chunk1.runs[0].results[GITHUB_MAX_RESULTS_PER_RUN - 1].ruleId).toBe(
      `rule-${GITHUB_MAX_RESULTS_PER_RUN - 1}`
    )
    expect(chunk2.runs[0].results[0].ruleId).toBe(
      `rule-${GITHUB_MAX_RESULTS_PER_RUN}`
    )
  })

  // ── metadata preservation ────────────────────────────────────────────────

  it('copies $schema and version into every chunk file', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN + 1
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    for (const f of fs.readdirSync(tmpDir)) {
      const sarif = readSarif(path.join(tmpDir, f))
      expect(sarif.$schema).toBe('https://example.com/sarif-schema-2.1.0.json')
      expect(sarif.version).toBe('2.1.0')
    }
  })

  it('copies tool.driver.rules into every chunk file', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN + 1
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    for (const f of fs.readdirSync(tmpDir)) {
      const sarif = readSarif(path.join(tmpDir, f))
      expect(sarif.runs[0].tool.driver.rules).toEqual([{id: 'rule-0'}])
    }
  })

  // ── logging ──────────────────────────────────────────────────────────────

  it('calls core.info with split count when splitting', () => {
    const total = GITHUB_MAX_RESULTS_PER_RUN + 1
    const data = JSON.stringify(makeSarif(total))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('splitting into 2 file(s)')
    )
  })

  it('does not call core.info when within limit', () => {
    const data = JSON.stringify(makeSarif(100))
    writeSarifFiles(data, tmpDir, GITHUB_MAX_RESULTS_PER_RUN)

    expect(core.info).not.toHaveBeenCalled()
  })

  // ── error handling ───────────────────────────────────────────────────────

  it('throws on invalid JSON input', () => {
    expect(() => writeSarifFiles('not-json', tmpDir, GITHUB_MAX_RESULTS_PER_RUN)).toThrow()
  })
})
