import * as core from '@actions/core'
import {Scanner} from './Scanner'
import TaskReport, {REPORT_TASK_NAME} from './TaskReport'
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
    const failOnRedQualityGate = core.getInput('failOnRedQualityGate') === 'true'

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

      const key = core.getInput('projectKey')

      var analysisId = ''
      tasks.forEach (task => 
        analysisId = task.analysisId
      )
      
      // fetch quality gate...
      core.info('Fetching Quality Gate')
      
      new Request()
          .get(
            codeScanUrl,
            authToken,
            `/api/qualitygates/project_status?analysisId=${analysisId}`,
            false
          )
          .then(data => {
            const json = JSON.parse(data);
            core.info('Quality Gate status: '+json.projectStatus.status)
            if (json.errors) {
              core.setFailed("Failed Quality Gate")
            } else if (json.projectStatus.status !== 'OK') {
              core.setFailed("Failed Quality Gate")
            }
          })
    }

  } catch (error: any) {
     core.setFailed(error.message)
  }
}

run()
