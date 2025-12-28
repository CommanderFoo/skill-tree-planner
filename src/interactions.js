/**
 * Interactions Module
 * Handles user input and translates to state actions
 */

import { find_tree, find_node } from "./state.js";
import { can_allocate_point, can_refund_point } from "./validation_engine.js";
import * as actions from "./actions.js";
import { render_tooltip, hide_tooltip } from "./renderer.js";
import { calculate_zoom_to_fit, calculate_center_on_node } from "./viewport_utils.js";

// Global interaction state
let hovered_node_id = null;

/**
 * Sets up all event listeners
 * @param {function} get_state - Function to get current state
 * @param {function} dispatch - Function to dispatch actions
 * @param {object} elements - DOM element references
 */
function setup_interactions(get_state, dispatch, elements) {
	setup_node_interactions(get_state, dispatch, elements);
	setup_canvas_interactions(get_state, dispatch, elements);
	setup_toolbar_interactions(get_state, dispatch, elements);
	setup_sidebar_interactions(get_state, dispatch, elements);
	setup_modal_interactions(get_state, dispatch, elements);

	// Global Keyboard Shortcuts
	document.addEventListener("keydown", (event) => {
		// Ignore shortcuts if user is typing in an input
		if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA" || event.target.isContentEditable) {
			return;
		}

		const state = get_state();
		if (state.ui_state.mode !== "edit") {
			return;
		}

		const key = event.key.toLowerCase();

		// 'A' to Add Node
		if (key === "a") {
			event.preventDefault();
			const tree_id = state.ui_state.active_tree_id;
			if (tree_id) {
				// Calculate center of visible canvas area
				const container = elements.canvas_container;
				const rect = container.getBoundingClientRect();
				const vp = state.ui_state.viewport;

				// Convert screen center to canvas coordinates
				const center_x = (rect.width / 2 - vp.x) / vp.zoom - 40; // -40 for half node size
				const center_y = (rect.height / 2 - vp.y) / vp.zoom - 40;

				dispatch(actions.add_node, tree_id, {
					name: "New Skill",
					x: Math.max(0, center_x + (Math.random() - 0.5) * 50),
					y: Math.max(0, center_y + (Math.random() - 0.5) * 50)
				});
			}
		}

		// 'D' to Delete Hovered Node
		if (key === "d" && hovered_node_id) {
			event.preventDefault();
			const tree_id = state.ui_state.active_tree_id;
			const node = find_node(state, tree_id, hovered_node_id);
			if (tree_id && node && confirm(`Delete skill "${node.name}"?`)) {
				dispatch(actions.remove_node, tree_id, hovered_node_id);
				hovered_node_id = null;
				hide_tooltip(elements);
			}
		}

		// 'F' to Zoom to Fit
		if (key === "f") {
			event.preventDefault();
			const state = get_state();
			const tree = find_tree(state, state.ui_state.active_tree_id);
			if (tree) {
				const rect = elements.canvas_container.getBoundingClientRect();
				const new_vp = calculate_zoom_to_fit(tree, rect.width, rect.height);
				dispatch(actions.set_viewport, new_vp);
			}
		}
	});
}

/**
 * Sets up node click and hover handlers
 */
