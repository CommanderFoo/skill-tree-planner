/**
 * Validation Engine Module
 * Standalone validation system for skill tree rules
 */

import { find_tree, find_node } from "./state.js";

// ============================================================================
// Node Status
// ============================================================================

/**
 * Node status enumeration
 */
const NODE_STATUS = {
	LOCKED: "locked",
	UNLOCKABLE: "unlockable",
	ACTIVE: "active",
	MAXED: "maxed",
	INVALID: "invalid"
};

/**
 * Gets the status of a node
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @param {string} node_id - Node ID
 * @returns {string} Node status
 */
function get_node_status(state, tree_id, node_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) {
		return NODE_STATUS.INVALID;
	}

	const node = find_node(state, tree_id, node_id);
	if (!node) {
		return NODE_STATUS.INVALID;
	}

	// Check if prerequisites are met
	const prereqs_met = check_prerequisites(state, tree_id, node_id);

	if (!prereqs_met) {
		return NODE_STATUS.LOCKED;
	}

	if (node.current_rank === 0) {
		return NODE_STATUS.UNLOCKABLE;
	}

	if (node.current_rank >= node.max_rank) {
		return NODE_STATUS.MAXED;
	}

	return NODE_STATUS.ACTIVE;
}

/**
 * Gets the status of all nodes in a tree
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @returns {object} Map of node_id to status
 */
function get_all_node_statuses(state, tree_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) {
		return {};
	}

	const statuses = {};
	for (const node of tree.nodes) {
		statuses[node.id] = get_node_status(state, tree_id, node.id);
	}

	return statuses;
}

// ============================================================================
// Prerequisite Checking
// ============================================================================

/**
 * Checks if all prerequisites for a node are met
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @param {string} node_id - Node ID
 * @returns {boolean} True if prerequisites are met
 */
function check_prerequisites(state, tree_id, node_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) {
		return false;
	}

	// Find all connections pointing to this node
	const incoming = tree.connections.filter(c => c.to_node_id === node_id);

	// No prerequisites = always unlocked
	if (incoming.length === 0) {
		return true;
	}

	const node = find_node(state, tree_id, node_id);
	if (!node) return false;

	const logic = node.prerequisite_logic || "AND";

	if (logic === "AND") {
		// All connections must be satisfied
		return incoming.every(conn => is_connection_satisfied(state, tree_id, conn));
	} else if (logic === "OR") {
		// At least one connection must be satisfied
		return incoming.some(conn => is_connection_satisfied(state, tree_id, conn));
	} else if (logic === "SUM") {
		// Total rank of all parents must meet threshold
		const threshold = node.prerequisite_threshold || 1;
		let total_rank = 0;
		for (const conn of incoming) {
			const from_node = find_node(state, tree_id, conn.from_node_id);
			if (from_node) {
				total_rank += from_node.current_rank;
			}
		}
		return total_rank >= threshold;
	}

	return true;
}

/**
 * Checks a tree for reachability and other logical issues
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @returns {object} Validation results { unreachable: [] }
 */
function check_tree_reachability(state, tree_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) return { unreachable: [] };

	const reachable = new Set();
	const queue = [];

	// Roots are reachable (nodes with no prerequisites)
	tree.nodes.forEach(node => {
		const incoming = tree.connections.filter(c => c.to_node_id === node.id);
		if (incoming.length === 0) {
			reachable.add(node.id);
			queue.push(node.id);
		}
	});

	// BFS to find all reachable nodes
	let head = 0;
	while (head < queue.length) {
		const current_id = queue[head++];

		// Find nodes that have THIS node as a prerequisite
		const outgoing = tree.connections.filter(c => c.from_node_id === current_id);

		for (const conn of outgoing) {
			const target_id = conn.to_node_id;
			if (reachable.has(target_id)) continue;

			// A node is reachable if its prerequisite logic can be satisfied
			// We check this assuming all its CURRENTLY reachable parents are MAXED
			// This is a conservative check for static reachability
			const target_node = find_node(state, tree_id, target_id);
			const incoming = tree.connections.filter(c => c.to_node_id === target_id);

			const logic = target_node.prerequisite_logic || "AND";
			let can_reach = false;

			if (logic === "AND") {
				can_reach = incoming.every(c => reachable.has(c.from_node_id));
			} else if (logic === "OR") {
				can_reach = incoming.some(c => reachable.has(c.from_node_id));
			} else if (logic === "SUM") {
				// For SUM, if any parent is reachable, the node is potentially reachable
				// (in theory we should check if sum of max_ranks >= threshold, but simple reachability is enough)
				can_reach = incoming.some(c => reachable.has(c.from_node_id));
			}

			if (can_reach) {
				reachable.add(target_id);
				queue.push(target_id);
			}
		}
	}

	const unreachable = tree.nodes
		.filter(node => !reachable.has(node.id))
		.map(node => node.id);

	return { unreachable };
}
function is_connection_satisfied(state, tree_id, connection) {
	const to_node = find_node(state, tree_id, connection.to_node_id);
	if (!to_node) return false;

	const from_node = find_node(state, tree_id, connection.from_node_id);
	if (!from_node) {
		return false;
	}

	if (to_node.prerequisite_logic === "SUM") {
		// In SUM mode, the connection is satisfied if the TOTAL group is satisfied
		return check_prerequisites(state, tree_id, connection.to_node_id);
	}

	// For AND/OR, use the individual connection threshold
	return from_node.current_rank >= connection.required_rank;
}

