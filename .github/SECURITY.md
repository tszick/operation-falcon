# Security policy

Report vulnerabilities privately through [GitHub Security Advisories](https://github.com/tszick/operation-falcon/security/advisories/new). Do not post credentials or flight logs in a public issue.

The supported version is the latest default-branch revision. The included server is a localhost development server, not a public hosting service. Public deployments must provide equivalent path restrictions, CSP and security headers at the hosting layer.

Dependency checks and CodeQL run nightly and on changes. Scheduled jobs require the workflow files on the default branch and Actions/code scanning enabled. Dependabot security alerts/automatic security updates are repository settings; version-update schedules alone do not enable those settings. GitHub schedules are best-effort and may run late; inactive public repositories can have scheduled jobs disabled.
