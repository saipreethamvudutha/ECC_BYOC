/**
 * Cloud Inventory Check Module
 *
 * Enterprise Asset Discovery: Cloud asset enumeration via API probing
 * and cloud service endpoint detection. Identifies cloud provider,
 * services in use, and potential misconfigurations.
 *
 * Methods:
 * - Cloud provider detection from DNS/HTTP headers
 * - AWS service endpoint probing (S3, EC2 metadata, ELB, CloudFront)
 * - Azure service detection (App Service, Blob, Functions)
 * - GCP service detection (Cloud Storage, App Engine, Cloud Functions)
 * - Container/orchestration detection (Docker, Kubernetes indicators)
 * - CDN and edge service detection
 *
 * Note: Full API-based inventory (ec2:DescribeInstances, etc.) requires
 * cloud credentials configured in the platform. This module performs
 * unauthenticated detection from external probing.
 *
 * Output: Cloud provider, detected services, infrastructure details
 */

import { CheckModule, CheckResult } from "../types";
import { getVulnById } from "../vulnerability-db";

interface CloudDetection {
  provider: string | null;     // aws, azure, gcp, cloudflare, null
  services: string[];           // Detected cloud services
  indicators: Record<string, string>;  // Evidence
  containers: boolean;         // Container indicators found
  kubernetes: boolean;         // K8s indicators found
}

/**
 * Fetch HTTP headers from a URL with timeout
 */
async function fetchHeaders(url: string, timeout = 4000): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "manual",
    });
    clearTimeout(timer);
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
    headers["_status"] = String(res.status);
  } catch {
    // Connection failed
  }
  return headers;
}

/**
 * Attempt GET and read response body
 */
async function fetchBody(url: string, timeout = 4000): Promise<{ status: number; body: string; headers: Record<string, string> } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
    });
    clearTimeout(timer);

    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return { status: res.status, body: body.substring(0, 4096), headers };
  } catch {
    return null;
  }
}

/**
 * Detect cloud provider from headers and DNS patterns
 */
function detectProvider(headers: Record<string, string>, host: string): string | null {
  const server = headers["server"] || "";
  const via = headers["via"] || "";
  const amzId = headers["x-amz-request-id"] || headers["x-amz-id-2"] || "";
  const azureReqId = headers["x-ms-request-id"] || "";
  const gcpTrace = headers["x-cloud-trace-context"] || "";

  // AWS indicators
  if (amzId || server.includes("AmazonS3") || server.includes("Amazon")) return "aws";
  if (host.includes(".amazonaws.com") || host.includes(".aws.")) return "aws";
  if (headers["x-amz-cf-id"]) return "aws"; // CloudFront

  // Azure indicators
  if (azureReqId || host.includes(".azurewebsites.net") || host.includes(".azure.")) return "azure";
  if (host.includes(".windows.net") || host.includes(".cloudapp.azure.com")) return "azure";
  if (headers["x-azure-ref"]) return "azure";

  // GCP indicators
  if (gcpTrace || host.includes(".appspot.com") || host.includes(".run.app")) return "gcp";
  if (host.includes(".googleapis.com") || host.includes(".cloudfunctions.net")) return "gcp";
  if (headers["x-goog-generation"]) return "gcp";

  // Cloudflare
  if (server.includes("cloudflare") || headers["cf-ray"]) return "cloudflare";

  // DigitalOcean / other
  if (host.includes(".digitalocean.com") || host.includes(".ondigitalocean.app")) return "digitalocean";

  return null;
}

