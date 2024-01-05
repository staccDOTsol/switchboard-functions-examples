module switchboard::node {
    use switchboard::switchboard::{Self, AdminCap};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use switchboard_std::errors;

    friend switchboard::quote_update_action;
    friend switchboard::node_heartbeat_action;
    friend switchboard::quote_verify_action;
    friend switchboard::quote_init_action;
    friend switchboard::quote_force_override_action;
    friend switchboard::node_init_action;

    struct Node has key {
        id: UID,
        authority: address,
        owner: address,
        queue_addr: address,
        last_heartbeat: u64,
        version: u64,
    }

    public(friend) fun new(authority: address, owner: address, queue: address, ctx: &mut TxContext): Node {
        Node {
            id: object::new(ctx),
            authority: authority,
            queue_addr: queue,
            last_heartbeat: 0,
            owner,
            version: switchboard::version(),
        }
    }

    public fun authority(node: &Node): address {
        node.authority
    }

    public fun queue_addr(node: &Node): address {
        node.queue_addr
    }

    public fun last_heartbeat(node: &Node): u64 {
        node.last_heartbeat
    }

    public fun node_address(node: &Node): address {
        object::uid_to_address(&node.id)
    }

    public fun owner(node: &Node): address {
        node.owner
    }

    public fun has_authority(node: &Node, ctx: &TxContext): bool {
        node.authority == tx_context::sender(ctx)
    }

    public fun share_node(node: Node) {
        transfer::share_object(node);
    }

    public(friend) fun set_last_heartbeat(node: &mut Node, last_heartbeat: u64) {
        assert!(node.version == switchboard::version(), errors::InvalidVersion());
        node.last_heartbeat = last_heartbeat;
    }

    // Migrate to new version of switchboard
    entry fun migrate(node: &mut Node, _cap: &AdminCap) {
        assert!(node.version < switchboard::version(), errors::InvalidPackage());
        node.version = switchboard::version();
    }
}
