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
 * Renders the point display (or resources display)
 */
function render_point_display(state, elements) {
	const tree = find_tree(state, state.ui_state.active_tree_id);

	if (!tree) {
		elements.points_available.textContent = "0";
		elements.points_total.textContent = "0";
		elements.point_display.classList.remove("hidden");
		elements.resources_display.classList.add("hidden");
		return;
	}

	if (tree.cost_mode === "resources") {
		// Show resources display, hide points display
		elements.point_display.classList.add("hidden");
		elements.resources_display.classList.remove("hidden");

		// Render resources
		elements.resources_display.innerHTML = "";
		for (const resource of tree.resources) {
			const available = resource.pool.total - resource.pool.spent;
			const item = document.createElement("div");
			item.className = "resource_item";
			item.innerHTML = `
				<span class="resource_indicator" style="background-color: ${resource.icon_color}"></span>
				<span class="resource_name">${resource.name}:</span>
				<span class="resource_value">${available}/${resource.pool.total}</span>
			`;
			elements.resources_display.appendChild(item);
		}

		if (tree.resources.length === 0) {
			elements.resources_display.innerHTML = '<span class="resource_name">No resources defined</span>';
		}
	} else {
		// Show points display, hide resources display
		elements.point_display.classList.remove("hidden");
		elements.resources_display.classList.add("hidden");

		const available = tree.point_pool.total - tree.point_pool.spent;
		elements.points_available.textContent = available.toString();
		elements.points_total.textContent = tree.point_pool.total.toString();
	}
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

	render_grid(state, elements);
	render_connections(state, tree, elements);
	render_nodes(state, tree, elements);
}

/**
 * Renders the grid overlay
 */