function setup_node_interactions(get_state, dispatch, elements) {
	const nodes_layer = elements.nodes_layer;

	// Click handling (delegated)
	nodes_layer.addEventListener("click", (event) => {
		const node_element = event.target.closest(".skill_node");
		if (!node_element) {
			return;
		}

		const state = get_state();
		const node_id = node_element.dataset.node_id;
		const tree_id = state.ui_state.active_tree_id;

		// Handle connection mode - check if panel is visible (connection mode UI active)
		const connection_panel_visible = !elements.connection_panel.classList.contains("hidden");

		if (connection_panel_visible) {
			const from_id = state.ui_state.connection_mode.from_node_id;

			if (!from_id) {
				// First click: set source node
				dispatch(actions.start_connection_mode, node_id);
				// Update UI to show source selected
				const node = find_node(state, tree_id, node_id);
				if (node) {
					elements.connection_panel.querySelector(".panel_description").textContent =
						`Source: ${node.name}. Now click a target node.`;
				}
			} else if (node_id !== from_id) {
				// Second click: create connection
				dispatch(actions.add_connection, tree_id, {
					from_node_id: from_id,
					to_node_id: node_id,
					logic: state.ui_state.connection_mode.logic,
					required_rank: state.ui_state.connection_mode.required_rank
				});
				dispatch(actions.cancel_connection_mode);
				// Reset UI
				elements.connection_panel.classList.add("hidden");
				elements.edit_tools.classList.remove("hidden");
				elements.btn_connect_mode.classList.remove("active");
				elements.connection_panel.querySelector(".panel_description").textContent =
					"Click a source node, then click a target node to create a dependency.";
			}
			return;
		}

		if (state.ui_state.mode === "edit") {
			// Edit mode: select node
			dispatch(actions.set_selected_node, node_id);
		} else {
			// Play mode: allocate point
			const { can_allocate } = can_allocate_point(state, tree_id, node_id);
			if (can_allocate) {
				dispatch(actions.allocate_point, tree_id, node_id);
			}
		}
	});

	// Right-click handling (refund)
	nodes_layer.addEventListener("contextmenu", (event) => {
		const node_element = event.target.closest(".skill_node");
		if (!node_element) {
			return;
		}

		event.preventDefault();

		const state = get_state();
		const node_id = node_element.dataset.node_id;
		const tree_id = state.ui_state.active_tree_id;

		const { can_refund } = can_refund_point(state, tree_id, node_id);
		if (can_refund) {
			dispatch(actions.refund_point, tree_id, node_id);
		}
	});

	// Hover handling
	nodes_layer.addEventListener("mouseover", (event) => {
		const node_element = event.target.closest(".skill_node");
		if (!node_element) {
			return;
		}

		const state = get_state();
		const node_id = node_element.dataset.node_id;
		hovered_node_id = node_id;

		const tree_id = state.ui_state.active_tree_id;
		const node = find_node(state, tree_id, node_id);

		if (node) {
			render_tooltip(state, node, event.clientX, event.clientY, elements);

			// Highlight parents and children
			const tree = find_tree(state, tree_id);
			if (tree) {
				// Parents
				const parent_ids = tree.connections
					.filter(c => c.to_node_id === node_id)
					.map(c => c.from_node_id);

				// Children
				const child_ids = tree.connections
					.filter(c => c.from_node_id === node_id)
					.map(c => c.to_node_id);

				// Apply classes
				parent_ids.forEach(id => {
					const el = document.querySelector(`.skill_node[data-node_id="${id}"]`);
					if (el) el.classList.add("highlight-parent");
				});
				child_ids.forEach(id => {
					const el = document.querySelector(`.skill_node[data-node_id="${id}"]`);
					if (el) el.classList.add("highlight-child");
				});
			}
		}
	});

	nodes_layer.addEventListener("mouseout", (event) => {
		const node_element = event.target.closest(".skill_node");
		if (node_element && !node_element.contains(event.relatedTarget)) {
			hovered_node_id = null;
			hide_tooltip(elements);

			// Remove highlights
			document.querySelectorAll(".skill_node.highlight-parent, .skill_node.highlight-child").forEach(el => {
				el.classList.remove("highlight-parent", "highlight-child");
			});
		}
	});

	nodes_layer.addEventListener("mousemove", (event) => {
		const node_element = event.target.closest(".skill_node");
		if (node_element) {
			const state = get_state();
			const node_id = node_element.dataset.node_id;
			const tree_id = state.ui_state.active_tree_id;
			const node = find_node(state, tree_id, node_id);

			if (node) {
				render_tooltip(state, node, event.clientX, event.clientY, elements);
			}
		}
	});
}

