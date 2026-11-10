const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

// 1. Update system stats to use window.electronAPI with fallback to fetch, and 2-second interval
const oldStatsFn = `    async function updateRealSystemStats() {
      try {
        const res = await fetch('/api/v1/system/stats', { signal: AbortSignal.timeout(2500) });
        if (!res.ok) return;
        const data = await res.json();`;

const newStatsFn = `    async function updateRealSystemStats() {
      try {
        let data = null;
        if (window.electronAPI && window.electronAPI.getSystemStats) {
          data = await window.electronAPI.getSystemStats();
        } else {
          const res = await fetch('/api/v1/system/stats', { signal: AbortSignal.timeout(1800) });
          if (res.ok) data = await res.json();
        }
        if (!data) return;`;

html = html.replace(oldStatsFn, newStatsFn);
html = html.replace('setInterval(updateRealSystemStats, 3000);', 'setInterval(updateRealSystemStats, 2000);');

// 2. Update runSystemAction to use window.electronAPI
const oldLaunchFn = `    window.runSystemAction = async function(appName) {
      AudioEngine.playConfirm();
      showToast(currentLang === 'fa' ? \`در حال باز کردن \${appName} در ویندوز...\` : \`Launching \${appName} in Windows...\`, "🚀");
      try {
        const res = await fetch('/api/v1/system/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appName })
        });
        const data = await res.json();
        if (data.success) {
          showToast(currentLang === 'fa' ? \`برنامه \${appName} اجرا شد.\` : \`\${appName} launched successfully.\`, "✓");
        } else {
          showToast(data.error || 'خطا در اجرا', "⚠️");
        }
      } catch (err) {
        showToast('خطا در ارتباط با سرور ویندوز', "⚠️");
      }
    };`;

const newLaunchFn = `    window.runSystemAction = async function(appName) {
      AudioEngine.playConfirm();
      showToast(currentLang === 'fa' ? ('در حال باز کردن ' + appName + ' در ویندوز...') : ('Launching ' + appName + ' in Windows...'), "🚀");
      try {
        let data = null;
        if (window.electronAPI && window.electronAPI.launchApp) {
          data = await window.electronAPI.launchApp(appName);
        } else {
          const res = await fetch('/api/v1/system/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appName })
          });
          data = await res.json();
        }
        if (data && data.success) {
          showToast(currentLang === 'fa' ? ('برنامه ' + appName + ' با موفقیت اجرا شد.') : (appName + ' launched successfully.'), "✓");
        } else {
          showToast(data ? (data.error || 'خطا در اجرا') : 'خطا', "⚠️");
        }
      } catch (err) {
        showToast('خطا در ارتباط با سیستم ویندوز', "⚠️");
      }
    };`;

html = html.replace(oldLaunchFn, newLaunchFn);

// 3. Update triggerWorkflowAction
const oldWfFn = `    window.triggerWorkflowAction = async function(action) {
      AudioEngine.playChime();
      const outputBox = document.getElementById('wf-output-display');
      if (outputBox) outputBox.textContent = \`[EXECUTING] Running workflow: \${action}...\\nPlease wait...\`;
      showToast(\`Executing workflow: \${action}\`, "⚡");

      try {
        const res = await fetch('/api/v1/system/workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action })
        });
        const data = await res.json();
        if (outputBox) {
          outputBox.textContent = \`========================================\\n[RESULT] \${data.title || action}\\n========================================\\n\\n\${data.result || 'Executed successfully.'}\`;
        }
        AudioEngine.playConfirm();
        showToast("Workflow execution completed", "✓");
      } catch (e) {
        if (outputBox) outputBox.textContent = \`[ERROR] Failed to execute workflow \${action}\`;
        showToast("Workflow failed", "⚠️");
      }
    };`;

const newWfFn = `    window.triggerWorkflowAction = async function(action) {
      AudioEngine.playChime();
      const outputBox = document.getElementById('wf-output-display');
      if (outputBox) outputBox.textContent = '[EXECUTING] Running workflow: ' + action + '...\\nPlease wait...';
      showToast('Executing: ' + action, "⚡");

      try {
        let data = null;
        if (window.electronAPI && window.electronAPI.runWorkflow) {
          data = await window.electronAPI.runWorkflow(action);
        } else {
          const res = await fetch('/api/v1/system/workflow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action })
          });
          data = await res.json();
        }
        if (outputBox) {
          outputBox.textContent = '========================================\\n[RESULT] ' + (data ? (data.title || action) : action) + '\\n========================================\\n\\n' + (data ? (data.result || 'Executed successfully.') : 'No result');
        }
        AudioEngine.playConfirm();
        showToast("عملیات با موفقیت پایان یافت", "✓");
      } catch (e) {
        if (outputBox) outputBox.textContent = '[ERROR] Failed to execute workflow ' + action;
        showToast("خطا در اجرای عملیات", "⚠️");
      }
    };`;

