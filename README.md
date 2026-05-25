# 🔔 FCM Notification Service

An AWS Lambda function that sends Firebase Cloud Messaging (FCM) push notifications, exposed securely via API Gateway.

---

## 🗺️ How It Works

When your app wants to push a notification to a mobile device, it calls this service. The request passes through two security layers before Firebase delivers the notification.

```mermaid
sequenceDiagram
    participant App as Your App
    participant AGW as API Gateway
    participant Lambda as Lambda Function
    participant FCM as Firebase FCM
    participant Device as Mobile Device

    App->>AGW: POST /dev<br/>x-api-key + Authorization: Bearer + body
    Note over AGW: Validates x-api-key<br/>against usage plan
    AGW->>Lambda: Invoke with full HTTP event<br/>(headers, method, body)
    Note over Lambda: Verifies Bearer token<br/>against API_SECRET
    Lambda->>FCM: Admin SDK — messaging().send()
    FCM->>Device: Push notification delivered
    Lambda-->>AGW: 200 { ok: true, messageId }
    AGW-->>App: HTTP Response
```

---

## 🤔 Why This Architecture?

**⚡ Why AWS Lambda?**
This is a stateless, event-driven operation. Lambda charges only per invocation — far cheaper than running a dedicated server 24/7 for something called occasionally.

**🔀 Why API Gateway in front?**
Lambda functions aren't reachable directly over HTTP. API Gateway provides the HTTPS endpoint, handles TLS termination, and adds rate limiting and API key enforcement before traffic even reaches your code.

**🔐 Why two layers of auth?**
- `x-api-key` **(API Gateway layer)** — enforces a usage plan with rate and quota limits. Blocks abusive traffic before Lambda is invoked, saving cost.
- `Authorization: Bearer` **(Lambda layer)** — a secret only your app knows. Even if someone leaks an API key, they still can't call the service without this second secret.

**📦 Why esbuild instead of shipping `node_modules`?**
Firebase Admin SDK + all dependencies = ~67 MB. esbuild bundles and tree-shakes only what's actually used, producing a single ~3.7 MB file that zips to ~850 KB — well within Lambda's direct upload limit and faster to cold-start.

**🌿 Why no `.env` in Lambda?**
Lambda has native encrypted-at-rest environment variable support. `dotenv` is only used locally — in production it finds no `.env` file and does nothing, while Lambda's own env vars are already in `process.env`.

---

## 🌐 Endpoint

```
POST https://<api-id>.execute-api.<region>.amazonaws.com/<stage>
```

---

## 🔑 Authentication

Two headers required on every request:

| Header          | Value                       | Checked by  | Purpose                         |
| --------------- | --------------------------- | ----------- | ------------------------------- |
| `x-api-key`     | API Gateway key value       | API Gateway | Rate limiting & client identity |
| `Authorization` | `Bearer <API_SECRET value>` | Lambda      | Request authenticity            |

---

## 📨 Request

**Headers**

| Header          | Required | Value              |
| --------------- | -------- | ------------------ |
| `Content-Type`  | Yes      | `application/json` |
| `Authorization` | Yes      | `Bearer <secret>`  |
| `x-api-key`     | Yes      | API Gateway key    |

**Body**

| Field         | Type                     | Required | Description                   |
| ------------- | ------------------------ | -------- | ----------------------------- |
| `deviceToken` | `string`                 | Yes      | FCM device registration token |
| `data`        | `Record<string, string>` | Yes      | Notification payload          |

```json
{
  "deviceToken": "fcm-device-token...",
  "data": {
    "title": "Hello",
    "body": "World"
  }
}
```

> 💡 The `data` object is passed directly to FCM as a data message. Your mobile app receives it and decides how to display the notification. Both keys and values must be strings.

---

## 📬 Responses

| Status | Body                                            | Meaning                         |
| ------ | ----------------------------------------------- | ------------------------------- |
| `200`  | `{ "ok": true, "messageId": "..." }`            | Notification sent successfully  |
| `400`  | `{ "ok": false, "error": "..." }`               | Missing or invalid body fields  |
| `401`  | `{ "ok": false, "error": "Unauthorized" }`      | Invalid or missing Bearer token |
| `500`  | `{ "ok": false, "error": "Failed to send..." }` | FCM rejected or unreachable     |

---

## 🔒 Environment Variables

Set these in **Lambda → Configuration → Environment variables**.

| Variable           | Required | How to get it                                                 |
| ------------------ | -------- | ------------------------------------------------------------- |
| `FCM_PROJECT_ID`   | Yes      | `project_id` field in Firebase service account JSON           |
| `FCM_CLIENT_EMAIL` | Yes      | `client_email` field in Firebase service account JSON         |
| `FCM_PRIVATE_KEY`  | Yes      | `private_key` field — see note below ⚠️                      |
| `API_SECRET`       | Yes      | Any strong random string — `openssl rand -base64 32`          |

