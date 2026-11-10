const path = require('path');
const instagramSkills = require('../src/core/instagram-skills');
const toolManager = require('../src/core/tools');
const agentOrchestrator = require('../src/core/agent-orchestrator');

async function runTests() {
  console.log('--- Testing HesaTech Instagram Agent Skills ---');

  // Test 1: 26 Hook Formulas
  console.log('\n[1/5] Checking 26 Scored Hook Formulas...');
  if (!instagramSkills.VIRAL_HOOK_FORMULAS || instagramSkills.VIRAL_HOOK_FORMULAS.length !== 26) {
    throw new Error(`Expected 26 formulas, got ${instagramSkills.VIRAL_HOOK_FORMULAS?.length}`);
  }
  console.log(`✓ 26 Hook formulas loaded successfully. Top hook: "${instagramSkills.VIRAL_HOOK_FORMULAS[0].text}"`);

  // Test 2: Reels Script Generation
  console.log('\n[2/5] Testing Reels Script Generation...');
  const reelRes = await instagramSkills.generateReelsScript({
    topic: 'هوش مصنوعی و طراحی سایت',
    hookCategory: 'کنجکاوی شدید'
  });
  if (!reelRes.script || !reelRes.script.includes('سناریو')) {
    throw new Error('Reels script generation failed');
  }
  console.log('✓ Reels script generated successfully:');
  console.log(reelRes.script.substring(0, 200) + '...\n');

  // Test 3: Caption Linter & AI Cliché Cleaner
  console.log('[3/5] Testing Caption Linter (AI Cliché Removal)...');
  const dirtyCaption = 'در این پست قصد داریم غوطه‌ور شوید در دنیای پرشتاب امروز و با هوش مصنوعی آشنا شوید. بدون شک این موضوع مهم است.';
  const lintRes = await instagramSkills.lintAndHumanizeCaption({
    draftCaption: dirtyCaption,
    goal: 'تعامل'
  });
  console.log('✓ Cliches detected and removed:', lintRes.clichesRemoved);
  if (!lintRes.clichesRemoved.includes('در این پست قصد داریم') || !lintRes.clichesRemoved.includes('غوطه‌ور شوید')) {
    throw new Error('Caption linter failed to catch blacklisted clichés');
  }
  console.log('✓ Cleaned caption preview:', lintRes.humanizedCaption.substring(0, 150) + '...\n');

  // Test 4: Weekly Content Matrix
  console.log('[4/5] Testing Weekly Content Matrix Planner...');
  const planRes = await instagramSkills.generateWeeklyPlan({ niche: 'برنامه‌نویسی' });
  if (!planRes.weeklyMatrix) {
    throw new Error('Weekly plan generation failed');
  }
  console.log('✓ Weekly plan generated successfully:\n', planRes.weeklyMatrix.substring(0, 180) + '...\n');

  // Test 5: Tool Manager & Agent Orchestrator Integration
  console.log('[5/5] Testing ToolManager & Agent Orchestrator integration...');
  const tools = toolManager.getAvailableTools();
  const igTools = tools.filter(t => t.id.startsWith('instagram_'));
  console.log(`✓ Registered Instagram Agent tools in ToolManager: ${igTools.map(t => t.id).join(', ')}`);
  if (igTools.length < 8) {
    throw new Error(`Expected at least 8 Instagram tools in registry, found ${igTools.length}`);
  }

  const orchRes = await agentOrchestrator.executeTool('instagram_reels_script', {
    topic: 'اتوماسیون کارهای روزمره'
  });
  if (!orchRes || !orchRes.script) {
    throw new Error('Agent orchestrator failed to execute instagram_reels_script');
  }
  console.log('✓ Agent Orchestrator successfully executed instagram_reels_script!');

  console.log('\n=========================================');
  console.log('ALL INSTAGRAM AGENT SKILLS PASSED VERIFICATION ✓');
  console.log('=========================================');
}

runTests().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
