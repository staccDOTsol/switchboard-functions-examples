use starknet::{
    core::types::{BlockId, BlockTag, FieldElement, FunctionCall},
    macros::abigen,
    providers::{Provider, SequencerGatewayProvider},
};

abigen!(Switchboard, "./Switchboard.json");
