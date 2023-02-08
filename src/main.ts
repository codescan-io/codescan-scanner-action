import * as core from '@actions/core'
import {Scanner} from './Scanner'
import TaskReport, {REPORT_TASK_NAME} from './TaskReport'
import Request from './Request'
import * as fs from 'fs'
import * as Path from 'path';
const request = require('request');

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
    const failPipeWhenRedQualityGate = true
    const qgurl = ''

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
          const qgurl = `${codeScanUrl}/api/qualitygates/project_status?analysisId=${task.id}`
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
    if (failPipeWhenRedQualityGate) {
        if (!qgurl) {
            Promise.reject('qualityGate url not found');
        } else {
            // fetch quality gate...
            request({url: qgurl, authToken}, (error: any, response: any, body: string) => {
              if (error) {
                return Promise.reject(error);
              }
              const json = JSON.parse(body);
              if (json.errors) {
                Promise.reject(json.errors[0].msg);
              } else if (json.projectStatus.staus === 'ERROR') {
                Promise.reject("Pipeline failed with red quality gate");
              }
              Promise.resolve(json.projectStatus);
            });
        }
    }
  } catch (error: any) {
    core.setFailed(error.message)
  }
}

run()
