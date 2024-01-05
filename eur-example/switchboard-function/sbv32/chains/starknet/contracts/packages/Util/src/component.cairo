#[starknet::interface]
trait IUtilLib<TContractState> {
    fn generate_id(ref self: TContractState) -> felt252;
}

#[starknet::component]
mod util_lib {
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        IdGenerated: IdGenerated
    }

    #[derive(Drop, starknet::Event)]
    struct IdGenerated {
        generated: felt252,
    }

    #[storage]
    struct Storage {
        id_nonce: felt252,
    }

    impl UtilLib<
        TContractState, +HasComponent<TContractState>
    > of super::IUtilLib<ComponentState<TContractState>> {
        // Generates a unique ID to be used for a Switchboard struct identifier.
        fn generate_id(ref self: ComponentState<TContractState>) -> felt252 {
            let block_number: felt252 = starknet::get_block_info().unbox().block_number.into();
            let nonce = self.id_nonce.read();
            let generated = super::super::poseidon_hash(array![block_number, nonce]);
            assert(generated != 0, 'InvalidIdGenerated');
            self.id_nonce.write(nonce + 1);

            self.emit(IdGenerated { generated });
            generated
        }
    }
}

