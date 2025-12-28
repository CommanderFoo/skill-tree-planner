/**
 * Storage Module
 * LocalStorage persistence with schema versioning and migration
 */

import { create_initial_state, clone_state } from "./state.js";

const STORAGE_KEY = "skill_tree_planner_project";
const CURRENT_VERSION = "1.0.0";

/**
 * Saves the project state to localStorage
 * @param {object} state - Current application state
 * @returns {boolean} True if save succeeded
 */
function save_project(state) {
	try {
		const data = {
			version: CURRENT_VERSION,
			project: state.project,
			ui_state: {
				active_tree_id: state.ui_state.active_tree_id,
				mode: state.ui_state.mode,
				viewport: state.ui_state.viewport,
				sidebar_open: state.ui_state.sidebar_open
			}
		};

		const json = JSON.stringify(data);
		localStorage.setItem(STORAGE_KEY, json);

		return true;
	} catch (error) {
		console.error("Failed to save project:", error);
		return false;
	}
}

/**
 * Loads the project state from localStorage
 * @returns {object} Loaded state or initial state if no saved data
 */
function load_project() {
	try {
		const json = localStorage.getItem(STORAGE_KEY);

		if (!json) {
			return create_initial_state();
		}

		const data = JSON.parse(json);

		// Validate basic structure
		if (!data || typeof data !== "object") {
			console.warn("Invalid saved data, using initial state");
			return create_initial_state();
		}

		// Check and migrate version if needed
		const migrated = migrate_if_needed(data);

		// Merge with initial state to ensure all fields exist
		const initial = create_initial_state();
		const state = clone_state(initial);

		// Apply saved project data
		if (migrated.project) {
			state.project = migrated.project;
		}

		// Apply saved UI state (partial)
		if (migrated.ui_state) {
			if (migrated.ui_state.active_tree_id !== undefined) {
				state.ui_state.active_tree_id = migrated.ui_state.active_tree_id;
			}
			if (migrated.ui_state.mode !== undefined) {
				state.ui_state.mode = migrated.ui_state.mode;
			}
			if (migrated.ui_state.viewport) {
				state.ui_state.viewport = {
					...state.ui_state.viewport,
					...migrated.ui_state.viewport
				};
			}
			if (migrated.ui_state.sidebar_open !== undefined) {
				state.ui_state.sidebar_open = migrated.ui_state.sidebar_open;
			}
		}

		// Validate active tree exists
		if (state.ui_state.active_tree_id) {
			const tree_exists = state.project.trees.some(
				t => t.id === state.ui_state.active_tree_id
			);
			if (!tree_exists) {
				state.ui_state.active_tree_id = state.project.trees[0]?.id || null;
			}
		}

		return state;
	} catch (error) {
		console.error("Failed to load project:", error);
		return create_initial_state();
	}
}

/**
 * Checks if migration is needed and performs it
 * @param {object} data - Raw saved data
 * @returns {object} Migrated data
 */
function migrate_if_needed(data) {
	const version = data.version || "0.0.0";

	if (version === CURRENT_VERSION) {
		return data;
	}

	console.log(`Migrating from version ${version} to ${CURRENT_VERSION}`);

	let migrated = clone_state(data);

	// Add migration steps here as versions evolve
	// Example:
	// if (compare_versions(version, "1.1.0") < 0) {
	//     migrated = migrate_to_1_1_0(migrated);
	// }

	migrated.version = CURRENT_VERSION;

	return migrated;
}

/**
 * Compares two semantic version strings
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compare_versions(v1, v2) {
	const parts1 = v1.split(".").map(Number);
	const parts2 = v2.split(".").map(Number);

	for (let i = 0; i < 3; i++) {
		const p1 = parts1[i] || 0;
		const p2 = parts2[i] || 0;

		if (p1 < p2) {
			return -1;
		}
		if (p1 > p2) {
			return 1;
		}
	}

	return 0;
}

/**
 * Clears all saved data
 * @returns {boolean} True if clear succeeded
 */
function clear_saved_data() {
	try {
		localStorage.removeItem(STORAGE_KEY);
		return true;
	} catch (error) {
		console.error("Failed to clear saved data:", error);
		return false;
	}
}

/**
 * Checks if there is saved data
 * @returns {boolean} True if saved data exists
 */
function has_saved_data() {
	try {
		return localStorage.getItem(STORAGE_KEY) !== null;
	} catch (error) {
		return false;
	}
}

/**
 * Exports the current state as a JSON string
 * @param {object} state - Current application state
 * @param {object} options - Export options { pretty, include_ui_state }
 * @returns {string} JSON string of the project
 */
function export_to_json(state, options = {}) {
	const data = {
		version: CURRENT_VERSION,
		project: state.project
	};

	if (options.include_ui_state) {
		data.ui_state = state.ui_state;
	}

	if (options.pretty) {
		return JSON.stringify(data, null, 2);
	}

	return JSON.stringify(data);
}

/**
 * Imports a project from a JSON string
 * @param {string} json - JSON string to import
 * @returns {object} Result { success, state, error }
 */
function import_from_json(json) {
	try {
		const data = JSON.parse(json);

		if (!data || typeof data !== "object") {
			return {
				success: false,
				state: null,
				error: "Invalid JSON structure"
			};
		}

		if (!data.project) {
			return {
				success: false,
				state: null,
				error: "Missing project data"
			};
		}

		// Migrate if needed
		const migrated = migrate_if_needed(data);

		// Create state from imported data
		const initial = create_initial_state();
		const state = clone_state(initial);
		state.project = migrated.project;

		// Set active tree to first tree if available
		if (state.project.trees.length > 0) {
			state.ui_state.active_tree_id = state.project.trees[0].id;
		}

		return {
			success: true,
			state: state,
			error: null
		};
	} catch (error) {
		return {
			success: false,
			state: null,
			error: error.message
		};
	}
}

export {
	save_project,
	load_project,
	clear_saved_data,
	has_saved_data,
	export_to_json,
	import_from_json,
	CURRENT_VERSION
};