export const cloudInventoryCheck: CheckModule = {
  id: "cloud-inventory",
  name: "Cloud Asset Inventory & Detection",

  async run(target: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];
    const host = target.replace(/^https?:\/\//, "").replace(/[:/].*$/, "");
    const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(host);

    const detection: CloudDetection = {
      provider: null,
      services: [],
      indicators: {},
      containers: false,
      kubernetes: false,
    };

    // 1. Probe main target for cloud provider detection
    const httpsHeaders = await fetchHeaders(`https://${host}/`);
    const httpHeaders = Object.keys(httpsHeaders).length > 0 ? httpsHeaders : await fetchHeaders(`http://${host}/`);
    const allHeaders = { ...httpHeaders, ...httpsHeaders };

    detection.provider = detectProvider(allHeaders, host);

    if (detection.provider) {
      detection.indicators["primary_detection"] = `Cloud provider ${detection.provider} detected from response headers`;

      // Provider-specific service detection
      if (detection.provider === "aws") {
        await detectAWSServices(host, detection, results);
      } else if (detection.provider === "azure") {
        await detectAzureServices(host, detection, results);
      } else if (detection.provider === "gcp") {
        await detectGCPServices(host, detection, results);
      }
    }

    // 2. Check for container indicators (regardless of provider)
    await detectContainerIndicators(host, allHeaders, detection);

    // 3. Check for Kubernetes indicators
    await detectKubernetesIndicators(host, detection);

    // 4. Check for CDN / Edge services
    detectCDNServices(allHeaders, host, detection);

    // 5. Check for GCP Storage (external probe)
    if (!isIP) {
      await checkGCPStorage(host, results);
    }

    // Produce summary result
    if (detection.provider || detection.services.length > 0 || detection.containers || detection.kubernetes) {
      const providerName = detection.provider
        ? { aws: "Amazon Web Services", azure: "Microsoft Azure", gcp: "Google Cloud Platform", cloudflare: "Cloudflare", digitalocean: "DigitalOcean" }[detection.provider] || detection.provider
        : "Unknown";

      results.push({
        title: `Cloud Inventory: ${host} — ${providerName}`,
        severity: "info",
        description: `Cloud infrastructure detected for ${host}. Provider: ${providerName}. ${detection.services.length} cloud service(s) identified${detection.containers ? ", container technology in use" : ""}${detection.kubernetes ? ", Kubernetes orchestration detected" : ""}.`,
        remediation: "Ensure all cloud resources are properly tagged and inventoried. Review IAM policies and network security groups. Enable cloud provider logging and monitoring.",
        details: {
          target: host,
          provider: detection.provider,
          providerName,
          services: detection.services,
          indicators: detection.indicators,
          containers: detection.containers,
          kubernetes: detection.kubernetes,
        },
      });
    }

    return results;
  },
};

/**
 * Detect AWS-specific services
 */
async function detectAWSServices(host: string, detection: CloudDetection, results: CheckResult[]) {
  // Check for CloudFront
  const cfHeaders = await fetchHeaders(`https://${host}/`);
  if (cfHeaders["x-amz-cf-id"] || cfHeaders["x-amz-cf-pop"]) {
    detection.services.push("CloudFront CDN");
    detection.indicators["cloudfront"] = "X-Amz-Cf-Id header present";
  }

  // Check for ELB
  if (host.includes(".elb.amazonaws.com")) {
    detection.services.push("Elastic Load Balancer");
  }

  // Check for S3 website hosting
  if (host.includes(".s3-website") || host.includes(".s3.amazonaws.com")) {
    detection.services.push("S3 Static Website");
  }

  // Check for API Gateway
  if (host.includes(".execute-api.") && host.includes(".amazonaws.com")) {
    detection.services.push("API Gateway");
  }

  // Check for Lambda (via API Gateway headers)
  if (cfHeaders["x-amzn-requestid"] && cfHeaders["x-amzn-trace-id"]) {
    detection.services.push("Lambda (via API Gateway)");
    detection.indicators["lambda"] = "X-Amzn-RequestId + Trace-Id present";
  }

  // Check for Elastic Beanstalk
  if (host.includes(".elasticbeanstalk.com")) {
    detection.services.push("Elastic Beanstalk");
  }

  // Check for EC2
  if (host.includes(".compute.amazonaws.com") || host.includes(".ec2.")) {
    detection.services.push("EC2 Instance");
  }

  // Flag if AWS with many services
  if (detection.services.length >= 3) {
    detection.indicators["complex_infra"] = `${detection.services.length} AWS services detected — complex infrastructure`;
  }
}

