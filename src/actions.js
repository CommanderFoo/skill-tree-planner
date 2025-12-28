/**
 * Actions Module
 * Pure functions that transform state immutably
 */

import {
	clone_state,
	touch_modified,
	generate_id,
	create_tree,
	create_node,
	create_connection,
	find_tree,
	find_node,
	get_tree_index,
	get_node_index,
	get_connection_index
} from "./state.js";

import { check_prerequisites } from "./validation_engine.js";

// ============================================================================
// Project Actions
// ============================================================================

/**
 * Updates project-level metadata
 * @param {object} state - Current state
 * @param {object} changes - Properties to update in metadata
 * @returns {object} New state with updated metadata
 */
function update_project_metadata(state, changes) {
	const new_state = touch_modified(clone_state(state));

	for (const key in changes) {
		if (Object.prototype.hasOwnProperty.call(changes, key)) {
			new_state.project.metadata[key] = changes[key];
		}
	}

	return new_state;
}

// ============================================================================
// Tree Actions
// ============================================================================

/**
 * Adds a new tree to the project
 * @param {object} state - Current state
 * @param {object} options - Tree options { name, description, total_points }
 * @returns {object} New state with added tree
 */
function add_tree(state, options = {}) {
	const new_state = touch_modified(clone_state(state));
	const id = generate_id("tree");
	const tree = create_tree(id, options.name || "New Tree");

	if (options.description) {
		tree.description = options.description;
	}
	if (typeof options.total_points === "number") {
		tree.point_pool.total = options.total_points;
	}

	new_state.project.trees.push(tree);

	// Auto-select if first tree
	if (new_state.project.trees.length === 1) {
		new_state.ui_state.active_tree_id = id;
	}

	return new_state;
}

/**
 * Removes a tree from the project
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree to remove
 * @returns {object} New state with tree removed
 */
function remove_tree(state, tree_id) {
	const new_state = touch_modified(clone_state(state));
	const index = get_tree_index(new_state, tree_id);

	if (index === -1) {
		return state; // Tree not found, return unchanged
	}

	new_state.project.trees.splice(index, 1);

	// Clear active tree if it was removed
	if (new_state.ui_state.active_tree_id === tree_id) {
		new_state.ui_state.active_tree_id = new_state.project.trees[0]?.id || null;
		new_state.ui_state.selected_node_id = null;
	}

	return new_state;
}

/**
 * Updates tree properties
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree to update
 * @param {object} changes - Properties to update
 * @returns {object} New state with updated tree
 */
function update_tree(state, tree_id, changes) {
	const new_state = touch_modified(clone_state(state));
	const index = get_tree_index(new_state, tree_id);

	if (index === -1) {
		return state;
	}

	const tree = new_state.project.trees[index];

	// Apply allowed changes
	if (changes.name !== undefined) {
		tree.name = changes.name;
	}
	if (changes.description !== undefined) {
		tree.description = changes.description;
	}
	if (changes.total_points !== undefined) {
		tree.point_pool.total = changes.total_points;
	}
	if (changes.point_source !== undefined) {
		tree.point_pool.source = changes.point_source;
	}

	return new_state;
}

// ============================================================================
// Node Actions
// ============================================================================

/**
 * Adds a new node to a tree
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree to add node to
 * @param {object} options - Node options { name, x, y, max_rank, cost_per_rank, type }
 * @returns {object} New state with added node
 */
function add_node(state, tree_id, options = {}) {
	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const id = generate_id("node");
	const node = create_node(
		id,
		options.name || "New Skill",
		options.x || 100,
		options.y || 100
	);

	// Apply optional properties
	if (options.description !== undefined) {
		node.description = options.description;
	}
	if (options.icon !== undefined) {
		node.icon = options.icon;
	}
	if (typeof options.max_rank === "number") {
		node.max_rank = options.max_rank;
	}
	if (Array.isArray(options.cost_per_rank)) {
		node.cost_per_rank = options.cost_per_rank;
	}
	if (Array.isArray(options.tags)) {
		node.tags = options.tags;
	}
	if (options.type === "passive" || options.type === "active") {
		node.type = options.type;
	}

	new_state.project.trees[tree_index].nodes.push(node);

	return new_state;
}

