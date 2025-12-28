/**
 * Renderer Module
 * State-driven rendering pipeline for skill trees
 */

import { find_tree, find_node } from "./state.js";
import * as validation from "./validation_engine.js";
const { get_node_status, get_all_node_statuses, NODE_STATUS, get_allocation_cost, is_connection_satisfied } = validation;

/**
 * Main render function - renders entire UI from state
 * @param {object} state - Current application state
 * @param {object} elements - DOM element references
 */
function render(state, elements) {
	render_tree_selector(state, elements);
	render_point_display(state, elements);
	render_mode_toggle(state, elements);
	render_zoom_level(state, elements);
	render_canvas(state, elements);
	render_sidebar(state, elements);
	render_empty_state(state, elements);
}

/**
 * Renders the zoom level indicator
 */
function render_zoom_level(state, elements) {
	const zoom = state.ui_state.viewport.zoom;
	const percentage = Math.round(zoom * 100);
	elements.zoom_level.textContent = `${percentage}%`;
}

/**
 * Renders the tree selector dropdown
 */
function render_tree_selector(state, elements) {
	const select = elements.tree_select;
	const current_value = select.value;

	select.innerHTML = "";

	if (state.project.trees.length === 0) {
		const option = document.createElement("option");
		option.value = "";
		option.textContent = "No trees";
		select.appendChild(option);
		return;
	}

	for (const tree of state.project.trees) {
		const option = document.createElement("option");
		option.value = tree.id;
		option.textContent = tree.name;
		if (tree.id === state.ui_state.active_tree_id) {
			option.selected = true;
		}
		select.appendChild(option);
	}
}

/**
 * Renders the point display
 */
function render_point_display(state, elements) {
	const tree = find_tree(state, state.ui_state.active_tree_id);

	if (!tree) {
		elements.points_available.textContent = "0";
		elements.points_total.textContent = "0";
		return;
	}

	const available = tree.point_pool.total - tree.point_pool.spent;
	elements.points_available.textContent = available.toString();
	elements.points_total.textContent = tree.point_pool.total.toString();
}

/**
 * Renders the mode toggle buttons
 */
function render_mode_toggle(state, elements) {
	elements.btn_mode_edit.classList.toggle("active", state.ui_state.mode === "edit");
	elements.btn_mode_play.classList.toggle("active", state.ui_state.mode === "play");
}

/**
 * Renders the canvas (nodes and connections)
 */
