# ADR-0008: Upload web assets with `aws s3 sync`, not `BucketDeployment`

**Status:** Accepted (supersedes the original BucketDeployment approach)

## Context

The built web app is ~1,100 files / ~22 MB — dominated by the ArcGIS Maps SDK's
many lazy-loaded JS chunks plus ~50 font files pulled in via the SDK theme CSS.

The first deploy used `aws-s3-deployment.BucketDeployment`, which uploads by
zipping the assets, then running a single Lambda that unzips and copies every
file to the destination bucket. With ~1,100 files this Lambda copies serially at
roughly 0.5 files/sec and never finishes within the 15-minute Lambda limit;
CloudFormation then restarts it from zero, so the stack hangs in
`CREATE_IN_PROGRESS` indefinitely. Raising the Lambda's memory helped only
marginally because the bottleneck is per-object PUT latency, not bandwidth.

We also confirmed the hosting model is correct: this is a static SPA, so S3 +
CloudFront is the right host (Fargate/containers would add cost, a VPC, an image
build/push, and ops burden with no benefit). The problem was purely the *upload
tool*, not the architecture.

## Decision

CDK provisions the **infrastructure only** (bucket, CloudFront, WAF, Lambda@Edge,
Secrets Manager, ACM). Web assets are uploaded with **`aws s3 sync`** followed by
a CloudFront invalidation, as a pipeline step:

- Locally / manually: `infra/scripts/deploy-assets.sh`
- CI: a workflow step after `cdk deploy`.

`aws s3 sync` uploads in parallel and completes ~1,100 files in well under a
minute. Fingerprinted assets are sent with a long immutable `Cache-Control`;
`index.html` is sent `no-cache` so new deploys are picked up immediately.

## Consequences

- Deploys are fast and reliable regardless of file count.
- Clean separation: infrastructure (CDK/CloudFormation) vs. content (sync).
- The pipeline needs the bucket name + distribution id — exposed as stack
  outputs (`SiteBucketName`, `DistributionId`).
- One extra pipeline step instead of an in-stack custom resource; the GitHub
  deploy role already has the needed S3 + CloudFront permissions via the CDK
  roles it assumes, and the manual script uses the operator's session.
- Rollback no longer couples asset upload to stack state.
