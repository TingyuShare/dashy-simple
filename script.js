document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Elements ---
    const dashboard = d3.select('#dashboard');
    const searchBox = d3.select('#search-box');
    const groupFiltersContainer = d3.select('#tag-filters-container');
    const importBtn = d3.select('#import-btn');
    const importFileInput = d3.select('#import-file-input');
    const exportBtn = d3.select('#export-btn');
    const modal = document.getElementById('edit-modal');
    const modalForm = document.getElementById('edit-form');
    const cancelBtn = d3.select('#cancel-btn');
    const groupSelect = d3.select('#edit-tag-select');

    // --- App State ---
    let appData = { items: [], groups: [] };
    let activeGroupFilter = null;
    let selectedItem = null;

    // --- Core Functions ---

    /**
     * Main render function. Calls all sub-renderers.
     */
    function render() {
        renderDashboardItems();
        renderGroupFilters();
        populateGroupSelect();
    }

    /**
     * Renders the dashboard items and the "Add" card.
     */
    function renderDashboardItems() {
        const searchTerm = searchBox.node().value.toLowerCase();

        const filteredItems = appData.items.filter(item => {
            const matchesGroup = !activeGroupFilter || item.group === activeGroupFilter;
            const matchesSearch = item.name.toLowerCase().includes(searchTerm) || (item.group && item.group.toLowerCase().includes(searchTerm));
            return matchesGroup && matchesSearch;
        });

        const renderData = [...filteredItems, { isAddButton: true }];

        dashboard.selectAll('.dashboard-item, .add-item-card')
            .data(renderData, d => d.isAddButton ? '__add_button__' : d.name)
            .join(enter => {
                const enterSelection = enter.append(d => d.isAddButton ? document.createElement('div') : document.createElement('a'));

                // Configure the "Add" button card
                enterSelection.filter(d => d.isAddButton)
                    .attr('class', 'add-item-card')
                    .on('click', () => openModal())
                    .append('span').text('+');

                // Configure the regular item cards
                const itemEnter = enterSelection.filter(d => !d.isAddButton);
                itemEnter
                    .attr('class', 'dashboard-item')
                    .attr('href', d => d.url)
                    .attr('target', '_blank')
                    .on('contextmenu', (event, d) => {
                        event.preventDefault();
                        if (!selectedItem) {
                            selectedItem = d;
                        } else {
                            const targetItem = d;
                            if (targetItem !== selectedItem) {
                                const oldIndex = appData.items.indexOf(selectedItem);
                                const newIndex = appData.items.indexOf(targetItem);
                                appData.items.splice(oldIndex, 1);
                                appData.items.splice(newIndex, 0, selectedItem);
                                saveData(true);
                            }
                            selectedItem = null;
                        }
                        renderDashboardItems();
                    });
                
                itemEnter.append('img')
                    .attr('src', d => {
                        try {
                            // 优先使用 Google API
                            return d.icon || `https://www.google.com/s2/favicons?domain=${new URL(d.url).hostname}`;
                        } catch (e) {
                            // 如果 URL 无效，立即返回默认图标
                            return 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>';
                        }
                    })
                    .on('error', function(event, d) {
                        // `this` 指代图片元素
                        // 如果主资源加载失败，尝试使用“直连”方案作为备用
                        const fallbackSrc = `${new URL(d.url).origin}/favicon.ico`;
                        
                        // 防止备用资源也失败时产生的无限循环
                        if (this.src !== fallbackSrc) {
                            this.src = fallbackSrc;
                            
                            // 如果备用资源也失败了，设置最终的默认图标
                            this.onerror = () => {
                                this.onerror = null; // 避免循环
                                this.src = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🌐</text></svg>';
                            };
                        }
                    });

                itemEnter.append('span')
                    .attr('class', 'item-name')
                    .text(d => d.name);

                const group = itemEnter.append('div').attr('class', 'item-tags');
                group.append('span').attr('class', 'tag').text(d => d.group);

                const actions = itemEnter.append('div').attr('class', 'item-actions');
                actions.append('button').text('✏️').on('click', (e, d) => {
                    e.preventDefault();
                    openModal(d);
                });
                actions.append('button').text('🗑️').on('click', (e, d) => {
                    e.preventDefault();
                    deleteItem(d);
                });

                return enterSelection;
            })
            .classed('selected', d => d === selectedItem);
    }

    /**
     * Renders the group filter buttons.
     */
    function renderGroupFilters() {
        const allGroups = ['All', ...appData.groups];
        
        groupFiltersContainer.selectAll('.tag-filter')
            .data(allGroups)
            .join('button')
            .attr('class', 'tag-filter')
            .classed('active', d => d === (activeGroupFilter || 'All'))
            .text(d => d)
            .on('click', (e, d) => {
                activeGroupFilter = (d === 'All') ? null : d;
                render();
            });
    }

    /**
     * Populates the select dropdown in the modal with groups.
     */
    function populateGroupSelect() {
        groupSelect.selectAll('option').remove();

        groupSelect.selectAll('option')
            .data(appData.groups)
            .join('option')
            .attr('value', d => d)
            .text(d => d);
    }

    // --- Helper Functions ---

    function openModal(item = null) {
        modalForm.reset();
        populateGroupSelect();
        if (item) {
            document.getElementById('edit-index').value = appData.items.indexOf(item);
            document.getElementById('edit-name').value = item.name;
            document.getElementById('edit-url').value = item.url;
            document.getElementById('edit-icon').value = item.icon || '';
            document.getElementById('edit-tag-select').value = item.group;
        } else {
            document.getElementById('edit-index').value = -1;
        }
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
        if (!silent) {
            alert('Changes saved successfully!');
        }
    }

    async function loadData() {
        const savedData = localStorage.getItem('dashboardData');
        if (savedData) {
            appData = JSON.parse(savedData);
        } else {
            try {
                const response = await fetch('data.json');
                appData = await response.json();
            } catch (error) {
                console.error('Error loading default data:', error);
                appData = { items: [], groups: [] };
            }
        }
        render();
    }

    // --- Event Listeners ---
    searchBox.on('input', renderDashboardItems);
    cancelBtn.on('click', () => modal.close());

    modalForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('edit-name').value;
        const url = document.getElementById('edit-url').value;
        const icon = document.getElementById('edit-icon').value;
        const group = document.getElementById('edit-tag-select').value;
        const index = document.getElementById('edit-index').value;

        const newItem = { name, url, icon, group };

        if (index > -1) {
            appData.items[index] = newItem;
        } else {
            appData.items.push(newItem);
        }
        saveData(true);
        render();
        modal.close();
    });

    exportBtn.on('click', () => {
        const dataStr = JSON.stringify(appData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dashboard-config.json';
        a.click();
        URL.revokeObjectURL(url);
    });

    importBtn.on('click', () => {
        importFileInput.node().click();
    });

    importFileInput.on('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData.items && importedData.groups) {
                    appData = importedData;
                    saveData(true);
                    render();
                    alert('Configuration imported successfully!');
                } else {
                    alert('Invalid file format.');
                }
            } catch (error) {
                alert('Error parsing file.');
                console.error('Import error:', error);
            }
        };
        reader.readAsText(file);
    });

    d3.select('body').on('click', function(event) {
        if (event.target.tagName === 'BODY' || event.target.tagName === 'MAIN') {
            if (selectedItem) {
                selectedItem = null;
                renderDashboardItems();
            }
        }
    });

    // --- Initial Load ---
    loadData();

});