/**
 * Sets up canvas pan/zoom and node dragging
 */
function setup_canvas_interactions(get_state, dispatch, elements) {
	const container = elements.canvas_container;
	let is_dragging = false;
	let drag_node_id = null;
	let drag_start = { x: 0, y: 0 };
	let node_start = { x: 0, y: 0 };

	// Pan state
	let is_panning = false;
	let pan_start = { x: 0, y: 0 };
	let viewport_start = { x: 0, y: 0 };
	let space_pressed = false;

	// Connection dragging state
	let is_connecting = false;
	let connect_from_node_id = null;
	let temp_connection_line = null;

	// Node dragging (edit mode only) or connection creation (Shift+drag)
	elements.nodes_layer.addEventListener("mousedown", (event) => {
		const state = get_state();
		if (state.ui_state.mode !== "edit") {
			return;
		}

		const node_element = event.target.closest(".skill_node");
		if (!node_element) {
			return;
		}

		if (event.button !== 0) {
			return; // Only left mouse button
		}

		const node_id = node_element.dataset.node_id;
		const tree_id = state.ui_state.active_tree_id;
		const node = find_node(state, tree_id, node_id);

		if (!node) {
			return;
		}

		// Shift+drag starts connection creation
		if (event.shiftKey) {
			is_connecting = true;
			connect_from_node_id = node_id;

			// Create temporary connection line - use node element's center position relative to canvas container
			const container_rect = container.getBoundingClientRect();
			const node_rect = node_element.getBoundingClientRect();

			const start_x = node_rect.left + node_rect.width / 2 - container_rect.left;
			const start_y = node_rect.top + node_rect.height / 2 - container_rect.top;

			temp_connection_line = document.createElementNS("http://www.w3.org/2000/svg", "line");
			temp_connection_line.setAttribute("x1", start_x);
			temp_connection_line.setAttribute("y1", start_y);
			temp_connection_line.setAttribute("x2", start_x);
			temp_connection_line.setAttribute("y2", start_y);
			temp_connection_line.setAttribute("stroke", "#f59e0b");
			temp_connection_line.setAttribute("stroke-width", "3");
			temp_connection_line.setAttribute("stroke-dasharray", "8 4");
			temp_connection_line.style.pointerEvents = "none";
			elements.temp_connection_layer.appendChild(temp_connection_line);

			node_element.classList.add("connecting");
			event.preventDefault();
			return;
		}

		// Calculate drag offset accounting for zoom
		const zoom = state.ui_state.viewport.zoom;

		is_dragging = true;
		drag_node_id = node_id;
		drag_start = { x: event.clientX, y: event.clientY };
		node_start = { x: node.position.x, y: node.position.y };

		node_element.style.cursor = "grabbing";
		event.preventDefault();
	});

	document.addEventListener("mousemove", (event) => {
		// Handle connection dragging
		if (is_connecting && temp_connection_line) {
			const rect = container.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			temp_connection_line.setAttribute("x2", x);
			temp_connection_line.setAttribute("y2", y);
			return;
		}

		// Handle node dragging
		if (is_dragging && drag_node_id) {
			const state = get_state();
			const tree_id = state.ui_state.active_tree_id;
			const zoom = state.ui_state.viewport.zoom;

			const dx = (event.clientX - drag_start.x) / zoom;
			const dy = (event.clientY - drag_start.y) / zoom;

			const new_x = Math.max(0, node_start.x + dx);
			const new_y = Math.max(0, node_start.y + dy);

			dispatch(actions.update_node_position, tree_id, drag_node_id, new_x, new_y);
			return;
		}

		// Handle panning
		if (is_panning) {
			const dx = event.clientX - pan_start.x;
			const dy = event.clientY - pan_start.y;

			dispatch(actions.set_viewport, {
				x: viewport_start.x + dx,
				y: viewport_start.y + dy
			});
		}
	});

	document.addEventListener("mouseup", (event) => {
		// Handle connection creation
		if (is_connecting && connect_from_node_id) {
			// Remove temp line
			if (temp_connection_line) {
				temp_connection_line.remove();
				temp_connection_line = null;
			}

			// Remove connecting class from source node
			const source_element = elements.nodes_layer.querySelector(`[data-node_id="${connect_from_node_id}"]`);
			if (source_element) {
				source_element.classList.remove("connecting");
			}

			// Check if dropped on a node
			const target_element = document.elementFromPoint(event.clientX, event.clientY);
			const target_node = target_element?.closest(".skill_node");

			if (target_node && target_node.dataset.node_id !== connect_from_node_id) {
				const state = get_state();
				const tree_id = state.ui_state.active_tree_id;
				const target_id = target_node.dataset.node_id;
				const tree = state.project.trees.find(t => t.id === tree_id);

				// Check if connection already exists in either direction (prevent circular)
				const connection_exists = tree?.connections.some(c =>
					(c.from_node_id === connect_from_node_id && c.to_node_id === target_id) ||
					(c.from_node_id === target_id && c.to_node_id === connect_from_node_id)
				);

				if (!connection_exists) {
					dispatch(actions.add_connection, tree_id, {
						from_node_id: connect_from_node_id,
						to_node_id: target_id,
						logic: "AND",
						required_rank: 1
					});
				}
			}

			is_connecting = false;
			connect_from_node_id = null;
		}

		if (is_dragging) {
			is_dragging = false;
			drag_node_id = null;
		}
		if (is_panning) {
			is_panning = false;
			container.style.cursor = "";
		}
	});

	// Pan with middle mouse button or space+left click
	container.addEventListener("mousedown", (event) => {
		// Middle mouse button or space+left click
		if (event.button === 1 || (event.button === 0 && space_pressed)) {
			event.preventDefault();
			const state = get_state();

			is_panning = true;
			pan_start = { x: event.clientX, y: event.clientY };
			viewport_start = {
				x: state.ui_state.viewport.x,
				y: state.ui_state.viewport.y
			};
			container.style.cursor = "grabbing";
		}
	});

	// Track space key for pan mode
	document.addEventListener("keydown", (event) => {
		if (event.code === "Space" && !event.repeat) {
			space_pressed = true;
			container.style.cursor = "grab";
		}
	});

	document.addEventListener("keyup", (event) => {
		if (event.code === "Space") {
			space_pressed = false;
			if (!is_panning) {
				container.style.cursor = "";
			}
		}
	});

	// Zoom with mouse wheel
	container.addEventListener("wheel", (event) => {
		event.preventDefault();

		const state = get_state();
		const current_zoom = state.ui_state.viewport.zoom;

		// Zoom factor
		const delta = event.deltaY > 0 ? 0.9 : 1.1;
		const new_zoom = Math.max(0.25, Math.min(3, current_zoom * delta));

		// Get mouse position relative to container
		const rect = container.getBoundingClientRect();
		const mouse_x = event.clientX - rect.left;
		const mouse_y = event.clientY - rect.top;

		// Calculate new viewport position to zoom towards cursor
		const vp = state.ui_state.viewport;
		const scale_change = new_zoom / current_zoom;

		const new_x = mouse_x - (mouse_x - vp.x) * scale_change;
		const new_y = mouse_y - (mouse_y - vp.y) * scale_change;

		dispatch(actions.set_viewport, {
			x: new_x,
			y: new_y,
			zoom: new_zoom
		});
	}, { passive: false });

	// Click on canvas to deselect
	container.addEventListener("click", (event) => {
		if (event.target === container || event.target === elements.nodes_layer) {
			const state = get_state();
			if (state.ui_state.selected_node_id) {
				dispatch(actions.set_selected_node, null);
			}
		}
	});

	// Click on connection to delete it
	elements.connections_layer.addEventListener("click", (event) => {
		const path = event.target.closest(".connection_path");
		if (!path) {
			return;
		}

		const state = get_state();
		if (state.ui_state.mode !== "edit") {
			return;
		}

		const connection_id = path.dataset.connection_id;
		const tree_id = state.ui_state.active_tree_id;

		// Delete without confirmation for a smoother UX
		dispatch(actions.remove_connection, tree_id, connection_id);
	});
}