/**
 * Gets all nodes that depend on a specific node
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @param {string} node_id - Node ID
 * @returns {array} Array of dependent node IDs
 */
function get_dependent_nodes(state, tree_id, node_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) {
		return [];
	}

	return tree.connections
		.filter(c => c.from_node_id === node_id)
		.map(c => c.to_node_id);
}

/**
 * Gets all nodes that are prerequisites for a specific node
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @param {string} node_id - Node ID
 * @returns {array} Array of prerequisite connection info
 */
function get_prerequisites(state, tree_id, node_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) {
		return [];
	}

	return tree.connections
		.filter(c => c.to_node_id === node_id)
		.map(c => ({
			node_id: c.from_node_id,
			required_rank: c.required_rank,
			logic: c.logic,
			satisfied: is_connection_satisfied(state, tree_id, c)
		}));
}

// ============================================================================
// Point Allocation Validation
// ============================================================================

/**
 * Checks if a point can be allocated to a node
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @param {string} node_id - Node ID
 * @returns {object} { can_allocate, reason }
 */
function can_allocate_point(state, tree_id, node_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) {
		return {
			can_allocate: false,
			reason: "Tree not found"
		};
	}

	const node = find_node(state, tree_id, node_id);
	if (!node) {
		return {
			can_allocate: false,
			reason: "Node not found"
		};
	}

	// Check mode - edit mode bypasses validation
	if (state.ui_state.mode === "edit") {
		// Still check basic constraints
		if (node.current_rank >= node.max_rank) {
			return {
				can_allocate: false,
				reason: "Maximum rank reached"
			};
		}

		const cost = get_allocation_cost(node);
		const available = tree.point_pool.total - tree.point_pool.spent;
		if (available < cost) {
			return {
				can_allocate: false,
				reason: "Not enough points"
			};
		}

		return {
			can_allocate: true,
			reason: null
		};
	}

	// Play mode - full validation
	const status = get_node_status(state, tree_id, node_id);

	if (status === NODE_STATUS.LOCKED) {
		return {
			can_allocate: false,
			reason: "Prerequisites not met"
		};
	}

	if (status === NODE_STATUS.MAXED) {
		return {
			can_allocate: false,
			reason: "Maximum rank reached"
		};
	}

	if (status === NODE_STATUS.INVALID) {
		return {
			can_allocate: false,
			reason: "Invalid node state"
		};
	}

	// Check points
	const cost = get_allocation_cost(node);
	const available = tree.point_pool.total - tree.point_pool.spent;

	if (available < cost) {
		return {
			can_allocate: false,
			reason: "Not enough points"
		};
	}

	return {
		can_allocate: true,
		reason: null
	};
}

/**
 * Gets the cost to allocate the next point to a node
 * @param {object} node - Node object
 * @returns {number} Point cost
 */
function get_allocation_cost(node) {
	const cost_index = Math.min(node.current_rank, node.cost_per_rank.length - 1);
	return node.cost_per_rank[cost_index];
}

// ============================================================================
// Refund Validation
// ============================================================================

/**
 * Checks if a point can be refunded from a node
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @param {string} node_id - Node ID
 * @returns {object} { can_refund, reason, affected_nodes }
 */
function can_refund_point(state, tree_id, node_id) {
	// Check if refunds are enabled
	if (!state.project.settings.allow_refunds) {
		return {
			can_refund: false,
			reason: "Refunds are disabled",
			affected_nodes: []
		};
	}

	const tree = find_tree(state, tree_id);
	if (!tree) {
		return {
			can_refund: false,
			reason: "Tree not found",
			affected_nodes: []
		};
	}

	const node = find_node(state, tree_id, node_id);
	if (!node) {
		return {
			can_refund: false,
			reason: "Node not found",
			affected_nodes: []
		};
	}

	// Check if has points to refund
	if (node.current_rank <= 0) {
		return {
			can_refund: false,
			reason: "No points allocated",
			affected_nodes: []
		};
	}

	// Edit mode - always allow basic refunds
	if (state.ui_state.mode === "edit") {
		return {
			can_refund: true,
			reason: null,
			affected_nodes: []
		};
	}

	// Play mode - check dependents
	const new_rank = node.current_rank - 1;
	const blocking_dependents = find_blocking_dependents(state, tree_id, node_id, new_rank);

	if (blocking_dependents.length > 0) {
		// In Play mode, we always allow the refund if it triggers a cascade,
		// providing better UX by not hard-blocking the user.
		return {
			can_refund: true,
			reason: "Will cascade to dependent nodes",
			affected_nodes: blocking_dependents
		};
	}

	return {
		can_refund: true,
		reason: null,
		affected_nodes: []
	};
}

