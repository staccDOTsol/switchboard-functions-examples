mod components;

#[starknet::contract]
mod FeedPusher {
    use feed_pusher::components::admin::IAdminLib;
    use super::components::admin::admin_lib as admin_lib;
    use super::components::receiver::receiver_lib as receiver_lib;

    component!(path: admin_lib, storage: admin_lib, event: AdminLibEvent);
    component!(path: receiver_lib, storage: receiver_lib, event: ReceiverLibEvent);

    #[abi(embed_v0)]
    impl AdminImpl = admin_lib::AdminImpl<ContractState>;
    #[abi(embed_v0)]
    impl ReceiverImpl = receiver_lib::ReceiverImpl<ContractState>;

    // ╔═════════════════════════════════════════════╗
    // ║  STORAGE                                    ║
    // ╚═════════════════════════════════════════════╝

    #[storage]
    struct Storage {
        #[substorage(v0)]
        admin_lib: admin_lib::Storage,
        #[substorage(v0)]
        receiver_lib: receiver_lib::Storage
    }

    // ╔═════════════════════════════════════════════╗
    // ║  EVENTS                                     ║
    // ╚═════════════════════════════════════════════╝

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        AdminLibEvent: admin_lib::Event,
        ReceiverLibEvent: receiver_lib::Event,
    }

    // ╔═════════════════════════════════════════════╗
    // ║  CONSTRUCTOR                                ║
    // ╚═════════════════════════════════════════════╝

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.admin_lib.initialize();
    }
}
