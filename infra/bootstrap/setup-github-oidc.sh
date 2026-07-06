#!/usr/bin/env bash
#
# One-time setup: CDK bootstrap + GitHub Actions OIDC least-privilege deploy role.
#
# GOLDEN PATH / LEAST PRIVILEGE:
#   GitHub Actions authenticates to AWS via OpenID Connect (no long-lived keys).
#   The federated role it assumes can do exactly ONE thing: assume the CDK
#   bootstrap roles to run `cdk deploy`. It is further restricted to this repo
#   and the `production` GitHub Environment (the deploy job runs in that
#   environment, so its OIDC subject is repo:<repo>:environment:production).
#   This lets you gate deploys with environment protection rules. GitHub itself
#   never holds broad AWS permissions.
#
# Run this locally with an admin/elevated session (it creates IAM resources).
#
# Prerequisites:
#   - AWS CLI v2 configured for the target account, e.g.:
#       aws sso login --profile <your-admin-profile>
#       export AWS_PROFILE=<your-admin-profile>
#     (or `aws configure` with admin credentials)
#   - Node + CDK available (npx cdk ...)
#
set -euo pipefail

# ------------------------------------------------------------------ #
# EDIT THESE
# ------------------------------------------------------------------ #
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID to your 12-digit account id}"
EDGE_REGION="us-east-1"                 # CloudFront cert / WAF / Lambda@Edge region
GITHUB_REPO="wagisdev/awsDemo_EsriUC2026_Sec"
ROLE_NAME="pormanes-github-deploy"

# Optional hardening: set HARDENED=true to bootstrap CDK with a SCOPED
# CloudFormation execution policy (from cfn-exec-policy.json) instead of the
# default AdministratorAccess. VALIDATE in a non-prod account first — if a
# deploy fails with AccessDenied, add the missing action to that JSON.
HARDENED="${HARDENED:-false}"
CFN_EXEC_POLICY_NAME="pormanes-cdk-cfn-exec"
# ------------------------------------------------------------------ #

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OIDC_URL="token.actions.githubusercontent.com"
OIDC_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/${OIDC_URL}"

echo ">> 1/4  Ensuring GitHub OIDC identity provider exists..."
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC_ARN" >/dev/null 2>&1; then
  echo "    OIDC provider already present."
else
  # AWS no longer verifies the thumbprint for GitHub, but the API requires one.
  aws iam create-open-id-connect-provider \
    --url "https://${OIDC_URL}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1"
  echo "    Created OIDC provider."
fi

echo ">> 2/4  Creating/updating the deploy role trust + permissions..."
TRUST_JSON="$(mktemp)"; PERM_JSON="$(mktemp)"
trap 'rm -f "$TRUST_JSON" "$PERM_JSON"' EXIT
sed "s/<AWS_ACCOUNT_ID>/${AWS_ACCOUNT_ID}/g" "$HERE/github-oidc-trust-policy.json"   > "$TRUST_JSON"
sed "s/<AWS_ACCOUNT_ID>/${AWS_ACCOUNT_ID}/g" "$HERE/github-deploy-permissions.json" > "$PERM_JSON"

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  aws iam update-assume-role-policy --role-name "$ROLE_NAME" --policy-document "file://$TRUST_JSON"
else
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document "file://$TRUST_JSON" \
    --description "GitHub Actions OIDC deploy role for ${GITHUB_REPO} (assumes CDK roles only)"
fi
aws iam put-role-policy --role-name "$ROLE_NAME" \
  --policy-name "cdk-deploy" \
  --policy-document "file://$PERM_JSON"

echo ">> 3/4  Bootstrapping CDK in ${EDGE_REGION}..."
if [ "$HARDENED" = "true" ]; then
  echo "    HARDENED mode: creating scoped CloudFormation execution policy..."
  EXEC_JSON="$(mktemp)"
  sed "s/<AWS_ACCOUNT_ID>/${AWS_ACCOUNT_ID}/g" "$HERE/cfn-exec-policy.json" > "$EXEC_JSON"
  EXEC_POLICY_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${CFN_EXEC_POLICY_NAME}"
  if aws iam get-policy --policy-arn "$EXEC_POLICY_ARN" >/dev/null 2>&1; then
    # Add a new default version (IAM keeps max 5; prune oldest if needed).
    aws iam create-policy-version --policy-arn "$EXEC_POLICY_ARN" \
      --policy-document "file://$EXEC_JSON" --set-as-default >/dev/null
  else
    aws iam create-policy --policy-name "$CFN_EXEC_POLICY_NAME" \
      --policy-document "file://$EXEC_JSON" >/dev/null
  fi
  rm -f "$EXEC_JSON"
  CFN_EXEC_POLICIES="$EXEC_POLICY_ARN"
else
  CFN_EXEC_POLICIES="arn:aws:iam::aws:policy/AdministratorAccess"
fi

npx cdk bootstrap "aws://${AWS_ACCOUNT_ID}/${EDGE_REGION}" \
  --cloudformation-execution-policies "$CFN_EXEC_POLICIES"

echo ">> 4/4  Done."
echo ""
echo "Add this as the GitHub Actions variable AWS_DEPLOY_ROLE_ARN (repo Settings > Secrets and variables > Actions):"
echo "    arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}"
