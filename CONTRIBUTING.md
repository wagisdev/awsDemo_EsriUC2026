# Contributing

Thanks for your interest in contributing. This repository is the public copy of
the Pormanes.NET map viewer — a TypeScript app deployed to AWS via CDK. It is an
npm workspaces monorepo with three packages:

- `web/` — the Vite + React client and the ArcGIS Maps SDK integration.
- `edge/` — the Lambda@Edge token-injection proxy.
- `infra/` — the AWS CDK app (CloudFront, WAF, Lambda@Edge, S3 origin).

## Prerequisites

- **Node.js 24** (or newer) and **npm**.
- **git**.
- For local runs against live services you also need ArcGIS Location Platform
  credentials. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — copy
  `web/.env.local.example` to `web/.env.local` and fill in your values.
  `web/.env.local` is gitignored and must never be committed.

## Getting started

```bash
npm ci                     # install all workspace dependencies
npm run dev --workspace web  # run the client locally at http://localhost:5173
```

## Checks before opening a pull request

Please make sure the full verification suite passes locally:

```bash
npm run lint    # ESLint (flat config)
npm test        # unit tests (web + edge)
npm run build   # type-check and build all workspaces
```

## Reporting bugs and feature requests

We welcome you to use the GitHub issue tracker to report bugs or suggest
features. When filing an issue, please check existing open and recently closed
issues to make sure somebody else hasn't already reported it. Try to include as
much information as you can — a reproducible test case or steps, the version
being used, and anything unusual about your environment or deployment.

## Contributing via pull requests

Contributions via pull requests are much appreciated. Before sending one, please
ensure that:

1. You are working against the latest source on the `main` branch.
2. You check existing open and recently merged pull requests to make sure
   someone else hasn't addressed the problem already.
3. You open an issue to discuss any significant work — we don't want your time
   wasted.

To send a pull request: fork the repository, modify the source focused on the
specific change, ensure the lint/test/build checks above pass, commit using
clear messages, and open the pull request. Pay attention to any automated CI
failures and stay involved in the conversation.

## Code of conduct

This project has adopted the [Amazon Open Source Code of Conduct](https://aws.github.io/code-of-conduct).
For more information see the [Code of Conduct FAQ](https://aws.github.io/code-of-conduct-faq) or contact
opensource-codeofconduct@amazon.com with any additional questions or comments.

## Security issue notifications

If you discover a potential security issue in this project we ask that you
notify AWS/Amazon Security via our
[vulnerability reporting page](https://aws.amazon.com/security/vulnerability-reporting/).
Please do **not** create a public GitHub issue. See [SECURITY.md](SECURITY.md).

## Licensing

See the [LICENSE](LICENSE) file for this project's licensing (MIT). We will ask
you to confirm the licensing of your contribution.
