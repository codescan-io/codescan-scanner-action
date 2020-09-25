import scanner from 'sonarqube-scanner'
import * as core from '@actions/core'

export class Scanner {
  readonly doScan = (options: object): Promise<object> =>
    new Promise(resolve => scanner(options, resolve))

  async runAnalysis(
    serverUrl: string,
    token: string,
    options: object
  ): Promise<void> {
    core.debug(`[CS] Scanner options: ${JSON.stringify(options)}`)
    await this.doScan({
      serverUrl,
      token,
      options
    })
  }
}
