# Security Policy

Medical BI Designer handles database connection metadata and may be used with healthcare analytics data. Do not include patient information, credentials, private SQL, internal network addresses, or production data in public reports.

## Supported versions

The project is currently in pre-release development. Security fixes apply to the latest default branch only.

## Reporting a vulnerability

Use GitHub Private Vulnerability Reporting for the repository. Do not open a public issue for a suspected vulnerability.

Include:

- affected version or commit;
- reproduction steps using synthetic data;
- expected security boundary;
- observed impact;
- suggested mitigation, if available.

Do not attach real credentials, database exports, patient data, or internal screenshots. If sensitive evidence is necessary, coordinate a private transfer method after the report is acknowledged.

## Security boundaries

- The local API binds to `127.0.0.1`.
- Database queries are restricted to read-only `SELECT` or `WITH` statements.
- Database passwords are encrypted in local storage and excluded from Git.
- `server/.data/`, `.env.local`, logs, backups, and real validation configuration are private assets.
- Public examples must use synthetic data and placeholder infrastructure.