/**
 * Removes a node from a tree (also removes connected connections)
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree containing the node
 * @param {string} node_id - ID of node to remove
 * @returns {object} New state with node removed
 */
function remove_node(state, tree_id, node_id) {
	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];
	const node_index = get_node_index(tree, node_id);

	if (node_index === -1) {
		return state;
	}

	// Remove the node
	tree.nodes.splice(node_index, 1);

	// Remove all connections involving this node
	tree.connections = tree.connections.filter(
		conn => conn.from_node_id !== node_id && conn.to_node_id !== node_id
	);

	// Clear selection if this node was selected
	if (new_state.ui_state.selected_node_id === node_id) {
		new_state.ui_state.selected_node_id = null;
	}

	return new_state;
}

/**
 * Updates node properties
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree containing the node
 * @param {string} node_id - ID of node to update
 * @param {object} changes - Properties to update
 * @returns {object} New state with updated node
 */
function update_node(state, tree_id, node_id, changes) {
	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];
	const node_index = get_node_index(tree, node_id);

	if (node_index === -1) {
		return state;
	}

	const node = tree.nodes[node_index];

	// Apply allowed changes
	const allowed_keys = [
		"name", "description", "icon", "max_rank",
		"cost_per_rank", "tags", "type", "event",
		"prerequisite_logic", "prerequisite_threshold"
	];

	for (const key of allowed_keys) {
		if (changes[key] !== undefined) {
			node[key] = changes[key];
		}
	}

	return new_state;
}

/**
 * Updates a node's position
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree containing the node
 * @param {string} node_id - ID of node to move
 * @param {number} x - New X position
 * @param {number} y - New Y position
 * @returns {object} New state with updated position
 */
function update_node_position(state, tree_id, node_id, x, y) {
	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];
	const node_index = get_node_index(tree, node_id);

	if (node_index === -1) {
		return state;
	}

	tree.nodes[node_index].position = { x: x, y: y };

	return new_state;
}

// ============================================================================
// Point Allocation Actions
// ============================================================================

/**
 * Allocates a point to a node (increases current_rank)
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree containing the node
 * @param {string} node_id - ID of node to allocate to
 * @returns {object} New state with point allocated
 */
function allocate_point(state, tree_id, node_id) {
	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];
	const node_index = get_node_index(tree, node_id);

	if (node_index === -1) {
		return state;
	}

	const node = tree.nodes[node_index];

	// Check if already maxed
	if (node.current_rank >= node.max_rank) {
		return state;
	}

	// Calculate cost
	const cost_index = Math.min(node.current_rank, node.cost_per_rank.length - 1);
	const cost = node.cost_per_rank[cost_index];

	// Check if enough points
	const available = tree.point_pool.total - tree.point_pool.spent;
	if (available < cost) {
		return state;
	}

	// Allocate
	node.current_rank += 1;
	tree.point_pool.spent += cost;

	return new_state;
}

/**
 * Refunds a point from a node (decreases current_rank)
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree containing the node
 * @param {string} node_id - ID of node to refund from
 * @returns {object} New state with point refunded
 */
function refund_point(state, tree_id, node_id) {
	const new_state = touch_modified(clone_state(state));

	// Check if refunds are allowed
	if (!new_state.project.settings.allow_refunds) {
		return state;
	}

	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];
	const node_index = get_node_index(tree, node_id);

	if (node_index === -1) {
		return state;
	}

	const node = tree.nodes[node_index];

	// Check if has points to refund
	if (node.current_rank <= 0) {
		return state;
	}

	// Calculate refund amount
	const cost_index = Math.min(node.current_rank - 1, node.cost_per_rank.length - 1);
	const refund = node.cost_per_rank[cost_index];

	// Refund
	node.current_rank -= 1;
	tree.point_pool.spent -= refund;

	// Cascading refunds: check if any dependents become locked
	// Always cascade in Play mode for a smoother experience, or in Edit mode if setting is enabled
	if (new_state.ui_state.mode !== "edit" || new_state.project.settings.cascade_refunds) {
		apply_cascade_refunds(new_state, tree_id);
	}

	return new_state;
}

