# Contributing

Medical BI Designer is currently preparing the V3 architecture. External feature contributions are not accepted until the V3 data model and Phase7 migration boundary are stable.

Bug reports and documentation corrections are welcome if they use synthetic data and contain no private healthcare or infrastructure information.

The repository is source-visible and all rights are reserved. Public access,
issue participation, or acceptance of a pull request does not by itself grant
an open-source license to the project.

## Before opening an issue

- Check existing issues.
- Reproduce the problem with the latest default branch.
- Remove patient data, credentials, internal addresses and private SQL.
- Include the browser, Node.js version and reproduction steps.

## Local verification

```powershell
npm ci
npm test
npm run build
```

Windows users can run `start-dev.cmd` for local development.

## Pull requests

Maintainer-approved pull requests should:

- stay within the agreed phase boundary;
- include tests for model or behavior changes;
- preserve V1/V2 migration compatibility;
- update affected documentation;
- avoid generated files and private assets;
- pass CI before review.

By contributing, you confirm that you have the right to submit the material and that it contains no confidential healthcare data.