// Update and display current time every second
function updateTime() {
  const timeElement = document.getElementById('current-time');
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0'); // Month is zero-based
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  timeElement.textContent = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
setInterval(updateTime, 1000);
updateTime();


// Fetch and display current IP address using free API
fetch('https://api.ipify.org?format=json')
  .then(response => response.json())
  .then(data => {
    document.getElementById('ip-address').textContent = data.ip;
  })
  .catch(() => {
    document.getElementById('ip-address').textContent = 'IP address unavailable';
  });

// 抓取天气信息并显示
function getUserLocationAndFetchWeather() {
  if (!navigator.geolocation) {
    alert('浏览器不支持地理位置获取');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      fetchWeatherByLatLon(lat, lon);
    },
    error => {
      alert('获取地理位置失败，请允许定位权限');
      console.error(error);
    }
  );
}

async function fetchWeatherByLatLon(lat, lon) {
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=e5986d093d1f9a7b254e22b10d6ade78&units=metric&lang=zh_cn`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const name = data.name;
    const country = data.sys.country;
    const description = data.weather[0].description.toLowerCase();
    document.getElementById('weatherStatus').innerText = `${name}(${country}): ` + description + ' ' + data.main.temp + '°C';
  } catch(e) {
    document.getElementById('weatherStatus').innerText = '';
    console.error(e);
  }
}

// 页面加载时调用
getUserLocationAndFetchWeather();


