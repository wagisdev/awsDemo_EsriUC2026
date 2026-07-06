import {
  Stack,
  type StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
  ArnFormat,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as logs from "aws-cdk-lib/aws-logs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { createWebAcl } from "./waf";
import { buildCspFunctionCode } from "./csp-function";
import { ARCGIS_SECRET_NAME, DOMAIN_NAME } from "./constants";

export interface EdgeStackProps extends StackProps {
  /**
   * ACM certificate ARN (us-east-1) for the custom domain. When omitted the
   * distribution is deployed on the default *.cloudfront.net domain so the
   * stack is deployable before the cert is validated in Cloudflare DNS.
   */
  readonly certificateArn?: string;
  /**
   * Enable CloudFront caching of static content (24h). Default false so
   * development iterates fast; flip to true for production.
   */
  readonly cachingEnabled: boolean;
  /**
   * WAF IP rate limit (requests / 5 min / IP). Defaults to the value in
   * constants.ts; override for tuning against real traffic.
   */
  readonly wafRateLimit?: number;
  /**
   * Retention (days) for CloudFront + WAF access logs. Default 90.
   */
  readonly logRetentionDays?: number;
}

/**
 * Edge stack (us-east-1): Secrets Manager, Lambda@Edge token injector, WAF,
 * CSP CloudFront Function, and the CloudFront distribution with the two-behavior
 * routing (static S3 vs. cached-disabled Esri proxy).
 */
export class EdgeStack extends Stack {
  constructor(scope: Construct, id: string, props: EdgeStackProps) {
    super(scope, id, props);

    // --- Private static-site origin bucket (co-located, see ADR-0002) ------
    // Fully private: Block All Public Access, TLS enforced, SSE-S3, reachable
    // only via CloudFront OAC.
    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const logRetention = props.logRetentionDays ?? 90;

    // --- Access-log bucket (CloudFront standard logs) ----------------------
    // CloudFront legacy logging writes via ACLs, so this bucket keeps ACLs
    // enabled (BUCKET_OWNER_PREFERRED). Logs auto-expire to control cost.
    const accessLogsBucket = new s3.Bucket(this, "AccessLogsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_PREFERRED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      lifecycleRules: [{ expiration: Duration.days(logRetention) }],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // --- Secret: ArcGIS OAuth client id/secret -----------------------------
    // Created with placeholders only; real values are set out-of-band via the
    // AWS CLI (never committed / never in the template).
    const secret = new secretsmanager.Secret(this, "ArcgisOAuthSecret", {
      secretName: ARCGIS_SECRET_NAME,
      description: "ArcGIS Location Platform OAuth 2.0 app credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ clientId: "REPLACE_ME" }),
        generateStringKey: "clientSecret",
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Secret: ArcGIS basemap API key (dual-auth) ------------------------
    // Referrer-restricted key for basemaps/commodity services. Isolated from
    // the OAuth secret so nothing can leak the client secret. Read ONLY by the
    // asset-deploy step (no Lambda), which publishes it as /config.json.
    const apiKeySecret = new secretsmanager.Secret(this, "ArcgisApiKeySecret", {
      secretName: "pormanes/arcgis-apikey",
      description: "ArcGIS referrer-restricted basemap API key (client-side)",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "apiKey",
      },
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- Lambda@Edge token injector ----------------------------------------
    const edgeRole = new iam.Role(this, "EdgeFnRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.ServicePrincipal("lambda.amazonaws.com"),
        new iam.ServicePrincipal("edgelambda.amazonaws.com"),
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole",
        ),
      ],
    });
    // Least-privilege: read only this one secret.
    secret.grantRead(edgeRole);

    const tokenInjector = new lambda.Function(this, "TokenInjector", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler.handler",
      code: lambda.Code.fromAsset("../edge/dist"),
      role: edgeRole,
      // Right-sized from CloudWatch: this is an I/O-bound token injector (a
      // cached string-rewrite on warm hits, an OAuth POST on refresh). Observed
      // max memory ~99 MB and durations ~2 ms warm / ~200-280 ms on refresh /
      // ~2 s cold. 128 MB is Lambda's floor and the right fit — raising it only
      // raises GB-s cost with no benefit for I/O-bound work. Timeout is a
      // runaway-cost guardrail (billing is per actual ms, not the ceiling);
      // 10 s gives ~5x headroom over the observed cold-start worst case while
      // capping a hung upstream call. Lambda@Edge origin-request hard limit is 30 s.
      timeout: Duration.seconds(10),
      memorySize: 128,
      description: "Injects ArcGIS token on /arcgis-proxy/* origin requests",
    });

    // --- WAF (CLOUDFRONT scope) --------------------------------------------
    const webAcl = createWebAcl(this, props.wafRateLimit);

    // WAF logging -> CloudWatch Logs. The log group name MUST start with
    // "aws-waf-logs-". The logging config expects the ARN without the ":*"
    // suffix that LogGroup.logGroupArn appends, so rebuild it.
    const wafLogGroup = new logs.LogGroup(this, "WafLogGroup", {
      logGroupName: "aws-waf-logs-pormanes-cloudfront",
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    const wafLogGroupArn = this.formatArn({
      service: "logs",
      resource: "log-group",
      resourceName: wafLogGroup.logGroupName,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });
    new wafv2.CfnLoggingConfiguration(this, "WafLogging", {
      resourceArn: webAcl.attrArn,
      logDestinationConfigs: [wafLogGroupArn],
    });

    // --- CSP / security-headers CloudFront Function ------------------------
    const cspFunction = new cloudfront.Function(this, "SecurityHeadersFn", {
      code: cloudfront.FunctionCode.fromInline(buildCspFunctionCode()),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      comment: "Attaches CSP + security headers to static responses",
    });

    // --- Origins -----------------------------------------------------------
    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket);

    // Placeholder origin for the proxy behavior; Lambda@Edge overrides the
    // real target per-request, but a behavior still needs a configured origin.
    const proxyPlaceholderOrigin = new origins.HttpOrigin("www.arcgis.com", {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    // --- Certificate / domain ----------------------------------------------
    const certificate = props.certificateArn
      ? acm.Certificate.fromCertificateArn(this, "Cert", props.certificateArn)
      : undefined;

    // Production static caching: a 3-day TTL (vs. the managed CACHING_OPTIMIZED
    // policy's fixed 1-day default). minTtl 0 lets the no-cache index.html /
    // config.json still revalidate so new deploys + API-key rotations appear;
    // fingerprinted assets are immutable so a longer edge TTL is safe. The
    // /arcgis-proxy/* behavior is always CACHING_DISABLED (metering accuracy).
    const staticCachePolicy = props.cachingEnabled
      ? new cloudfront.CachePolicy(this, "StaticCachePolicy", {
          comment: "Pormanes static content — 3-day TTL",
          defaultTtl: Duration.days(3),
          minTtl: Duration.seconds(0),
          maxTtl: Duration.days(3),
          enableAcceptEncodingGzip: true,
          enableAcceptEncodingBrotli: true,
          cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          headerBehavior: cloudfront.CacheHeaderBehavior.none(),
          queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
        })
      : cloudfront.CachePolicy.CACHING_DISABLED;

    // --- Distribution ------------------------------------------------------
    const distribution = new cloudfront.Distribution(this, "Distribution", {
      comment: "Pormanes.NET map viewer",
      defaultRootObject: "index.html",
      webAclId: webAcl.attrArn,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      // Access logs for audit / anomaly detection.
      enableLogging: true,
      logBucket: accessLogsBucket,
      logFilePrefix: "cloudfront/",
      ...(certificate ? { domainNames: [DOMAIN_NAME], certificate } : {}),
      // Static content behavior -> private S3 (OAC).
      defaultBehavior: {
        origin: s3Origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy: staticCachePolicy,
        compress: true,
        functionAssociations: [
          {
            function: cspFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
          },
        ],
      },
      additionalBehaviors: {
        // Esri proxy behavior -> Lambda@Edge token injector, caching DISABLED.
        "/arcgis-proxy/*": {
          origin: proxyPlaceholderOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          compress: true,
          edgeLambdas: [
            {
              functionVersion: tokenInjector.currentVersion,
              eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
              includeBody: true,
            },
          ],
        },
      },
    });

    // --- Web app upload -----------------------------------------------------
    // NOTE: the built app is ~1,100 files (the ArcGIS SDK's lazy chunks + fonts).
    // We intentionally do NOT use s3deploy.BucketDeployment for this: its single
    // upload Lambda copies files serially and times out at ~15 min on this file
    // count. Instead the deploy pipeline (and infra/scripts/deploy-assets.sh)
    // runs `aws s3 sync` — massively parallel, finishes in well under a minute —
    // followed by a CloudFront invalidation. See ADR-0008.

    // --- Outputs -----------------------------------------------------------
    new CfnOutput(this, "DistributionDomainName", {
      value: distribution.distributionDomainName,
      description: "CloudFront domain (point demo.gis.dev CNAME here)",
    });
    new CfnOutput(this, "DistributionId", {
      value: distribution.distributionId,
    });
    new CfnOutput(this, "SiteBucketName", {
      value: siteBucket.bucketName,
      description: "Upload the built web app here: aws s3 sync web/dist s3://<name>",
    });
    new CfnOutput(this, "ArcgisApiKeySecretArn", {
      value: apiKeySecret.secretArn,
      description: "Basemap API key. Populate: aws secretsmanager put-secret-value ...",
    });
    new CfnOutput(this, "ArcgisSecretArn", {
      value: secret.secretArn,
      description: "Populate with: aws secretsmanager put-secret-value ...",
    });
    new CfnOutput(this, "CustomDomainConfigured", {
      value: certificate ? DOMAIN_NAME : "(none - using default cloudfront.net)",
    });
    new CfnOutput(this, "AccessLogsBucketName", {
      value: accessLogsBucket.bucketName,
      description: "CloudFront access logs (prefix cloudfront/)",
    });
    new CfnOutput(this, "WafLogGroupName", {
      value: wafLogGroup.logGroupName,
      description: "WAF request logs (CloudWatch Logs)",
    });
  }
}
