import * as fs from 'fs-extra'
import * as core from '@actions/core'
import * as glob from '@actions/glob'
import Task, {TimeOutReachedError} from './Task'

export const REPORT_TASK_NAME = 'report-task.txt'

interface ITaskReport {
  ceTaskId: string
  ceTaskUrl?: string
  dashboardUrl?: string
  projectKey: string
  serverUrl: string
}

export default class TaskReport {
  private readonly report: ITaskReport

  constructor(report: Partial<ITaskReport>) {
    for (const field of ['projectKey', 'ceTaskId', 'serverUrl']) {
      if (!report[field as keyof ITaskReport]) {
        throw TaskReport.throwMissingField(field)
      }
    }
    this.report = report as ITaskReport
  }

  get ceTaskId(): string {
    return this.report.ceTaskId
  }

  static async createTaskReportsFromFiles(
    filePaths: string[]
  ): Promise<TaskReport[]> {
    return Promise.all(
      filePaths.map(filePath => {
        if (!filePath) {
          return Promise.reject(
            TaskReport.throwInvalidReport(
              `[CS] Could not find '${REPORT_TASK_NAME}'.` +
                ` Possible cause: the analysis did not complete successfully.`
            )
          )
        }
        core.debug(`[CS] Read Task report file: ${filePath}`)
        return fs.access(filePath, fs.constants.R_OK).then(
          () => this.parseReportFile(filePath),
          () => {
            return Promise.reject(
              TaskReport.throwInvalidReport(
                `[CS] Task report not found at: ${filePath}`
              )
            )
          }
        )
      })
    )
  }

  static async findTaskFileReport(): Promise<string[]> {
    const globber = await glob.create(`**/${REPORT_TASK_NAME}`, {
      followSymbolicLinks: false
    })
    return globber.glob()
  }

  static async getReportForTask(
    taskReport: TaskReport,
    codeScanUrl: string,
    auth: string,
    timeoutSec: number
  ): Promise<Task> {
    try {
      return await Task.waitForTaskCompletion(
        codeScanUrl,
        auth,
        taskReport.ceTaskId,
        timeoutSec
      )
    } catch (e) {
      if (e instanceof TimeOutReachedError) {
        core.warning(
          `[CS] Task '${taskReport.ceTaskId}' takes too long to complete. Stopping after ${timeoutSec}s of polling. No quality gate will be displayed on build result.`
        )
      }
      throw e
    }
  }

  private static parseReportFile(filePath: string): Promise<TaskReport> {
    return fs.readFile(filePath, 'utf-8').then(
      fileContent => {
        core.debug(`[CS] Parse Task report file: ${fileContent}`)
        if (!fileContent || fileContent.length <= 0) {
          return Promise.reject(
            TaskReport.throwInvalidReport(
              `[CS] Error reading file: ${fileContent}`
            )
          )
        }
        try {
          const settings = TaskReport.createTaskReportFromString(fileContent)
          const taskReport = new TaskReport({
            ceTaskId: settings.get('ceTaskId'),
            ceTaskUrl: settings.get('ceTaskUrl'),
            dashboardUrl: settings.get('dashboardUrl'),
            projectKey: settings.get('projectKey'),
            serverUrl: settings.get('serverUrl')
          })
          return Promise.resolve(taskReport)
        } catch (err) {
          if (err && err.message) {
            core.error(`[CS] Parse Task report error: ${err.message}`)
          } else if (err) {
            core.error(`[CS] Parse Task report error: ${JSON.stringify(err)}`)
          }
          return Promise.reject(err)
        }
      },
      err =>
        Promise.reject(
          TaskReport.throwInvalidReport(
            `[CS] Error reading file: ${err.message || JSON.stringify(err)}`
          )
        )
    )
  }

  private static createTaskReportFromString(
    fileContent: string
  ): Map<string, string> {
    const lines: string[] = fileContent.replace(/\r\n/g, '\n').split('\n') // proofs against xplat line-ending issues
    const settings = new Map<string, string>()
    for (const line of lines) {
      const splitLine = line.split('=')
      if (splitLine.length > 1) {
        settings.set(
          splitLine[0],
          splitLine.slice(1, splitLine.length).join('=')
        )
      }
    }
    return settings
  }

  private static throwMissingField(field: string): Error {
    return new Error(
      `Failed to create TaskReport object. Missing field: ${field}`
    )
  }

  private static throwInvalidReport(debugMsg: string): Error {
    core.error(debugMsg)
    return new Error(
      'Invalid or missing task report. Check that the analysis finished successfully.'
    )
  }
}
