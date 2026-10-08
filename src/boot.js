// ==========================================
// 入口与初始化逻辑
// ==========================================

function bootUi() {
    const mode = localStorage.getItem('spine_view_mode') || 'list';
    const list = document.getElementById('custom-file-list');
    const btn = document.getElementById('btn-view-mode');
    if (list && btn) {
        if (mode === 'grid') {
            list.classList.remove('view-list');
            list.classList.add('view-grid');
            btn.innerText = "▦";
        } else {
            list.classList.remove('view-grid');
            list.classList.add('view-list');
            btn.innerText = "≣";
        }
    }

    window.makeDraggable('effect-panel', 'effect-panel-header');
    window.makeResizable('effect-panel', 'effect-resize-handle');
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', bootUi);
} else {
    bootUi();
}

window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (!window.animControl || !window.skeleton) return;
    e.preventDefault();
    window.animControl.togglePlay();
});

// 监听搜索框回车
const searchInput = document.getElementById('spine-file-search');
if(searchInput) {
    searchInput.addEventListener('keydown', (e) => {
        if(e.key === 'Enter') {
            const visibleItem = document.querySelector('.file-item:not([style*="display: none"])');
            if(visibleItem) {
                visibleItem.click(); 
                visibleItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                e.target.blur();
            }
        }
    });
}