/**
 * Sets up toolbar button handlers
 */
function setup_toolbar_interactions(get_state, dispatch, elements) {
	// Tree selector
	elements.tree_select.addEventListener("change", (event) => {
		dispatch(actions.set_active_tree, event.target.value);
	});

	// Add tree button
	elements.btn_add_tree.addEventListener("click", () => {
		show_modal(elements.tree_modal);
		elements.new_tree_name.value = "";
		elements.new_tree_name.focus();
	});

	// Mode toggle
	elements.btn_mode_edit.addEventListener("click", () => {
		dispatch(actions.set_mode, "edit");
	});

	elements.btn_mode_play.addEventListener("click", () => {
		dispatch(actions.set_mode, "play");
	});

	// Zoom controls
	elements.btn_zoom_in.addEventListener("click", () => {
		const state = get_state();
		const new_zoom = Math.min(3, state.ui_state.viewport.zoom * 1.25);
		dispatch(actions.set_viewport, { zoom: new_zoom });
	});

	elements.btn_zoom_out.addEventListener("click", () => {
		const state = get_state();
		const new_zoom = Math.max(0.25, state.ui_state.viewport.zoom * 0.8);
		dispatch(actions.set_viewport, { zoom: new_zoom });
	});

	elements.btn_reset_view.addEventListener("click", () => {
		dispatch(actions.set_viewport, { x: 0, y: 0, zoom: 1 });
	});

	elements.btn_zoom_fit.addEventListener("click", () => {
		const state = get_state();
		const tree = find_tree(state, state.ui_state.active_tree_id);
		if (tree) {
			const rect = elements.canvas_container.getBoundingClientRect();
			const new_vp = calculate_zoom_to_fit(tree, rect.width, rect.height);
			dispatch(actions.set_viewport, new_vp);
		}
	});

	// Reset button
	elements.btn_reset.addEventListener("click", () => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		if (tree_id && confirm("Reset all points in this tree?")) {
			dispatch(actions.reset_tree, tree_id);
		}
	});

	// Export button
	elements.btn_export.addEventListener("click", () => {
		const state = get_state();
		const convention = state.project.metadata.export_convention || "snake_case";

		let project_data = JSON.parse(JSON.stringify(state.project));

		if (convention !== "snake_case") {
			project_data = convert_keys(project_data, convention);
		}

		// Use tree name for filename and internal metadata
		const tree = state.project.trees.find(t => t.id === state.ui_state.active_tree_id);
		const tree_name = tree ? tree.name : "skill_tree";
		project_data.metadata.name = tree_name;

		const json = JSON.stringify({
			version: "1.0.0",
			project: project_data
		}, null, 2);

		const blob = new Blob([json], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;

		const filename = tree_name.replace(/\s+/g, "_");
		a.download = `${filename}.json`;
		a.click();
		URL.revokeObjectURL(url);
	});

	// Import button
	elements.btn_import.addEventListener("click", () => {
		show_modal(elements.import_modal);
		elements.import_json.value = "";
	});
}