**Getting Firebase credentials:**
1. [Firebase Console](https://console.firebase.google.com) → your project → ⚙️ **Project Settings** → **Service accounts**
2. Click **Generate new private key** → downloads a `.json` file
3. Copy `project_id`, `client_email`, and `private_key` into Lambda env vars

**⚠️ `FCM_PRIVATE_KEY` gotcha:**
The private key in the JSON contains `\n` as literal two-character sequences. Paste it exactly as it appears in the JSON — all on one line with literal `\n` — not actual newlines. The code converts them at runtime:

```sh
python3 -c "import json; d=json.load(open('service-account.json')); print(d['private_key'].replace('\n', r'\n'))"
```

---

## 🛠️ AWS Setup Guide

### Step 1 — Create the Lambda Function

1. Go to **AWS Lambda** → **Create function**
2. Choose **Author from scratch**
3. Set **Function name** (e.g. `fcm-notification-sender`)
4. Set **Runtime** to `Node.js 22.x`
5. Click **Create function**

**After creation:**

- **Configuration → General configuration → Edit**
  - Set **Handler** to `dist/main.handler`
  - Set **Timeout** to `15` seconds (FCM calls can take a moment)
  - Save

- **Configuration → Environment variables → Edit**
  - Add all four env vars: `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`, `API_SECRET`
  - Save

- **Code → Upload from → .zip file**
  - Upload the `lambda.zip` produced by `pnpm run package`

**Or via AWS CLI:**

```sh
# Create the function (requires an existing execution role with basic Lambda permissions)
aws lambda create-function \
  --function-name fcm-notification-sender \
  --runtime nodejs22.x \
  --role arn:aws:iam::<account-id>:role/<execution-role> \
  --handler dist/main.handler \
  --zip-file fileb://lambda.zip \
  --timeout 15 \
  --region <region>

# Set environment variables
aws lambda update-function-configuration \
  --function-name fcm-notification-sender \
  --environment 'Variables={FCM_PROJECT_ID=<value>,FCM_CLIENT_EMAIL=<value>,FCM_PRIVATE_KEY=<value>,API_SECRET=<value>}' \
  --region <region>
```

---

### Step 2 — Create the API Gateway

1. Go to **API Gateway** → **Create API** → **REST API** → **Build**
2. Choose **New API**, give it a name (e.g. `fcm-lambda-api`), click **Create API**

**Create the POST method:**

3. In **Resources**, select `/` → **Create method** → choose `POST` → confirm
4. Set **Integration type** to `Lambda Function`
5. ✅ Enable **Lambda proxy integration** — this is required; without it headers won't reach your handler
6. Select your Lambda function → **Save**

**Enable API Key requirement:**

7. Select the `POST` method → **Method request** → **Edit**
8. Set **API key required** to `true` → **Save**

**Enable CORS (for browser/frontend requests):**

9. Select the `/` resource → **Enable CORS**
10. Set `Access-Control-Allow-Headers` to include `Content-Type,Authorization,X-Api-Key`
11. Click **Enable CORS and replace existing CORS headers**
    > This creates an `OPTIONS` method with a mock integration that responds to preflight requests without requiring an API key — browsers require this before sending the actual POST.

**Deploy:**

12. **Deploy API** → create a new stage (e.g. `dev`) → **Deploy**
13. Note the **Invoke URL** — this is your endpoint

**Or via AWS CLI:**

```sh
# Create the REST API and capture its ID
API_ID=$(aws apigateway create-rest-api \
  --name fcm-lambda-api \
  --query 'id' --output text --region <region>)

# Get the root resource ID
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[?path==`/`].id' --output text --region <region>)

# Create POST method with API key required
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $ROOT_ID \
  --http-method POST \
  --authorization-type NONE \
  --api-key-required true \
  --region <region>

# Set Lambda proxy integration
LAMBDA_ARN=$(aws lambda get-function \
  --function-name fcm-notification-sender \
  --query 'Configuration.FunctionArn' --output text --region <region>)

aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $ROOT_ID \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/$LAMBDA_ARN/invocations" \
  --region <region>

# Grant API Gateway permission to invoke the Lambda function
aws lambda add-permission \
  --function-name fcm-notification-sender \
  --statement-id apigateway-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:<region>:<account-id>:$API_ID/*/POST/" \
  --region <region>

# Deploy to a stage
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name dev \
  --region <region>
```

---

### Step 3 — Create API Key & Usage Plan

A usage plan lets you control rate limits and attach API keys to your deployed stage.

**Create a Usage Plan:**

1. **API Gateway → Usage Plans → Create**
2. Set a name (e.g. `fcm-gateway-plan`)
3. Set **Rate** (e.g. `10` req/sec), **Burst** (e.g. `20`), **Quota** (e.g. `10000`/day)
4. Add your API + stage (`fcm-lambda-api` / `dev`) → **Next**
5. Skip adding API keys for now → **Done**

**Create an API Key:**

6. **API Gateway → API Keys → Create API Key**
7. Give it a name (e.g. `fcm-gateway-key`), set **Auto Generate** → **Save**

**Associate key with the usage plan:**

8. Open the usage plan → **Associated API Keys** tab → **Add API key**
9. Select your key → **Add**

Your clients must now send `x-api-key: <key value>` on every request.

**Or via AWS CLI:**

```sh
# Create usage plan and associate with your API stage
PLAN_ID=$(aws apigateway create-usage-plan \
  --name fcm-gateway-plan \
  --throttle "burstLimit=20,rateLimit=10" \
  --quota "limit=10000,period=DAY" \
  --api-stages "apiId=$API_ID,stage=dev" \
  --query 'id' --output text --region <region>)

# Create an API key
KEY_ID=$(aws apigateway create-api-key \
  --name fcm-gateway-key \
  --enabled \
  --query 'id' --output text --region <region>)

# Associate the key with the usage plan
aws apigateway create-usage-plan-key \
  --usage-plan-id $PLAN_ID \
  --key-id $KEY_ID \
  --key-type API_KEY \
  --region <region>

# Print the key value to use in requests
aws apigateway get-api-key \
  --api-key $KEY_ID \
  --include-value \
  --query 'value' --output text --region <region>
```

---

## 🚀 CI/CD — Automated Deployment via GitHub Actions

Every push to `main` automatically builds and deploys to Lambda. No AWS credentials are stored in GitHub — it uses OIDC to get short-lived tokens at deploy time.

### How OIDC works

GitHub generates a signed JWT for each workflow run. AWS has a trusted OIDC provider pointed at GitHub. When the workflow runs, it exchanges the JWT for temporary IAM credentials scoped to a specific role — no static keys needed.

### Step 1 — Create the OIDC Provider in AWS

1. Go to **IAM → Identity providers → Add provider**
2. Select **OpenID Connect**
3. **Provider URL**: `https://token.actions.githubusercontent.com`
4. Click **Get thumbprint**
5. **Audience**: `sts.amazonaws.com`
6. Click **Add provider**

**Or via AWS CLI:**

```sh
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### Step 2 — Create the IAM Role

1. **IAM → Roles → Create role**
2. **Trusted entity type**: `Web identity`
3. **Identity provider**: `token.actions.githubusercontent.com`
4. **Audience**: `sts.amazonaws.com`
5. Click **Next**, attach the **AWSLambdaRole** policy (or a custom policy with `lambda:UpdateFunctionCode`)
6. Name the role (e.g. `github-oidc-role`) → **Create role**

**Or via AWS CLI** (save the trust policy JSON below to `trust-policy.json` first, then):

```sh
# Create the role
aws iam create-role \
  --role-name github-oidc-role \
  --assume-role-policy-document file://trust-policy.json

# Attach Lambda update permissions
aws iam attach-role-policy \
  --role-name github-oidc-role \
  --policy-arn arn:aws:iam::aws:policy/AWSLambda_FullAccess
```

**Update the trust policy** to restrict it to your repo:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<account-id>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:<YourGitHubUsername>/<YourRepoName>:*"
        }
      }
    }
  ]
}
```

### Step 3 — Add GitHub Secrets

In your GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret                 | Value                                              |
| ---------------------- | -------------------------------------------------- |
| `AWS_ROLE_ARN`         | `arn:aws:iam::<account-id>:role/github-oidc-role`  |
| `AWS_REGION`           | e.g. `ap-south-1`                                  |
| `LAMBDA_FUNCTION_NAME` | Name of your Lambda function                       |

### Step 4 — Push to `main`

The workflow in `.github/workflows/deploy.yml` will:
1. Install dependencies with pnpm
2. Bundle with esbuild → `dist/main.js`
3. Zip to `lambda.zip` (~850 KB)
4. Authenticate with AWS via OIDC (no static credentials)
5. Upload the zip directly to Lambda with `aws lambda update-function-code`

---

## 💻 Local Development

```sh
# Install dependencies
pnpm install

# Type check only (esbuild handles compilation, tsc only checks types)
pnpm run typecheck

# Bundle with esbuild → dist/main.js
pnpm run build

# Build + run a test invocation (requires .env with valid credentials)
pnpm run test

# Build + zip → lambda.zip (ready to upload manually)
pnpm run package
```

Create a `.env` file for local testing:

```env
FCM_PROJECT_ID=your-project-id
FCM_CLIENT_EMAIL=your-service-account@project.iam.gserviceaccount.com
FCM_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n
API_SECRET=your-secret
```

---

## ⚙️ Infrastructure Summary

| Setting                  | Value                        |
| ------------------------ | ---------------------------- |
| Runtime                  | Node.js 22.x                 |
| Handler                  | `dist/main.handler`          |
| Lambda Proxy Integration | ✅ Enabled (required)        |
| API Gateway Auth         | API Key via Usage Plan       |
| Bundle tool              | esbuild (single file output) |
| Deploy artifact          | `lambda.zip` (~850 KB)       |
