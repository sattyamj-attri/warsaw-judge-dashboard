import { tool } from '@openai/agents';
import { Stagehand, AISdkClient } from '@browserbasehq/stagehand';
import { createAzure } from '@ai-sdk/azure';
import { z } from 'zod';
import path from 'path';
import type { Page } from 'playwright';

// Callback for pushing logs to the active audit
let toolLogCallback: ((message: string) => void) | null = null;

export function setToolLogCallback(callback: ((message: string) => void) | null): void {
  toolLogCallback = callback;
}

// Logging utility for tools (no emojis)
function toolLog(level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'TOOL', message: string, data?: unknown) {
  const timestamp = new Date().toISOString();
  const consoleMsg = `[${timestamp}] [STAGEHAND/${level}] ${message}`;
  console.log(consoleMsg);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }

  // Push to audit logs if callback is registered
  if (toolLogCallback) {
    const formattedMsg = data
      ? `[${timestamp}] [STAGEHAND/${level}] ${message} ${JSON.stringify(data)}`
      : `[${timestamp}] [STAGEHAND/${level}] ${message}`;
    toolLogCallback(formattedMsg);
  }
}

// Stagehand singleton for browser automation
let stagehandInstance: Stagehand | null = null;

// Store screenshots separately to avoid token overflow
let lastScreenshot: string | null = null;

export function getLastScreenshot(): string | null {
  return lastScreenshot;
}

export function clearLastScreenshot(): void {
  lastScreenshot = null;
}

// Helper to get the current page from Stagehand
async function getPage(stagehand: Stagehand): Promise<Page> {
  const pages = stagehand.context.pages();
  if (pages.length === 0) {
    throw new Error('No pages available in browser context');
  }
  return pages[0];
}

// Configure Azure OpenAI for Stagehand's AI features
function createStagehandLLMClient() {
  const azure = createAzure({
    resourceName: extractResourceName(process.env.AZURE_OPENAI_ENDPOINT || ''),
    apiKey: process.env.AZURE_OPENAI_API_KEY || '',
  });

  return new AISdkClient({
    model: azure(process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o'),
  });
}

// Extract resource name from Azure endpoint URL
function extractResourceName(endpoint: string): string {
  // https://attri-internal-us-east-2.openai.azure.com/ -> attri-internal-us-east-2
  const match = endpoint.match(/https:\/\/([^.]+)\.openai\.azure\.com/);
  return match ? match[1] : '';
}

export async function getStagehand(): Promise<Stagehand> {
  if (!stagehandInstance) {
    // Determine environment: BROWSERBASE for production (Vercel), LOCAL for development
    const hasBrowserbase = !!(process.env.BROWSERBASE_API_KEY && process.env.BROWSERBASE_PROJECT_ID);
    const env = hasBrowserbase ? 'BROWSERBASE' : 'LOCAL';

    toolLog('INFO', `Initializing browser (${env} mode)...`);
    toolLog('DEBUG', 'Stagehand configuration:', {
      env,
      enableCaching: false,
      verbose: 1,
      hasLLMClient: true,
      hasBrowserbaseKey: !!process.env.BROWSERBASE_API_KEY,
      hasBrowserbaseProject: !!process.env.BROWSERBASE_PROJECT_ID,
    });

    if (env === 'BROWSERBASE') {
      // Production: Use Browserbase cloud browser (required for Vercel)
      toolLog('INFO', 'Using Browserbase cloud browser for production');
      stagehandInstance = new Stagehand({
        env: 'BROWSERBASE',
        apiKey: process.env.BROWSERBASE_API_KEY,
        projectId: process.env.BROWSERBASE_PROJECT_ID,
        enableCaching: false,
        verbose: 1,
        llmClient: createStagehandLLMClient(),
      });
    } else {
      // Development: Use local Chrome/Chromium
      // Try to find Chrome in common locations, or use env var override
      const playwrightChromiumPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
        findLocalChrome();

      toolLog('DEBUG', 'Using local Chromium executable:', { path: playwrightChromiumPath });

      if (!playwrightChromiumPath) {
        throw new Error(
          'No browser found for LOCAL mode. Either:\n' +
          '1. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID for cloud browser, or\n' +
          '2. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to your local Chrome path, or\n' +
          '3. Run: npx playwright install chromium'
        );
      }

      stagehandInstance = new Stagehand({
        env: 'LOCAL',
        enableCaching: false,
        verbose: 1,
        llmClient: createStagehandLLMClient(),
        localBrowserLaunchOptions: {
          headless: true,
          executablePath: playwrightChromiumPath,
        },
      });
    }

    toolLog('INFO', 'Browser instance created, initializing...');
    await stagehandInstance.init();
    toolLog('INFO', 'Browser initialized successfully');
  }
  return stagehandInstance;
}

// Helper to find Chrome in common locations (for local development)
function findLocalChrome(): string | undefined {
  const fs = require('fs');
  const possiblePaths = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    process.env.HOME + '/Library/Caches/ms-playwright/chromium-1200/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    process.env.HOME + '/Library/Caches/ms-playwright/chromium-1200/chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Windows (WSL paths)
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];

  for (const chromePath of possiblePaths) {
    try {
      if (fs.existsSync(chromePath)) {
        return chromePath;
      }
    } catch {
      // Continue to next path
    }
  }

  return undefined;
}

