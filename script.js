document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    const gridDashboard = d3.select('#dashboard');
    const dockContainer = d3.select('#dock-container');
    const iframeContainer = d3.select('#iframe-container');
    const rssFeeds = d3.select('#rss-feeds');
    const searchBox = d3.select('#search-box');
    const groupFiltersContainer = d3.select('#tag-filters-container');
    const modal = document.getElementById('edit-modal');
    const modalForm = document.getElementById('edit-form');
    const cancelBtn = d3.select('#cancel-btn');
    const groupSelect = d3.select('#edit-tag-select');
    const importBtn = d3.select('#import-btn');
    const importFileInput = d3.select('#import-file-input');
    const importNotesInput = d3.select('#import-notes-input');
    const exportBtn = d3.select('#export-btn');
    const calendarContainer = d3.select('#calendar-container');
    const noteModal = document.getElementById('note-modal');
    const noteForm = document.getElementById('note-form');
    const cancelNoteBtn = document.getElementById('cancel-note-btn');


    // --- App State ---
    let appData = { items: [], groups: [] };
    let activeGroupFilter = null;
    let activeIframeId = null;
    let authPopup = null;
    let calendarDate = new Date();
    
    // --- Drag and Drop State ---
    let longPressTimeout;
    let isDragging = false;
    let draggedItemData = null;
    let draggedItemNode = null;

    // --- Core Rendering ---
    function render() {
        renderItems();
        renderGroupFilters();
        populateGroupSelect();
    }

    function renderItems() {
        const searchTerm = searchBox.node().value.toLowerCase();

        // Handle Calendar View
        if (activeGroupFilter === 'Cal') {
            gridDashboard.style('display', 'none');
            rssFeeds.style('display', 'none');
            dockContainer.style('display', 'none');
            calendarContainer.style('display', 'block');
            renderCalendar();
            return;
        } else {
            gridDashboard.style('display', 'grid');
            rssFeeds.style('display', 'grid');
            dockContainer.style('display', 'flex');
            calendarContainer.style('display', 'none');
        }

        const filteredItems = appData.items.filter(item => 
            ((!activeGroupFilter && item.group !== 'mini-program' && item.group !== 'RSS' && item.group !== 'Cal') || item.group === activeGroupFilter) &&
            (item.name.toLowerCase().includes(searchTerm) || (item.group && item.group.toLowerCase().includes(searchTerm)))
        );

        const gridItems = filteredItems.filter(d => (d.type || 'link') === 'link' || d.type === 'qrcode');
        const dockItems = filteredItems.filter(d => d.type === 'auth');
        const rssItems = filteredItems.filter(d => d.type === 'rss');

        renderGrid(gridItems);
        renderDock(dockItems);
        renderRssFeeds(rssItems);
    }

    function renderGrid(data) {
        gridDashboard.html(''); // Clear the dashboard

        const itemsBySubgroup = d3.group(data, d => {
            if (d.group === 'mini-program' && !d.subgroup) {
                return '未分类'; // Assign a default subgroup name
            }
            return d.subgroup;
        });

        const drag = d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);

        // Render items WITHOUT a subgroup
        const noSubgroupItems = itemsBySubgroup.get(undefined) || [];
        const itemSelection = gridDashboard.selectAll('.dashboard-item')
            .data(noSubgroupItems, d => d.url)
            .enter()
            .append('a')
            .attr('class', 'dashboard-item draggable-item')
            .attr('href', d => isDragging ? null : d.url) // Disable link during drag
            .attr('target', '_blank')
            .on('click', (e, d) => {
                if (isDragging) {
                    e.preventDefault();
                }
            })
            .call(drag);
        
        itemSelection.each(function(d) {
            const itemEnter = d3.select(this);
            itemEnter.append('img').each(function() {
                const img = this;
                const defaultIcon = 'icon.png';
                if (d.icon) {
                    img.src = d.icon;
                    img.onerror = () => { img.src = defaultIcon; };
                    return;
                }
                try {
                    const origin = new URL(d.url).origin;
                    const faviconUrls = [`${origin}/favicon.ico`, `${origin}/favicon.png`];
                    let currentAttempt = 0;
                    function tryNext() {
                        if (currentAttempt < faviconUrls.length) {
                            img.src = faviconUrls[currentAttempt];
                            currentAttempt++;
                        } else {
                            img.src = defaultIcon;
                        }
                    }
                    img.onerror = tryNext;
                    tryNext();
                } catch (e) {
                    img.src = defaultIcon;
                }
            });
            itemEnter.append('span').attr('class', 'item-name').text(d.name);
            itemEnter.append('div').attr('class', 'item-tags').append('span').attr('class', 'tag').text(d.group);
            
            const actions = itemEnter.append('div').attr('class', 'item-actions');
            actions.append('button').text('✏️').on('click', (e, item) => { e.preventDefault(); e.stopPropagation(); openModal(d); });
            actions.append('button').text('🗑️').on('click', (e, item) => { e.preventDefault(); e.stopPropagation(); deleteItem(d); });
        });


        // Render items WITH a subgroup
        itemsBySubgroup.forEach((items, subgroup) => {
            if (!subgroup) return;

            const container = gridDashboard.append('div').attr('class', 'subgroup-container');
            container.append('h2').attr('class', 'subgroup-title').text(subgroup);
            const itemsContainer = container.append('div').attr('class', 'subgroup-items');

            items.forEach(d => {
                const qrItem = itemsContainer.append('div')
                    .attr('class', 'qr-code-item draggable-item')
                    .datum(d)
                    .call(drag);
                
                const canvasEl = qrItem.append('canvas').node();
                
                QRCode.toCanvas(canvasEl, d.url, { width: 128 }, function (error) {
                  if (error) console.error('QRCode generation failed:', error)
                });

                qrItem.append('span').attr('class', 'item-name').text(d.name);

                const actions = qrItem.append('div').attr('class', 'item-actions');
                actions.append('button').text('✏️').on('click', (e) => { e.preventDefault(); e.stopPropagation(); openModal(d); });
                actions.append('button').text('🗑️').on('click', (e) => { e.preventDefault(); e.stopPropagation(); deleteItem(d); });
            });
        });

        // Add the '+' button at the end
        if (activeGroupFilter !== 'RSS' && activeGroupFilter !== 'mini-program') {
            gridDashboard.append('div')
                .attr('class', 'add-item-card')
                .on('click', () => openModal(null, 'grid'))
                .append('span').text('+');
        }
    }
    
    function renderRssFeeds(data) {
        rssFeeds.html('');
        
        const drag = d3.drag()
            .on('start', dragstarted)
            .on('drag', dragged)
            .on('end', dragended);

        data.forEach(feed => {
            const feedContainer = rssFeeds.append('div')
                .attr('class', 'rss-feed draggable-item')
                .datum(feed)
                .call(drag);

            const feedHeader = feedContainer.append('div').attr('class', 'rss-feed-header');
            feedHeader.append('h2').text(feed.name);
            const actions = feedHeader.append('div').attr('class', 'item-actions');
            actions.append('button').text('✏️').on('click', (e) => { e.stopPropagation(); openModal(feed); });
            actions.append('button').text('🗑️').on('click', (e) => { e.stopPropagation(); deleteItem(feed); });

            const feedContent = feedContainer.append('div').attr('class', 'rss-content');
            feedContent.text('Loading...');

            fetch(`https://corsproxy.io/${feed.url}`)
                .then(response => response.text())
                .then(str => new window.DOMParser().parseFromString(str, "text/xml"))
                .then(data => {
                    feedContent.html('');
                    const items = data.querySelectorAll("item, entry");
                    items.forEach(el => {
                        const isAtom = el.tagName === 'entry';
                        const title = el.querySelector("title").textContent;
                        const link = isAtom ? el.querySelector("link").getAttribute('href') : el.querySelector("link").textContent;
                        const pubDate = el.querySelector(isAtom ? "updated" : "pubDate") ? new Date(el.querySelector(isAtom ? "updated" : "pubDate").textContent).toLocaleDateString() : '';

                        const item = feedContent.append('div').attr('class', 'rss-item');
                        item.append('h3').append('a').attr('href', link).attr('target', '_blank').text(title);
                        item.append('span').attr('class', 'rss-date').text(pubDate);
                    });
                })
                .catch(err => {
                    feedContent.text('Error loading feed.');
                    console.error(err);
                });
        });
    }

    // --- Drag and Drop Functions ---
    function dragstarted(event, d) {
        longPressTimeout = setTimeout(() => {
            isDragging = true;
            draggedItemData = d;
            draggedItemNode = this;
            d3.select(this).raise().classed('dragging', true);
        }, 200); // 200ms for long press
    }

    function dragged(event, d) {
        clearTimeout(longPressTimeout);
        if (!isDragging) return;
        
        d3.select(draggedItemNode)
            .style('left', (event.x - (draggedItemNode.offsetWidth / 2)) + 'px')
            .style('top', (event.y - (draggedItemNode.offsetHeight / 2)) + 'px');

        // Find drop target
        const allItems = document.querySelectorAll('.draggable-item');
        let targetNode = null;
        allItems.forEach(node => {
            node.classList.remove('drop-target');
            if (node !== draggedItemNode) {
                const rect = node.getBoundingClientRect();
                if (event.sourceEvent.clientX > rect.left && event.sourceEvent.clientX < rect.right &&
                    event.sourceEvent.clientY > rect.top && event.sourceEvent.clientY < rect.bottom) {
                    targetNode = node;
                }
            }
        });

        if (targetNode) {
            const targetData = d3.select(targetNode).datum();
            if (draggedItemData.group === targetData.group) {
                targetNode.classList.add('drop-target');
            }
        }
    }

    function dragended(event, d) {
        clearTimeout(longPressTimeout);
        if (!isDragging) return;

        d3.select(draggedItemNode).classed('dragging', false)
            .style('left', null)
            .style('top', null);

        const allItems = document.querySelectorAll('.draggable-item');
        let targetNode = null;
        allItems.forEach(node => {
            node.classList.remove('drop-target');
             if (node !== draggedItemNode) {
                const rect = node.getBoundingClientRect();
                if (event.sourceEvent.clientX > rect.left && event.sourceEvent.clientX < rect.right &&
                    event.sourceEvent.clientY > rect.top && event.sourceEvent.clientY < rect.bottom) {
                    targetNode = node;
                }
            }
        });

        if (targetNode) {
            const targetData = d3.select(targetNode).datum();
            if (draggedItemData.group === targetData.group) {
                const fromIndex = appData.items.findIndex(item => item.url === draggedItemData.url);
                const toIndex = appData.items.findIndex(item => item.url === targetData.url);

                if (fromIndex !== -1 && toIndex !== -1) {
                    const [item] = appData.items.splice(fromIndex, 1);
                    appData.items.splice(toIndex, 0, item);
                    saveData(true);
                }
            }
        }
        
        isDragging = false;
        draggedItemData = null;
        draggedItemNode = null;
        render(); // Re-render to apply order and remove styles
    }


    function renderDock(data) {
        dockContainer.html('');
        const renderData = [...data, { isAddButton: true }];

        renderData.forEach(d => {
            const iconDiv = dockContainer.append('div').attr('class', 'dock-icon');
            if (d.isAddButton) {
                iconDiv.html('+').on('click', () => openModal(null, 'dock'));
            } else {
                iconDiv.on('click', function() { handleSpecialClick(d, this); });
                iconDiv.append('span').html(d.icon || '❓');

                const actions = iconDiv.append('div').attr('class', 'item-actions');
                actions.append('button').text('✏️').on('click', (e) => { e.stopPropagation(); openModal(d); });
                actions.append('button').text('🗑️').on('click', (e) => { e.stopPropagation(); deleteItem(d); });
            }
        });
    }

    // --- Other Functions ---
    function handleSpecialClick(d, element) {
        if (d.type === 'auth') handleAuthClick(d);
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
        const subgroupRow = document.getElementById('subgroup-form-row');
        const groupSelectEl = document.getElementById('edit-tag-select');
        const subgroupDatalist = document.getElementById('subgroup-list');
        const iconRow = document.getElementById('icon-form-row');

        const miniProgramSubgroups = [...new Set(appData.items
            .filter(i => i.group === 'mini-program' && i.subgroup)
            .map(i => i.subgroup))];
        subgroupDatalist.innerHTML = '';
        miniProgramSubgroups.forEach(subgroup => {
            subgroupDatalist.appendChild(new Option(subgroup));
        });

        typeSelect.innerHTML = '';

        const updateModalOptions = () => {
            const selectedType = typeSelect.value;
            const isQrCode = selectedType === 'qrcode';
            const isRss = selectedType === 'rss';
            const isAuth = selectedType === 'auth';

            iconRow.style.display = isAuth ? 'block' : 'none';
            subgroupRow.style.display = isQrCode ? 'block' : 'none';

            if (isQrCode) {
                groupSelectEl.disabled = true;
                groupSelectEl.value = 'mini-program';
            } else if (isRss) {
                groupSelectEl.disabled = true;
                groupSelectEl.value = 'RSS';
            } else {
                groupSelectEl.disabled = false;
            }
        };

        typeSelect.onchange = updateModalOptions;

        if (item) {
            typeSelect.add(new Option('Link (New Tab)', 'link'));
            typeSelect.add(new Option('QR Code', 'qrcode'));
            typeSelect.add(new Option('Auth Popup', 'auth'));
            typeSelect.add(new Option('RSS Feed', 'rss'));
            document.getElementById('edit-index').value = appData.items.indexOf(item);
            document.getElementById('edit-name').value = item.name;
            document.getElementById('edit-url').value = item.url;
            document.getElementById('edit-icon').value = item.icon || '';
            typeSelect.value = item.type || 'link';
            groupSelectEl.value = item.group;
            document.getElementById('edit-subgroup').value = item.subgroup || '';
            
        } else {
            document.getElementById('edit-index').value = -1;
            document.getElementById('edit-subgroup').value = '';
            if (context === 'grid') {
                typeSelect.add(new Option('Link (New Tab)', 'link'));
                typeSelect.add(new Option('QR Code', 'qrcode'));
                typeSelect.add(new Option('RSS Feed', 'rss'));
                typeSelect.value = 'link';
            } else if (context === 'dock') {
                typeSelect.add(new Option('Auth Popup', 'auth'));
                typeSelect.value = 'auth';
            }
        }
        
        updateModalOptions();
        modal.showModal();
    }

    function deleteItem(itemToDelete) {
        if (confirm(`Are you sure you want to delete "${itemToDelete.name}"?`)) {
            appData.items = appData.items.filter(item => item !== itemToDelete);
            saveData(true);
            render();
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

        // --- Fix for ensuring "Cal" group exists ---
        if (!appData.groups.includes('Cal')) {
            appData.groups.push('Cal');
            saveData(true); // Silently save the updated groups
        }
        // --- End of fix ---

        render();
    }

    // --- Event Listeners ---
    searchBox.on('input', render);
    cancelBtn.on('click', () => modal.close());
    modalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const type = document.getElementById('edit-type-select').value;
        const newItem = { 
            name: document.getElementById('edit-name').value, 
            url: document.getElementById('edit-url').value, 
            icon: document.getElementById('edit-icon').value, 
            type: type, 
            group: document.getElementById('edit-tag-select').value,
        };

        if (type === 'qrcode') {
            newItem.subgroup = document.getElementById('edit-subgroup').value;
        }

        const index = document.getElementById('edit-index').value;
        if (index > -1) { appData.items[index] = newItem; } else { appData.items.push(newItem); }
        saveData(true); render(); modal.close();
    });
    exportBtn.on('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' })); a.download = 'dashboard-config.json'; a.click(); URL.revokeObjectURL(a.href); });
    importBtn.on('click', () => importFileInput.node().click());
    importFileInput.on('change', (event) => { const file = event.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (e) => { try { const importedData = JSON.parse(e.target.result); if (importedData.items && importedData.groups) { appData = importedData; saveData(true); render(); alert('Success!'); } else { alert('Invalid file.'); } } catch (error) { alert('Error parsing file.'); } }; reader.readAsText(file); });
    importNotesInput.on('change', importNotes);
    window.addEventListener('message', (event) => { if (event.data && event.data.authSuccess) { if (authPopup) authPopup.close(); } }, false);

    // --- Theme Switcher (v3) ---
    const lightThemeStyles = `
        body.light-mode {
            --bg-color: #f0f0f0;
            --surface-color: #ffffff;
            --primary-color: #007bff;
            --text-color: #212529;
            --border-color: #dee2e6;
        }
        body.light-mode button,
        body.light-mode input[type="text"],
        body.light-mode input[type="url"],
        body.light-mode select {
            background-color: #f8f9fa;
        }
        body.light-mode .tag-filter {
            background-color: #f8f9fa;
            color: var(--text-color);
        }
        body.light-mode .tag-filter.active {
            background-color: var(--primary-color);
            border-color: var(--primary-color);
            color: #fff;
        }
        body.light-mode .item-tags .tag {
            background-color: #e9ecef;
            color: #495057;
        }
        body.light-mode #dock-container {
            background-color: rgba(255, 255, 255, 0.7);
        }
        body.light-mode .dock-icon {
            background-color: rgba(0, 0, 0, 0.05);
            color: var(--text-color);
        }
        body.light-mode .dock-icon:hover {
            background-color: rgba(0, 0, 0, 0.1);
        }
        body.light-mode .dock-icon.active {
            color: #fff;
        }
        body.light-mode .add-item-card:hover {
            background-color: #f8f9fa;
        }
        body.light-mode .item-actions button {
            background: rgba(255,255,255,0.5);
            color: #000;
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = lightThemeStyles;
    document.head.appendChild(styleSheet);

    const themeToggleBtn = document.createElement('button');
    themeToggleBtn.id = 'theme-toggle-btn';
    
    const exportBtnRef = document.getElementById('export-btn');
    if (exportBtnRef && exportBtnRef.parentNode) {
        exportBtnRef.parentNode.insertBefore(themeToggleBtn, exportBtnRef.nextSibling);
    } else {
        document.body.appendChild(themeToggleBtn);
    }

    const themeStates = ['dark', 'light', 'auto'];
    const themeIcons = { light: '☀️', dark: '🌙', auto: '🌗' };

    function updateTheme() {
        let preference = localStorage.getItem('theme-preference') || 'auto';
        let currentTheme;

        if (preference === 'auto') {
            const hour = new Date().getHours();
            currentTheme = (hour < 6 || hour >= 18) ? 'dark' : 'light';
        } else {
            currentTheme = preference;
        }

        if (currentTheme === 'light') {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.remove('light-mode');
        }

        setGlobalCursor();

        const weatherWidget = document.getElementById('weather-widget-iframe');
        if (weatherWidget) {
            const isLight = document.body.classList.contains('light-mode');
            const currentColor = isLight ? '000000' : 'FFFFFF';
            const newSrc = `https://widget.tianqiapi.com/?style=tm&skin=pitaya&color=${currentColor}`;
            if (weatherWidget.src !== newSrc) {
                weatherWidget.src = newSrc;
            }
        }
        
        themeToggleBtn.textContent = themeIcons[preference];
        themeToggleBtn.title = `Theme: ${preference}`;
    }

    function setGlobalCursor() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0L20 12L8 14L0 0Z" fill="red" stroke="black" stroke-width="1"/></svg>`;
        const encodedSvg = encodeURIComponent(svg);
        document.documentElement.style.setProperty('cursor', `url('data:image/svg+xml;utf8,${encodedSvg}') 0 0, auto`, 'important');
    }

    themeToggleBtn.addEventListener('click', () => {
        let currentPreference = localStorage.getItem('theme-preference') || 'auto';
        let nextPreferenceIndex = (themeStates.indexOf(currentPreference) + 1) % themeStates.length;
        let newPreference = themeStates[nextPreferenceIndex];
        localStorage.setItem('theme-preference', newPreference);
        updateTheme();
    });

    updateTheme();
    setInterval(updateTheme, 60 * 1000);

    // --- Calendar Functions ---
    function renderCalendar() {
        calendarContainer.html(''); // Clear previous render

        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();

        const header = calendarContainer.append('div').attr('class', 'calendar-header');
        header.append('button').text('⬅️').on('click', () => {
            calendarDate.setMonth(month - 1);
            renderCalendar();
        });
        header.append('h2').text(new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long' }).format(calendarDate))
            .style('cursor', 'pointer')
            .on('click', renderMonthPicker);
        header.append('button').text('➡️').on('click', () => {
            calendarDate.setMonth(month + 1);
            renderCalendar();
        });
        header.append('button').attr('class', 'import-notes-btn').text('Import').on('click', () => importNotesInput.node().click());
        header.append('button').attr('class', 'export-notes-btn').text('Export').on('click', exportNotes);

        const grid = calendarContainer.append('div').attr('class', 'calendar-grid');

        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(name => {
            grid.append('div').attr('class', 'calendar-day-name').text(name);
        });

        const firstDayOfMonth = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();

        // Days from previous month
        const daysInPrevMonth = new Date(year, month, 0).getDate();
        for (let i = 0; i < firstDayOfMonth; i++) {
            const day = grid.append('div').attr('class', 'calendar-day other-month');
            day.append('span').attr('class', 'day-number').text(daysInPrevMonth - firstDayOfMonth + i + 1);
        }

        // Days of the current month
        for (let i = 1; i <= daysInMonth; i++) {
            const date = new Date(year, month, i);
            const dateKey = `${year}${String(month + 1).padStart(2, '0')}${String(i).padStart(2, '0')}`;
            
            const day = grid.append('div').attr('class', 'calendar-day')
                .on('click', () => openNoteModal(date));

            day.append('span').attr('class', 'day-number').text(i);

            if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) {
                day.classed('today', true);
            }
            if (localStorage.getItem(`note_${dateKey}`)) {
                day.classed('has-note', true);
            }
        }

        // Days from next month
        const totalDays = firstDayOfMonth + daysInMonth;
        const nextMonthDays = (7 - (totalDays % 7)) % 7;
        for (let i = 1; i <= nextMonthDays; i++) {
            const day = grid.append('div').attr('class', 'calendar-day other-month');
            day.append('span').attr('class', 'day-number').text(i);
        }
    }

    function renderMonthPicker() {
        calendarContainer.html(''); // Clear previous render
        const year = calendarDate.getFullYear();

        const header = calendarContainer.append('div').attr('class', 'calendar-header');
        header.append('button').text('⬅️').on('click', () => {
            calendarDate.setFullYear(year - 1);
            renderMonthPicker();
        });
        header.append('h2').text(year);
        header.append('button').text('➡️').on('click', () => {
            calendarDate.setFullYear(year + 1);
            renderMonthPicker();
        });

        const grid = calendarContainer.append('div').attr('class', 'month-picker-grid');
        const today = new Date();

        for (let i = 0; i < 12; i++) {
            const monthName = new Date(year, i).toLocaleString('en-us', { month: 'long' });
            const monthDiv = grid.append('div')
                .attr('class', 'month-picker-month')
                .text(monthName)
                .on('click', () => {
                    calendarDate.setMonth(i);
                    renderCalendar();
                });
            
            if (year === today.getFullYear() && i === today.getMonth()) {
                monthDiv.classed('current', true);
            }
        }
    }

    function importNotes(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const newNotes = JSON.parse(e.target.result);
                if (typeof newNotes !== 'object' || newNotes === null) {
                    throw new Error('Invalid JSON format.');
                }

                const existingKeys = Object.keys(newNotes).filter(dateKey => localStorage.getItem(`note_${dateKey}`));
                
                let shouldOverwrite = true;
                if (existingKeys.length > 0) {
                    shouldOverwrite = confirm(`${existingKeys.length} note(s) already exist. Do you want to overwrite them?`);
                }

                let importedCount = 0;
                for (const dateKey in newNotes) {
                    if (Object.prototype.hasOwnProperty.call(newNotes, dateKey)) {
                        const storageKey = `note_${dateKey}`;
                        if (!localStorage.getItem(storageKey) || shouldOverwrite) {
                            localStorage.setItem(storageKey, newNotes[dateKey]);
                            importedCount++;
                        }
                    }
                }
                
                alert(`${importedCount} note(s) imported successfully!`);
                renderCalendar();

            } catch (error) {
                alert(`Error importing notes: ${error.message}`);
            } finally {
                // Reset file input to allow importing the same file again
                event.target.value = '';
            }
        };
        reader.readAsText(file);
    }

    function exportNotes() {
        const notes = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith('note_')) {
                const date = key.substring(5); // Remove "note_" prefix
                notes[date] = localStorage.getItem(key);
            }
        }

        if (Object.keys(notes).length === 0) {
            alert('No notes to export.');
            return;
        }

        const blob = new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'calendar_notes.json';
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function openNoteModal(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const dateKey = `${year}${String(month + 1).padStart(2, '0')}${String(day).padStart(2, '0')}`;

        document.getElementById('note-modal-title').textContent = `Note for ${date.toLocaleDateString()}`;
        document.getElementById('note-date-key').value = dateKey;
        document.getElementById('note-content').value = localStorage.getItem(`note_${dateKey}`) || '';
        noteModal.showModal();
    }

    noteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const dateKey = document.getElementById('note-date-key').value;
        const content = document.getElementById('note-content').value;

        if (content) {
            localStorage.setItem(`note_${dateKey}`, content);
        } else {
            localStorage.removeItem(`note_${dateKey}`);
        }
        noteModal.close();
        renderCalendar(); // Re-render to show/hide the note indicator
    });

    cancelNoteBtn.addEventListener('click', () => {
        noteModal.close();
    });


    loadData();
});

function updateTime() {
  const timeElement = document.getElementById('current-time'); if (!timeElement) return;
  const now = new Date();
  timeElement.textContent = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}` + ` ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
}

function fetchIpAddress() {
    const ipElement = document.getElementById('ip-address');
    if (!ipElement) return;

    fetch('https://api.ipify.org?format=json')
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            ipElement.textContent = data.ip;
        })
        .catch(error => {
            console.error('Error fetching IP address:', error);
            ipElement.textContent = 'IP Not Available';
        });
}

setInterval(updateTime, 1000); 
updateTime();
fetchIpAddress();