/**
 * Recursively refunds points from nodes that no longer meet prerequisites
 * @param {object} state - State to modify (mutates tree/nodes)
 * @param {string} tree_id - Tree to process
 */
function apply_cascade_refunds(state, tree_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) return;

	let changed = true;
	while (changed) {
		changed = false;
		for (const node of tree.nodes) {
			if (node.current_rank > 0) {
				const prereqs_met = check_prerequisites(state, tree_id, node.id);
				if (!prereqs_met) {
					// Refund all points from this node
					for (let i = 0; i < node.current_rank; i++) {
						const cost_index = Math.min(i, node.cost_per_rank.length - 1);
						tree.point_pool.spent -= node.cost_per_rank[cost_index];
					}
					node.current_rank = 0;
					changed = true;
				}
			}
		}
	}
}

/**
 * Resets all points in a tree
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree to reset
 * @returns {object} New state with tree reset
 */
function reset_tree(state, tree_id) {
	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];

	// Reset all nodes
	for (const node of tree.nodes) {
		node.current_rank = 0;
	}

	// Reset spent points
	tree.point_pool.spent = 0;

	return new_state;
}

// ============================================================================
// Connection Actions
// ============================================================================

/**
 * Adds a connection between two nodes
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree to add connection to
 * @param {object} options - Connection options { from_node_id, to_node_id, logic, required_rank }
 * @returns {object} New state with added connection
 */
function add_connection(state, tree_id, options) {
	if (!options.from_node_id || !options.to_node_id) {
		return state;
	}

	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];

	// Verify both nodes exist
	const from_exists = tree.nodes.some(n => n.id === options.from_node_id);
	const to_exists = tree.nodes.some(n => n.id === options.to_node_id);

	if (!from_exists || !to_exists) {
		return state;
	}

	// Check for duplicate connection
	const duplicate = tree.connections.some(
		c => c.from_node_id === options.from_node_id && c.to_node_id === options.to_node_id
	);

	if (duplicate) {
		return state;
	}

	const id = generate_id("conn");
	const connection = create_connection(id, options.from_node_id, options.to_node_id);

	if (options.logic === "AND" || options.logic === "OR") {
		connection.logic = options.logic;
	}
	if (typeof options.required_rank === "number") {
		connection.required_rank = options.required_rank;
	}

	tree.connections.push(connection);

	return new_state;
}

/**
 * Removes a connection
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree containing the connection
 * @param {string} connection_id - ID of connection to remove
 * @returns {object} New state with connection removed
 */
function remove_connection(state, tree_id, connection_id) {
	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];
	const conn_index = get_connection_index(tree, connection_id);

	if (conn_index === -1) {
		return state;
	}

	tree.connections.splice(conn_index, 1);

	return new_state;
}

/**
 * Updates connection properties
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree containing the connection
 * @param {string} connection_id - ID of connection to update
 * @param {object} changes - Properties to update { logic, required_rank }
 * @returns {object} New state with updated connection
 */
function update_connection(state, tree_id, connection_id, changes) {
	const new_state = touch_modified(clone_state(state));
	const tree_index = get_tree_index(new_state, tree_id);

	if (tree_index === -1) {
		return state;
	}

	const tree = new_state.project.trees[tree_index];
	const conn_index = get_connection_index(tree, connection_id);

	if (conn_index === -1) {
		return state;
	}

	const connection = tree.connections[conn_index];

	if (changes.logic === "AND" || changes.logic === "OR") {
		connection.logic = changes.logic;
	}
	if (typeof changes.required_rank === "number") {
		connection.required_rank = changes.required_rank;
	}

	return new_state;
}

// ============================================================================
// UI State Actions
// ============================================================================

/**
 * Sets the active tree
 * @param {object} state - Current state
 * @param {string} tree_id - ID of tree to activate
 * @returns {object} New state with active tree set
 */
function set_active_tree(state, tree_id) {
	const new_state = clone_state(state);
	new_state.ui_state.active_tree_id = tree_id;
	new_state.ui_state.selected_node_id = null;
	return new_state;
}

