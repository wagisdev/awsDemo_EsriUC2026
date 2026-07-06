#!/usr/bin/env node
import { App, Tags } from "aws-cdk-lib";
import { EdgeStack } from "../lib/edge-stack";
import { EDGE_REGION } from "../lib/constants";

const app = new App();

// Account resolved from the deploy environment (CDK_DEFAULT_ACCOUNT) or a
// context override; a placeholder keeps `cdk synth` working offline.
const account =
  app.node.tryGetContext("account") ??
  process.env.CDK_DEFAULT_ACCOUNT ??
  "000000000000";

// Optional custom-domain certificate (us-east-1). Provided once validated in
// Cloudflare:  cdk deploy -c certificateArn=arn:aws:acm:us-east-1:...:certificate/...
const certificateArn: string | undefined =
  app.node.tryGetContext("certificateArn") || process.env.CERTIFICATE_ARN || undefined;

// Static caching is OFF by default for fast dev iteration.
// Enable for production:  cdk deploy -c caching=true
const cachingEnabled = String(app.node.tryGetContext("caching")) === "true";

// Optional WAF tuning:  cdk deploy -c wafRateLimit=1000
const wafRateLimitCtx = app.node.tryGetContext("wafRateLimit");
const wafRateLimit = wafRateLimitCtx ? Number(wafRateLimitCtx) : undefined;

// All CloudFront-coupled resources (cert, WAF, Lambda@Edge) are us-east-1-only;
// the private origin bucket is co-located there too (see docs/adr/0002).
new EdgeStack(app, "PormanesEdgeStack", {
  env: { account, region: EDGE_REGION },
  certificateArn,
  cachingEnabled,
  wafRateLimit,
  description:
    "Pormanes.NET CloudFront + WAF + Lambda@Edge token injector + S3 origin (us-east-1)",
});

Tags.of(app).add("project", "pormanes-gis-demo");
Tags.of(app).add("owner", "pormanes.net");
