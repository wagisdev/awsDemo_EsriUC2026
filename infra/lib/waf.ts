import { Construct } from "constructs";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import { WAF_MANAGED_RULE_GROUPS, WAF_RATE_LIMIT } from "./constants";

/**
 * Builds a CLOUDFRONT-scope WAF WebACL: AWS-managed rule groups (common
 * exploits, known-bad inputs, IP reputation) plus an IP rate-based rule to
 * throttle map-scraping bots. Must be created in us-east-1.
 *
 * @param rateLimit requests per 5-minute window per IP before blocking.
 */
export function createWebAcl(
  scope: Construct,
  rateLimit: number = WAF_RATE_LIMIT,
): wafv2.CfnWebACL {
  const managedRules: wafv2.CfnWebACL.RuleProperty[] = WAF_MANAGED_RULE_GROUPS.map(
    (name, index) => ({
      name,
      priority: index,
      overrideAction: { none: {} },
      statement: {
        managedRuleGroupStatement: { vendorName: "AWS", name },
      },
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: name,
      },
    }),
  );

  const rateRule: wafv2.CfnWebACL.RuleProperty = {
    name: "RateLimitPerIp",
    priority: managedRules.length,
    action: { block: {} },
    statement: {
      rateBasedStatement: {
        limit: rateLimit,
        aggregateKeyType: "IP",
      },
    },
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: "RateLimitPerIp",
    },
  };

  return new wafv2.CfnWebACL(scope, "WebAcl", {
    name: "pormanes-cloudfront-waf",
    scope: "CLOUDFRONT",
    defaultAction: { allow: {} },
    rules: [...managedRules, rateRule],
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: "pormanes-cloudfront-waf",
    },
  });
}
