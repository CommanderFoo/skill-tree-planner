/**
 * Import/Export Module
 * Handles project serialization, deserialization, and validation
 */

import { create_initial_state, clone_state } from "./state.js";

const CURRENT_VERSION = "1.0.0";

/**
 * Validates a project object structure
 * @param {object} project - Project to validate
 * @returns {object} { valid, errors }
 */
function validate_project(project) {
	const errors = [];

	if (!project) {
		errors.push("Project is null or undefined");
		return { valid: false, errors: errors };
	}

	// Check required fields
	if (!project.metadata) {
		errors.push("Missing project.metadata");
	} else {
		if (!project.metadata.name || typeof project.metadata.name !== "string") {
			errors.push("Missing or invalid project.metadata.name");
		}
	}

	if (!project.settings) {
		errors.push("Missing project.settings");
	}

	if (!Array.isArray(project.trees)) {
		errors.push("project.trees must be an array");
	} else {
		// Validate each tree
		for (let i = 0; i < project.trees.length; i++) {
			const tree_errors = validate_tree(project.trees[i], i);
			errors.push(...tree_errors);
		}
	}

	return {
		valid: errors.length === 0,
		errors: errors
	};
}

/**
 * Validates a tree object
 * @param {object} tree - Tree to validate
 * @param {number} index - Tree index for error messages
 * @returns {array} Array of error messages
 */
function validate_tree(tree, index) {
	const errors = [];
	const prefix = `trees[${index}]`;

	if (!tree) {
		errors.push(`${prefix} is null or undefined`);
		return errors;
	}

	if (!tree.id || typeof tree.id !== "string") {
		errors.push(`${prefix}.id is missing or invalid`);
	}

	if (!tree.name || typeof tree.name !== "string") {
		errors.push(`${prefix}.name is missing or invalid`);
	}

	if (!tree.point_pool) {
		errors.push(`${prefix}.point_pool is missing`);
	} else {
		if (typeof tree.point_pool.total !== "number") {
			errors.push(`${prefix}.point_pool.total must be a number`);
		}
		if (typeof tree.point_pool.spent !== "number") {
			errors.push(`${prefix}.point_pool.spent must be a number`);
		}
	}

	if (!Array.isArray(tree.nodes)) {
		errors.push(`${prefix}.nodes must be an array`);
	} else {
		// Validate nodes
		const node_ids = new Set();
		for (let i = 0; i < tree.nodes.length; i++) {
			const node_errors = validate_node(tree.nodes[i], `${prefix}.nodes[${i}]`);
			errors.push(...node_errors);

			// Check for duplicate IDs
			if (tree.nodes[i].id) {
				if (node_ids.has(tree.nodes[i].id)) {
					errors.push(`Duplicate node ID: ${tree.nodes[i].id}`);
				}
				node_ids.add(tree.nodes[i].id);
			}
		}
	}

	if (!Array.isArray(tree.connections)) {
		errors.push(`${prefix}.connections must be an array`);
	} else {
		// Validate connections
		const node_ids = new Set(tree.nodes?.map(n => n.id) || []);
		for (let i = 0; i < tree.connections.length; i++) {
			const conn_errors = validate_connection(tree.connections[i], `${prefix}.connections[${i}]`, node_ids);
			errors.push(...conn_errors);
		}
	}

	return errors;
}

/**
 * Validates a node object
 * @param {object} node - Node to validate
 * @param {string} prefix - Prefix for error messages
 * @returns {array} Array of error messages
 */
function validate_node(node, prefix) {
	const errors = [];

	if (!node) {
		errors.push(`${prefix} is null or undefined`);
		return errors;
	}

	if (!node.id || typeof node.id !== "string") {
		errors.push(`${prefix}.id is missing or invalid`);
	}

	if (!node.name || typeof node.name !== "string") {
		errors.push(`${prefix}.name is missing or invalid`);
	}

	if (!node.position || typeof node.position.x !== "number" || typeof node.position.y !== "number") {
		errors.push(`${prefix}.position must have numeric x and y`);
	}

	if (typeof node.max_rank !== "number" || node.max_rank < 1) {
		errors.push(`${prefix}.max_rank must be a number >= 1`);
	}

	if (typeof node.current_rank !== "number" || node.current_rank < 0) {
		errors.push(`${prefix}.current_rank must be a number >= 0`);
	}

	if (!Array.isArray(node.cost_per_rank) || node.cost_per_rank.length === 0) {
		errors.push(`${prefix}.cost_per_rank must be a non-empty array`);
	}

	return errors;
}