export async function cleanupStagehand(): Promise<void> {
  if (stagehandInstance) {
    toolLog('INFO', 'Closing browser...');
    await stagehandInstance.close();
    stagehandInstance = null;
    toolLog('INFO', 'Browser closed');
  }
}

// Tool: Navigate to a URL (Enhanced)
export const navigateTool = tool({
  name: 'navigate_browser',
  description: 'Navigates the browser to a specific URL. Returns detailed page information including title, URL (after redirects), and basic page stats.',
  parameters: z.object({
    url: z.string().describe('The full URL to navigate to (e.g., https://example.com)'),
  }),
  execute: async ({ url }) => {
    toolLog('TOOL', 'navigate_browser called', { url });
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      const page = await getPage(stagehand);
      toolLog('DEBUG', 'Navigating to URL...', { url });

      // Navigate and track response
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      const statusCode = response?.status() || 0;

      const title = await page.title();
      const finalUrl = page.url();
      const duration = Date.now() - startTime;

      // Get basic page info
      const pageInfo = await page.evaluate(() => ({
        hasInputs: document.querySelectorAll('input').length,
        hasButtons: document.querySelectorAll('button').length,
        hasForms: document.querySelectorAll('form').length,
        hasFileInputs: document.querySelectorAll('input[type="file"]').length,
        bodyTextLength: document.body?.innerText?.length || 0,
      }));

      const result = {
        success: true,
        url: finalUrl,
        originalUrl: url,
        redirected: finalUrl !== url,
        title,
        statusCode,
        loadTimeMs: duration,
        pageStats: pageInfo,
      };

      toolLog('TOOL', `Navigation successful (${duration}ms)`, result);
      return JSON.stringify(result);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorResult = {
        success: false,
        url,
        error: String(error),
        loadTimeMs: duration,
      };
      toolLog('ERROR', `Navigation failed (${duration}ms)`, errorResult);
      return JSON.stringify(errorResult);
    }
  },
});