/**
 * Sets up sidebar form handlers
 */
function setup_sidebar_interactions(get_state, dispatch, elements) {
	// Tree properties
	elements.tree_name.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		if (tree_id) {
			dispatch(actions.update_tree, tree_id, { name: event.target.value });
		}
	});

	elements.tree_description.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		if (tree_id) {
			dispatch(actions.update_tree, tree_id, { description: event.target.value });
		}
	});

	elements.tree_points.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		if (tree_id) {
			dispatch(actions.update_tree, tree_id, { total_points: parseInt(event.target.value, 10) || 0 });
		}
	});

	elements.export_convention.addEventListener("change", (event) => {
		dispatch(actions.update_project_metadata, { export_convention: event.target.value });
	});

	elements.btn_delete_tree.addEventListener("click", () => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		if (tree_id && confirm("Delete this skill tree?")) {
			dispatch(actions.remove_tree, tree_id);
		}
	});

	// Node properties
	elements.node_name.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id) {
			dispatch(actions.update_node, tree_id, node_id, { name: event.target.value });
		}
	});

	elements.node_description.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id) {
			dispatch(actions.update_node, tree_id, node_id, { description: event.target.value });
		}
	});

	elements.node_max_rank.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id) {
			dispatch(actions.update_node, tree_id, node_id, { max_rank: parseInt(event.target.value, 10) || 1 });
		}
	});

	elements.node_type.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id) {
			dispatch(actions.update_node, tree_id, node_id, { type: event.target.value });
		}
	});

	elements.node_prereq_logic.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id) {
			dispatch(actions.update_node, tree_id, node_id, { prerequisite_logic: event.target.value });
		}
	});

	elements.node_prereq_threshold.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id) {
			dispatch(actions.update_node, tree_id, node_id, { prerequisite_threshold: parseInt(event.target.value, 10) || 1 });
		}
	});

	elements.node_costs.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id) {
			const values = event.target.value.split(",").map(v => parseInt(v.trim(), 10));
			if (values.every(v => !isNaN(v))) {
				dispatch(actions.update_node, tree_id, node_id, { cost_per_rank: values });
			}
		}
	});

	elements.node_event.addEventListener("change", (event) => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id) {
			dispatch(actions.update_node, tree_id, node_id, { event: event.target.value });
		}
	});

	elements.btn_delete_node.addEventListener("click", () => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		const node_id = state.ui_state.selected_node_id;
		if (tree_id && node_id && confirm("Delete this node?")) {
			dispatch(actions.remove_node, tree_id, node_id);
		}
	});

	// Add node button
	elements.btn_add_node.addEventListener("click", () => {
		const state = get_state();
		const tree_id = state.ui_state.active_tree_id;
		if (tree_id) {
			// Calculate center of visible canvas area
			const container = elements.canvas_container;
			const rect = container.getBoundingClientRect();
			const vp = state.ui_state.viewport;

			// Convert screen center to canvas coordinates
			const center_x = (rect.width / 2 - vp.x) / vp.zoom - 40; // -40 for half node size
			const center_y = (rect.height / 2 - vp.y) / vp.zoom - 40;

			dispatch(actions.add_node, tree_id, {
				name: "New Skill",
				x: Math.max(0, center_x + (Math.random() - 0.5) * 50),
				y: Math.max(0, center_y + (Math.random() - 0.5) * 50)
			});
		}
	});

	// Connect nodes button
	elements.btn_connect_mode.addEventListener("click", () => {
		const state = get_state();
		if (state.ui_state.connection_mode.active) {
			// Already in connection mode, cancel it
			dispatch(actions.cancel_connection_mode);
		} else {
			// Show connection panel - user needs to click a source node first
			elements.connection_panel.classList.remove("hidden");
			elements.edit_tools.classList.add("hidden");
			// Visual feedback
			elements.btn_connect_mode.classList.add("active");
		}
	});

	// Cancel connection button
	elements.btn_cancel_connection.addEventListener("click", () => {
		dispatch(actions.cancel_connection_mode);
		elements.connection_panel.classList.add("hidden");
		elements.edit_tools.classList.remove("hidden");
		elements.btn_connect_mode.classList.remove("active");
	});

	// Connection required rank
	elements.connection_rank.addEventListener("change", (event) => {
		const rank = parseInt(event.target.value, 10);
		if (rank >= 1) {
			dispatch(actions.set_connection_settings, { required_rank: rank });
		}
	});

	// Toggle sidebar (hide)
	elements.btn_toggle_sidebar.addEventListener("click", () => {
		elements.sidebar.classList.add("collapsed");
	});

	// Show sidebar (from floating button)
	elements.btn_show_sidebar.addEventListener("click", () => {
		elements.sidebar.classList.remove("collapsed");
	});
}

