document.addEventListener('DOMContentLoaded', () => {

    // 1. DOM Element Selection
    const svg = d3.select('#flowchart-svg');
    const detailsPanel = document.getElementById('details-panel');
    const detailsContent = document.getElementById('details-content');
    const svgContextMenu = document.getElementById('svg-context-menu');
    const nodeContextMenu = document.getElementById('node-context-menu');
    const modalOverlay = document.getElementById('modal-overlay');
    const modalLabelInput = document.getElementById('modal-node-label');
    const modalDetailsInput = document.getElementById('modal-node-details');
    const exportBtn = document.getElementById('export-btn');
    const importBtn = document.getElementById('import-btn');
    const importFileInput = document.getElementById('import-file-input');
    const resetLayoutBtn = document.getElementById('reset-layout-btn');
    const clearBtn = document.getElementById('clear-btn');

    // 2. Data & State Store
    let nodes = [];
    let links = [];
    let selectedNode = null;
    let linkingState = { active: false, sourceNode: null };
    let lastRightClickPos = { x: 0, y: 0 };
    let isReadOnly = false;
    const localStorageKey = 'd3-flowchart-data';

    // 3. D3 Force Simulation Setup
    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(150))
        .force('charge', d3.forceManyBody().strength(-500))
        .force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2))
        .on('tick', ticked);

    // 4. D3 Selections & Arrowhead Definition
    svg.append('defs').append('marker').attr('id', 'arrowhead')        .attr('viewBox', '-0 -5 10 10')
        .attr('refX', 10) // The arrow tip is at x=10 in the path, so this makes the tip touch the endpoint
        .attr('refY', 0).attr('orient', 'auto').attr('markerWidth', 8).attr('markerHeight', 8).attr('xoverflow', 'visible').append('svg:path').attr('d', 'M0,-5L10,0L0,5').attr('class', 'arrow-marker');

    let linkGroup = svg.append('g').attr('class', 'links');
    let nodeGroup = svg.append('g').attr('class', 'nodes');
    let tempLink = svg.append('line').attr('class', 'temp-link').style('display', 'none');

    // 5. Core Functions
    function update() {
        let node = nodeGroup.selectAll('.node').data(nodes, d => d.id);
        node.exit().remove();
        const nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .on('click', nodeClicked);

        // Add drag and context menu only if not in read-only mode
        if (!isReadOnly) {
            nodeEnter
                .on('contextmenu', nodeContextMenuHandler)
                .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));
        }
        const rectWidth = 120, rectHeight = 50;
        nodeEnter.append('rect').attr('x', -rectWidth / 2).attr('y', -rectHeight / 2).attr('rx', 5).attr('ry', 5);
        nodeEnter.append('text').text(d => d.label);
        node = nodeEnter.merge(node);
        node.select('text').text(d => d.label);
        let link = linkGroup.selectAll('.link').data(links, d => `${d.source.id}-${d.target.id}`);
        link.exit().remove();
        link.enter().insert('line', '.node').attr('class', 'link').attr('marker-end', 'url(#arrowhead)');
        simulation.nodes(nodes);
        simulation.force('link').links(links);
        simulation.alpha(1).restart();
    }

    function ticked() {
        const arrowLength = 16; // Final requested value
        const rectWidth = 120;
        const rectHeight = 50;

        linkGroup.selectAll('.link').each(function(d) {
            const sourcePos = { x: d.source.x, y: d.source.y };
            const targetPos = { x: d.target.x, y: d.target.y };

            // Find the intersection point on the rectangle's edge
            const edgePoint = getRectIntersectionPoint(sourcePos, targetPos, rectWidth, rectHeight);

            // Calculate the vector from source to the edge of the target
            const dx = edgePoint.x - sourcePos.x;
            const dy = edgePoint.y - sourcePos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);

            // Safety check: if nodes are too close, hide the link
            if (dist < arrowLength) {
                d3.select(this).attr('x1', sourcePos.x).attr('y1', sourcePos.y).attr('x2', sourcePos.x).attr('y2', sourcePos.y);
                return;
            }

            // Calculate the new line endpoint by moving back from the edge by the arrow's length
            const newX2 = edgePoint.x - (dx / dist) * arrowLength;
            const newY2 = edgePoint.y - (dy / dist) * arrowLength;

            d3.select(this)
                .attr('x1', sourcePos.x)
                .attr('y1', sourcePos.y)
                .attr('x2', newX2)
                .attr('y2', newY2);
        });

        nodeGroup.selectAll('.node').attr('transform', d => `translate(${d.x},${d.y})`);
    }

    // Helper function to find the intersection of a line and a rectangle
    function getRectIntersectionPoint(p1, p2, rectW, rectH) {
        const hw = rectW / 2;
        const hh = rectH / 2;
        const cx = p2.x;
        const cy = p2.y;

        const dx = p1.x - cx;
        const dy = p1.y - cy;

        // Return target center if source is inside the rectangle, to avoid errors
        if (Math.abs(dx) < hw && Math.abs(dy) < hh) {
            return p2;
        }

        let ix, iy;
        const slope = dy / dx;
        const rectSlope = hh / hw;

        if (Math.abs(slope) < rectSlope) {
            // Intersects with left or right edge
            if (dx > 0) { // source is to the right of target
                ix = cx + hw;
                iy = cy + slope * hw;
            } else { // source is to the left
                ix = cx - hw;
                iy = cy - slope * hw;
            }
        } else {
            // Intersects with top or bottom edge
            if (dy > 0) { // source is below target
                ix = cx + (hh / slope);
                iy = cy + hh;
            } else { // source is above
                ix = cx - (hh / slope);
                iy = cy - hh;
            }
        }
        return { x: ix, y: iy };
    }

    function createNode(label, details, pos) {
        if (!label) return;
        const newNode = { id: nodes.length > 0 ? Math.max(...nodes.map(n => n.id)) + 1 : 0, label, details, x: pos.x, y: pos.y, fx: pos.x, fy: pos.y };
        nodes.push(newNode);
        updateAndSave();
    }

    function deleteNode(nodeToDelete) {
        nodes = nodes.filter(n => n.id !== nodeToDelete.id);
        links = links.filter(l => l.source.id !== nodeToDelete.id && l.target.id !== nodeToDelete.id);
        if (selectedNode && selectedNode.id === nodeToDelete.id) hideDetailsPanel();
        updateAndSave();
    }

    function startAddLink(sourceNode) {
        linkingState.active = true; linkingState.sourceNode = sourceNode;
        tempLink.style('display', 'block').attr('x1', sourceNode.x).attr('y1', sourceNode.y).attr('x2', sourceNode.x).attr('y2', sourceNode.y);
        d3.select(sourceNode).classed('selected', true);
    }

    function completeAddLink(targetNode) {
        if (!linkingState.active || linkingState.sourceNode.id === targetNode.id) return;
        const linkExists = links.some(l => l.source.id === linkingState.sourceNode.id && l.target.id === targetNode.id);
        if (!linkExists) { links.push({ source: linkingState.sourceNode, target: targetNode }); }
        cancelAddLink();
        updateAndSave();
    }

    function cancelAddLink() { linkingState.active = false; linkingState.sourceNode = null; tempLink.style('display', 'none'); d3.selectAll('.node').classed('selected', false); }

    // 6. Persistence & IO
    function updateAndSave() { update(); saveToLocalStorage(); }

    function getSerializableData() {
        const plainNodes = nodes.map(n => ({ id: n.id, label: n.label, details: n.details, x: n.x, y: n.y, fx: n.fx, fy: n.fy }));
        const plainLinks = links.map(l => ({ source: l.source.id, target: l.target.id }));
        return { nodes: plainNodes, links: plainLinks };
    }

    function saveToLocalStorage() { localStorage.setItem(localStorageKey, JSON.stringify(getSerializableData())); }

    function loadData(data) {
        try {
            if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.links)) {
                throw new Error("Invalid data structure");
            }

            // Create a fresh copy of nodes from the loaded data.
            const newNodes = data.nodes.map(n => ({ ...n }));

            // Create a map of the NEW nodes for easy lookup.
            const nodeMap = new Map(newNodes.map(n => [n.id, n]));

            // Create links by pulling references from the NEW node map.
            const newLinks = data.links.map(l => {
                const source = nodeMap.get(l.source);
                const target = nodeMap.get(l.target);
                if (!source || !target) throw new Error(`Invalid link found: ${l.source} -> ${l.target}`);
                return { source, target };
            });

            // Assign the correctly structured data to the main state variables.
            nodes = newNodes;
            links = newLinks;

            updateAndSave();
        } catch (e) {
            alert('Invalid or corrupted data file.');
            console.error('Failed to load data:', e);
        }
    }

    function exportToFile() {
        const data = JSON.stringify(getSerializableData(), null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'flowchart-data.json'; a.click();
        URL.revokeObjectURL(url);
    }

    function importFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => { const data = JSON.parse(e.target.result); loadData(data); };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    }

    // 7. Event & Modal Handlers
    function showModal() { modalOverlay.classList.remove('hidden'); }
    function hideModal() { modalOverlay.classList.add('hidden'); }

    function handleModalSave() {
        const label = modalLabelInput.value.trim();
        const details = modalDetailsInput.value.trim() || 'No details provided.';
        if (!label) { alert('Node name is required.'); return; }
        createNode(label, details, { x: lastRightClickPos.svgX, y: lastRightClickPos.svgY });
        modalLabelInput.value = ''; modalDetailsInput.value = ''; hideModal();
    }

    function nodeClicked(event, d) {
        if (linkingState.active) { completeAddLink(d); return; }
        d3.selectAll('.node').classed('selected', false); d3.select(this).classed('selected', true);
        if (selectedNode && selectedNode.id === d.id) hideDetailsPanel();
        else { selectedNode = d; detailsContent.textContent = d.details; detailsPanel.classList.remove('hidden'); }
        event.stopPropagation();
    }

    function svgContextMenuHandler(event) {
        if (isReadOnly) return;
        event.preventDefault(); hideContextMenus(); const [svgX, svgY] = d3.pointer(event); lastRightClickPos = { svgX, svgY }; svgContextMenu.style.left = `${event.clientX}px`; svgContextMenu.style.top = `${event.clientY}px`; svgContextMenu.classList.remove('hidden'); }
    function nodeContextMenuHandler(event, d) { event.preventDefault(); event.stopPropagation(); hideContextMenus(); selectedNode = d; nodeContextMenu.style.left = `${event.clientX}px`; nodeContextMenu.style.top = `${event.clientY}px`; nodeContextMenu.classList.remove('hidden'); }
    function hideDetailsPanel() { detailsPanel.classList.add('hidden'); selectedNode = null; d3.selectAll('.node').classed('selected', false); }
    function hideContextMenus() { svgContextMenu.classList.add('hidden'); nodeContextMenu.classList.add('hidden'); }

    // 8. Drag Handlers
    function dragstarted(event, d) { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }
    function dragged(event, d) {
        const padding = 20; // Set a small padding from the edges

        // Clamp coordinates to prevent dragging past the top-left boundaries
        d.fx = Math.max(padding, event.x);
        d.fy = Math.max(padding, event.y);

        // Expand SVG width/height if node is dragged near the right/bottom edges
        const currentWidth = parseFloat(svg.attr('width'));
        const currentHeight = parseFloat(svg.attr('height'));

        if (d.fx > currentWidth - padding * 2) {
            svg.attr('width', d.fx + padding * 2);
        }
        if (d.fy > currentHeight - padding * 2) {
            svg.attr('height', d.fy + padding * 2);
        }
    }
    function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        // Do not nullify fx/fy here if you want nodes to stay put
        saveToLocalStorage();
    }

    function resetLayout() {
        for (const node of nodes) {
            node.fx = null;
            node.fy = null;
        }
        simulation.alpha(1).restart();
    }

    function resetCanvas(withConfirm = true) {
        if (withConfirm && !confirm('您确定要清空整个画布吗？此操作不可撤销。')) {
            return;
        }
        // Reset data arrays
        nodes = [];
        links = [];

        // Reset SVG dimensions
        svg.attr('width', window.innerWidth).attr('height', window.innerHeight);

        // Create the initial node
        const startNode = {
            id: 0,
            label: 'Start',
            details: 'Right-click the background to add a node.',
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            fx: window.innerWidth / 2,
            fy: window.innerHeight / 2
        };
        nodes.push(startNode);

        // Hide details panel and reset selection
        hideDetailsPanel();

        // Update and save the cleared state
        updateAndSave();
    }

    // 9. Window & Menu Listeners
    window.addEventListener('resize', () => { simulation.force('center', d3.forceCenter(window.innerWidth / 2, window.innerHeight / 2)); simulation.alpha(1).restart(); });
    svg.on('contextmenu', svgContextMenuHandler);
    svg.on('click', () => { hideDetailsPanel(); cancelAddLink(); });
    svg.on('mousemove', (event) => { if (!linkingState.active) return; const [x, y] = d3.pointer(event); tempLink.attr('x2', x).attr('y2', y); });
    document.addEventListener('click', hideContextMenus);
    document.getElementById('add-node-here').addEventListener('click', showModal);
    document.getElementById('add-link').addEventListener('click', () => startAddLink(selectedNode));
    document.getElementById('delete-node').addEventListener('click', () => deleteNode(selectedNode));
    document.getElementById('modal-save-btn').addEventListener('click', handleModalSave);
    document.getElementById('modal-cancel-btn').addEventListener('click', hideModal);
    exportBtn.addEventListener('click', exportToFile);
    importBtn.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', importFromFile);
    resetLayoutBtn.addEventListener('click', resetLayout);
    clearBtn.addEventListener('click', resetCanvas);

    // 10. Initial Load
    function initialize() {
        const urlParams = new URLSearchParams(window.location.search);
        const viewUrl = urlParams.get('view');

        svg.attr('width', window.innerWidth).attr('height', window.innerHeight);

        if (viewUrl) {
            isReadOnly = true;
            document.body.classList.add('read-only');
            console.log(`Loading read-only from: ${viewUrl}`);
            fetch(viewUrl)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    // In read-only mode, we don't save to local storage
                    const originalUpdateAndSave = window.updateAndSave;
                    window.updateAndSave = () => update(); // Temporarily override save function
                    loadData(data);
                    window.updateAndSave = originalUpdateAndSave; // Restore it
                })
                .catch(e => {
                    console.error('Failed to load from URL:', e);
                    alert('Could not load or parse the remote JSON file. Please check the URL and CORS policy.');
                });
        } else {
            // Normal interactive mode
            const savedData = localStorage.getItem(localStorageKey);
            if (savedData) {
                loadData(JSON.parse(savedData));
            } else {
                // Fresh start
                resetCanvas(false); // false to skip confirm dialog
            }
        }
    }

    // Add a confirm parameter to resetCanvas
    function resetCanvas(withConfirm = true) {
        if (withConfirm && !confirm('您确定要清空整个画布吗？此操作不可撤销。')) {
            return;
        }
        nodes = [];
        links = [];
        svg.attr('width', window.innerWidth).attr('height', window.innerHeight);
        const startNode = {
            id: 0,
            label: 'Start',
            details: 'Right-click the background to add a node.',
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
            fx: window.innerWidth / 2,
            fy: window.innerHeight / 2
        };
        nodes.push(startNode);
        hideDetailsPanel();
        updateAndSave();
    }

    window.updateAndSave = updateAndSave; // Expose for the loader logic
    initialize();
});
