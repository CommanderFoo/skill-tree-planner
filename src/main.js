/**
 * Main Entry Point
 * Initializes the application and wires up all modules
 */

import { create_initial_state, clone_state } from "./state.js";
import * as actions from "./actions.js";
import { save_project, load_project } from "./storage.js";
import { import_project } from "./io.js";
import { render } from "./renderer.js";
import { setup_interactions } from "./interactions.js";

// Application state
let app_state = null;

// DOM element references
let elements = {};

/**
 * Initializes the application
 */
function init() {
	// Cache DOM elements
	elements = cache_elements();

	// Load state from localStorage or create initial
	app_state = load_project();

	// Set up interactions
	setup_interactions(get_state, dispatch, elements);

	// Handle import events
	window.addEventListener("import_project", (event) => {
		const result = import_project(JSON.stringify(event.detail));

		if (result.success) {
			app_state = result.state;
			save_project(app_state);
			render(app_state, elements);

			// Show warnings if any
			if (result.warnings.length > 0) {
				console.warn("Import warnings:", result.warnings);
			}
		} else {
			const error_msg = result.errors.slice(0, 5).join("\n");
			alert("Import failed:\n" + error_msg);
		}
	});

	// Global error handler
	window.addEventListener("error", (event) => {
		console.error("Uncaught error:", event.error);
	});

	window.addEventListener("unhandledrejection", (event) => {
		console.error("Unhandled promise rejection:", event.reason);
	});

	// Initial render
	try {
		render(app_state, elements);
	} catch (error) {
		console.error("Error during initial render:", error);
	}

	console.log("Skill Tree Planner initialized");
}

/**
 * Caches DOM element references
 */
function cache_elements() {
	return {
		// Toolbar
		tree_select: document.getElementById("tree_select"),
		btn_add_tree: document.getElementById("btn_add_tree"),
		points_available: document.getElementById("points_available"),
		points_total: document.getElementById("points_total"),
		btn_mode_edit: document.getElementById("btn_mode_edit"),
		btn_mode_play: document.getElementById("btn_mode_play"),
		btn_zoom_in: document.getElementById("btn_zoom_in"),
		btn_zoom_out: document.getElementById("btn_zoom_out"),
		btn_reset_view: document.getElementById("btn_reset_view"),
		zoom_level: document.getElementById("zoom_level"),
		btn_reset: document.getElementById("btn_reset"),
		btn_export: document.getElementById("btn_export"),
		btn_import: document.getElementById("btn_import"),
		btn_zoom_fit: document.getElementById("btn_zoom_fit"),

		// Canvas
		canvas_container: document.getElementById("canvas_container"),
		connections_layer: document.getElementById("connections_layer"),
		temp_connection_layer: document.getElementById("temp_connection_layer"),
		nodes_layer: document.getElementById("nodes_layer"),
		empty_state: document.getElementById("empty_state"),
		btn_create_first_tree: document.getElementById("btn_create_first_tree"),

		// Sidebar
		sidebar: document.getElementById("sidebar"),
		btn_toggle_sidebar: document.getElementById("btn_toggle_sidebar"),
		btn_show_sidebar: document.getElementById("btn_show_sidebar"),
		tree_properties: document.getElementById("tree_properties"),
		tree_name: document.getElementById("tree_name"),
		tree_description: document.getElementById("tree_description"),
		tree_points: document.getElementById("tree_points"),
		export_convention: document.getElementById("export_convention"),
		tree_warnings: document.getElementById("tree_warnings"),
		warning_list: document.getElementById("warning_list"),
		btn_delete_tree: document.getElementById("btn_delete_tree"),



		node_properties: document.getElementById("node_properties"),
		node_name: document.getElementById("node_name"),
		node_description: document.getElementById("node_description"),
		node_max_rank: document.getElementById("node_max_rank"),
		node_type: document.getElementById("node_type"),
		node_costs: document.getElementById("node_costs"),
		node_event: document.getElementById("node_event"),
		node_prereq_logic: document.getElementById("node_prereq_logic"),
		node_prereq_threshold: document.getElementById("node_prereq_threshold"),
		group_node_threshold: document.getElementById("group_node_threshold"),
		btn_delete_node: document.getElementById("btn_delete_node"),
		connection_panel: document.getElementById("connection_panel"),
		connection_rank: document.getElementById("connection_rank"),
		btn_cancel_connection: document.getElementById("btn_cancel_connection"),
		edit_tools: document.getElementById("edit_tools"),
		btn_add_node: document.getElementById("btn_add_node"),
		btn_connect_mode: document.getElementById("btn_connect_mode"),

		// Tooltip
		tooltip: document.getElementById("tooltip"),
		tooltip_name: document.getElementById("tooltip_name"),
		tooltip_rank: document.getElementById("tooltip_rank"),
		tooltip_description: document.getElementById("tooltip_description"),
		tooltip_cost: document.getElementById("tooltip_cost"),
		tooltip_status: document.getElementById("tooltip_status"),

		// Import Modal
		import_modal: document.getElementById("import_modal"),
		import_json: document.getElementById("import_json"),
		import_dropzone: document.getElementById("import_dropzone"),
		btn_close_import: document.getElementById("btn_close_import"),
		btn_cancel_import: document.getElementById("btn_cancel_import"),
		btn_confirm_import: document.getElementById("btn_confirm_import"),

		// Tree Modal
		tree_modal: document.getElementById("tree_modal"),
		new_tree_name: document.getElementById("new_tree_name"),
		btn_cancel_tree: document.getElementById("btn_cancel_tree"),
		btn_confirm_tree: document.getElementById("btn_confirm_tree")
	};
}

/**
 * Gets the current application state
 */
function get_state() {
	return app_state;
}

/**
 * Dispatches an action and updates the state
 * @param {function} action_fn - Action function to call
 * @param  {...any} args - Arguments to pass to the action
 */
function dispatch(action_fn, ...args) {
	try {
		const new_state = action_fn(app_state, ...args);

		if (new_state !== app_state) {
			app_state = new_state;
			save_project(app_state);
			render(app_state, elements);
		}
	} catch (error) {
		console.error("Error in dispatch:", error);
		console.error("Action:", action_fn.name);
		console.error("Args:", args);
	}
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
	document.addEventListener("DOMContentLoaded", init);
} else {
	init();
}

export { get_state, dispatch };