/**
 * Detect Azure-specific services
 */
async function detectAzureServices(host: string, detection: CloudDetection, results: CheckResult[]) {
  // Azure App Service
  if (host.includes(".azurewebsites.net")) {
    detection.services.push("Azure App Service");
    detection.indicators["app_service"] = "azurewebsites.net hostname";
  }

  // Azure Functions
  if (host.includes(".azurewebsites.net") && host.includes("func")) {
    detection.services.push("Azure Functions");
  }

  // Azure Blob Storage
  if (host.includes(".blob.core.windows.net")) {
    detection.services.push("Azure Blob Storage");
  }

  // Azure CDN
  const headers = await fetchHeaders(`https://${host}/`);
  if (headers["x-azure-ref"]) {
    detection.services.push("Azure Front Door / CDN");
    detection.indicators["azure_cdn"] = "X-Azure-Ref header present";
  }

  // Azure API Management
  if (host.includes(".azure-api.net")) {
    detection.services.push("Azure API Management");
  }

  // Azure Traffic Manager
  if (host.includes(".trafficmanager.net")) {
    detection.services.push("Azure Traffic Manager");
  }

  // Azure VM
  if (host.includes(".cloudapp.azure.com")) {
    detection.services.push("Azure Virtual Machine");
  }
}

/**
 * Detect GCP-specific services
 */
async function detectGCPServices(host: string, detection: CloudDetection, results: CheckResult[]) {
  // App Engine
  if (host.includes(".appspot.com")) {
    detection.services.push("Google App Engine");
    detection.indicators["app_engine"] = "appspot.com hostname";
  }

  // Cloud Run
  if (host.includes(".run.app")) {
    detection.services.push("Google Cloud Run");
    detection.indicators["cloud_run"] = "run.app hostname";
  }

  // Cloud Functions
  if (host.includes(".cloudfunctions.net")) {
    detection.services.push("Google Cloud Functions");
  }

  // Firebase
  if (host.includes(".firebaseapp.com") || host.includes(".web.app")) {
    detection.services.push("Firebase Hosting");
  }

  // Cloud Storage
  if (host.includes(".storage.googleapis.com")) {
    detection.services.push("Google Cloud Storage");
  }

  // GCP load balancer
  const headers = await fetchHeaders(`https://${host}/`);
  if (headers["via"]?.includes("google")) {
    detection.services.push("Google Cloud Load Balancer");
    detection.indicators["gclb"] = "Via: google header";
  }
}

/**
 * Detect container technology indicators
 */
async function detectContainerIndicators(host: string, headers: Record<string, string>, detection: CloudDetection) {
  // Docker indicators
  const dockerPaths = ["/v2/", "/v2/_catalog"];
  for (const path of dockerPaths) {
    const response = await fetchBody(`https://${host}${path}`);
    if (response && (response.status === 200 || response.status === 401)) {
      if (response.headers["docker-distribution-api-version"]) {
        detection.containers = true;
        detection.services.push("Docker Registry");
        detection.indicators["docker_registry"] = `Docker Distribution API at ${path}`;

        // Flag exposed Docker Registry
        if (response.status === 200) {
          const vuln = getVulnById("exposed-docker-registry");
          if (vuln) {
            // This will be added by caller
            detection.indicators["docker_registry_open"] = "Docker Registry accessible without authentication";
          }
        }
        break;
      }
    }
  }

  // Container runtime headers
  if (headers["x-docker-container-id"] || headers["x-container-id"]) {
    detection.containers = true;
    detection.indicators["container_id"] = "Container ID exposed in headers";
  }

  // ECS/Fargate
  if (headers["x-amzn-ecs-container-metadata"]) {
    detection.containers = true;
    detection.services.push("AWS ECS/Fargate");
  }
}

/**
 * Detect Kubernetes indicators
 */