/**
 * Finds nodes that would be blocked if a node's rank is reduced
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @param {string} node_id - Node ID being refunded
 * @param {number} new_rank - Rank after refund
 * @returns {array} Array of node IDs that would be blocked
 */
function find_blocking_dependents(state, tree_id, node_id, new_rank) {
	const tree = find_tree(state, tree_id);
	if (!tree) {
		return [];
	}

	const blocking = [];

	// Find connections from this node
	const outgoing = tree.connections.filter(c => c.from_node_id === node_id);

	for (const conn of outgoing) {
		// Would this connection become unsatisfied?
		if (new_rank < conn.required_rank) {
			const dependent_node = find_node(state, tree_id, conn.to_node_id);

			// Only blocking if dependent has points allocated
			if (dependent_node && dependent_node.current_rank > 0) {
				// Check if there are alternative OR paths
				if (!has_alternative_path(state, tree_id, conn.to_node_id, node_id)) {
					blocking.push(conn.to_node_id);
				}
			}
		}
	}

	return blocking;
}

/**
 * Checks if a node has an alternative satisfied path (OR logic)
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @param {string} node_id - Dependent node ID
 * @param {string} excluded_node_id - Node being refunded (to exclude)
 * @returns {boolean} True if alternative path exists
 */
function has_alternative_path(state, tree_id, node_id, excluded_node_id) {
	const tree = find_tree(state, tree_id);
	if (!tree) {
		return false;
	}

	// Find OR connections to this node (excluding the one being refunded)
	const or_connections = tree.connections.filter(
		c => c.to_node_id === node_id &&
			c.from_node_id !== excluded_node_id &&
			c.logic === "OR"
	);

	// Check if any OR path is satisfied
	return or_connections.some(conn => is_connection_satisfied(state, tree_id, conn));
}

/**
 * Gets the refund amount for a node
 * @param {object} node - Node object
 * @returns {number} Points to refund
 */
function get_refund_amount(node) {
	if (node.current_rank <= 0) {
		return 0;
	}
	const cost_index = Math.min(node.current_rank - 1, node.cost_per_rank.length - 1);
	return node.cost_per_rank[cost_index];
}

// ============================================================================
// Full State Validation
// ============================================================================

/**
 * Validates the entire state
 * @param {object} state - Current state
 * @returns {object} Validation result
 */
function validate_state(state) {
	const errors = [];
	const warnings = [];
	const blocked_actions = [];

	// Validate each tree
	for (const tree of state.project.trees) {
		const tree_result = validate_tree(state, tree.id);
		errors.push(...tree_result.errors);
		warnings.push(...tree_result.warnings);
		blocked_actions.push(...tree_result.blocked_actions);
	}

	// Check for duplicate tree IDs
	const tree_ids = state.project.trees.map(t => t.id);
	const duplicate_trees = tree_ids.filter(
		(id, index) => tree_ids.indexOf(id) !== index
	);

	for (const id of duplicate_trees) {
		errors.push({
			code: "ERR_DUPLICATE_TREE_ID",
			message: `Duplicate tree ID: ${id}`,
			tree_id: id,
			details: {}
		});
	}

	return {
		is_valid: errors.length === 0,
		errors: errors,
		warnings: warnings,
		blocked_actions: blocked_actions
	};
}

/**
 * Validates a single tree
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID
 * @returns {object} Validation result
 */