// Tool: Perform an action on the page using AI
export const actTool = tool({
  name: 'perform_action',
  description: 'Uses AI vision to interact with the page - click buttons, type text, upload files, fill forms. Describe the action in natural language.',
  parameters: z.object({
    instruction: z.string().describe('Natural language instruction for the action, e.g., "Click the Upload button" or "Type test@example.com in the email field"'),
  }),
  execute: async ({ instruction }) => {
    toolLog('TOOL', 'perform_action called', { instruction });
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      toolLog('DEBUG', 'Executing AI-driven action...', { instruction });
      await stagehand.act(instruction);
      const duration = Date.now() - startTime;

      toolLog('TOOL', `Action completed (${duration}ms)`, { instruction });
      return `Action completed: ${instruction}`;
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Action failed (${duration}ms)`, { instruction, error: String(error) });
      throw error;
    }
  },
});

// Helper to truncate long strings to avoid token overflow
function truncateOutput(str: string, maxLength: number = 2000): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + `... [truncated, ${str.length - maxLength} chars omitted]`;
}

// Tool: Extract information from the page
export const extractTool = tool({
  name: 'extract_page_data',
  description: 'Extracts structured information from the current page using AI vision. Use this to read text, check for errors, or verify UI state.',
  parameters: z.object({
    instruction: z.string().describe('What information to extract, e.g., "Get all error messages on the page" or "Read the response after form submission"'),
  }),
  execute: async ({ instruction }) => {
    toolLog('TOOL', 'extract_page_data called', { instruction });
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      toolLog('DEBUG', 'Extracting data from page...', { instruction });
      const result = await stagehand.extract({
        instruction,
        schema: z.object({
          data: z.string().describe('The extracted information (concise summary only)'),
          found: z.boolean().describe('Whether the requested information was found'),
        }),
      });
      const duration = Date.now() - startTime;

      // Truncate all string fields to prevent token overflow
      // Stagehand may return data in various fields including pageText
      const truncatedResult: Record<string, unknown> = {};
      const skipFields = ['pageText', 'rawText', 'text', 'html', 'innerHTML', 'outerHTML'];

      for (const [key, value] of Object.entries(result)) {
        // Skip known large fields entirely
        if (skipFields.includes(key)) {
          truncatedResult[key] = '[omitted for token efficiency]';
        } else if (typeof value === 'string') {
          truncatedResult[key] = truncateOutput(value, 1000);
        } else {
          truncatedResult[key] = value;
        }
      }

      toolLog('TOOL', `Data extracted (${duration}ms)`, { instruction, found: (result as { found?: boolean }).found, resultKeys: Object.keys(result) });
      toolLog('DEBUG', 'Extracted data (truncated):', truncatedResult);
      return JSON.stringify(truncatedResult);
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Extraction failed (${duration}ms)`, { instruction, error: String(error) });
      throw error;
    }
  },
});

// Tool: Observe the page and describe what's visible
export const observeTool = tool({
  name: 'observe_page',
  description: 'Analyzes the current page and returns possible actions (limited to top 10 results). Use this to understand what can be done on the page.',
  parameters: z.object({
    instruction: z.string().describe('What to look for, e.g., "Find all upload buttons" or "Identify form fields"'),
  }),
  execute: async ({ instruction }) => {
    toolLog('TOOL', 'observe_page called', { instruction });
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      toolLog('DEBUG', 'Observing page...', { instruction });
      const observations = await stagehand.observe(instruction);
      const duration = Date.now() - startTime;

      // Limit to first 10 observations to prevent token overflow
      const limitedObservations = Array.isArray(observations)
        ? observations.slice(0, 10).map(obs => ({
            description: truncateOutput(obs.description || '', 200),
            method: obs.method,
            selector: obs.selector,
          }))
        : observations;

      const observationCount = Array.isArray(observations) ? observations.length : 1;
      toolLog('TOOL', `Observation completed (${duration}ms)`, { instruction, observationCount, returned: Array.isArray(limitedObservations) ? limitedObservations.length : 1 });
      toolLog('DEBUG', 'Observations:', limitedObservations);
      return JSON.stringify(limitedObservations, null, 2);
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Observation failed (${duration}ms)`, { instruction, error: String(error) });
      throw error;
    }
  },
});

// Tool: Take a screenshot for evidence
export const screenshotTool = tool({
  name: 'capture_evidence',
  description: 'Takes a screenshot of the current page state. The screenshot is stored for the final report. Use this to capture evidence of vulnerabilities or test results.',
  parameters: z.object({
    reason: z.string().describe('Why this screenshot is being captured, e.g., "Capturing error state after malicious upload"'),
  }),
  execute: async ({ reason }) => {
    toolLog('TOOL', 'capture_evidence called', { reason });
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      const page = await getPage(stagehand);
      toolLog('DEBUG', 'Taking screenshot...', { reason });
      const buffer = await page.screenshot({ fullPage: false });
      const base64 = buffer.toString('base64');
      const duration = Date.now() - startTime;
      const sizeKB = Math.round(base64.length / 1024);

      // Store screenshot separately to avoid sending large data to LLM
      lastScreenshot = base64;

      toolLog('TOOL', `Screenshot captured (${duration}ms, ${sizeKB}KB)`, { reason });
      // Return confirmation only - NOT the screenshot data
      return JSON.stringify({
        captured: true,
        reason,
        sizeKB,
        timestamp: new Date().toISOString(),
        note: 'Screenshot stored for final report (not included in this response to save tokens)',
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Screenshot failed (${duration}ms)`, { reason, error: String(error) });
      throw error;
    }
  },
});

