use snforge_std::ContractClassTrait;
use snforge_std::declare;
use snforge_std::start_prank;
use starknet::ContractAddress;
use switchboard_contract::contract::ICoreSwitchboardDispatcher;

fn deploy_switchboard(authority: ContractAddress) -> (ContractAddress, ICoreSwitchboardDispatcher) {
    // Precalculate the address that the contract will be deployed to.
    let contract = declare('Switchboard');
    let calldata: @Array::<felt252> = @array![];
    let contract_address = contract.precalculate_address(calldata);
    // Set the caller to be the desired authority for the contract (Caller is set to be the authority in the constructor).
    start_prank(contract_address, authority);
    // Deploy the contract
    let contract_address = contract.deploy(calldata).unwrap();
    let core_dispatcher = ICoreSwitchboardDispatcher { contract_address };
    (contract_address, core_dispatcher)
}
