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
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    if (!window.animControl || !window.skeleton) return;

    if (e.code === 'Space') {
        e.preventDefault();
        window.animControl.togglePlay();
        return;
    }

    // Leave Ctrl/Cmd/Alt chords (select-all, history) alone. Shift still steps.
    if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;

    let direction = 0;
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') direction = -1;
    else if (e.code === 'KeyD' || e.code === 'ArrowRight') direction = 1;
    if (!direction) return;

    e.preventDefault();
    window.animControl.step(direction);
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
