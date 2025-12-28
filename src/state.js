/**
 * State Management Module
 * Central state container with immutable state updates
 */

/**
 * Creates the initial application state
 * @returns {object} Fresh application state
 */
function create_initial_state() {
    const now = new Date().toISOString();

    return {
        project: {
            version: "1.0.0",
            metadata: {
                name: "Untitled Project",
                description: "",
                created_at: now,
                modified_at: now,
                export_convention: "snake_case"
            },
            settings: {
                global_point_pool: {
                    enabled: false,
                    total: 0,
                    spent: 0
                },
                allow_refunds: true,
                cascade_refunds: false
            },
            trees: []
        },
        ui_state: {
            active_tree_id: null,
            selected_node_id: null,
            mode: "edit", // "edit" or "play"
            connection_mode: {
                active: false,
                from_node_id: null,
                logic: "AND",
                required_rank: 1
            },
            viewport: {
                x: 0,
                y: 0,
                zoom: 1
            },
            sidebar_open: true,
            tooltip: {
                visible: false,
                node_id: null,
                x: 0,
                y: 0
            }
        },
        history: {
            past: [],
            future: [],
            max_size: 50
        }
    };
}

/**
 * Creates a new tree with default values
 * @param {string} id - Unique tree identifier
 * @param {string} name - Display name
 * @returns {object} New tree object
 */
function create_tree(id, name) {
    return {
        id: id,
        name: name,
        description: "",
        point_pool: {
            total: 20,
            spent: 0,
            source: "local"
        },
        nodes: [],
        connections: []
    };
}

/**
 * Creates a new node with default values
 * @param {string} id - Unique node identifier
 * @param {string} name - Display name
 * @param {number} x - X position
 * @param {number} y - Y position
 * @returns {object} New node object
 */
function create_node(id, name, x, y) {
    return {
        id: id,
        name: name,
        description: "",
        icon: null,
        position: { x: x, y: y },
        max_rank: 1,
        current_rank: 0,
        cost_per_rank: [1],
        tags: [],
        type: "active",
        event: "",
        prerequisite_logic: "AND", // "AND", "OR", "SUM"
        prerequisite_threshold: 1   // Used for SUM logic
    };
}

/**
 * Creates a new connection with default values
 * @param {string} id - Unique connection identifier
 * @param {string} from_node_id - Source node ID
 * @param {string} to_node_id - Target node ID
 * @returns {object} New connection object
 */
function create_connection(id, from_node_id, to_node_id) {
    return {
        id: id,
        from_node_id: from_node_id,
        to_node_id: to_node_id,
        required_rank: 1
    };
}

/**
 * Deep clones a state object to ensure immutability
 * @param {object} state - State to clone
 * @returns {object} Cloned state
 */
function clone_state(state) {
    return JSON.parse(JSON.stringify(state));
}

/**
 * Updates the modified_at timestamp
 * @param {object} state - Current state
 * @returns {object} State with updated timestamp
 */
function touch_modified(state) {
    const new_state = clone_state(state);
    new_state.project.metadata.modified_at = new Date().toISOString();
    return new_state;
}

/**
 * Generates a unique ID
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} Unique identifier
 */
function generate_id(prefix = "") {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Finds a tree by ID
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID to find
 * @returns {object|null} Tree object or null
 */
function find_tree(state, tree_id) {
    return state.project.trees.find(tree => tree.id === tree_id) || null;
}

/**
 * Finds a node by ID within a specific tree
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID containing the node
 * @param {string} node_id - Node ID to find
 * @returns {object|null} Node object or null
 */
function find_node(state, tree_id, node_id) {
    const tree = find_tree(state, tree_id);
    if (!tree) {
        return null;
    }
    return tree.nodes.find(node => node.id === node_id) || null;
}

/**
 * Finds a connection by ID within a specific tree
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID containing the connection
 * @param {string} connection_id - Connection ID to find
 * @returns {object|null} Connection object or null
 */
function find_connection(state, tree_id, connection_id) {
    const tree = find_tree(state, tree_id);
    if (!tree) {
        return null;
    }
    return tree.connections.find(conn => conn.id === connection_id) || null;
}

/**
 * Gets the index of a tree in the trees array
 * @param {object} state - Current state
 * @param {string} tree_id - Tree ID to find
 * @returns {number} Index or -1 if not found
 */
function get_tree_index(state, tree_id) {
    return state.project.trees.findIndex(tree => tree.id === tree_id);
}

/**
 * Gets the index of a node in a tree's nodes array
 * @param {object} tree - Tree object
 * @param {string} node_id - Node ID to find
 * @returns {number} Index or -1 if not found
 */
function get_node_index(tree, node_id) {
    return tree.nodes.findIndex(node => node.id === node_id);
}

/**
 * Gets the index of a connection in a tree's connections array
 * @param {object} tree - Tree object
 * @param {string} connection_id - Connection ID to find
 * @returns {number} Index or -1 if not found
 */
function get_connection_index(tree, connection_id) {
    return tree.connections.findIndex(conn => conn.id === connection_id);
}

export {
    create_initial_state,
    create_tree,
    create_node,
    create_connection,
    clone_state,
    touch_modified,
    generate_id,
    find_tree,
    find_node,
    find_connection,
    get_tree_index,
    get_node_index,
    get_connection_index
};