// Tool: Upload a trap file
export const uploadTrapFileTool = tool({
  name: 'upload_trap_file',
  description: 'Uploads a pre-configured "trap" file to test the application. These files contain intentional issues to test validation. Uses input[type="file"] selector by default.',
  parameters: z.object({
    trapType: z.enum([
      'invoice_math_error',
      'malicious_contract',
      'hipaa_violation',
      'oversized_file',
      'jailbreak_prompts',
      'rag_poison_doc',
      'test_payment'
    ]).describe('The type of trap file to upload'),
  }),
  execute: async ({ trapType }) => {
    const fileInputSelector = 'input[type="file"]';
    toolLog('TOOL', 'upload_trap_file called', { trapType, fileInputSelector });
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      const page = await getPage(stagehand);

      const trapFiles: Record<string, string> = {
        invoice_math_error: 'invoice_math_error.txt',
        malicious_contract: 'malicious_contract.txt',
        hipaa_violation: 'hipaa_violation.txt',
        oversized_file: 'oversized_file.txt',
        jailbreak_prompts: 'jailbreak_prompts.txt',
        rag_poison_doc: 'rag_poison_doc.txt',
        test_payment: 'test_payment.txt',
      };

      const fileName = trapFiles[trapType];
      const trapPath = path.join(process.cwd(), 'public', 'traps', fileName);
      toolLog('DEBUG', 'Trap file details:', { trapType, fileName, trapPath });

      // Find file input and upload
      const selector = fileInputSelector;
      toolLog('DEBUG', 'Looking for file input...', { selector });
      const fileInput = await page.$(selector);

      if (!fileInput) {
        const duration = Date.now() - startTime;
        toolLog('WARN', `No file input found (${duration}ms)`, { selector });
        return JSON.stringify({ success: false, error: 'No file input found on page' });
      }

      toolLog('DEBUG', 'File input found, uploading...');
      await fileInput.setInputFiles(trapPath);
      const duration = Date.now() - startTime;

      toolLog('TOOL', `Trap file uploaded (${duration}ms)`, { trapType, fileName });
      return JSON.stringify({
        success: true,
        trapType,
        fileName,
        message: `Uploaded ${trapType} trap file`,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Upload failed (${duration}ms)`, { trapType, error: String(error) });
      throw error;
    }
  },
});

// Tool: Wait for a specified time
export const waitTool = tool({
  name: 'wait_for_change',
  description: 'Waits for a specified amount of time in milliseconds. Use after actions that trigger loading or API calls.',
  parameters: z.object({
    milliseconds: z.number().describe('Time to wait in milliseconds (e.g., 2000 for 2 seconds)'),
  }),
  execute: async ({ milliseconds }) => {
    toolLog('TOOL', `wait_for_change called (${milliseconds}ms)`);
    const startTime = Date.now();

    try {
      // Use standard Promise-based wait instead of page.waitForTimeout
      await new Promise(resolve => setTimeout(resolve, milliseconds));
      const duration = Date.now() - startTime;

      toolLog('TOOL', `Wait completed (${duration}ms)`);
      return `Waited for ${milliseconds}ms`;
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Wait failed (${duration}ms)`, { error: String(error) });
      throw error;
    }
  },
});

