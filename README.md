codescan-scanner-action
=============

Run CodeScan static code analysis jobs from Github actions. The action may produce SARIF file with analysis results.

## Input parameters for Action

| Parameter name | Required / Default value | Description |
|------------- | -------- | ---------------- |
| organization | **required** | Organization Key |
| projectKey | **required** | Project Key |
| login | **required** | Security authentication key for the user having scan access for the project |
| codeScanUrl | https://app.codescan.io/ | CodeScanCloud endpoint for your project |
| pollingTimeoutSec | 300 | Timeout to wait for Post-Analysis report generation is completed (in seconds) |
| generateSarifFile | true | The flag to indicate that SARIF file should be generated. |
| args | | Optional parameters passed to CodeScan analyzer |

## Example of using Action in Github Workflow

```yml
    -   name: Run Analysis
        uses: codescan-io/codescan-scanner-action@main
        with:
            login: ${{ secrets.CODESCAN_AUTH_TOKEN }}
            organization: test-org
            projectKey: test-java-project
            args: |
                sonar.verbose=true
                sonar.java.binaries=target
```

## SARIF file output

Be default the Action will generate SARIF report file.
You can disable this feature via `generateSarifFile` input parameter.

As a next Workflow step you have to upload SARIF file:

```
    -   name: Upload SARIF file
        uses: github/codeql-action/upload-sarif@v1
        with:
            sarif_file: codescan.sarif
```

When SARIF file is uploaded, you can view, fix, and close alerts for potential vulnerabilities or errors in your project's code.
For details read this article: [Managing alerts from code scanning](https://docs.github.com/en/github/finding-security-vulnerabilities-and-errors-in-your-code/managing-alerts-from-code-scanning)