/**
 * Sets up modal handlers
 */
function setup_modal_interactions(get_state, dispatch, elements) {
	// Tree modal
	elements.btn_confirm_tree.addEventListener("click", () => {
		const name = elements.new_tree_name.value.trim();
		if (name) {
			dispatch(actions.add_tree, { name: name });
			hide_modal(elements.tree_modal);
		}
	});

	elements.btn_cancel_tree.addEventListener("click", () => {
		hide_modal(elements.tree_modal);
	});

	elements.new_tree_name.addEventListener("keypress", (event) => {
		if (event.key === "Enter") {
			elements.btn_confirm_tree.click();
		}
	});

	// Import modal
	elements.btn_confirm_import.addEventListener("click", () => {
		const json = elements.import_json.value.trim();
		if (json) {
			try {
				const data = JSON.parse(json);
				if (data.project) {
					// This requires special handling in main.js
					window.dispatchEvent(new CustomEvent("import_project", { detail: data }));
					hide_modal(elements.import_modal);
				}
			} catch (e) {
				alert("Invalid JSON: " + e.message);
			}
		}
	});

	elements.btn_cancel_import.addEventListener("click", () => {
		hide_modal(elements.import_modal);
	});

	elements.btn_close_import.addEventListener("click", () => {
		hide_modal(elements.import_modal);
	});

	// Create first tree button
	elements.btn_create_first_tree.addEventListener("click", () => {
		show_modal(elements.tree_modal);
		elements.new_tree_name.value = "";
		elements.new_tree_name.focus();
	});

	// Modal backdrop clicks
	document.querySelectorAll(".modal_backdrop").forEach(backdrop => {
		backdrop.addEventListener("click", () => {
			const modal = backdrop.closest(".modal");
			hide_modal(modal);
		});
	});

	// Dropzone for imports
	const dropzone = elements.import_dropzone;

	dropzone.addEventListener("dragover", (event) => {
		event.preventDefault();
		dropzone.classList.add("dragover");
	});

	dropzone.addEventListener("dragleave", () => {
		dropzone.classList.remove("dragover");
	});

	dropzone.addEventListener("drop", (event) => {
		event.preventDefault();
		dropzone.classList.remove("dragover");

		const file = event.dataTransfer.files[0];
		if (file && file.type === "application/json") {
			const reader = new FileReader();
			reader.onload = (e) => {
				elements.import_json.value = e.target.result;
			};
			reader.readAsText(file);
		}
	});
}

/**
 * Recursively converts object keys to a specific naming convention
 */
function convert_keys(obj, convention) {
	if (Array.isArray(obj)) {
		return obj.map(v => convert_keys(v, convention));
	} else if (obj !== null && typeof obj === "object") {
		const new_obj = {};
		for (const key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				const new_key = transform_key(key, convention);
				new_obj[new_key] = convert_keys(obj[key], convention);
			}
		}
		return new_obj;
	}
	return obj;
}

/**
 * Transforms a single string key to the target convention
 */
function transform_key(key, convention) {
	if (convention === "camelCase") {
		return key.replace(/(_\w)/g, m => m[1].toUpperCase());
	} else if (convention === "PascalCase") {
		const camel = key.replace(/(_\w)/g, m => m[1].toUpperCase());
		return camel.charAt(0).toUpperCase() + camel.slice(1);
	}
	return key;
}

/**
 * Shows a modal
 */
function show_modal(modal) {
	modal.classList.remove("hidden");
}

/**
 * Hides a modal
 */
function hide_modal(modal) {
	modal.classList.add("hidden");
}

export {
	setup_interactions,
	show_modal,
	hide_modal
};
