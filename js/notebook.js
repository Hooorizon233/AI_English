// ===== Notebook Module — View learned words & AI annotations =====
// Now fetches data from server API

let _notebookData = [];
let _notebookFilter = 'all';
let _notebookSearch = '';
let _notebookPage = 1;
let _notebookTotal = 0;

async function loadNotebookPage() {
    try {
        const result = await API.getNotebook(_notebookFilter, _notebookSearch, 1, 500);
        if (result.ok) {
            _notebookData = result.entries || [];
            _notebookTotal = result.total || 0;
        } else {
            _notebookData = [];
            _notebookTotal = 0;
        }
    } catch (e) {
        console.error('Notebook load error:', e);
        _notebookData = [];
    }

    // For AI content, check cache for each word
    for (const item of _notebookData) {
        if (!item.aiContent) {
            const cached = await API.getAICache(item.word);
            if (cached) {
                item.aiContent = cached.content;
                item.aiCachedAt = cached.cachedAt;
            }
        }
    }

    renderNotebook();
}

function renderNotebook() {
    const listEl = document.getElementById('notebook-list');
    const emptyEl = document.getElementById('notebook-empty');

    // Apply filters (server handles most, but client-side for mastered)
    let filtered = _notebookData;

    if (_notebookFilter === 'learning') {
        filtered = filtered.filter(w => !w.mastered);
    } else if (_notebookFilter === 'mastered') {
        filtered = filtered.filter(w => w.mastered);
    }

    if (_notebookSearch) {
        const q = _notebookSearch.toLowerCase();
        filtered = filtered.filter(w =>
            w.word.toLowerCase().includes(q) ||
            (w.translation || '').toLowerCase().includes(q)
        );
    }

    if (filtered.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = '';
        return;
    }

    emptyEl.style.display = 'none';

    const maxStage = 6;
    const masteredCount = filtered.filter(w => w.mastered).length;

    listEl.innerHTML = `
    <div style="padding:12px 16px; background:var(--bg-secondary); border-radius:12px; margin-bottom:12px; font-size:13px; color:var(--text-secondary);">
      共 ${filtered.length} 个单词
      ${masteredCount > 0 ? ` · 已掌握 ${masteredCount} 个` : ''}
    </div>` +
    filtered.map((item, idx) => {
        const stage = item.stage || 0;
        const stagePct = Math.min(100, (stage / maxStage) * 100);
        const stageColor = item.mastered ? 'var(--success)' : 'var(--primary)';
        const stageLabel = item.mastered ? '已掌握 ✓' : `阶段 ${stage}/${maxStage}`;

        return `
        <div class="notebook-item" id="notebook-item-${idx}">
            <div class="notebook-item-header" onclick="toggleNotebookAI(${idx})">
                <div class="notebook-word-info">
                    <div class="notebook-word">${item.word}</div>
                    <div class="notebook-phonetic">${item.phonetic || ''}</div>
                    <div class="notebook-translation">${item.translation || ''}</div>
                </div>
                <div class="notebook-meta">
                    <div class="notebook-stage-label" style="color:${stageColor}">${stageLabel}</div>
                    <div class="notebook-stage-bar">
                        <div class="notebook-stage-fill" style="width:${stagePct}%; background:${stageColor}"></div>
                    </div>
                    <div class="notebook-stats-mini">
                        <span style="color:var(--success)">✓${item.correctCount || 0}</span>
                        <span style="color:var(--danger)">✗${item.wrongCount || 0}</span>
                        ${item.fuzzyCount > 0 ? `<span style="color:var(--warning)">~${item.fuzzyCount}</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="notebook-ai-note" id="notebook-ai-${idx}" style="display:none;">
                ${item.aiContent
                ? `<div class="ai-content-body">${formatAIContent(item.aiContent)}</div>
                       ${item.aiCachedAt ? `<div class="text-secondary" style="font-size:11px; margin-top:8px;">缓存于 ${new Date(item.aiCachedAt).toLocaleString()}</div>` : ''}`
                : `<div class="text-secondary" style="padding:12px; text-align:center;">暂无 AI 注解<br><button class="btn btn-sm btn-primary mt-8" onclick="generateNotebookAI('${item.word}', ${idx})">生成 AI 注解</button></div>`
            }
            </div>
        </div>`;
    }).join('');
}

function formatAIContent(content) {
    return content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>');
}

function filterNotebook(type, btn) {
    _notebookFilter = type;
    document.querySelectorAll('.notebook-filter').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadNotebookPage();
}

function searchNotebook(query) {
    _notebookSearch = query;
    loadNotebookPage();
}

function toggleNotebookAI(idx) {
    const el = document.getElementById(`notebook-ai-${idx}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? '' : 'none';
    }
}

async function generateNotebookAI(word, idx) {
    if (!Auth.isLoggedIn()) {
        showToast('请先登录');
        return;
    }

    const noteEl = document.getElementById(`notebook-ai-${idx}`);
    noteEl.innerHTML = '<div class="ai-loading"><div class="spinner"></div><span>AI 正在生成...</span></div>';

    const result = await AI.getWordAssist(word, true);
    if (result.ok) {
        _notebookData[idx].aiContent = result.content;
        _notebookData[idx].aiCachedAt = new Date().toISOString();
        noteEl.innerHTML = `<div class="ai-content-body">${formatAIContent(result.content)}</div>`;
        showToast('AI 注解已生成 ✓');
    } else {
        noteEl.innerHTML = `<div class="text-danger" style="padding:12px;">${result.msg || '生成失败'}</div>`;
    }
}