function validate_tree(state, tree_id) {
	const errors = [];
	const warnings = [];
	const blocked_actions = [];

	const tree = find_tree(state, tree_id);
	if (!tree) {
		errors.push({
			code: "ERR_TREE_NOT_FOUND",
			message: "Tree not found",
			tree_id: tree_id,
			details: {}
		});
		return { is_valid: false, errors, warnings, blocked_actions };
	}

	// Check for duplicate node IDs
	const node_ids = tree.nodes.map(n => n.id);
	const duplicate_nodes = node_ids.filter(
		(id, index) => node_ids.indexOf(id) !== index
	);

	for (const id of duplicate_nodes) {
		errors.push({
			code: "ERR_DUPLICATE_NODE_ID",
			message: `Duplicate node ID: ${id}`,
			tree_id: tree_id,
			node_id: id,
			details: {}
		});
	}

	// Validate connections reference existing nodes
	for (const conn of tree.connections) {
		const from_exists = node_ids.includes(conn.from_node_id);
		const to_exists = node_ids.includes(conn.to_node_id);

		if (!from_exists) {
			errors.push({
				code: "ERR_INVALID_CONNECTION_SOURCE",
				message: `Connection references non-existent source node: ${conn.from_node_id}`,
				tree_id: tree_id,
				connection_id: conn.id,
				details: { from_node_id: conn.from_node_id }
			});
		}

		if (!to_exists) {
			errors.push({
				code: "ERR_INVALID_CONNECTION_TARGET",
				message: `Connection references non-existent target node: ${conn.to_node_id}`,
				tree_id: tree_id,
				connection_id: conn.id,
				details: { to_node_id: conn.to_node_id }
			});
		}
	}

	// Check for cycles
	const cycle = detect_cycle(tree);
	if (cycle) {
		errors.push({
			code: "ERR_CYCLIC_DEPENDENCY",
			message: "Cyclic dependency detected",
			tree_id: tree_id,
			details: { cycle: cycle }
		});
	}

	// Validate point pool integrity
	const calculated_spent = calculate_spent_points(tree);
	if (calculated_spent !== tree.point_pool.spent) {
		warnings.push({
			code: "WARN_POINT_POOL_MISMATCH",
			message: `Point pool mismatch: spent=${tree.point_pool.spent}, calculated=${calculated_spent}`,
			tree_id: tree_id,
			details: { stored: tree.point_pool.spent, calculated: calculated_spent }
		});
	}

	// Check for orphaned nodes (no connections in a tree with other connected nodes)
	if (tree.nodes.length > 1 && tree.connections.length > 0) {
		for (const node of tree.nodes) {
			const has_incoming = tree.connections.some(c => c.to_node_id === node.id);
			const has_outgoing = tree.connections.some(c => c.from_node_id === node.id);

			if (!has_incoming && !has_outgoing) {
				warnings.push({
					code: "WARN_ORPHANED_NODE",
					message: `Node has no connections: ${node.name}`,
					tree_id: tree_id,
					node_id: node.id,
					details: {}
				});
			}
		}
	}

	return {
		is_valid: errors.length === 0,
		errors: errors,
		warnings: warnings,
		blocked_actions: blocked_actions
	};
}

/**
 * Calculates the total spent points in a tree
 * @param {object} tree - Tree object
 * @returns {number} Total spent points
 */
function calculate_spent_points(tree) {
	let total = 0;

	for (const node of tree.nodes) {
		for (let i = 0; i < node.current_rank; i++) {
			const cost_index = Math.min(i, node.cost_per_rank.length - 1);
			total += node.cost_per_rank[cost_index];
		}
	}

	return total;
}

/**
 * Detects cycles in the dependency graph
 * @param {object} tree - Tree object
 * @returns {array|null} Array of node IDs forming a cycle, or null
 */
function detect_cycle(tree) {
	const visited = new Set();
	const rec_stack = new Set();
	const path = [];

	// Build adjacency list
	const adjacency = {};
	for (const node of tree.nodes) {
		adjacency[node.id] = [];
	}
	for (const conn of tree.connections) {
		if (adjacency[conn.from_node_id]) {
			adjacency[conn.from_node_id].push(conn.to_node_id);
		}
	}

	function dfs(node_id) {
		visited.add(node_id);
		rec_stack.add(node_id);
		path.push(node_id);

		for (const neighbor of (adjacency[node_id] || [])) {
			if (!visited.has(neighbor)) {
				const cycle = dfs(neighbor);
				if (cycle) {
					return cycle;
				}
			} else if (rec_stack.has(neighbor)) {
				// Found cycle
				const cycle_start = path.indexOf(neighbor);
				return path.slice(cycle_start);
			}
		}

		path.pop();
		rec_stack.delete(node_id);
		return null;
	}

	for (const node of tree.nodes) {
		if (!visited.has(node.id)) {
			const cycle = dfs(node.id);
			if (cycle) {
				return cycle;
			}
		}
	}

	return null;
}

export {
	NODE_STATUS,
	get_node_status,
	get_all_node_statuses,
	check_prerequisites,
	is_connection_satisfied,
	get_dependent_nodes,
	get_prerequisites,
	can_allocate_point,
	get_allocation_cost,
	can_refund_point,
	find_blocking_dependents,
	get_refund_amount,
	validate_state,
	check_tree_reachability,
	validate_tree,
	calculate_spent_points,
	detect_cycle
};
