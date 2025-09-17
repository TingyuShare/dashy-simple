document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    const gridDashboard = d3.select('#dashboard');
    const dockContainer = d3.select('#dock-container');
    const iframeContainer = d3.select('#iframe-container');
    const searchBox = d3.select('#search-box');
    const groupFiltersContainer = d3.select('#tag-filters-container');
    const modal = document.getElementById('edit-modal');
    const modalForm = document.getElementById('edit-form');
    const cancelBtn = d3.select('#cancel-btn');
    const groupSelect = d3.select('#edit-tag-select');
    const importBtn = d3.select('#import-btn');
    const importFileInput = d3.select('#import-file-input');
    const exportBtn = d3.select('#export-btn');

    // --- App State ---
    let appData = { items: [], groups: [] };
    let activeGroupFilter = null;
    let activeIframeId = null;
    let authPopup = null;
    let pickedUpItemElement = null;
    let pickedUpItemData = null;

    // --- Core Rendering ---
    function render() {
        renderItems();
        renderGroupFilters();
        populateGroupSelect();
    }

    function renderItems() {
        const searchTerm = searchBox.node().value.toLowerCase();
        const filteredItems = appData.items.filter(item => 
            (!activeGroupFilter || item.group === activeGroupFilter) &&
            (item.name.toLowerCase().includes(searchTerm) || (item.group && item.group.toLowerCase().includes(searchTerm)))
        );

        const gridItems = filteredItems.filter(d => (d.type || 'link') === 'link');
        const dockItems = filteredItems.filter(d => d.type === 'iframe' || d.type === 'auth');

        renderGrid(gridItems);
        renderDock(dockItems);
    }

    function renderGrid(data) {
        const renderData = [...data, { isAddButton: true }];
        gridDashboard.selectAll('.dashboard-item, .add-item-card').data(renderData, d => d.isAddButton ? '__add_grid__' : d.url)
            .join(enter => {
                const enterSelection = enter.append(d => d.isAddButton ? document.createElement('div') : document.createElement('a'));
                
                enterSelection.filter(d => d.isAddButton)
                    .attr('class', 'add-item-card')
                    .on('click', () => openModal(null, 'grid'))
                    .append('span').text('+');

                const itemEnter = enterSelection.filter(d => !d.isAddButton)
                    .attr('class', 'dashboard-item')
                    .attr('href', d => d.url)
                    .attr('target', '_blank')
                    .on('contextmenu', (e, d) => {
                        e.preventDefault();
                        pickupItem(e.currentTarget, d);
                    })
                    .on('click', (e, d) => {
                        if (pickedUpItemData) {
                            e.preventDefault();
                            dropItem(d);
                        }
                    });

                itemEnter.append('img').attr('src', d => d.icon || `https://www.google.com/s2/favicons?domain=${new URL(d.url).hostname}`).on('error', function() { this.src = 'icon.svg'; });
                itemEnter.append('span').attr('class', 'item-name').text(d => d.name);
                itemEnter.append('div').attr('class', 'item-tags').append('span').attr('class', 'tag').text(d => d.group);
                
                const actions = itemEnter.append('div').attr('class', 'item-actions');
                actions.append('button').text('✏️').on('click', (e, d) => { e.preventDefault(); e.stopPropagation(); openModal(d); });
                actions.append('button').text('🗑️').on('click', (e, d) => { e.preventDefault(); e.stopPropagation(); deleteItem(d); });
                
                return enterSelection;
            });
    }

    function renderDock(data) {
        dockContainer.html('');
        const renderData = [...data, { isAddButton: true }];

        renderData.forEach(d => {
            const iconDiv = dockContainer.append('div').attr('class', 'dock-icon');
            if (d.isAddButton) {
                iconDiv.html('+').on('click', () => openModal(null, 'dock'));
            } else {
                iconDiv.classed('active', d.url === activeIframeId).on('click', function() { handleSpecialClick(d, this); });
                iconDiv.append('span').html(d.icon || '❓');
                const actions = iconDiv.append('div').attr('class', 'item-actions');
                actions.append('button').text('✏️').on('click', (e) => { e.stopPropagation(); openModal(d); });
                actions.append('button').text('🗑️').on('click', (e) => { e.stopPropagation(); deleteItem(d); });
            }
        });
    }

    // --- Sorting Functions ---
    function pickupItem(element, data) {
        if (pickedUpItemElement) {
            pickedUpItemElement.classList.remove('picked-up');
        }

        if (pickedUpItemElement === element) {
            pickedUpItemElement = null;
            pickedUpItemData = null;
            document.body.classList.remove('item-picked-up');
        } else {
            pickedUpItemElement = element;
            pickedUpItemData = data;
            element.classList.add('picked-up');
            document.body.classList.add('item-picked-up');
        }
    }

    function dropItem(targetItemData) {
        if (!pickedUpItemData || !targetItemData || pickedUpItemData.url === targetItemData.url) {
            if (pickedUpItemElement) {
                pickedUpItemElement.classList.remove('picked-up');
            }
            pickedUpItemElement = null;
            pickedUpItemData = null;
            document.body.classList.remove('item-picked-up');
            return;
        }

        const fromIndex = appData.items.findIndex(item => item.url === pickedUpItemData.url);
        const toIndex = appData.items.findIndex(item => item.url === targetItemData.url);

        if (fromIndex > -1 && toIndex > -1) {
            const [item] = appData.items.splice(fromIndex, 1);
            appData.items.splice(toIndex, 0, item);
        }

        if (pickedUpItemElement) {
            pickedUpItemElement.classList.remove('picked-up');
        }
        pickedUpItemElement = null;
        pickedUpItemData = null;
        document.body.classList.remove('item-picked-up');

        saveData(true);
        render();
    }

    // --- Other Functions ---
    function handleSpecialClick(d, element) {
        if (d.type === 'iframe') toggleIframe(d.url);
        else if (d.type === 'auth') handleAuthClick(d);
    }

    function toggleIframe(url) {
        const wasActive = (url === activeIframeId);
        iframeContainer.selectAll('*').remove();
        if (!wasActive) {
            activeIframeId = url;
            iframeContainer.append('iframe').attr('class', 'content-iframe visible').attr('src', url).attr('frameborder', '0');
        } else {
            activeIframeId = null;
        }
        render();
    }

    function handleAuthClick(d) {
        const isPopupOpen = authPopup && !authPopup.closed;
        if (activeIframeId) { activeIframeId = null; render(); }
        if (isPopupOpen) {
            authPopup.close();
        } else {
            let pW = window.innerWidth * 0.8, pH = window.innerHeight * 0.7, maxW = 1200;
            if (pW > maxW) pW = maxW;
            const left = (window.screen.width / 2) - (pW / 2), top = (window.screen.height / 2) - (pH / 2);
            authPopup = window.open(d.url, 'authPopup', `width=${pW},height=${pH},top=${top},left=${left}`);
        }
    }

    function renderGroupFilters() {
        const allGroups = ['All', ...appData.groups];
        groupFiltersContainer.selectAll('.tag-filter').data(allGroups).join('button')
            .attr('class', 'tag-filter').classed('active', d => d === (activeGroupFilter || 'All'))
            .text(d => d).on('click', (e, d) => { activeGroupFilter = (d === 'All') ? null : d; render(); });
    }

    function populateGroupSelect() {
        groupSelect.selectAll('option').remove();
        groupSelect.selectAll('option').data(appData.groups).join('option').attr('value', d => d).text(d => d);
    }

    function openModal(item = null, context = 'grid') {
        modalForm.reset();
        populateGroupSelect();
        const typeSelect = document.getElementById('edit-type-select');
        typeSelect.innerHTML = '';

        if (item) {
            typeSelect.add(new Option('Link (New Tab)', 'link'));
            typeSelect.add(new Option('Iframe Window', 'iframe'));
            typeSelect.add(new Option('Auth Popup', 'auth'));
            document.getElementById('edit-index').value = appData.items.indexOf(item);
            document.getElementById('edit-name').value = item.name;
            document.getElementById('edit-url').value = item.url;
            document.getElementById('edit-icon').value = item.icon || '';
            typeSelect.value = item.type || 'link';
            document.getElementById('edit-tag-select').value = item.group;
        } else {
            document.getElementById('edit-index').value = -1;
            if (context === 'grid') {
                typeSelect.add(new Option('Link (New Tab)', 'link'));
                typeSelect.value = 'link';
            } else {
                typeSelect.add(new Option('Iframe Window', 'iframe'));
                typeSelect.add(new Option('Auth Popup', 'auth'));
                typeSelect.value = 'iframe';
            }
        }
        modal.showModal();
    }

    function deleteItem(itemToDelete) {
        if (confirm(`Are you sure you want to delete "${itemToDelete.name}"?`)) {
            appData.items = appData.items.filter(item => item !== itemToDelete);
            saveData(true); render();
        }
    }

    function saveData(silent = false) {
        localStorage.setItem('dashboardData', JSON.stringify(appData));
        if (!silent) alert('Changes saved successfully!');
    }

    async function loadData() {
        const savedData = localStorage.getItem('dashboardData');
        if (savedData) { appData = JSON.parse(savedData); }
        else { try { const res = await fetch('data.json'); appData = await res.json(); } catch (e) { appData = { items: [], groups: [] }; } }
        render();
    }

    // --- Event Listeners ---
    searchBox.on('input', render);
    cancelBtn.on('click', () => modal.close());
    modalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const newItem = { name: document.getElementById('edit-name').value, url: document.getElementById('edit-url').value, icon: document.getElementById('edit-icon').value, type: document.getElementById('edit-type-select').value, group: document.getElementById('edit-tag-select').value };
        const index = document.getElementById('edit-index').value;
        if (index > -1) { appData.items[index] = newItem; } else { appData.items.push(newItem); }
        saveData(true); render(); modal.close();
    });
    exportBtn.on('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' })); a.download = 'dashboard-config.json'; a.click(); URL.revokeObjectURL(a.href); });
    importBtn.on('click', () => importFileInput.node().click());
    importFileInput.on('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const importedData = JSON.parse(e.target.result); if (importedData.items && importedData.groups) { appData = importedData; saveData(true); render(); alert('Success!'); } else { alert('Invalid file.'); } } catch (error) { alert('Error parsing file.'); } }; reader.readAsText(file); });
    window.addEventListener('message', (event) => { if (event.data && event.data.authSuccess) { if (authPopup) authPopup.close(); } }, false);

    loadData();
});

function updateTime() {
  const timeElement = document.getElementById('current-time'); if (!timeElement) return;
  const now = new Date();
  timeElement.textContent = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}` + ` ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
}
setInterval(updateTime, 1000); updateTime();