// Tool: Check for JavaScript errors on the page
export const checkErrorsTool = tool({
  name: 'check_page_errors',
  description: 'Checks the browser console for JavaScript errors, warnings, and security issues. Use this to detect client-side problems. Always includes warnings.',
  parameters: z.object({}),
  execute: async () => {
    const includeWarnings = true;
    toolLog('TOOL', 'check_page_errors called', { includeWarnings });
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      const page = await getPage(stagehand);

      // Collect console messages
      const errors: string[] = [];
      const warnings: string[] = [];
      const securityIssues: string[] = [];

      // Get any existing errors from the page
      const consoleErrors = await page.evaluate(() => {
        // Check for common security issues
        const issues: string[] = [];

        // Check if page is served over HTTP (not HTTPS)
        if (window.location.protocol === 'http:') {
          issues.push('Page served over insecure HTTP');
        }

        // Check for inline scripts without nonce
        const inlineScripts = document.querySelectorAll('script:not([src]):not([nonce])');
        if (inlineScripts.length > 0) {
          issues.push(`${inlineScripts.length} inline scripts without nonce (CSP risk)`);
        }

        // Check for password fields without autocomplete=off
        const passwordFields = document.querySelectorAll('input[type="password"]:not([autocomplete="off"]):not([autocomplete="new-password"]):not([autocomplete="current-password"])');
        if (passwordFields.length > 0) {
          issues.push(`${passwordFields.length} password fields with potential autocomplete issues`);
        }

        // Check for forms with action to different domain
        const forms = document.querySelectorAll('form[action]');
        forms.forEach(form => {
          const action = form.getAttribute('action');
          if (action && action.startsWith('http') && !action.includes(window.location.hostname)) {
            issues.push(`Form submits to external domain: ${action}`);
          }
        });

        return {
          securityIssues: issues,
          documentReady: document.readyState,
        };
      });

      securityIssues.push(...consoleErrors.securityIssues);

      const duration = Date.now() - startTime;
      const result = {
        errors: errors.slice(0, 10),
        warnings: includeWarnings ? warnings.slice(0, 10) : [],
        securityIssues: securityIssues.slice(0, 10),
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        totalSecurityIssues: securityIssues.length,
        documentState: consoleErrors.documentReady,
        checkDurationMs: duration,
      };

      toolLog('TOOL', `Error check completed (${duration}ms)`, {
        errors: errors.length,
        warnings: warnings.length,
        security: securityIssues.length,
      });
      return JSON.stringify(result);
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Error check failed (${duration}ms)`, { error: String(error) });
      return JSON.stringify({
        errors: [],
        warnings: [],
        securityIssues: [],
        checkFailed: true,
        error: String(error),
      });
    }
  },
});

// Tool: Test input field with specific payload
export const testInputTool = tool({
  name: 'test_input_field',
  description: 'Tests a specific input field with a security payload (XSS, SQL injection, etc.). Automatically checks for vulnerabilities in the response. Does NOT submit the form automatically.',
  parameters: z.object({
    selector: z.string().describe('CSS selector for the input field to test'),
    payload: z.string().describe('The test payload to enter (e.g., "<script>alert(1)</script>" for XSS test)'),
  }),
  execute: async ({ selector, payload }) => {
    const submitAfter = false;
    toolLog('TOOL', 'test_input_field called', { selector, payload: payload.substring(0, 50), submitAfter });
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      const page = await getPage(stagehand);

      // Find the input
      const input = await page.$(selector);
      if (!input) {
        return JSON.stringify({
          success: false,
          error: `Input not found: ${selector}`,
        });
      }

      // Clear and type the payload
      await input.fill('');
      await input.fill(payload);
      toolLog('DEBUG', 'Payload entered', { selector });

      // Submit if requested
      if (submitAfter) {
        // Try to find and click submit button
        const form = await page.$(`${selector} >> xpath=ancestor::form`);
        if (form) {
          const submitBtn = await form.$('button[type="submit"], input[type="submit"]');
          if (submitBtn) {
            await submitBtn.click();
            await page.waitForLoadState('networkidle').catch(() => {});
          }
        }
      }

      // Wait a moment for any response
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check for vulnerability indicators
      const vulnerabilityCheck = await page.evaluate((testPayload) => {
        const indicators: string[] = [];

        // Check if payload appears unescaped in page
        if (document.body.innerHTML.includes(testPayload)) {
          indicators.push('Payload appears unescaped in HTML (potential XSS)');
        }

        // Check for script execution (XSS)
        if (testPayload.includes('<script>') && document.body.innerHTML.includes('<script>')) {
          indicators.push('Script tag may have been injected');
        }

        // Check for SQL error messages
        const sqlErrors = ['SQL', 'syntax error', 'mysql', 'postgresql', 'sqlite', 'ORA-', 'ODBC'];
        const pageText = document.body.innerText.toLowerCase();
        for (const err of sqlErrors) {
          if (pageText.includes(err.toLowerCase())) {
            indicators.push(`Potential SQL error message detected: ${err}`);
            break;
          }
        }

        // Check for error messages
        const errorElements = document.querySelectorAll('.error, .alert-danger, [class*="error"]');
        if (errorElements.length > 0) {
          indicators.push(`${errorElements.length} error elements found on page`);
        }

        return {
          indicators,
          pageTitle: document.title,
          currentUrl: window.location.href,
        };
      }, payload);

      const duration = Date.now() - startTime;
      const result = {
        success: true,
        selector,
        payloadLength: payload.length,
        submitted: submitAfter,
        vulnerabilityIndicators: vulnerabilityCheck.indicators,
        potentialVulnerability: vulnerabilityCheck.indicators.length > 0,
        pageTitle: vulnerabilityCheck.pageTitle,
        testDurationMs: duration,
      };

      toolLog('TOOL', `Input test completed (${duration}ms)`, {
        selector,
        indicators: vulnerabilityCheck.indicators.length,
      });
      return JSON.stringify(result);
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Input test failed (${duration}ms)`, { error: String(error) });
      return JSON.stringify({
        success: false,
        selector,
        error: String(error),
      });
    }
  },
});

