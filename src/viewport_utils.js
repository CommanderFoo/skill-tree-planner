
/**
 * Viewport utility functions
 */

/**
 * Calculates the bounds of all nodes in a tree
 * @param {object} tree - Tree object
 * @returns {object|null} Bounds {minX, minY, maxX, maxY} or null if no nodes
 */
export function get_tree_bounds(tree) {
	if (!tree.nodes || tree.nodes.length === 0) {
		return null;
	}

	const node_size = 80;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;

	tree.nodes.forEach(node => {
		minX = Math.min(minX, node.position.x);
		minY = Math.min(minY, node.position.y);
		maxX = Math.max(maxX, node.position.x + node_size);
		maxY = Math.max(maxY, node.position.y + node_size);
	});

	return { minX, minY, maxX, maxY };
}

/**
 * Calculates the viewport settings to fit all nodes
 * @param {object} tree - Tree object
 * @param {number} containerWidth - Canvas container width
 * @param {number} containerHeight - Canvas container height
 * @param {number} padding - Padding around the nodes
 * @returns {object|null} Viewport settings {x, y, zoom}
 */
export function calculate_zoom_to_fit(tree, containerWidth, containerHeight, padding = 100) {
	const bounds = get_tree_bounds(tree);
	if (!bounds) {
		return { x: 0, y: 0, zoom: 1 };
	}

	const contentWidth = bounds.maxX - bounds.minX;
	const contentHeight = bounds.maxY - bounds.minY;

	const availableWidth = containerWidth - (padding * 2);
	const availableHeight = containerHeight - (padding * 2);

	const zoomX = availableWidth / contentWidth;
	const zoomY = availableHeight / contentHeight;

	// Use the minimum zoom (to fit both dimensions) and cap it
	let zoom = Math.min(zoomX, zoomY);
	zoom = Math.max(0.25, Math.min(zoom, 1.5));

	// Center the bounds
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerY = (bounds.minY + bounds.maxY) / 2;

	const x = (containerWidth / 2) - (centerX * zoom);
	const y = (containerHeight / 2) - (centerY * zoom);

	return { x, y, zoom };
}

/**
 * Calculates the viewport settings to center a node
 * @param {object} node - Node object
 * @param {number} containerWidth - Canvas container width
 * @param {number} containerHeight - Canvas container height
 * @param {number} currentZoom - Current zoom level
 * @returns {object} Viewport settings {x, y}
 */
export function calculate_center_on_node(node, containerWidth, containerHeight, currentZoom) {
	const node_size = 80;
	const centerX = node.position.x + (node_size / 2);
	const centerY = node.position.y + (node_size / 2);

	const x = (containerWidth / 2) - (centerX * currentZoom);
	const y = (containerHeight / 2) - (centerY * currentZoom);

	return { x, y };
}
