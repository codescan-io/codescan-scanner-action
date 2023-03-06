codescan-scanner-action
=============

Run CodeScan static code analysis jobs from Github workflow. The CodeScan action produces SARIF report file with analysis results.

## Input parameters for Action

| Parameter name | Required / Default value | Description |
|------------- | -------- | ---------------- |
| organization | **required** | Organization Key |
| projectKey | **required** | Project Key |
| login | **required** | Security authentication key for the user having scan access for the project |
| codeScanUrl | https://app.codescan.io/ | CodeScanCloud endpoint for your project |
| pollingTimeoutSec | 900 | Timeout to wait for Post-Analysis report generation is completed (in seconds) |
| generateReportFile | true | The flag to indicate that SARIF file should be generated on client side. |
| generateSarifFile | false | The flag to indicate that SARIF file should be generated on server side. |
| failOnRedQualityGate | false | The flag to indicate that pipeline will fail in case of quality gate status failed. |
| args | | Optional parameters passed to CodeScan analyzer |

## Example of using Action in Github Workflow

```yml
    -   name: Run Analysis
        uses: codescan-io/codescan-scanner-action@master
        with:
            login: ${{ secrets.CODESCAN_AUTH_TOKEN }}
            organization: test-org
            projectKey: test-java-project
            args: |
                sonar.verbose=true
                sonar.java.binaries=target
```

## SARIF file output

By default the Action will generate SARIF report file on client side.
You can disable this feature via `generateReportFile` input parameter.

SARIF report file can also generated on server side.
This feature can be enabled via `generateSarifFile` input parameter.

As a next Workflow step you have to upload SARIF file:

```
    -   name: Upload SARIF file
        uses: github/codeql-action/upload-sarif@v1
        with:
            sarif_file: codescan.sarif
```

When SARIF file is uploaded, you can view, fix, and close alerts for potential vulnerabilities or errors in your project's code.
For details read this article: [Managing alerts from code scanning](https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/managing-alerts-from-code-scanning)
