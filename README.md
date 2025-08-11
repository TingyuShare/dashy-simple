# flow-action

An interactive, browser-based flowchart editor built with D3.js. This tool allows users to create, link, and manage nodes in a flowchart, with all data saved locally in the browser. It also features a read-only presentation mode.

## Features

- **Interactive Canvas**: A full-screen, pannable canvas that expands automatically.
- **Node Management**: 
    - **Add Nodes**: Right-click anywhere on the canvas to add a new node.
    - **Delete Nodes**: Right-click on a node to delete it.
    - **Node Details**: Click on a node to view its details. Click again to hide.
- **Link Management**:
    - **Add Links**: Right-click a node and select "Add Link" to create a directed (one-to-many) connection to another node.
    - **Visual Clarity**: Arrowheads on links automatically adjust to connect perfectly with node borders.
- **Layout Control**:
    - **Drag & Drop**: Freely move nodes around the canvas.
    - **Auto-Layout**: Click the "Auto-Layout" button to have the force simulation neatly arrange all nodes.
- **Data Persistence**:
    - **Local Storage**: Your flowchart is automatically saved to the browser's local storage, so your work is always there when you return.
    - **Import/Export**: Easily export your flowchart to a `.json` file for backup or sharing, and import them back at any time.
    - **Clear Canvas**: A dedicated button to reset the canvas to its initial state.
- **Read-Only Presentation Mode**:
    - Share your flowchart in a non-editable view by using the `?view=` URL parameter.

## How to Use

### Editing Mode

1.  Open the `index.html` file in your web browser.
2.  **Add a node**: Right-click on the canvas background and choose "Add Node Here". A dialog will appear for you to enter a name and details.
3.  **Add a link**: Right-click on a source node, choose "Add Link", then left-click on the target node.
4.  **Move a node**: Click and drag any node.
5.  **View details**: Left-click a node.
6.  Use the buttons in the bottom-right corner to manage your project (Import, Export, Auto-Layout, Clear).

### Read-Only Mode

1.  First, export your flowchart to a `flowchart-data.json` file.
2.  Upload this file to a public web host (like GitHub Gist, etc.).
3.  Construct a URL like this: `path/to/your/index.html?view=URL_TO_YOUR_JSON_FILE`.
4.  Open this URL in a browser. The flowchart will be loaded in a view-only mode with all editing UI hidden.
