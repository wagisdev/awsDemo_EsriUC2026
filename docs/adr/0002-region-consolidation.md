# ADR-0002: Consolidate CloudFront-coupled resources in us-east-1

**Status:** Accepted

## Context

The project standard is to work in **us-west-2** when possible and use
**us-east-1** only when a service requires it. For a CloudFront-fronted app,
several resources are us-east-1-only:

- the ACM certificate attached to a CloudFront distribution,
- a WAF WebACL with `CLOUDFRONT` scope,
- Lambda@Edge functions.

The only resource that *could* live in us-west-2 is the private static-origin S3
bucket. We initially split it into a us-west-2 stack. That created a **circular
cross-region dependency**: the bucket's OAC policy needs the CloudFront
distribution ARN, while the distribution needs the bucket as an origin — CDK
rejects the cycle. Breaking it would require a looser (`SourceAccount`-only)
bucket policy plus fragile cross-region `BucketDeployment`.

## Decision

Co-locate the private origin bucket with the CloudFront-coupled resources in a
single **us-east-1** stack.

## Consequences

- Deployment is reliable and simple: one stack, no cross-region references, tight
  per-distribution OAC bucket policy, straightforward asset deployment.
- Lower origin-fetch latency from the edge function's region.
- We deviate from the us-west-2 preference for this one bucket. Given every other
  component must be us-east-1 and the split forces either a dependency cycle or a
  weaker security posture, us-east-1 is the justified "when you have to" choice.
- If a us-west-2 origin becomes a hard requirement later, revisit with a
  `SourceAccount`-scoped policy and an imported-bucket origin.