async function detectKubernetesIndicators(host: string, detection: CloudDetection) {
  // Check for Kubernetes API exposure
  const k8sPaths = ["/api", "/apis", "/healthz", "/version"];
  for (const path of k8sPaths) {
    const response = await fetchBody(`https://${host}:6443${path}`);
    if (response && response.status !== 0) {
      if (response.body.includes("kubernetes") || response.body.includes("k8s") ||
          response.body.includes("apiVersion") || response.body.includes("serverAddressByClientCIDRs")) {
        detection.kubernetes = true;
        detection.services.push("Kubernetes API Server");
        detection.indicators["k8s_api"] = `Kubernetes API at :6443${path}`;

        // Flag exposed K8s API
        if (response.status === 200) {
          const vuln = getVulnById("exposed-k8s-api");
          if (vuln) {
            detection.indicators["k8s_api_open"] = "Kubernetes API accessible — critical security issue";
          }
        }
        break;
      }
    }
  }

  // Check for ingress controllers
  const ingressHeaders = await fetchHeaders(`https://${host}/`);
  if (ingressHeaders["x-kubernetes-pf-flowschema-uid"] || ingressHeaders["x-kubernetes-pf-prioritylevel-uid"]) {
    detection.kubernetes = true;
    detection.indicators["k8s_ingress"] = "Kubernetes flow control headers detected";
  }

  // Traefik ingress
  if (ingressHeaders["x-traefik-ingress"]) {
    detection.kubernetes = true;
    detection.services.push("Traefik Ingress Controller");
  }

  // Istio service mesh
  if (ingressHeaders["x-envoy-upstream-service-time"]) {
    detection.services.push("Envoy Proxy (possibly Istio)");
    detection.indicators["envoy"] = "X-Envoy-Upstream-Service-Time header";
  }
}

/**
 * Detect CDN and edge services
 */
function detectCDNServices(headers: Record<string, string>, host: string, detection: CloudDetection) {
  // Cloudflare
  if (headers["cf-ray"]) {
    detection.services.push("Cloudflare");
    detection.indicators["cloudflare"] = `CF-Ray: ${headers["cf-ray"]}`;
  }

  // Fastly
  if (headers["x-served-by"]?.includes("cache-") || headers["x-fastly-request-id"]) {
    detection.services.push("Fastly CDN");
    detection.indicators["fastly"] = "Fastly cache headers detected";
  }

  // Akamai
  if (headers["x-akamai-transformed"] || headers["x-true-cache-key"]) {
    detection.services.push("Akamai CDN");
    detection.indicators["akamai"] = "Akamai transformation headers detected";
  }

  // Vercel
  if (headers["x-vercel-id"] || host.includes(".vercel.app")) {
    detection.services.push("Vercel Edge Network");
    detection.indicators["vercel"] = "X-Vercel-Id header present";
  }

  // Netlify
  if (headers["x-nf-request-id"] || host.includes(".netlify.app")) {
    detection.services.push("Netlify Edge");
    detection.indicators["netlify"] = "Netlify request ID present";
  }
}

/**
 * Check for GCP Storage bucket exposure
 */
async function checkGCPStorage(host: string, results: CheckResult[]) {
  // Check if host might be a GCP bucket
  const domainParts = host.split(".");
  const potentialBucket = domainParts[0];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`https://storage.googleapis.com/${potentialBucket}/`, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 200) {
      const text = await res.text();
      if (text.includes("ListBucketResult") || text.includes("<Contents>")) {
        const vuln = getVulnById("open-gcp-bucket");
        if (vuln) {
          results.push({
            title: vuln.title,
            severity: vuln.severity,
            description: vuln.description,
            remediation: vuln.remediation,
            cveId: vuln.cveId,
            cvssScore: vuln.cvssScore,
            details: {
              target: host,
              bucketName: potentialBucket,
              bucketUrl: `https://storage.googleapis.com/${potentialBucket}/`,
            },
          });
        }
      }
    }
  } catch {
    // Bucket not accessible
  }
}