html = html.replace(oldWfFn, newWfFn);

// 4. Update executeAgentShell
const oldShellFn = `      try {
        const res = await fetch('/api/v1/system/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: cmd })
        });
        const data = await res.json();
        const resText = data.stdout || data.stderr || '[Command finished with empty output]';
        output.textContent += \`\\n\${resText}\`;
        output.scrollTop = output.scrollHeight;
        AudioEngine.playConfirm();
      } catch (err) {
        output.textContent += \`\\n[ERROR] Failed to communicate with command server.\`;
      }`;

const newShellFn = `      try {
        let data = null;
        if (window.electronAPI && window.electronAPI.execCommand) {
          data = await window.electronAPI.execCommand(cmd);
        } else {
          const res = await fetch('/api/v1/system/exec', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmd })
          });
          data = await res.json();
        }
        const resText = data ? (data.stdout || data.stderr || '[Command finished with empty output]') : '[Empty result]';
        output.textContent += '\\n' + resText;
        output.scrollTop = output.scrollHeight;
        AudioEngine.playConfirm();
      } catch (err) {
        output.textContent += '\\n[ERROR] Failed to communicate with command server.';
      }`;

html = html.replace(oldShellFn, newShellFn);

// 5. Update n8n webhooks with explicit status and feedback log
const oldMktCard = `      // --- Marketing Hub n8n Triggers ---
      document.querySelectorAll('.mkt-card[data-webhook]').forEach(card => {
        card.addEventListener('click', async () => {
          const hook = card.dataset.webhook;
          showToast(\`Triggering n8n webhook: /webhook/\${hook}\`, "🚀");
          try {
            await fetch(\`http://localhost:5678/webhook/\${hook}\`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: hook, timestamp: new Date().toISOString() }),
              signal: AbortSignal.timeout(2000)
            });
            showToast(\`n8n Webhook /webhook/\${hook} Executed\`, "✓");
          } catch(e) {
            showToast(\`n8n Webhook dispatched: /webhook/\${hook}\`, "✓");
          }
        });
      });`;

const newMktCard = `      // --- Marketing Hub n8n Triggers ---
      document.querySelectorAll('.mkt-card[data-webhook]').forEach(card => {
        card.addEventListener('click', async () => {
          const hook = card.dataset.webhook;
          showToast('ارسال درخواست به وب‌هوک n8n: ' + hook, "🚀");
          try {
            let resData = null;
            if (window.electronAPI && window.electronAPI.triggerWebhook) {
              resData = await window.electronAPI.triggerWebhook({ hook });
            } else {
              const res = await fetch('http://localhost:5678/webhook/' + hook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: hook, timestamp: new Date().toISOString() }),
                signal: AbortSignal.timeout(2500)
              });
              resData = { success: res.ok, status: res.status };
            }
            if (resData && resData.success) {
              AudioEngine.playConfirm();
              showToast('وب‌هوک ' + hook + ' با موفقیت اجرا شد (کد ' + (resData.status || 200) + ')', "✓");
            } else {
              AudioEngine.playTone(400, 'sawtooth', 0.1);
              showToast('سرور n8n در پورت 5678 غیرفعال است (آفلاین)', "⚠️");
            }
          } catch(e) {
            AudioEngine.playTone(400, 'sawtooth', 0.1);
            showToast('خطا در اتصال به وب‌هوک n8n در http://localhost:5678', "⚠️");
          }
        });
      });`;

html = html.replace(oldMktCard, newMktCard);

// 6. Update chat logic to call window.electronAPI.sendMessage
const oldChatFn = `        try {
          const res = await fetch('/api/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: query })
          });
          const data = await res.json();
          const reply = data.reply || data.error || 'دستور با موفقیت دریافت و اجرا شد.';`;

const newChatFn = `        try {
          let data = null;
          if (window.electronAPI && window.electronAPI.sendMessage) {
            data = await window.electronAPI.sendMessage(query);
          } else {
            const res = await fetch('/api/v1/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: query })
            });
            data = await res.json();
          }
          const reply = data ? (data.reply || data.error || 'دستور با موفقیت دریافت و اجرا شد.') : 'فرمان پردازش شد.';`;

html = html.replace(oldChatFn, newChatFn);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('index.html successfully patched with direct IPC integration!');
