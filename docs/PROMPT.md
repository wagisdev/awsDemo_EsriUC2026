## The Who, Why, and How

You are a senior geospatial software development engineer who is developing a simple mapping application for a small company named Pormanes.NET which is based in Brgy. San Isidro Almagro Island Western Samar Philippines.

The code repo will be within Github and github will initiate deployment when new code is committed. Github will access AWS using least privileges (golden path) to allow for deployment, not full access. All application components based in AWS will be deployed via CDK. All code will be by typescript. You will perform unit tests. You will maintain documentation about the design, design choices, security designs, infrastructure diagrams, and decisions we make together. You will always offer the golden path for performance, compliance, and security for both AWS and ArcGIS based infrastructure.

When a manual configuration is needed, for example DNS entries, you will give me the configurations that need to be inserted to make it work.

Do not display in the chat sensitive data such as account information, etc. You can ask me for it, but do not display it afterwards. This is a demo run.

Hold all questions until I tell you its okay to ask questions.

If AWS commands need to be manually run, you will provide me the commands to include any authentication commands that are required of me.

During development, disable any cloudfront caching as to allow us to develop fast with frequent changes. I will tell you when to enable it.

Use subagents to optimize your development work.

Let me know when you are ready for the architecture.

## The Architecture

Your application architecture will be as follows:

* ### Global Edge Routing (DNS)

  * **Component:** DNS (Configured as **Grey Cloud / DNS-Only**)  
  * **Domain Name:** demo.gis.dev  
  * **Justification:** DNS handles authoritative resolution globally. By choosing "Grey Cloud" mode, you bypass proxy features and route the user's browser straight to the AWS CloudFront distribution. This ensures that downstream security layers receive the user's authentic, unproxied client IP address.

* ### Core Perimeter Protection

  * **Component:** AWS WAF (Web Application Firewall)  
  * **Justification:** Placed directly at the entrance of the CloudFront distribution, AWS WAF inspects all Layer 7 traffic. It uses custom and managed rulesets to prevent malicious actors from exploiting your proxy paths (e.g., trying to use the proxy to crawl unauthorized URLs) and filters out map-scraping bots.

* ### Strategic Edge Content Router

  * **Component:** Amazon CloudFront \+ AWS Certificate Manager (ACM)  
  * **Nuanced Cache Configuration:** To keep the application fully compliant with Esri's pay-as-you-go billing metrics, CloudFront is split into two distinct routing behaviors:  
    * **Static Content Behavior (`/index.html`, `/assets/*`):** Points to Amazon S3. **Cache is Enabled (TTL \= 24 hours \*when in production)**. This makes the application code load instantly.  
    * **Esri Proxy Behavior (`/arcgis-proxy/*`):** Points directly to Esri's Location Platform servers. **Cache is DISABLED (TTL \= 0\)**. Requests pass through instantly, ensuring Esri can accurately meter every tile and feature query, keeping the deployment completely with the terms of service.  
  * **Security Headers:** A CloudFront Function attaches a strict Content Security Policy (CSP), locking down script executions solely to the domain domain.

* ### Hidden Static Web Storage

  * **Component:** Amazon S3  
  * **Configuration:** Fully private, **Block All Public Access** enabled, paired with **OAC (Origin Access Control)**.  
  * **Justification:** Hosts the compiled, tree-shaken TypeScript mapping code (HTML, plain JS, CSS). By locking down the bucket and restricting origin access exclusively to CloudFront's cryptographic signatures, the application code cannot be accessed or scraped directly from the open internet.

* ### The Edge Token Injector

  * **Component:** AWS Lambda@Edge  
  * **Configuration:** Deployed globally as an **Origin Request** trigger on the `/arcgis-proxy/*` behavior.  
  * **Software Engineering Requirements:** This serverless tier hides your token entirely from the client browser by implementing three critical patterns:  
    * **Global-Scope Variable Caching:** Tokens are cached outside the main handler block, saving the need to request a fresh token from Esri on every page reload.  
    * **Reactive 5-Minute Safety Buffer:** It continuously checks if the token is valid. If the current Unix time plus 5 minutes exceeds the token expiration, it automatically flags the token as stale and fetches a new 2-hour lease *before* the current one dies.  
    * **Concurrency Promise Lock:** To eliminate the "thundering herd" problem when a map loads dozens of tiles at once, the Lambda caches the async network transaction (the Promise) instead of a string literal. Parallel tile requests are held up to await and share the *exact same single token request*, preventing authentication flooding.

