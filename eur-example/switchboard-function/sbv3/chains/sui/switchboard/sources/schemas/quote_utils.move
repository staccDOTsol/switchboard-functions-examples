module switchboard::quote_utils {
    use switchboard::switchboard::{AdminCap};

    friend switchboard::quote_update_action;
    friend switchboard::quote_verify_action;
    friend switchboard::quote_fail_action;
    friend switchboard::quote_init_action;
    friend switchboard::quote_force_override_action;

    struct FriendKey has drop {}

    // Used for package migration / admin ops
    public fun admin_friend_key(_admin_cap: &AdminCap): FriendKey {
        FriendKey {}
    }

    public(friend) fun friend_key(): FriendKey {
        FriendKey {}
    }

    // For package migration only 
    // - must be called once on all existing aggregators to update them. 
    // entry fun migrate_aggregator(
    //     q: &mut Quote, 
    //     _cap: &AdminCap
    // ) {
    //     aggregator::migrate_package(
    //         q, 
    //         &switchboard_v0::quote_utils::admin_friend_key(_cap), 
    //         &friend_key()
    //     );
    // }
}