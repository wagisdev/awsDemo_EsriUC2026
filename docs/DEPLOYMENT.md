# Deployment Runbook (beginner-friendly)

This guide assumes **no prior experience** with AWS, the command line, or the
tools involved. Follow it top to bottom. Each step says what to run, what you
should see, and how to fix the most common problems.

If you get stuck, jump to [Troubleshooting](#troubleshooting) at the bottom.

---

## What you're building

A map website served securely from AWS:

- The website files live in a **private** storage bucket (S3) that the public
  cannot read directly.
- **CloudFront** (Amazon's global CDN) serves the site over HTTPS at
  `demo.gis.dev`.
- A small function at the edge (**Lambda@Edge**) attaches a short-lived ArcGIS
  **OAuth token** to the **data** requests, so the OAuth client secret never
  reaches the browser. (Basemaps use a separate, referrer-restricted **API key**
  loaded in the browser — a deliberate split; see the dual-auth note below.)
- A firewall (**WAF**) sits in front to block bad traffic.

> **Two ArcGIS credentials (dual-auth).** This app uses two ArcGIS apps: an
> **OAuth app** (client id + secret) that protects your network **data** behind
> the edge proxy, and an **API-key app** (a referrer-restricted key) for
> **basemaps**. The OAuth secret stays in AWS; the basemap key is delivered to
> the browser (protected by an HTTP-referrer restriction). You'll store both in
> AWS Secrets Manager in Step 7. See [SECURITY.md](SECURITY.md) §1 and
> [adr/0009](adr/0009-dual-auth.md).

Everything is created for you by code (**AWS CDK**). You mostly run a few
commands and copy a couple of values into your DNS and ArcGIS settings.

## Glossary (plain-English)

| Term | Meaning |
|------|---------|
| **AWS account** | Your Amazon cloud account. Has a 12-digit number (the "account id"). |
| **Region** | A geographic AWS location. We use **us-east-1** (N. Virginia). |
| **CLI** | "Command line interface" — you type commands in a terminal. |
| **CDK** | Tool that turns our TypeScript into AWS resources. |
| **Bootstrap** | One-time CDK setup in your account so it can deploy. |
| **OIDC** | A way for GitHub to log into AWS without storing passwords/keys. |
| **ACM** | AWS Certificate Manager — issues the HTTPS certificate. |
| **Secret** | The ArcGIS client id/secret, stored safely in AWS Secrets Manager. |

> **Regions:** everything is deployed in **us-east-1** because CloudFront
> certificates, WAF, and Lambda@Edge only work there.

---

## Step 0 — Install the tools (once)

You need **git**, **Node.js 22+**, and the **AWS CLI v2**.

### macOS

If you have [Homebrew](https://brew.sh):

```bash
brew install git node awscli
```

No Homebrew? Install Node from <https://nodejs.org> (choose the LTS 22+
installer) and the AWS CLI from
<https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html>.

### Windows

Install each with their official installers:
- Git: <https://git-scm.com/download/win>
- Node.js 22+ (LTS): <https://nodejs.org>
- AWS CLI v2: <https://awscli.amazonaws.com/AWSCLIV2.msi>

Then use **Git Bash** (installed with Git) to run the commands below.

### Linux

```bash
# Node via nodesource or your package manager; AWS CLI v2:
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip awscliv2.zip && sudo ./aws/install
```

### Verify everything is installed

```bash
node -v     # should print v22.x or higher (Node 24 recommended; CI runs on 24)
npm -v      # any recent version
git --version
aws --version   # should print aws-cli/2.x
```

If any command says "command not found", re-open your terminal or re-run the
installer.

---

## Step 1 — Get the code

```bash
git clone https://github.com/wagisdev/awsDemo_EsriUC2026_Sec.git
cd awsDemo_EsriUC2026_Sec
npm install
```

`npm install` downloads dependencies for all three parts (web, edge, infra). It
may take a couple of minutes and print some warnings — that's normal.

---

## Step 2 — Connect the AWS CLI to your account

You need credentials for an AWS user/role with administrator access (for the
one-time setup). Two common ways:

### Option A — IAM Identity Center / SSO (recommended)

```bash
aws configure sso
```

Answer the prompts (your SSO start URL, region `us-east-1`). It opens a browser
to sign in. When done, note the **profile name** it created, then:

```bash
export AWS_PROFILE=<that-profile-name>
aws sso login
```

### Option B — Access keys

If you were given an Access Key ID and Secret Access Key:

```bash
aws configure
# AWS Access Key ID:     <paste>
# AWS Secret Access Key: <paste>
# Default region name:   us-east-1
# Default output format:  json
```

### Confirm it works and find your account id

```bash
aws sts get-caller-identity
```

Expected output (yours will differ):

```json
{
  "UserId": "AIDA...",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/you"
}
```

The **`Account`** value (12 digits) is your account id — you'll use it next.

```bash
export AWS_ACCOUNT_ID=123456789012   # <-- use YOUR number
```

> Keep this terminal open; the exported variables (`AWS_PROFILE`,
> `AWS_ACCOUNT_ID`) only last for this session.

---

## Step 3 — Get your ArcGIS credentials ready

Because of the dual-auth model you need **two** things from the ArcGIS Location
Platform developer portal:

1. **OAuth 2.0 app (for data)** — a **Client ID** and **Client Secret**. This is
   the app that owns your network layers.
2. **API key (for basemaps)** — a **referrer-restricted API key**. Restrict it to
   the referrers in Step 11 (`https://demo.gis.dev`, your CloudFront domain, and
   `http://localhost:5173`).

You won't type them yet — just have all three values handy. **Never paste them
into chat, commits, or screenshots.**

---

## Step 4 — Run it locally first (optional but recommended)

This confirms the app works before touching AWS.

```bash
cp web/.env.local.example web/.env.local
```

Open `web/.env.local` in a text editor and fill in your ArcGIS values. The
client id/secret power the local token proxy (data); `VITE_ARCGIS_API_KEY` is the
referrer-restricted basemap key (its referrers must include
`http://localhost:5173`):

```
ARCGIS_CLIENT_ID=your-client-id
ARCGIS_CLIENT_SECRET=your-client-secret
VITE_ARCGIS_API_KEY=your-referrer-restricted-basemap-key
```

Then start the local server (leave it running in this terminal):

```bash
npm run dev --workspace web
```

Open <http://localhost:5173> in your browser. You should see the Pormanes.NET
map. Press `Ctrl+C` in the terminal to stop it.

> `web/.env.local` is ignored by git and never uploaded to AWS.

---

## Step 5 — One-time AWS setup (bootstrap + GitHub login)

This creates the GitHub deploy login (OIDC), a least-privilege deploy role, and
prepares your account for CDK. Make sure Step 2's variables are still set, then:

```bash
./infra/bootstrap/setup-github-oidc.sh
```

Expected: it prints progress for 4 steps and finishes with a line like:

```
Add this as the GitHub Actions variable AWS_DEPLOY_ROLE_ARN ...
    arn:aws:iam::123456789012:role/pormanes-github-deploy
```

**Copy that ARN.** In your GitHub repository:
Settings → Secrets and variables → Actions → **Variables** tab → **New
repository variable** → name `AWS_DEPLOY_ROLE_ARN`, value = the ARN.

> **Optional hardening:** to give the deploy pipeline a *scoped* permission set
> instead of full admin, run it as `HARDENED=true ./infra/bootstrap/setup-github-oidc.sh`.
> Test this in a non-production account first (see
> [SECURITY.md](SECURITY.md) "Addressed vs. remaining").

---

## Step 6 — First deploy

Deployment has two parts: CDK creates the **infrastructure**, then a script
**uploads the web app** with `aws s3 sync` and invalidates CloudFront. (The
upload is a separate step on purpose — see [adr/0008](adr/0008-asset-upload-s3-sync.md)
for why we don't bundle it into the CDK stack.)

```bash
npm run build:edge
npm run build:web

# 1. Infrastructure (CloudFront, WAF, Lambda@Edge, S3, secret)
cd infra
npx cdk deploy --all --require-approval never
cd ..

# 2. Upload the built app + invalidate CloudFront (fast, parallel)
./infra/scripts/deploy-assets.sh
```

The CDK step takes several minutes (CloudFront is slow to create). When it
finishes, it prints **Outputs** including:

```
PormanesEdgeStack.DistributionDomainName = d111111abcdef8.cloudfront.net
PormanesEdgeStack.SiteBucketName        = pormanesedgestack-sitebucket-xxxx
PormanesEdgeStack.ArcgisSecretArn       = arn:aws:secretsmanager:us-east-1:...:secret:pormanes/arcgis-oauth-XXXX
```

**Copy the `DistributionDomainName`** — that's your live CloudFront address.

> First deploy may pause on "creating CloudFormation changeset..." for a while —
> CloudFront genuinely takes 5–10 minutes. The `deploy-assets.sh` upload, by
> contrast, finishes in under a minute even though the app is ~1,100 files.

> In CI, both parts run automatically: the GitHub workflow runs `cdk deploy`
> then the same `deploy-assets.sh` step.

---

## Step 7 — Put your ArcGIS credentials into AWS

The CDK created **two** empty secrets in Step 6. Now fill both with your real
values (from Step 3).

**7a — the OAuth secret (data).** Used by the edge function:

```bash
aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id pormanes/arcgis-oauth \
  --secret-string '{"clientId":"YOUR_CLIENT_ID","clientSecret":"YOUR_CLIENT_SECRET"}'
```

**7b — the basemap API key (basemaps).** Used at deploy time to build the
client's `/config.json`:

```bash
aws secretsmanager put-secret-value \
  --region us-east-1 \
  --secret-id pormanes/arcgis-apikey \
  --secret-string '{"apiKey":"YOUR_REFERRER_RESTRICTED_API_KEY"}'
```

Each command prints a JSON block with a `VersionId` — that means it saved.

**Important:** the API key is written into `config.json` by the upload script,
so after setting/rotating it you must **re-run the upload** to publish it:

```bash
./infra/scripts/deploy-assets.sh
```

**Check the site:** open `https://<DistributionDomainName>` (from Step 6) in a
browser. The map (basemap + your data layers) should load. If the **basemap** is
blank, it's usually 7b (the API key secret) or its referrer; if **data/features**
are blank, it's usually 7a (the OAuth secret) or the referrer in Step 11.

---

## Step 8 — Request the HTTPS certificate for demo.gis.dev

To use the real domain, request a certificate in **us-east-1**:

```bash
aws acm request-certificate \
  --region us-east-1 \
  --domain-name demo.gis.dev \
  --validation-method DNS \
  --query CertificateArn --output text
```

Expected: it prints a certificate ARN like
`arn:aws:acm:us-east-1:123456789012:certificate/abcd-...`. **Copy it.**

Now get the DNS record you must add to prove you own the domain:

```bash
aws acm describe-certificate \
  --region us-east-1 \
  --certificate-arn <PASTE_CERT_ARN> \
  --query "Certificate.DomainValidationOptions[0].ResourceRecord" --output json
```

Expected output (example):

```json
{
  "Name": "_abc123.demo.gis.dev.",
  "Type": "CNAME",
  "Value": "_xyz789.acm-validations.aws."
}
```

Keep this — you'll add it in the next step.

---

## Step 9 — Add the DNS records in Cloudflare

Log in to Cloudflare, choose the **gis.dev** zone, go to **DNS → Records**. Add
**two** records. For both, set the proxy toggle to **DNS only (grey cloud)** —
this is required so the firewall sees real visitor IPs.

**Record 1 — certificate validation** (from Step 8):

| Field | Value |
|-------|-------|
| Type | `CNAME` |
| Name | the `Name` from Step 8 (e.g. `_abc123.demo`) |
| Target | the `Value` from Step 8 (e.g. `_xyz789.acm-validations.aws`) |
| Proxy status | **DNS only (grey cloud)** |

> Cloudflare adds the zone automatically, so enter the Name without the trailing
> `.gis.dev.` if the UI appends it for you.

**Record 2 — the website** (points your domain at CloudFront):

| Field | Value |
|-------|-------|
| Type | `CNAME` |
| Name | `demo` |
| Target | your `DistributionDomainName` (e.g. `d111111abcdef8.cloudfront.net`) |
| Proxy status | **DNS only (grey cloud)** |

Wait a few minutes. Check the certificate has been validated:

```bash
aws acm describe-certificate --region us-east-1 \
  --certificate-arn <CERT_ARN> --query "Certificate.Status" --output text
```

When it prints `ISSUED`, continue.

---

## Step 10 — Turn on the custom domain

Redeploy, this time telling CloudFront to use your certificate + domain:

```bash
cd infra
npx cdk deploy --all --require-approval never -c certificateArn=<CERT_ARN>
cd ..
```

After it finishes (again several minutes), `https://demo.gis.dev` will serve the
site.

> For automatic GitHub deploys, also add a GitHub Actions **Variable** named
> `CERTIFICATE_ARN` with the cert ARN, so future deploys keep the domain.

---

## Step 11 — Allow the domain in ArcGIS

In your ArcGIS Location Platform item/app settings, add these **HTTP referrers**
so the tokens work only from your site:

| Referrer | Why |
|----------|-----|
| `https://demo.gis.dev` | your live site |
| `https://<DistributionDomainName>` | testing before the domain is live |
| `http://localhost:5173` | local development |

Save. This is why tiles may not show until you complete this step.

---

## Step 12 — (Later) turn on caching for production

During development, caching is off so changes appear instantly. When you're
ready for production speed:

```bash
cd infra
npx cdk deploy --all --require-approval never -c caching=true -c certificateArn=<CERT_ARN>
cd ..
```

(Or set the GitHub Actions Variable `ENABLE_CACHING` = `true`.) The ArcGIS proxy
path stays uncached regardless, so Esri billing stays accurate.

---

## Ongoing deploys via GitHub (no commands)

Once Step 5's `AWS_DEPLOY_ROLE_ARN` variable is set, every push to the `main`
branch runs tests and deploys automatically — no keys stored, no manual steps.

The deploy job runs inside a GitHub **Environment** named `production`, and the
AWS OIDC trust policy is scoped to exactly that (subject
`repo:<owner>/<repo>:environment:production`). The two must match — if you rename
the environment, update the trust policy in
`infra/bootstrap/github-oidc-trust-policy.json` and re-run Step 5. GitHub
auto-creates the `production` environment on the first deploy.

Optional GitHub Actions **Variables**:

| Name | Purpose |
|------|---------|
| `AWS_DEPLOY_ROLE_ARN` | (required) deploy role ARN from Step 5 |
| `CERTIFICATE_ARN` | enables the custom domain |
| `ENABLE_CACHING` | `true` for production caching |

---

## Cost notes (avoiding surprise bills)

This stack is inexpensive at demo scale, but it's worth knowing what drives cost:

- **CloudFront** — priced per request + data transfer out. The biggest lever is
  **caching**: during development it's **off** (every request hits the origin),
  so turn it **on** for anything long-lived (Step 12). The `/arcgis-proxy/*` path
  stays uncached on purpose so Esri metering is accurate.
- **Lambda@Edge (token injector)** — invoked once per **data** request on the
  uncached proxy path (basemaps don't touch it — they go direct with the API
  key). It's **right-sized at 128 MB** (Lambda's floor; measured usage ~99 MB)
  with a 10 s timeout guardrail; typical run is ~2 ms warm. Raising memory would
  only raise cost with no benefit for this I/O-bound function. The cost driver is
  request **volume**, not size — and Lambda@Edge is billed per request + GB-second
  at a modest premium over standard Lambda.
- **WAF** — priced per web ACL + per million requests inspected. Fixed and small.
- **S3 + Secrets Manager** — negligible (a few MB of assets; two secrets).
- **ACM certificate** — public certs are **free**.

For a live production site, enabling CloudFront caching (Step 12) is the single
most effective cost control; it also improves performance.

---

## Troubleshooting

**`aws: command not found`** — the AWS CLI isn't installed or the terminal needs
restarting. Re-check Step 0.

**`Unable to locate credentials` / `ExpiredToken`** — your session expired. Run
`aws sso login` again (SSO) or re-check `aws configure` (keys). Confirm with
`aws sts get-caller-identity`.

**`Need to perform AWS CDK bootstrap`** — Step 5 didn't finish. Re-run
`./infra/bootstrap/setup-github-oidc.sh`.

**Basemap is blank (but data draws)** — the basemap API key. Check secret 7b
(`pormanes/arcgis-apikey`) has valid JSON `{"apiKey":"..."}`, that you re-ran
`deploy-assets.sh` after setting it, and that the key's ArcGIS referrers include
the exact URL you're visiting (Step 11). Confirm the key reached the browser:
open `https://<your-site>/config.json` — it should contain your key.

**Data/features are blank (but basemap draws)** — the OAuth path. Check secret 7a
(`pormanes/arcgis-oauth`) is correct JSON and the OAuth app's referrer (Step 11)
matches. The edge token is bound to `https://demo.gis.dev` (see
`edge/src/config.ts` `TOKEN_REFERER`), which must be one of the app's referrers.

**Whole map blank** — usually both secrets unset (Step 7) or the site itself
didn't upload; re-run `./infra/scripts/deploy-assets.sh`.

**`AccessDenied` during a HARDENED deploy** — the scoped policy is missing an
action. Add it to `infra/bootstrap/cfn-exec-policy.json` and re-run Step 5, or
temporarily use the default (non-hardened) bootstrap.

**Certificate stuck at `PENDING_VALIDATION`** — the Cloudflare validation record
(Step 9, Record 1) is wrong or not grey-cloud. Double-check Name/Value exactly
match Step 8's output.

**`cdk deploy` fails on CloudFront** — CloudFront changes are slow; if it timed
out, simply run the deploy command again (CDK is safe to re-run).

---

## Tearing it all down

```bash
cd infra
npx cdk destroy --all
```

Lambda@Edge replicas take time to delete after the distribution is removed. If
`destroy` complains the replicated function is still in use, wait ~15–30 minutes
and run it again. You may also delete the ACM certificate and the Cloudflare
records manually afterward.
