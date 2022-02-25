import * as core from '@actions/core'
import {Scanner} from './Scanner'

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
    const generateSarifFile = core.getInput('generateSarifFile') === 'true'

    if (generateSarifFile) {
      Object.assign(options, {
        'codescan.reports.enabled': 'true',
        'codescan.reports.types': 'sarif'
      })
    }

    await new Scanner().runAnalysis(codeScanUrl, authToken, options)
    core.debug('[CS] CodeScan Analysis completed.')
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
