import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import {Scanner} from './Scanner'
import TaskReport, {REPORT_TASK_NAME} from './TaskReport'
import {PullRequestEvent} from '@octokit/webhooks-definitions/schema'
import Request from './Request'
import * as fs from 'fs'

async function run(): Promise<void> {
  try {
    core.debug('[CS] Run CodeScan Analysis')
    const args = core
      .getInput('args')
      .split('\n')
      .filter(x => x !== '')
      .reduce(function (obj: {[index: string]: string}, str) {
        const strParts = str.split('=')
        if (strParts[0] && strParts[1]) {
          obj[strParts[0].replace(/\s+/g, '')] = strParts[1].trim()
        }
        return obj
      }, {})

    const options = {
      ...args,
      'sonar.organization': core.getInput('organization'),
      'sonar.projectKey': core.getInput('projectKey')
    }

    const codeScanUrl = core.getInput('codeScanUrl')
    const authToken = core.getInput('login')
    const timeoutSec = Number.parseInt(core.getInput('pollingTimeoutSec'), 10)
    const generateSarifFile = core.getInput('generateSarifFile') === 'true'
    const generateReportFile = core.getInput('generateReportFile') === 'true'
    const failOnRedQualityGate =
      core.getInput('failOnRedQualityGate') === 'true'
    const scanChangedFilesOnly =
      core.getInput('scanChangedFilesOnly') === 'true'

    if (generateSarifFile) {
      Object.assign(options, {
        'sonar.analysis.report.enabled': 'true',
        'sonar.analysis.report.type': 'sarif'
      })
    } else if (generateReportFile) {
      Object.assign(options, {
        'codescan.reports.enabled': 'true',
        'codescan.reports.types': 'sarif'
      })
    }

    if (scanChangedFilesOnly) {
      if (github.context.eventName === 'pull_request') {
        const prPayload = github.context.payload as PullRequestEvent

        // Fetch till PR start
        const commits = prPayload.pull_request.commits
        const branch = prPayload.pull_request.head.ref
        await exec.exec('git', [
          'fetch',
          'origin',
          `${branch}`,
          `--depth=${commits + 1}`
        ])

        // Get filenames with diff
        const {stdout} = await exec.getExecOutput('git', [
          'diff',
          '--name-only',
          prPayload.pull_request.head.sha,
          prPayload.pull_request.base.sha
        ])

        // Add to inclusions
        const files = stdout.split(/\r?\n/)
        Object.assign(options, {
          'sonar.inclusions': files.join(',')
        })
      }
    }

    await new Scanner().runAnalysis(codeScanUrl, authToken, options)
    core.debug('[CS] CodeScan Analysis completed.')

    const reportFiles = await TaskReport.findTaskFileReport()
    core.debug(
      `[SQ] Searching for ${REPORT_TASK_NAME} - found ${reportFiles.length} file(s)`
    )

    const taskReports = await TaskReport.createTaskReportsFromFiles(reportFiles)
    const tasks = await Promise.all(
      taskReports.map(taskReport =>
        TaskReport.getReportForTask(
          taskReport,
          codeScanUrl,
          authToken,
          timeoutSec
        )
      )
    )
    core.debug('[CS] CodeScan Report Tasks execution completed.')

    if (generateSarifFile) {
      // We should always have single task, so it's enough to hardcode SERIF filename as codescan.sarif.
      await Promise.all(
        tasks.map(task => {
          core.debug(`[CS] Downloading SARIF file for Report Task: ${task.id}`)
          new Request()
            .get(
              codeScanUrl,
              authToken,
              `/_codescan/analysis/reports/${task.id}`,
              false,
              {
                format: 'sarif',
                projectKey: core.getInput('projectKey')
              }
            )
            .then(data => {
              fs.writeFile('codescan.sarif', data, () => {
                core.debug(
                  '[CS] The SARIF file with CodeScan analysis results has been saved'
                )
              })
            })
        })
      )
    } else {
      core.debug('[CS] Generation of SARIF file is disabled.')
    }

    if (failOnRedQualityGate) {
      core.debug('Fetching Quality Gate results')
      const analysisId = tasks[0].analysisId
      new Request()
        .get(
          codeScanUrl,
          authToken,
          `/api/qualitygates/project_status?analysisId=${analysisId}`,
          false
        )
        .then(data => {
          const json = JSON.parse(data)
          core.debug(`Quality Gate status: ${json.projectStatus.status}`)
          if (json.errors || json.projectStatus.status !== 'OK') {
            core.setFailed('Failed Quality Gate')
          }
        })
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