* ### Token-Free Client Runtime

  * **Component:** ArcGIS Maps SDK for JavaScript (TypeScript App State)  
  * **Configuration:** The client frontend utilizes **zero tokens, zero client secrets, and zero API keys**.  
    * **Request Interceptors:** The code invokes `esriConfig.request.interceptors` globally on startup. It catches native outbound URLs pointing to `basemaps-api.arcgis.com` or `services.arcgis.com` and rewrites them on the fly to match your custom local domain (`demo.gis.dev/arcgis-proxy/...`).  
    * **Dual-Layer Vector Render:** It loads the heavy baseline utility grid as a static, pre-rendered **Vector Tile Layer** (which leverages Esri's high-speed global CDN) and overlays an interactive **Feature Layer** purely for utility elements that require on-the-fly clicking or data attributes.

* ### Encrypted Secrets Store

  * **Component:** AWS Secrets Manager  
  * **Configuration:** Enforced with strict, principle-of-least-privilege IAM Execution Roles.  
  * **Justification:** Securely isolates the ArcGIS Location Platform Client ID and Secret entirely from the code repository. Because Lambda@Edge caches the token for up to 2 hours at the edge, Secrets Manager is only queried during an absolute container cold start or a 2-hour token renewal window.

* ### System of Record & Location Services

  * **Component:** ArcGIS Location Platform Developer Portal  
  * **Configuration:** Securely hosts and serves the network spatial services via OAuth 2.0 App Authentication. The item settings are further secured by explicitly restricting service permissions to match *only* the specific HTTP referrers of the custom web domain.

Let me know when you are ready to learn about the application you will build.

## The Application to be built

The map application is a simple viewer app that shows their network plans, both currently deployed and future to be built. It needs to have a header with their logo attached (logo uploaded for you). The title “Pormanes.NET Internet Service” with a subtitle saying Brgy. San Isidro, Almagro Island, Western Samar. The company really likes a header design that is found here https://pormanes.net, where under the header is the map application. You will have access to their repo too found here [https://github.com/wagisdev/pormanesNet](https://github.com/wagisdev/pormanesNet) which is not public, but you have access to it. They really like that frosted glass look and feel with the high tech background map and want to replicate that look and feel as much as possible. Use that as a starting point and iteratively design a modern UI that meets their goals and intent.

The application will have the following widgets and controls:

* Layers  
* Coordinates  
* Ruler  
* Drawing  
* Coordinate Conversion  
* Buffers  
* Data Enrichment  
* Table  
* Filter Controls  
* Add Data (from living atlas only)  
* Share map tool that lets users share their current view of the application with others.

## Data Sources

* Network Infrastructure (Name and LayerID, and number)  
  * Access Points – <A Item ID> – 0  
    * Fields:  
      * OBJECTID (type: esriFieldTypeOID, alias: OBJECTID, SQL Type: sqlTypeOther, length: 0, nullable: false, editable: false)  
      * name (type: esriFieldTypeString, alias: Name, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * dateScheduledDeployment (type: esriFieldTypeDate, alias: Scheduled Deployment Date, SQL Type: sqlTypeOther, length: 8, nullable: true, editable: true)  
      * dateDeployed (type: esriFieldTypeDate, alias: Deployed Date, SQL Type: sqlTypeOther, length: 8, nullable: true, editable: true)  
      * manufacturer (type: esriFieldTypeString, alias: Manufacturer, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * model (type: esriFieldTypeString, alias: Model, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * poeBudget (type: esriFieldTypeSmallInteger, alias: POE Budget, SQL Type: sqlTypeOther, nullable: true, editable: true)  
      * meshEnabled (type: esriFieldTypeString, alias: Mesh Enabled, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * vlan (type: esriFieldTypeString, alias: VLAN, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * staticIP (type: esriFieldTypeString, alias: Static IP Assigned, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * ipAddressV4 (type: esriFieldTypeString, alias: IP Address v4, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * ipAddressV6 (type: esriFieldTypeString, alias: IP Address v6, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * status (type: esriFieldTypeString, alias: Status, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
  * Infrastructure Nodes – <A Item ID> – 1  
    * Fields:  
      * OBJECTID (type: esriFieldTypeOID, alias: OBJECTID, SQL Type: sqlTypeOther, length: 0, nullable: false, editable: false)  
      * name (type: esriFieldTypeString, alias: Name, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * dateScheduledDeployment (type: esriFieldTypeDate, alias: Scheduled Deployment Date, SQL Type: sqlTypeOther, length: 8, nullable: true, editable: true)  
      * dateDeployed (type: esriFieldTypeDate, alias: Deployed Date, SQL Type: sqlTypeOther, length: 8, nullable: true, editable: true)  
      * manufacturer (type: esriFieldTypeString, alias: Manufacturer, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * model (type: esriFieldTypeString, alias: Model, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * poeBudget (type: esriFieldTypeSmallInteger, alias: POE Budget, SQL Type: sqlTypeOther, nullable: true, editable: true)  
      * meshEnabled (type: esriFieldTypeString, alias: Mesh Enabled, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * vlan (type: esriFieldTypeString, alias: VLAN, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * staticIP (type: esriFieldTypeString, alias: Static IP Assigned, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * ipAddressV4 (type: esriFieldTypeString, alias: IP Address v4, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * ipAddressV6 (type: esriFieldTypeString, alias: IP Address v6, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * status (type: esriFieldTypeString, alias: Status, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
  * Backbone Run – <A Item ID> – 2  
    * Fields:  
      * OBJECTID (type: esriFieldTypeOID, alias: OBJECTID, SQL Type: sqlTypeOther, length: 0, nullable: false, editable: false)  
      * name (type: esriFieldTypeString, alias: Name, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * dateScheduledDeployment (type: esriFieldTypeDate, alias: Scheduled Deployment Date, SQL Type: sqlTypeOther, length: 8, nullable: true, editable: true)  
      * dateDeployed (type: esriFieldTypeDate, alias: Deployed Date, SQL Type: sqlTypeOther, length: 8, nullable: true, editable: true)  
      * originSwitch (type: esriFieldTypeString, alias: Origin Switch, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * originSwitchPort (type: esriFieldTypeString, alias: Origin Switch Port, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * destinationSwitch (type: esriFieldTypeString, alias: Destination Switch, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * destinationSwitchPort (type: esriFieldTypeString, alias: Destination Switch Port, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * destinationDevice (type: esriFieldTypeString, alias: Destination Device, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * connectionMethod (type: esriFieldTypeString, alias: Connection Method, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * poeType (type: esriFieldTypeString, alias: POE Type, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * status (type: esriFieldTypeString, alias: Status, SQL Type: sqlTypeOther, length: 255, nullable: true, editable: true)  
      * Shape\_\_Length (type: esriFieldTypeDouble, alias: Shape\_\_Length, SQL Type: sqlTypeDouble, nullable: true, editable: false)  
* Planned Coverage – <A Item ID> – 3  
  * Fields:  
    * AnalysisArea (type: esriFieldTypeDouble, alias: Area in Square Miles, SQL Type: sqlTypeOther, nullable: true, editable: true)  
    * BUFF\_DIST (type: esriFieldTypeDouble, alias: Buffer distance in Feet, SQL Type: sqlTypeOther, nullable: true, editable: true)  
    * OBJECTID (type: esriFieldTypeOID, alias: OBJECTID, SQL Type: sqlTypeOther, length: 0, nullable: false, editable: false)

Okay….what questions do you need me to answer now.

The original application – [https://experience.arcgis.com/experience/721f412c9aae45cb81d9ce9bc1821c77](https://experience.arcgis.com/experience/721f412c9aae45cb81d9ce9bc1821c77)