// Tool: Get detailed page information
export const getPageInfoTool = tool({
  name: 'get_page_info',
  description: 'Gets comprehensive information about the current page including forms, inputs, buttons, links, and potential attack surface.',
  parameters: z.object({}),
  execute: async () => {
    toolLog('TOOL', 'get_page_info called');
    const startTime = Date.now();

    try {
      const stagehand = await getStagehand();
      const page = await getPage(stagehand);

      const pageInfo = await page.evaluate(() => {
        // Get all forms
        const forms = Array.from(document.querySelectorAll('form')).map(form => ({
          id: form.id || null,
          action: form.action || null,
          method: form.method || 'GET',
          inputCount: form.querySelectorAll('input').length,
          hasFileInput: form.querySelector('input[type="file"]') !== null,
          hasPasswordInput: form.querySelector('input[type="password"]') !== null,
        }));

        // Get all inputs not in forms
        const standaloneInputs = Array.from(document.querySelectorAll('input:not(form input)')).map(input => ({
          type: input.type,
          name: input.name || null,
          id: input.id || null,
          placeholder: input.placeholder || null,
        })).slice(0, 20);

        // Get all buttons
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]')).map(btn => ({
          text: btn.textContent?.trim().substring(0, 50) || null,
          type: btn.getAttribute('type') || 'button',
          id: btn.id || null,
        })).slice(0, 20);

        // Get file inputs specifically
        const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).map(input => ({
          id: input.id || null,
          name: input.name || null,
          accept: input.accept || '*',
          multiple: input.multiple,
        }));

        // Check for AI/chat interfaces
        const aiIndicators = {
          hasChatInput: document.querySelector('[class*="chat"], [id*="chat"], [class*="message"], textarea') !== null,
          hasAIBranding: document.body.innerText.toLowerCase().includes('ai') ||
                         document.body.innerText.toLowerCase().includes('assistant') ||
                         document.body.innerText.toLowerCase().includes('chatgpt'),
        };

        // Security indicators
        const security = {
          hasHttps: window.location.protocol === 'https:',
          hasCspMeta: document.querySelector('meta[http-equiv="Content-Security-Policy"]') !== null,
          hasPasswordFields: document.querySelectorAll('input[type="password"]').length,
          externalLinks: Array.from(document.querySelectorAll('a[href^="http"]'))
            .filter(a => !a.href.includes(window.location.hostname)).length,
        };

        return {
          url: window.location.href,
          title: document.title,
          forms,
          formCount: forms.length,
          standaloneInputs,
          buttons,
          buttonCount: buttons.length,
          fileInputs,
          fileInputCount: fileInputs.length,
          aiIndicators,
          security,
          bodyTextLength: document.body.innerText.length,
        };
      });

      const duration = Date.now() - startTime;
      toolLog('TOOL', `Page info retrieved (${duration}ms)`, {
        forms: pageInfo.formCount,
        buttons: pageInfo.buttonCount,
        fileInputs: pageInfo.fileInputCount,
      });

      return JSON.stringify(pageInfo, null, 2);
    } catch (error) {
      const duration = Date.now() - startTime;
      toolLog('ERROR', `Page info failed (${duration}ms)`, { error: String(error) });
      return JSON.stringify({
        error: String(error),
      });
    }
  },
});

// Export all tools as an array for the agent
export const auditTools = [
  navigateTool,
  actTool,
  extractTool,
  observeTool,
  screenshotTool,
  uploadTrapFileTool,
  waitTool,
  checkErrorsTool,
  testInputTool,
  getPageInfoTool,
];
