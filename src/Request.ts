import * as core from '@actions/core'
import * as request from 'request'

interface RequestData {
  [x: string]: string
}

export default class Request {
  async get(
    url: string,
    authToken: string,
    path: string,
    isJson: boolean,
    query?: RequestData
  ): Promise<any> {
    core.debug(`[CS] API GET: '${path}' with query "${JSON.stringify(query)}"`)
    return new Promise((resolve, reject) => {
      const options: request.CoreOptions = {
        auth: {user: authToken}
      }
      if (query) {
        options.qs = query
        options.useQuerystring = true
      }
      request.get(
        {
          method: 'GET',
          baseUrl: url,
          uri: path,
          json: isJson,
          ...options
        },
        (error, response, body) => {
          if (error) {
            return Request.logAndReject(
              reject,
              `[CS] API GET '${path}' failed, error was: ${JSON.stringify(
                error
              )}`
            )
          }
          core.debug(
            `[CS] Response: ${response.statusCode} Body: "${
              Request.isString(body) ? body : JSON.stringify(body)
            }"`
          )
          if (response.statusCode < 200 || response.statusCode >= 300) {
            return Request.logAndReject(
              reject,
              `[CS] API GET '${path}' failed, status code was: ${response.statusCode}`
            )
          }
          return resolve(body || (isJson ? {} : ''))
        }
      )
    })
  }

  private static isString(x: object): boolean {
    return Object.prototype.toString.call(x) === '[object String]'
  }

  private static logAndReject(reject: any, errMsg: string): string {
    core.debug(errMsg)
    return reject(new Error(errMsg))
  }
}