/**
 * Sets the selected node
 * @param {object} state - Current state
 * @param {string|null} node_id - ID of node to select, or null to deselect
 * @returns {object} New state with selected node set
 */
function set_selected_node(state, node_id) {
	const new_state = clone_state(state);
	new_state.ui_state.selected_node_id = node_id;
	return new_state;
}

/**
 * Sets the editing mode
 * @param {object} state - Current state
 * @param {string} mode - "edit" or "play"
 * @returns {object} New state with mode set
 */
function set_mode(state, mode) {
	if (mode !== "edit" && mode !== "play") {
		return state;
	}
	const new_state = clone_state(state);
	new_state.ui_state.mode = mode;
	return new_state;
}

/**
 * Updates viewport position and zoom
 * @param {object} state - Current state
 * @param {object} viewport - { x, y, zoom }
 * @returns {object} New state with viewport updated
 */
function set_viewport(state, viewport) {
	const new_state = clone_state(state);

	if (typeof viewport.x === "number") {
		new_state.ui_state.viewport.x = viewport.x;
	}
	if (typeof viewport.y === "number") {
		new_state.ui_state.viewport.y = viewport.y;
	}
	if (typeof viewport.zoom === "number") {
		new_state.ui_state.viewport.zoom = Math.max(0.1, Math.min(3, viewport.zoom));
	}

	return new_state;
}

/**
 * Updates tooltip state
 * @param {object} state - Current state
 * @param {object} tooltip - { visible, node_id, x, y }
 * @returns {object} New state with tooltip updated
 */
function set_tooltip(state, tooltip) {
	const new_state = clone_state(state);

	if (typeof tooltip.visible === "boolean") {
		new_state.ui_state.tooltip.visible = tooltip.visible;
	}
	if (tooltip.node_id !== undefined) {
		new_state.ui_state.tooltip.node_id = tooltip.node_id;
	}
	if (typeof tooltip.x === "number") {
		new_state.ui_state.tooltip.x = tooltip.x;
	}
	if (typeof tooltip.y === "number") {
		new_state.ui_state.tooltip.y = tooltip.y;
	}

	return new_state;
}

/**
 * Enters connection creation mode
 * @param {object} state - Current state
 * @param {string} from_node_id - Source node ID
 * @returns {object} New state with connection mode active
 */
function start_connection_mode(state, from_node_id) {
	const new_state = clone_state(state);
	new_state.ui_state.connection_mode.active = true;
	new_state.ui_state.connection_mode.from_node_id = from_node_id;
	return new_state;
}

/**
 * Exits connection creation mode
 * @param {object} state - Current state
 * @returns {object} New state with connection mode inactive
 */
function cancel_connection_mode(state) {
	const new_state = clone_state(state);
	new_state.ui_state.connection_mode.active = false;
	new_state.ui_state.connection_mode.from_node_id = null;
	return new_state;
}

/**
 * Updates connection mode settings
 * @param {object} state - Current state
 * @param {object} settings - { logic, required_rank }
 * @returns {object} New state with updated settings
 */
function set_connection_settings(state, settings) {
	const new_state = clone_state(state);

	if (settings.logic === "AND" || settings.logic === "OR") {
		new_state.ui_state.connection_mode.logic = settings.logic;
	}
	if (typeof settings.required_rank === "number" && settings.required_rank >= 1) {
		new_state.ui_state.connection_mode.required_rank = settings.required_rank;
	}

	return new_state;
}

export {
	// Project actions
	update_project_metadata,

	// Tree actions
	add_tree,
	remove_tree,
	update_tree,

	// Node actions
	add_node,
	remove_node,
	update_node,
	update_node_position,

	// Point allocation
	allocate_point,
	refund_point,
	reset_tree,

	// Connection actions
	add_connection,
	remove_connection,
	update_connection,

	// UI state actions
	set_active_tree,
	set_selected_node,
	set_mode,
	set_viewport,
	set_tooltip,

	// Connection mode actions
	start_connection_mode,
	cancel_connection_mode,
	set_connection_settings
};