/**
 * Validates a connection object
 * @param {object} conn - Connection to validate
 * @param {string} prefix - Prefix for error messages
 * @param {Set} node_ids - Set of valid node IDs
 * @returns {array} Array of error messages
 */
function validate_connection(conn, prefix, node_ids) {
	const errors = [];

	if (!conn) {
		errors.push(`${prefix} is null or undefined`);
		return errors;
	}

	if (!conn.id || typeof conn.id !== "string") {
		errors.push(`${prefix}.id is missing or invalid`);
	}

	if (!conn.from_node_id || typeof conn.from_node_id !== "string") {
		errors.push(`${prefix}.from_node_id is missing or invalid`);
	} else if (!node_ids.has(conn.from_node_id)) {
		errors.push(`${prefix}.from_node_id references non-existent node: ${conn.from_node_id}`);
	}

	if (!conn.to_node_id || typeof conn.to_node_id !== "string") {
		errors.push(`${prefix}.to_node_id is missing or invalid`);
	} else if (!node_ids.has(conn.to_node_id)) {
		errors.push(`${prefix}.to_node_id references non-existent node: ${conn.to_node_id}`);
	}

	return errors;
}

/**
 * Exports the project to a JSON string
 * @param {object} state - Current application state
 * @param {object} options - Export options
 * @returns {string} JSON string
 */
function export_project(state, options = {}) {
	const data = {
		version: CURRENT_VERSION,
		project: state.project
	};

	// Option: Build only (minimal export)
	if (options.build_only) {
		data.project = {
			version: state.project.version,
			metadata: {
				name: state.project.metadata.name,
				exported_at: new Date().toISOString()
			},
			trees: state.project.trees.map(tree => ({
				id: tree.id,
				name: tree.name,
				nodes: tree.nodes.map(node => ({
					id: node.id,
					name: node.name,
					current_rank: node.current_rank,
					max_rank: node.max_rank
				})),
				point_pool: {
					total: tree.point_pool.total,
					spent: tree.point_pool.spent
				}
			}))
		};
	}

	// Option: Pretty print
	if (options.pretty) {
		return JSON.stringify(data, null, 2);
	}

	return JSON.stringify(data);
}

/**
 * Imports a project from a JSON string
 * @param {string} json - JSON string to import
 * @returns {object} { success, state, errors, warnings }
 */
function import_project(json) {
	const result = {
		success: false,
		state: null,
		errors: [],
		warnings: []
	};

	// Parse JSON
	let data;
	try {
		data = JSON.parse(json);
	} catch (e) {
		result.errors.push(`Invalid JSON: ${e.message}`);
		return result;
	}

	if (!data || typeof data !== "object") {
		result.errors.push("Data must be an object");
		return result;
	}

	// Check for project data
	const project = data.project || data;

	// Validate structure
	const validation = validate_project(project);
	if (!validation.valid) {
		result.errors = validation.errors;
		return result;
	}

	// Version check
	if (data.version && data.version !== CURRENT_VERSION) {
		result.warnings.push(`Version mismatch: file is ${data.version}, current is ${CURRENT_VERSION}`);
	}

	// Create new state
	const initial = create_initial_state();
	const state = clone_state(initial);

	// Apply imported project
	state.project = {
		version: CURRENT_VERSION,
		metadata: {
			name: project.metadata?.name || "Imported Project",
			description: project.metadata?.description || "",
			author: project.metadata?.author || "",
			created_at: project.metadata?.created_at || new Date().toISOString(),
			modified_at: new Date().toISOString()
		},
		settings: {
			global_point_pool: {
				enabled: project.settings?.global_point_pool?.enabled || false,
				total: project.settings?.global_point_pool?.total || 0,
				spent: project.settings?.global_point_pool?.spent || 0
			},
			allow_refunds: project.settings?.allow_refunds !== false,
			cascade_refunds: project.settings?.cascade_refunds || false
		},
		trees: project.trees || []
	};

	// Set active tree
	if (state.project.trees.length > 0) {
		state.ui_state.active_tree_id = state.project.trees[0].id;
	}

	result.success = true;
	result.state = state;

	return result;
}

/**
 * Downloads a file in the browser
 * @param {string} filename - Name of the file
 * @param {string} content - File content
 * @param {string} mimeType - MIME type
 */
function download_file(filename, content, mimeType = "application/json") {
	const blob = new Blob([content], { type: mimeType });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export {
	validate_project,
	validate_tree,
	validate_node,
	validate_connection,
	export_project,
	import_project,
	download_file,
	CURRENT_VERSION
};
