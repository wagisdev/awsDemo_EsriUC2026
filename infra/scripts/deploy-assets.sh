#!/usr/bin/env bash
#
# Upload the built web app to the private origin bucket and invalidate
# CloudFront. This replaces s3deploy.BucketDeployment, which is too slow for the
# ~1,100-file ArcGIS SDK build (see docs/adr/0008). `aws s3 sync` uploads in
# parallel and finishes in well under a minute.
#
# Usage:  ./infra/scripts/deploy-assets.sh
#   Requires an authenticated AWS session and that web/dist is built.
#   Reads the bucket + distribution id from the CloudFormation stack outputs.
#
set -euo pipefail

STACK_NAME="${STACK_NAME:-PormanesEdgeStack}"
REGION="${AWS_REGION:-us-east-1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST_DIR="$HERE/../../web/dist"

if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: $DIST_DIR not found. Build the web app first: npm run build:web" >&2
  exit 1
fi

echo ">> Reading stack outputs from $STACK_NAME ($REGION)..."
outputs="$(aws cloudformation describe-stacks --region "$REGION" \
  --stack-name "$STACK_NAME" --query "Stacks[0].Outputs" --output json)"

BUCKET="$(echo "$outputs" | python3 -c 'import sys,json; print(next(o["OutputValue"] for o in json.load(sys.stdin) if o["OutputKey"]=="SiteBucketName"))')"
DIST_ID="$(echo "$outputs" | python3 -c 'import sys,json; print(next(o["OutputValue"] for o in json.load(sys.stdin) if o["OutputKey"]=="DistributionId"))')"

# Publish the referrer-restricted basemap API key from Secrets Manager as a
# runtime config file (dual-auth). Secrets Manager is the single source of
# truth; rotating the key = update the secret + re-run this script.
APIKEY_SECRET_ID="${APIKEY_SECRET_ID:-pormanes/arcgis-apikey}"
echo ">> Reading basemap API key from Secrets Manager ($APIKEY_SECRET_ID)..."
API_KEY="$(aws secretsmanager get-secret-value --region "$REGION" \
  --secret-id "$APIKEY_SECRET_ID" --query SecretString --output text 2>/dev/null \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("apiKey",""))' 2>/dev/null || true)"
if [ -z "$API_KEY" ]; then
  echo "   WARNING: no apiKey in $APIKEY_SECRET_ID — basemaps will not authorize."
fi
# Write config.json into the build output so it is synced with everything else.
python3 - "$DIST_DIR/config.json" "$API_KEY" <<'PY'
import json, sys
path, key = sys.argv[1], sys.argv[2]
json.dump({"arcgisApiKey": key}, open(path, "w"))
PY

echo ">> Syncing $DIST_DIR -> s3://$BUCKET ..."
# Long-lived cache for fingerprinted assets; the CloudFront cache policy still
# governs edge TTLs. index.html is uploaded last with no-cache so new deploys
# are picked up immediately.
aws s3 sync "$DIST_DIR" "s3://$BUCKET" --delete \
  --exclude "index.html" --exclude "config.json" \
  --cache-control "public,max-age=31536000,immutable"
# index.html and config.json must never be cached so new deploys / key
# rotations are picked up immediately.
aws s3 cp "$DIST_DIR/index.html" "s3://$BUCKET/index.html" \
  --cache-control "no-cache"
aws s3 cp "$DIST_DIR/config.json" "s3://$BUCKET/config.json" \
  --cache-control "no-cache" --content-type "application/json"

echo ">> Invalidating CloudFront distribution $DIST_ID ..."
aws cloudfront create-invalidation --distribution-id "$DIST_ID" \
  --paths "/*" --query "Invalidation.Id" --output text

echo ">> Done."