function render_canvas(state, elements) {
	const tree = find_tree(state, state.ui_state.active_tree_id);

	if (!tree) {
		elements.nodes_layer.innerHTML = "";
		elements.connections_layer.innerHTML = "";
		return;
	}

	// Apply viewport transform (pan and zoom)
	const vp = state.ui_state.viewport;
	const transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`;
	elements.nodes_layer.style.transform = transform;
	elements.nodes_layer.style.transformOrigin = "0 0";
	elements.connections_layer.style.transform = transform;
	elements.connections_layer.style.transformOrigin = "0 0";

	render_connections(state, tree, elements);
	render_nodes(state, tree, elements);
}

/**
 * Renders all connections for a tree
 */
function render_connections(state, tree, elements) {
	const svg = elements.connections_layer;
	svg.innerHTML = "";

	const statuses = get_all_node_statuses(state, tree.id);

	for (const conn of tree.connections) {
		const from_node = find_node(state, tree.id, conn.from_node_id);
		const to_node = find_node(state, tree.id, conn.to_node_id);

		if (!from_node || !to_node) {
			continue;
		}

		const path = create_connection_path(state, from_node, to_node, conn, statuses);
		svg.appendChild(path);
	}
}

/**
 * Creates an SVG path element for a connection
 */
function create_connection_path(state, from_node, to_node, connection, statuses) {
	const node_size = 80;
	const half = node_size / 2;

	const x1 = from_node.position.x + half;
	const y1 = from_node.position.y + half;
	const x2 = to_node.position.x + half;
	const y2 = to_node.position.y + half;

	const path = document.createElementNS("http://www.w3.org/2000/svg", "path");

	// Create curved path
	const dx = x2 - x1;
	const dy = y2 - y1;
	const ctrl_offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.5;

	const d = `M ${x1} ${y1} C ${x1 + ctrl_offset} ${y1}, ${x2 - ctrl_offset} ${y2}, ${x2} ${y2}`;
	path.setAttribute("d", d);
	path.classList.add("connection_path");
	path.dataset.connection_id = connection.id;

	// Determine connection state
	const is_satisfied = is_connection_satisfied(state, state.ui_state.active_tree_id, connection);

	if (is_satisfied) {
		path.classList.add("active");
	} else {
		path.classList.add("locked");
	}

	return path;
}

/**
 * Renders all nodes for a tree
 */
function render_nodes(state, tree, elements) {
	const container = elements.nodes_layer;
	container.innerHTML = "";

	const statuses = get_all_node_statuses(state, tree.id);

	for (const node of tree.nodes) {
		const status = statuses[node.id];
		const element = create_node_element(node, status, state);
		container.appendChild(element);
	}
}

/**
 * Creates a DOM element for a node
 */
function create_node_element(node, status, state) {
	const div = document.createElement("div");
	div.className = "skill_node";
	div.classList.add(status);
	div.dataset.node_id = node.id;

	if (state.ui_state.selected_node_id === node.id) {
		div.classList.add("selected");
	}

	// Connection mode visual feedback
	if (state.ui_state.connection_mode.from_node_id === node.id) {
		div.classList.add("connecting");
	}

	div.style.left = `${node.position.x}px`;
	div.style.top = `${node.position.y}px`;

	// Prerequisite logic badge
	const logic = node.prerequisite_logic || "AND";
	const badge = document.createElement("div");
	badge.className = "node_logic_badge";
	badge.textContent = logic;
	div.appendChild(badge);
	div.classList.add(`logic-${logic.toLowerCase()}`);

	// Status indicator
	const status_indicator = document.createElement("div");
	status_indicator.className = "node_status_indicator";
	div.appendChild(status_indicator);

	// Node type class
	div.classList.add(`type-${node.type || "active"}`);

	// Node content
	if (node.icon) {
		const icon = document.createElement("img");
		icon.className = "node_icon";
		icon.src = node.icon;
		icon.alt = "";
		div.appendChild(icon);
	}

	const name = document.createElement("span");
	name.className = "node_name";
	name.textContent = node.name;
	div.appendChild(name);

	// Rank badge
	if (node.max_rank > 1 || node.current_rank > 0) {
		const rank = document.createElement("span");
		rank.className = "node_rank";
		rank.textContent = `${node.current_rank}/${node.max_rank}`;
		div.appendChild(rank);
	}

	return div;
}

/**
 * Renders the sidebar panels
 */
function render_sidebar(state, elements) {
	const tree = find_tree(state, state.ui_state.active_tree_id);
	const node = state.ui_state.selected_node_id
		? find_node(state, state.ui_state.active_tree_id, state.ui_state.selected_node_id)
		: null;

	// Show/hide panels based on selection
	elements.tree_properties.classList.toggle("hidden", !tree || node);
	elements.node_properties.classList.toggle("hidden", !node);
	elements.edit_tools.classList.toggle("hidden", state.ui_state.mode !== "edit");

	// Populate tree properties
	if (tree && !node) {
		elements.tree_name.value = tree.name;
		elements.tree_description.value = tree.description;
		elements.tree_points.value = tree.point_pool.total;
		elements.export_convention.value = state.project.metadata.export_convention || "snake_case";

		// Check for validation warnings
		render_tree_warnings(state, tree, elements);
	}

	// Populate node properties
	if (node) {
		elements.node_name.value = node.name;
		elements.node_description.value = node.description;
		elements.node_max_rank.value = node.max_rank;
		elements.node_type.value = node.type;
		elements.node_costs.value = node.cost_per_rank.join(", ");

		// Prerequisite logic
		elements.node_prereq_logic.value = node.prerequisite_logic || "AND";
		elements.node_prereq_threshold.value = node.prerequisite_threshold || 1;
		elements.group_node_threshold.classList.toggle("hidden", node.prerequisite_logic !== "SUM");

		// Event string
		elements.node_event.value = node.event || "";
	}
}

/**
 * Renders validation warnings for the tree
 * @param {object} state - Current application state
 * @param {object} tree - Tree object
 * @param {object} elements - DOM elements
 */
function render_tree_warnings(state, tree, elements) {
	const warnings = [];

	if (tree.nodes.length > 1) {
		// Root nodes are OK (nodes with no prerequisites)
		// Orphans are non-root nodes with no connections TO them
		const orphans = tree.nodes.filter(node => {
			const is_prerequisite = tree.connections.some(c => c.from_node_id === node.id);
			const has_no_incoming = !tree.connections.some(c => c.to_node_id === node.id);
			return has_no_incoming && !is_prerequisite && tree.nodes.length > 1;
		});

		orphans.forEach(orphan => {
			warnings.push(`"${orphan.name}" is isolated (no connections)`);
		});

		// Check for unreachable nodes
		const { unreachable } = validation.check_tree_reachability(state, tree.id);
		unreachable.forEach(node_id => {
			const node = find_node(state, tree.id, node_id);
			if (node) {
				// Don't duplicate orphan warnings
				const has_incoming = tree.connections.some(c => c.to_node_id === node_id);
				if (has_incoming) {
					warnings.push(`"${node.name}" is unreachable with current requirements`);
				}
			}
		});
	}

	// Update warnings display
	if (warnings.length > 0) {
		elements.tree_warnings.classList.remove("hidden");
		elements.warning_list.innerHTML = warnings.map(w => `<li>${w}</li>`).join("");
	} else {
		elements.tree_warnings.classList.add("hidden");
		elements.warning_list.innerHTML = "";
	}
}

/**
 * Renders the empty state
 */
function render_empty_state(state, elements) {
	const has_trees = state.project.trees.length > 0;
	elements.empty_state.classList.toggle("hidden", has_trees);
}

/**
 * Updates the tooltip
 */
function render_tooltip(state, node, x, y, elements) {
	const tooltip = elements.tooltip;

	if (!node) {
		tooltip.classList.add("hidden");
		return;
	}

	const tree_id = state.ui_state.active_tree_id;
	const status = get_node_status(state, tree_id, node.id);
	const cost = get_allocation_cost(node);

	elements.tooltip_name.textContent = node.name;
	elements.tooltip_rank.textContent = `${node.current_rank}/${node.max_rank}`;
	elements.tooltip_description.textContent = node.description || "No description";
	elements.tooltip_cost.textContent = node.current_rank < node.max_rank
		? `Next rank costs ${cost} point${cost !== 1 ? "s" : ""}`
		: "Max rank reached";

	const status_messages = {
		[NODE_STATUS.LOCKED]: "🔒 Prerequisites not met",
		[NODE_STATUS.UNLOCKABLE]: "✨ Click to allocate",
		[NODE_STATUS.ACTIVE]: "⬆️ Click to upgrade, Right-click to refund",
		[NODE_STATUS.MAXED]: "⭐ Fully upgraded",
		[NODE_STATUS.INVALID]: "⚠️ Invalid state"
	};
	elements.tooltip_status.textContent = status_messages[status] || "";

	// Position tooltip
	const padding = 15;
	let tooltip_x = x + padding;
	let tooltip_y = y + padding;

	// Keep tooltip in viewport
	const tooltip_rect = tooltip.getBoundingClientRect();
	const viewport_width = window.innerWidth;
	const viewport_height = window.innerHeight;

	if (tooltip_x + 280 > viewport_width) {
		tooltip_x = x - 280 - padding;
	}
	if (tooltip_y + 200 > viewport_height) {
		tooltip_y = y - 200 - padding;
	}

	tooltip.style.left = `${tooltip_x}px`;
	tooltip.style.top = `${tooltip_y}px`;
	tooltip.classList.remove("hidden");
}

/**
 * Hides the tooltip
 */
function hide_tooltip(elements) {
	elements.tooltip.classList.add("hidden");
}

export {
	render,
	render_tree_selector,
	render_point_display,
	render_mode_toggle,
	render_canvas,
	render_sidebar,
	render_empty_state,
	render_tooltip,
	hide_tooltip
};
