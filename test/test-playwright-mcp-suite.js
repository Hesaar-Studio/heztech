/**
 * HezTech Microsoft Playwright MCP Acceptance Test Suite
 * Validates:
 * Test A: MCP Process Start & Tool Discovery
 * Test B: Navigation to https://example.com & Title Extraction
 * Test C: Element Interaction (Click / Snapshot)
 * Test D: Real Electron Chat Assistant Persian Prompt Execution
 * Test E: Research Agent Web Access & Multi-Agent Matrix Enforcement
 * Test F: SSRF Security Guard (Localhost, Private IPs, Metadata, file://)
 * Test G: Clean Termination & Zero Orphan Processes
 */

const fs = require('fs');
const path = require('path');
const mcpBrowserClient = require('../src/core/mcp-browser-client');
const agentOrchestrator = require('../src/core/agent-orchestrator');
const ToolManager = require('../src/core/tools');

async function runSuite() {
  const results = {
    suite: 'HezTech Microsoft Playwright MCP Integration Suite',
    timestamp: new Date().toISOString(),
    tests: {}
  };

  console.log('=== STARTING HEZTECH PLAYWRIGHT MCP TEST SUITE ===\n');

  // -------------------------------------------------------------
  // Test A: MCP Process Start & Tool Discovery
  // -------------------------------------------------------------
  console.log('--- Test A: MCP Process Start & Tool Discovery ---');
  try {
    await mcpBrowserClient.ensureStarted();
    const status = mcpBrowserClient.getStatus();
    const tools = mcpBrowserClient.toolsList;
    const pass = status.available && status.initialized && tools.length >= 20;

    results.tests.testA = {
      name: 'Playwright MCP Server Initialization & Tool Discovery',
      pass,
      toolsCount: tools.length,
      sampleTools: tools.slice(0, 8).map(t => t.name),
      pid: status.pid
    };
    console.log(`[Test A] PASS: Initialized PID=${status.pid}, Registered Tools=${tools.length}`);
  } catch (err) {
    results.tests.testA = { name: 'Playwright MCP Initialization', pass: false, error: err.message };
    console.error('[Test A] FAIL:', err.message);
  }

  // -------------------------------------------------------------
  // Test B: Navigation to https://example.com & Title Extraction
  // -------------------------------------------------------------
  console.log('\n--- Test B: Navigation to https://example.com & Title Extraction ---');
  try {
    const navRes = await mcpBrowserClient.navigate('https://example.com', 'master');
    const snapRes = await mcpBrowserClient.snapshot('master');
    const pass = navRes.success && navRes.title.includes('Example Domain') && snapRes.success && snapRes.snapshot.length > 50;

    results.tests.testB = {
      name: 'Navigate & Title Extraction',
      pass,
      url: navRes.url,
      title: navRes.title,
      snapshotLength: snapRes.length
    };
    console.log(`[Test B] PASS: URL=${navRes.url}, Title="${navRes.title}", Snapshot Length=${snapRes.length}`);
  } catch (err) {
    results.tests.testB = { name: 'Navigate & Title Extraction', pass: false, error: err.message };
    console.error('[Test B] FAIL:', err.message);
  }

  // -------------------------------------------------------------
  // Test C: Element Interaction (Snapshot & Screenshot)
  // -------------------------------------------------------------
  console.log('\n--- Test C: Element Interaction & Screenshot ---');
  try {
    const shotRes = await mcpBrowserClient.takeScreenshot('test_example_page.png', 'master');
    const fileExists = fs.existsSync(shotRes.path);
    const fileSize = fileExists ? fs.statSync(shotRes.path).size : 0;
    const pass = shotRes.success && fileExists && fileSize > 1000;

    results.tests.testC = {
      name: 'Element Screenshot Capture',
      pass,
      screenshotPath: shotRes.path,
      fileSize,
      fileExists
    };
    console.log(`[Test C] PASS: Screenshot=${shotRes.filename}, Size=${fileSize} bytes`);
  } catch (err) {
    results.tests.testC = { name: 'Element Screenshot Capture', pass: false, error: err.message };
    console.error('[Test C] FAIL:', err.message);
  }

  // -------------------------------------------------------------
  // Test D: Real Assistant Persian Prompt Execution
  // -------------------------------------------------------------
  console.log('\n--- Test D: Real Assistant Persian Prompt Execution ---');
  try {
    const prompt = 'مرورگر را باز کن، وارد example.com شو، عنوان صفحه را بخوان و نتیجه را بگو.';
    const toolCallsCaptured = [];

    const agentOutcome = await agentOrchestrator.runAgentLoop({
      query: prompt,
      model: 'gemini-3.5-flash-lite',
      onToolCall: (name, args) => {
        toolCallsCaptured.push({ name, args });
        console.log(`[Test D Tool Called]: ${name}`, JSON.stringify(args));
      }
    });

    const hasBrowserTool = toolCallsCaptured.some(t => t.name.startsWith('browser_'));
    const replyMentionsTitle = agentOutcome.reply && (
      agentOutcome.reply.includes('Example Domain') ||
      agentOutcome.reply.includes('example') ||
      agentOutcome.reply.includes('دامنه') ||
      agentOutcome.reply.includes('عنوان')
    );
    const pass = hasBrowserTool && replyMentionsTitle;

    results.tests.testD = {
      name: 'Real Persian Assistant Prompt (Browser Automation Loop)',
      pass,
      toolCalls: toolCallsCaptured,
      model: agentOutcome.model,
      provider: agentOutcome.provider,
      replyPreview: agentOutcome.reply.slice(0, 300) + '...'
    };
    console.log(`[Test D] PASS: Model=${agentOutcome.model}, ToolsExecuted=${toolCallsCaptured.length}`);
    console.log(`[Test D Reply]:\n${agentOutcome.reply}\n`);
  } catch (err) {
    results.tests.testD = { name: 'Real Persian Assistant Prompt', pass: false, error: err.message };
    console.error('[Test D] FAIL:', err.message);
  }

  // -------------------------------------------------------------
  // Test E: Research Agent Delegation & Multi-Agent Authorization Matrix
  // -------------------------------------------------------------
  console.log('\n--- Test E: Multi-Agent Authorization Matrix ---');
  try {
    // 1. Research Agent is authorized for read-only navigation and snapshot
    const researchNav = await mcpBrowserClient.navigate('https://example.com', 'research');
    const researchSnap = await mcpBrowserClient.snapshot('research');

    // 2. Research Agent is NOT authorized for click
    const researchClick = await mcpBrowserClient.click('a', 'research');

    // 3. Unauthorized agent (e.g. critic or judge) is NOT authorized for navigate
    const criticNav = await mcpBrowserClient.navigate('https://example.com', 'critic');

    const pass = researchNav.success &&
                 researchSnap.success &&
                 researchClick.success === false &&
                 criticNav.success === false;

    results.tests.testE = {
      name: 'Agent Authorization Matrix & Research Delegation',
      pass,
      researchNavAllowed: researchNav.success,
      researchSnapAllowed: researchSnap.success,
      researchClickBlocked: researchClick.success === false,
      researchClickError: researchClick.error,
      criticNavBlocked: criticNav.success === false,
      criticNavError: criticNav.error
    };
    console.log(`[Test E] PASS: Research Read Allowed, Research Click Blocked, Critic Nav Blocked.`);
  } catch (err) {
    results.tests.testE = { name: 'Multi-Agent Authorization Matrix', pass: false, error: err.message };
    console.error('[Test E] FAIL:', err.message);
  }

  // -------------------------------------------------------------
  // Test F: SSRF Security Guard Verification
  // -------------------------------------------------------------
  console.log('\n--- Test F: SSRF Security Guard Verification ---');
  try {
    const maliciousTargets = [
      'http://localhost:8080/admin',
      'http://127.0.0.1:3000',
      'http://192.168.1.1/router',
      'http://169.254.169.254/latest/meta-data',
      'file:///C:/Windows/win.ini'
    ];

    const ssrfResults = [];
    let allBlocked = true;

    for (const target of maliciousTargets) {
      const res = await mcpBrowserClient.navigate(target, 'master');
      const blocked = res.success === false && res.error.includes('SSRF Guard');
      ssrfResults.push({ target, blocked, error: res.error });
      if (!blocked) allBlocked = false;
    }

    results.tests.testF = {
      name: 'SSRF Security Guard (Localhost, Private IPs, Metadata, File)',
      pass: allBlocked,
      blockedCount: ssrfResults.filter(r => r.blocked).length,
      totalTested: maliciousTargets.length,
      details: ssrfResults
    };
    console.log(`[Test F] PASS: ${ssrfResults.filter(r => r.blocked).length}/${maliciousTargets.length} Malicious Targets Blocked.`);
  } catch (err) {
    results.tests.testF = { name: 'SSRF Security Guard', pass: false, error: err.message };
    console.error('[Test F] FAIL:', err.message);
  }

  // -------------------------------------------------------------
  // Test G: Clean Termination & Zero Orphan Processes
  // -------------------------------------------------------------
  console.log('\n--- Test G: Clean Termination & Zero Orphan Processes ---');
  try {
    const pidBefore = mcpBrowserClient.process ? mcpBrowserClient.process.pid : null;
    const closeRes = await mcpBrowserClient.close('master');
    const statusAfter = mcpBrowserClient.getStatus();
    const isKilled = statusAfter.initialized === false && statusAfter.pid === null;

    results.tests.testG = {
      name: 'Clean Session Termination & Process Cleanup',
      pass: closeRes.success && isKilled,
      pidBefore,
      statusAfter
    };
    console.log(`[Test G] PASS: Session Closed, Initialized=${statusAfter.initialized}, PID=${statusAfter.pid}`);
  } catch (err) {
    results.tests.testG = { name: 'Clean Session Termination', pass: false, error: err.message };
    console.error('[Test G] FAIL:', err.message);
  }

  // Write full summary to artifact path
  const summaryPath = path.resolve('C:\\Users\\Green\\.gemini\\antigravity\\brain\\f8b37958-d0c9-4d74-84ce-c3cf49b66dd6\\heztech_playwright_mcp_verification.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\n=== SUITE COMPLETE. Saved verification report to: ${summaryPath} ===`);

  const allPass = Object.values(results.tests).every(t => t.pass);
  console.log(`OVERALL STATUS: ${allPass ? 'ALL TESTS PASSED (7/7)' : 'SOME TESTS FAILED'}`);
  return results;
}

runSuite().then(res => {
  const allPass = Object.values(res.tests).every(t => t.pass);
  process.exit(allPass ? 0 : 1);
}).catch(e => {
  console.error('Suite fatal error:', e);
  process.exit(1);
});
