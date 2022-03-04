import * as core from '@actions/core'
import Request from './Request'

interface ITask {
  id: string
  type: string
  componentId: string
  componentKey: string
  componentName: string
  componentQualifier: string
  analysisId: string
  status: string
  submittedAt: string
  startedAt: string
  executedAt: string
  executionTimeMs: number
  submitterLogin?: string
  logs?: boolean
  hasScannerContext?: boolean
  organization?: string
  warningCount?: number
  warnings?: string[]
  errorMessage?: string
}

export default class Task {
  constructor(private readonly task: ITask) {}

  get id(): string {
    return this.task.id
  }

  static async waitForTaskCompletion(
    codeScanUrl: string,
    authToken: string,
    taskId: string,
    tries: number,
    delay = 1000
  ): Promise<Task> {
    core.debug(`[CS] Waiting for task '${taskId}' to complete.`)
    return new Request()
      .get(codeScanUrl, authToken, `/api/ce/task`, true, {
        id: taskId
      })
      .then(
        ({task}: {task: ITask}) => {
          core.debug(`[CS] Task status:${task.status}`)
          if (tries <= 0) {
            throw new TimeOutReachedError()
          }
          const errorInfo = task.errorMessage
            ? `, Error message: ${task.errorMessage}`
            : ''
          switch (task.status.toUpperCase()) {
            case 'CANCEL':
            case 'FAILED':
              throw new Error(
                `[CS] Task failed with status ${task.status}${errorInfo}`
              )
            case 'SUCCESS':
              core.debug(`[CS] Task complete: ${JSON.stringify(task)}`)
              return new Task(task)
            default:
              return new Promise<Task>((resolve, reject) =>
                setTimeout(() => {
                  Task.waitForTaskCompletion(
                    codeScanUrl,
                    authToken,
                    taskId,
                    tries,
                    delay
                  ).then(resolve, reject)
                  tries--
                }, delay)
              )
          }
        },
        (err: Error) => {
          if (err && err.message) {
            core.error(err.message)
          } else if (err) {
            core.error(JSON.stringify(err))
          }
          throw new Error(`[CS] Could not fetch task for ID '${taskId}'`)
        }
      )
  }
}

export class TimeOutReachedError extends Error {
  constructor() {
    super()
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, TimeOutReachedError.prototype)
  }
}
