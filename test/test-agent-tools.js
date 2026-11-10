const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'heztech-tools-'));
process.env.HEZTECH_DATA_DIR = path.join(isolatedRoot, 'data');
fs.mkdirSync(process.env.HEZTECH_DATA_DIR);
const agentOrchestrator = require('../src/core/agent-orchestrator');
const { SecurityManager: security } = require('../src/core/security');
agentOrchestrator.defaultCwd = isolatedRoot;
process.on('exit', () => fs.rmSync(isolatedRoot, { recursive: true, force: true }));

async function runAgentToolsTest() {
  console.log('================================================================');
  console.log(' HESATECH — AUTONOMOUS AGENT OS TOOLS UNIT TEST');
  console.log('================================================================');

  // 1. Telemetry
  console.log('[*] Testing get_system_telemetry...');
  const telem = await agentOrchestrator.executeTool('get_system_telemetry');
  assert.ok(telem.cpuModel, 'CPU model should be present');
  assert.ok(telem.totalMemGB, 'Total memory should be present');
  console.log(`  ✅ CPU: ${telem.cpuModel} (${telem.cpuCores} cores) | RAM: ${telem.usedMemPercent}% used | Disk: ${telem.disk.percent}%`);

  // 2. Command Execution
  console.log('[*] Testing run_command (cmd /c ver)...');
  const cmdRes = await agentOrchestrator.executeTool('run_command', { command: 'cmd /c ver' });
  assert.strictEqual(cmdRes.exitCode, 0);
  assert.ok(cmdRes.stdout.includes('Microsoft Windows'), 'Output should contain Microsoft Windows');
  console.log(`  ✅ Command output: ${cmdRes.stdout.trim()}`);

  // 3. Write, Read, Edit File
  const testFile = path.join(isolatedRoot, 'test-scratch-agent.txt');
  console.log('[*] Testing write_file...');
  const writeRes = await agentOrchestrator.executeTool('write_file', {
    filePath: 'test-scratch-agent.txt',
    content: 'Initial text by HesaTech Agent. Version 1.0.'
  });
  assert.strictEqual(writeRes.requiresApproval, true);
  assert.strictEqual(fs.existsSync(testFile), false);
  assert.strictEqual(security.resolveApproval(writeRes.approvalId, true, 'Test Owner', 'ui').success, true);
  const approvedWrite = await agentOrchestrator.executeTool('write_file', { filePath: 'test-scratch-agent.txt', content: 'Initial text by HesaTech Agent. Version 1.0.' });
  assert.strictEqual(approvedWrite.success, true);
  console.log('  ✅ write_file success.');

  console.log('[*] Testing read_file...');
  const readRes = await agentOrchestrator.executeTool('read_file', { filePath: 'test-scratch-agent.txt' });
  assert.ok(readRes.content.includes('Version 1.0'));
  console.log(`  ✅ read_file content verified: "${readRes.content.trim()}"`);

  console.log('[*] Testing edit_file...');
  const editRes = await agentOrchestrator.executeTool('edit_file', {
    filePath: 'test-scratch-agent.txt',
    target: 'Version 1.0',
    replacement: 'Version 2.0 (Verified)'
  });
  assert.strictEqual(editRes.requiresApproval, true);
  assert.strictEqual(security.resolveApproval(editRes.approvalId, true, 'Test Owner', 'ui').success, true);
  const approvedEdit = await agentOrchestrator.executeTool('edit_file', { filePath: 'test-scratch-agent.txt', target: 'Version 1.0', replacement: 'Version 2.0 (Verified)' });
  assert.strictEqual(approvedEdit.success, true);

  const verifyRead = await agentOrchestrator.executeTool('read_file', { filePath: 'test-scratch-agent.txt' });
  assert.ok(verifyRead.content.includes('Version 2.0 (Verified)'));
  console.log('  ✅ edit_file verified successfully.');

  // Cleanup test scratch file
  if (fs.existsSync(testFile)) fs.unlinkSync(testFile);

  // 4. Vault Tasks Management
  console.log('[*] Testing manage_vault_tasks (list)...');
  const taskList = await agentOrchestrator.executeTool('manage_vault_tasks', { action: 'list' });
  assert.ok(Array.isArray(taskList.tasks));
  console.log(`  ✅ Current vault tasks count: ${taskList.tasks.length}`);

  console.log('----------------------------------------------------------------');
  console.log(' RESULT: ALL AUTONOMOUS AGENT TOOLS VERIFIED AND PASSED 100%');
  console.log('----------------------------------------------------------------');
}

runAgentToolsTest().catch(err => {
  console.error('Agent tools test failed:', err);
  process.exit(1);
});



