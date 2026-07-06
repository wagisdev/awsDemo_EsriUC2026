# Infrastructure Diagram

## System architecture

Dual-auth (see ADR-0009): basemaps + public CDN are called **directly** with a
referrer-restricted API key; **data** is proxied through Lambda@Edge with an OAuth
token.

```mermaid
flowchart TB
    user([User browser])

    subgraph cf_dns["Cloudflare DNS (grey cloud / DNS-only)"]
        dns["demo.gis.dev CNAME"]
    end

    subgraph aws_use1["AWS · us-east-1"]
        waf["AWS WAF\nmanaged rules + rate limit"]
        cff["CloudFront Function\nCSP + security headers"]
        cf["CloudFront distribution\nTLS 1.2+"]
        s3[("S3 bucket\nprivate · Block All Public · OAC\nincl. /config.json (no-cache)")]
        edge["Lambda@Edge\nOAuth token injector (Origin Request)"]
        secretOauth[["Secrets Manager\npormanes/arcgis-oauth\nclientId + clientSecret"]]
        secretKey[["Secrets Manager\npormanes/arcgis-apikey\napiKey"]]
        deploy["Asset-deploy step\naws s3 sync"]
    end

    subgraph esri["Esri ArcGIS"]
        basemaps["Basemap + public CDN hosts\nbasemapstyles-api / ibasemaps-api /\n*.arcgisonline.com / cdn+static.arcgis.com / js.arcgis.com"]
        oauth["OAuth 2.0 token endpoint"]
        services["DATA services\nfeature / Living Atlas / www.arcgis.com / geoenrich"]
    end

    user -- "DIRECT + referrer-restricted API key\n(esriConfig.apiKey)" --> basemaps
    user --> dns --> waf --> cf
    cf -- "/index.html, /assets/*\n(cache 3d prod / off dev)" --> s3
    cf -- "/config.json (no-cache)\ncarries the API key" --> s3
    cf -- "viewer-response" --> cff
    cf -- "/arcgis-proxy/?<url>\n(cache DISABLED, DATA only)" --> edge
    edge -- "read on cold start / refresh" --> secretOauth
    edge -- "client-credentials grant" --> oauth
    edge -- "rewrite origin + append OAuth token" --> services

    deploy -- "GetSecretValue" --> secretKey
    deploy -- "writes apiKey into config.json + s3 sync" --> s3

    style s3 fill:#0b3d2e,stroke:#34d399,color:#fff
    style secretOauth fill:#3d2e0b,stroke:#fbbf24,color:#fff
    style secretKey fill:#3d2e0b,stroke:#fbbf24,color:#fff
    style edge fill:#0b2a3d,stroke:#00e5ff,color:#fff
    style waf fill:#3d0b1e,stroke:#f87171,color:#fff
    style basemaps fill:#12324a,stroke:#38bdf8,color:#fff
```

## Token lifecycle at the edge

```mermaid
sequenceDiagram
    participant Tiles as Parallel tile requests
    participant Edge as Lambda@Edge (global cache)
    participant SM as Secrets Manager
    participant OAuth as ArcGIS OAuth

    Tiles->>Edge: request 1 (cache empty / stale)
    Tiles->>Edge: request 2..N (concurrent)
    Note over Edge: Promise lock — one refresh shared
    Edge->>SM: GetSecretValue (cold start / refresh only)
    SM-->>Edge: clientId + clientSecret
    Edge->>OAuth: client_credentials grant (2h token)
    OAuth-->>Edge: access_token + expires_in
    Note over Edge: cache token; stale when now+5min >= expiry
    Edge-->>Tiles: forward each request to Esri + token
```

## CI/CD (GitHub OIDC, least privilege)

Runs on Node 24 runners in the GitHub `production` Environment. OIDC subject is
scoped to `environment:production` (not the branch ref); the deploy role also
carries scoped perms the asset-upload step runs with directly.

```mermaid
flowchart LR
    push["git push main"] --> gha["GitHub Actions\n(production Environment, Node 24)"]
    gha -- "OIDC token\nsub: repo:wagisdev/awsDemo_EsriUC2026_Sec:environment:production" --> role["IAM role\npormanes-github-deploy"]
    role -- "sts:AssumeRole (cdk-hnb659fds-*)\n+ ssm:GetParameter (cdk-bootstrap version)" --> cdk["CDK bootstrap roles"]
    cdk --> cfn["CloudFormation\ndeploy EdgeStack"]
    role -- "cfn:DescribeStacks · secretsmanager:GetSecretValue (arcgis-apikey)\ns3 sync (sitebucket*) · cloudfront:CreateInvalidation" --> assets["Asset upload\n(deploy-assets step)"]

    note["Scoped least-privilege: assume CDK roles for deploy\n+ direct perms for the asset-upload step. No broad AWS access."]
    role -.-> note
```