function render_grid(state, elements) {
	const svg = elements.grid_layer;
	svg.innerHTML = "";

	if (!state.ui_state.grid.visible) {
		return;
	}

	const vp = state.ui_state.viewport;
	const cell_size = state.ui_state.grid.cell_size;
	const container = elements.canvas_container;
	const rect = container.getBoundingClientRect();

	// Calculate visible area in world coordinates
	const world_width = rect.width / vp.zoom;
	const world_height = rect.height / vp.zoom;
	const world_x = -vp.x / vp.zoom;
	const world_y = -vp.y / vp.zoom;

	// Calculate grid line positions
	const start_x = Math.floor(world_x / cell_size) * cell_size;
	const start_y = Math.floor(world_y / cell_size) * cell_size;
	const end_x = world_x + world_width + cell_size;
	const end_y = world_y + world_height + cell_size;

	// Set SVG size and transform
	svg.style.transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`;
	svg.style.transformOrigin = "0 0";

	// Draw vertical lines
	for (let x = start_x; x <= end_x; x += cell_size) {
		const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
		line.setAttribute("x1", x);
		line.setAttribute("y1", start_y);
		line.setAttribute("x2", x);
		line.setAttribute("y2", end_y);
		line.classList.add("grid_line");
		svg.appendChild(line);
	}

	// Draw horizontal lines
	for (let y = start_y; y <= end_y; y += cell_size) {
		const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
		line.setAttribute("x1", start_x);
		line.setAttribute("y1", y);
		line.setAttribute("x2", end_x);
		line.setAttribute("y2", y);
		line.classList.add("grid_line");
		svg.appendChild(line);
	}
}

/**
 * Renders all connections for a tree
 */
function render_connections(state, tree, elements) {
	const svg = elements.connections_layer;
	svg.innerHTML = "";

	const statuses = get_all_node_statuses(state, tree.id);

	// Helper to check if a node should be hidden (either directly or via a hidden parent)
	const is_node_hidden = (node_id, visited = new Set()) => {
		if (visited.has(node_id)) {
			return false;
		}

		visited.add(node_id);
		const node = tree.nodes.find(n => n.id === node_id);

		if (!node) {
			return false;
		}

		// Check if this node is directly hidden
		if (node.hidden_until_unlockable && statuses[node_id] === "locked") {
			return true;
		}

		// Check if any parent is hidden
		const parent_connections = tree.connections.filter(c => c.to_node_id === node_id);

		for (const conn of parent_connections) {
			if (is_node_hidden(conn.from_node_id, visited)) {
				return true;
			}
		}

		return false;
	};

	for (const conn of tree.connections) {
		const from_node = find_node(state, tree.id, conn.from_node_id);
		const to_node = find_node(state, tree.id, conn.to_node_id);

		if (!from_node || !to_node) {
			continue;
		}

		// In play mode, skip connections involving hidden nodes
		if (state.ui_state.mode === "play") {
			if (is_node_hidden(from_node.id) || is_node_hidden(to_node.id)) {
				continue;
			}
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

	// Helper to check if a node should be hidden (either directly or via a hidden parent)
	const is_node_hidden = (node_id, visited = new Set()) => {
		if (visited.has(node_id)) {
			return false;
		}

		visited.add(node_id);
		const node = tree.nodes.find(n => n.id === node_id);

		if (!node) {
			return false;
		}

		// Check if this node is directly hidden
		if (node.hidden_until_unlockable && statuses[node_id] === "locked") {
			return true;
		}

		// Check if any parent is hidden
		const parent_connections = tree.connections.filter(c => c.to_node_id === node_id);

		for (const conn of parent_connections) {
			if (is_node_hidden(conn.from_node_id, visited)) {
				return true;
			}
		}

		return false;
	};

	for (const node of tree.nodes) {
		const status = statuses[node.id];

		// In play mode, skip nodes that are hidden (directly or via parent)
		if (state.ui_state.mode === "play" && is_node_hidden(node.id)) {
			continue;
		}

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

		// Cost mode
		elements.tree_cost_mode.value = tree.cost_mode || "skill_points";

		// Show/hide cost sections based on mode
		const is_resources_mode = tree.cost_mode === "resources";
		elements.skill_points_section.classList.toggle("hidden", is_resources_mode);
		elements.resources_section.classList.toggle("hidden", !is_resources_mode);

		// Render resources list
		if (is_resources_mode) {
			render_resources_list(tree, elements);
		}

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

		// Hidden until unlockable
		elements.node_hidden_until.checked = node.hidden_until_unlockable || false;

		// Metadata
		elements.node_metadata.value = node.metadata || "";

		// Show/hide cost sections based on tree's cost mode
		const is_resources_mode = tree && tree.cost_mode === "resources";
		elements.node_costs_section.classList.toggle("hidden", is_resources_mode);
		elements.node_resource_costs_section.classList.toggle("hidden", !is_resources_mode);

		// Render resource costs editor
		if (is_resources_mode && tree) {
			render_node_resource_costs(state, tree, node, elements);
		}
	}
}

/**
 * Renders the resources list in tree properties
 * @param {object} tree - Tree object
 * @param {object} elements - DOM elements
 */
function render_resources_list(tree, elements) {
	const list = elements.resources_list;
	list.innerHTML = "";

	for (const resource of tree.resources) {
		const row = document.createElement("div");
		row.className = "resource_row";
		row.dataset.resource_id = resource.id;

		const available = resource.pool.total - resource.pool.spent;
		row.innerHTML = `
			<span class="resource_indicator" style="background-color: ${resource.icon_color}"></span>
			<div class="resource_info">
				<div class="resource_name">${resource.name}</div>
				<div class="resource_pool">${available} / ${resource.pool.total} available</div>
			</div>
			<div class="resource_actions">
				<button class="btn btn_icon_small btn_edit_resource" title="Edit resource">
					<svg viewBox="0 0 24 24" width="14" height="14">
						<path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
					</svg>
				</button>
				<button class="btn btn_icon_small btn_danger btn_delete_resource" title="Delete resource">
					<svg viewBox="0 0 24 24" width="14" height="14">
						<path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
					</svg>
				</button>
			</div>
		`;
		list.appendChild(row);
	}

	if (tree.resources.length === 0) {
		const empty = document.createElement("div");
		empty.className = "form_hint";
		empty.textContent = "No resources defined. Click 'Add Resource' to create one.";
		list.appendChild(empty);
	}
}

/**
 * Renders the resource costs editor for a node
 * @param {object} state - Current application state
 * @param {object} tree - Tree object
 * @param {object} node - Node object
 * @param {object} elements - DOM elements
 */
function render_node_resource_costs(state, tree, node, elements) {
	const container = elements.node_resource_costs;
	container.innerHTML = "";

	if (tree.resources.length === 0) {
		const hint = document.createElement("div");
		hint.className = "form_hint";
		hint.textContent = "Add resources to the tree first.";
		container.appendChild(hint);
		return;
	}

	// Create cost editor for each rank
	for (let rank = 0; rank < node.max_rank; rank++) {
		const rank_row = document.createElement("div");
		rank_row.className = "rank_cost_row";

		const header = document.createElement("div");
		header.className = "rank_cost_header";
		header.textContent = `Rank ${rank + 1}`;
		rank_row.appendChild(header);

		const inputs = document.createElement("div");
		inputs.className = "rank_cost_inputs";

		for (const resource of tree.resources) {
			// Get current cost for this resource at this rank
			const rank_costs = node.resource_costs && node.resource_costs[rank] ? node.resource_costs[rank] : [];
			const cost_entry = rank_costs.find(c => c.resource_id === resource.id);
			const current_amount = cost_entry ? cost_entry.amount : 0;

			const input_row = document.createElement("div");
			input_row.className = "rank_cost_input_row";
			input_row.innerHTML = `
				<span class="resource_indicator" style="background-color: ${resource.icon_color}"></span>
				<span class="resource_label">${resource.name}</span>
				<input type="number" class="input resource_cost_input"
					data-rank="${rank}"
					data-resource_id="${resource.id}"
					min="0"
					value="${current_amount}">
			`;
			inputs.appendChild(input_row);
		}

		rank_row.appendChild(inputs);
		container.appendChild(rank_row);
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
	const tree = find_tree(state, tree_id);
	const status = get_node_status(state, tree_id, node.id);

	elements.tooltip_name.textContent = node.name;
	elements.tooltip_rank.textContent = `${node.current_rank}/${node.max_rank}`;
	elements.tooltip_description.textContent = node.description || "No description";

	// Show cost based on cost mode
	if (node.current_rank >= node.max_rank) {
		elements.tooltip_cost.textContent = "Max rank reached";
	} else if (tree && tree.cost_mode === "resources") {
		// Show resource costs
		const rank_index = node.current_rank;
		const rank_costs = node.resource_costs && node.resource_costs[rank_index]
			? node.resource_costs[rank_index]
			: [];

		if (rank_costs.length === 0) {
			elements.tooltip_cost.textContent = "Next rank: Free";
		} else {
			const cost_strings = rank_costs.map(cost => {
				const resource = tree.resources.find(r => r.id === cost.resource_id);
				return resource ? `${cost.amount} ${resource.name}` : `${cost.amount} ???`;
			});
			elements.tooltip_cost.textContent = `Next rank: ${cost_strings.join(", ")}`;
		}
	} else {
		const cost = get_allocation_cost(node);
		elements.tooltip_cost.textContent = `Next rank costs ${cost} point${cost !== 1 ? "s" : ""}`;
	}

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
