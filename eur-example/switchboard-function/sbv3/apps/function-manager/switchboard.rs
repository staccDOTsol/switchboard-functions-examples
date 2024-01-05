pub use switchboard::*;
/// This module was auto-generated with ethers-rs Abigen.
/// More information at: <https://github.com/gakonst/ethers-rs>
#[allow(
    clippy::enum_variant_names,
    clippy::too_many_arguments,
    clippy::upper_case_acronyms,
    clippy::type_complexity,
    dead_code,
    non_camel_case_types,
)]
pub mod switchboard {
    pub use super::super::shared_types::*;
    #[allow(deprecated)]
    fn __abi() -> ::ethers::core::abi::Abi {
        ::ethers::core::abi::ethabi::Contract {
            constructor: ::core::option::Option::Some(::ethers::core::abi::ethabi::Constructor {
                inputs: ::std::vec![
                    ::ethers::core::abi::ethabi::Param {
                        name: ::std::borrow::ToOwned::to_owned("_contractOwner"),
                        kind: ::ethers::core::abi::ethabi::ParamType::Address,
                        internal_type: ::core::option::Option::Some(
                            ::std::borrow::ToOwned::to_owned("address"),
                        ),
                    },
                    ::ethers::core::abi::ethabi::Param {
                        name: ::std::borrow::ToOwned::to_owned("_diamondCutFacet"),
                        kind: ::ethers::core::abi::ethabi::ParamType::Address,
                        internal_type: ::core::option::Option::Some(
                            ::std::borrow::ToOwned::to_owned("address"),
                        ),
                    },
                ],
            }),
            functions: ::std::collections::BTreeMap::new(),
            events: ::core::convert::From::from([
                (
                    ::std::borrow::ToOwned::to_owned("DiamondCut"),
                    ::std::vec![
                        ::ethers::core::abi::ethabi::Event {
                            name: ::std::borrow::ToOwned::to_owned("DiamondCut"),
                            inputs: ::std::vec![
                                ::ethers::core::abi::ethabi::EventParam {
                                    name: ::std::borrow::ToOwned::to_owned("_diamondCut"),
                                    kind: ::ethers::core::abi::ethabi::ParamType::Array(
                                        ::std::boxed::Box::new(
                                            ::ethers::core::abi::ethabi::ParamType::Tuple(
                                                ::std::vec![
                                                    ::ethers::core::abi::ethabi::ParamType::Address,
                                                    ::ethers::core::abi::ethabi::ParamType::Uint(8usize),
                                                    ::ethers::core::abi::ethabi::ParamType::Array(
                                                        ::std::boxed::Box::new(
                                                            ::ethers::core::abi::ethabi::ParamType::FixedBytes(4usize),
                                                        ),
                                                    ),
                                                ],
                                            ),
                                        ),
                                    ),
                                    indexed: false,
                                },
                                ::ethers::core::abi::ethabi::EventParam {
                                    name: ::std::borrow::ToOwned::to_owned("_init"),
                                    kind: ::ethers::core::abi::ethabi::ParamType::Address,
                                    indexed: false,
                                },
                                ::ethers::core::abi::ethabi::EventParam {
                                    name: ::std::borrow::ToOwned::to_owned("_calldata"),
                                    kind: ::ethers::core::abi::ethabi::ParamType::Bytes,
                                    indexed: false,
                                },
                            ],
                            anonymous: false,
                        },
                    ],
                ),
                (
                    ::std::borrow::ToOwned::to_owned("OwnershipTransferred"),
                    ::std::vec![
                        ::ethers::core::abi::ethabi::Event {
                            name: ::std::borrow::ToOwned::to_owned(
                                "OwnershipTransferred",
                            ),
                            inputs: ::std::vec![
                                ::ethers::core::abi::ethabi::EventParam {
                                    name: ::std::borrow::ToOwned::to_owned("previousOwner"),
                                    kind: ::ethers::core::abi::ethabi::ParamType::Address,
                                    indexed: true,
                                },
                                ::ethers::core::abi::ethabi::EventParam {
                                    name: ::std::borrow::ToOwned::to_owned("newOwner"),
                                    kind: ::ethers::core::abi::ethabi::ParamType::Address,
                                    indexed: true,
                                },
                            ],
                            anonymous: false,
                        },
                    ],
                ),
            ]),
            errors: ::core::convert::From::from([
                (
                    ::std::borrow::ToOwned::to_owned("InitializationFunctionReverted"),
                    ::std::vec![
                        ::ethers::core::abi::ethabi::AbiError {
                            name: ::std::borrow::ToOwned::to_owned(
                                "InitializationFunctionReverted",
                            ),
                            inputs: ::std::vec![
                                ::ethers::core::abi::ethabi::Param {
                                    name: ::std::borrow::ToOwned::to_owned(
                                        "_initializationContractAddress",
                                    ),
                                    kind: ::ethers::core::abi::ethabi::ParamType::Address,
                                    internal_type: ::core::option::Option::Some(
                                        ::std::borrow::ToOwned::to_owned("address"),
                                    ),
                                },
                                ::ethers::core::abi::ethabi::Param {
                                    name: ::std::borrow::ToOwned::to_owned("_calldata"),
                                    kind: ::ethers::core::abi::ethabi::ParamType::Bytes,
                                    internal_type: ::core::option::Option::Some(
                                        ::std::borrow::ToOwned::to_owned("bytes"),
                                    ),
                                },
                            ],
                        },
                    ],
                ),
            ]),
            receive: true,
            fallback: true,
        }
    }
    ///The parsed JSON ABI of the contract.
    pub static SWITCHBOARD_ABI: ::ethers::contract::Lazy<::ethers::core::abi::Abi> = ::ethers::contract::Lazy::new(
        __abi,
    );
    #[rustfmt::skip]
    const __BYTECODE: &[u8] = b"`\x80`@R4\x80\x15b\0\0\x11W`\0\x80\xFD[P`@Qb\0\x15\xB78\x03\x80b\0\x15\xB7\x839\x81\x01`@\x81\x90Rb\0\x004\x91b\0\roV[\x81\x81b\0\0A\x82b\0\x01XV[`@\x80Q`\x01\x80\x82R\x81\x83\x01\x90\x92R`\0\x91\x81` \x01[`@\x80Q``\x80\x82\x01\x83R`\0\x80\x83R` \x83\x01R\x91\x81\x01\x91\x90\x91R\x81R` \x01\x90`\x01\x90\x03\x90\x81b\0\0XWPP`@\x80Q`\x01\x80\x82R\x81\x83\x01\x90\x92R\x91\x92P`\0\x91\x90` \x80\x83\x01\x90\x806\x837\x01\x90PP\x90Pc\x1F\x93\x1C\x1C`\xE0\x1B\x81`\0\x81Q\x81\x10b\0\0\xCBWb\0\0\xCBb\0\r\xB2V[`\x01`\x01`\xE0\x1B\x03\x19\x90\x92\x16` \x92\x83\x02\x91\x90\x91\x01\x82\x01R`@\x80Q``\x81\x01\x90\x91R`\x01`\x01`\xA0\x1B\x03\x85\x16\x81R\x90\x81\x01`\0\x81R` \x01\x82\x81RP\x82`\0\x81Q\x81\x10b\0\x01\x1EWb\0\x01\x1Eb\0\r\xB2V[` \x02` \x01\x01\x81\x90RPb\0\x01L\x82`\0`@Q\x80` \x01`@R\x80`\0\x81RPb\0\x01\xDC` \x1B` \x1CV[PPPPPPb\0\x13\xFFV[\x7F\xC8\xFC\xAD\x8D\xB8M<\xC1\x8BLA\xD5Q\xEA\x0E\xE6m\xD5\x99\xCD\xE0h\xD9\x98\xE5}^\t3,\x13 \x80T`\x01`\x01`\xA0\x1B\x03\x19\x81\x16`\x01`\x01`\xA0\x1B\x03\x84\x81\x16\x91\x82\x17\x90\x93U`@Q`\0\x80Q` b\0\x15K\x839\x81Q\x91R\x93\x90\x92\x16\x91\x82\x90\x7F\x8B\xE0\x07\x9CS\x16Y\x14\x13D\xCD\x1F\xD0\xA4\xF2\x84\x19I\x7F\x97\"\xA3\xDA\xAF\xE3\xB4\x18okdW\xE0\x90`\0\x90\xA3PPPV[`\0[\x83Q\x81\x10\x15b\0\x03\xAEW`\0\x84\x82\x81Q\x81\x10b\0\x02\0Wb\0\x02\0b\0\r\xB2V[` \x02` \x01\x01Q` \x01Q\x90P`\0`\x02\x81\x11\x15b\0\x02$Wb\0\x02$b\0\r\xC8V[\x81`\x02\x81\x11\x15b\0\x029Wb\0\x029b\0\r\xC8V[\x03b\0\x02\x97Wb\0\x02\x91\x85\x83\x81Q\x81\x10b\0\x02XWb\0\x02Xb\0\r\xB2V[` \x02` \x01\x01Q`\0\x01Q\x86\x84\x81Q\x81\x10b\0\x02yWb\0\x02yb\0\r\xB2V[` \x02` \x01\x01Q`@\x01Qb\0\x03\xFD` \x1B` \x1CV[b\0\x03\x98V[`\x01\x81`\x02\x81\x11\x15b\0\x02\xAEWb\0\x02\xAEb\0\r\xC8V[\x03b\0\x03\x06Wb\0\x02\x91\x85\x83\x81Q\x81\x10b\0\x02\xCDWb\0\x02\xCDb\0\r\xB2V[` \x02` \x01\x01Q`\0\x01Q\x86\x84\x81Q\x81\x10b\0\x02\xEEWb\0\x02\xEEb\0\r\xB2V[` \x02` \x01\x01Q`@\x01Qb\0\x05\xD0` \x1B` \x1CV[`\x02\x81`\x02\x81\x11\x15b\0\x03\x1DWb\0\x03\x1Db\0\r\xC8V[\x03b\0\x03uWb\0\x02\x91\x85\x83\x81Q\x81\x10b\0\x03<Wb\0\x03<b\0\r\xB2V[` \x02` \x01\x01Q`\0\x01Q\x86\x84\x81Q\x81\x10b\0\x03]Wb\0\x03]b\0\r\xB2V[` \x02` \x01\x01Q`@\x01Qb\0\x07\xAE` \x1B` \x1CV[`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x0E\"V[`@Q\x80\x91\x03\x90\xFD[P\x80b\0\x03\xA5\x81b\0\x0EJV[\x91PPb\0\x01\xDFV[P\x7F\x8F\xAAp\x87\x86q\xCC\xD2\x12\xD2\x07q\xB7\x95\xC5\n\xF8\xFD?\xF6\xCF'\xF4\xBD\xE5~]M\xE0\xAE\xB6s\x83\x83\x83`@Qb\0\x03\xE4\x93\x92\x91\x90b\0\x10KV[`@Q\x80\x91\x03\x90\xA1b\0\x03\xF8\x82\x82b\0\x08\x8DV[PPPV[`\0\x81Q\x11b\0\x04!W`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x10\xCAV[`\0\x80Q` b\0\x15K\x839\x81Q\x91R`\x01`\x01`\xA0\x1B\x03\x83\x16b\0\x04ZW`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x11$V[`\x01`\x01`\xA0\x1B\x03\x83\x16`\0\x90\x81R`\x01\x82\x01` R`@\x81 T\x90`\x01`\x01``\x1B\x03\x82\x16\x90\x03b\0\x04\x93Wb\0\x04\x93\x82\x85b\0\t_V[`\0[\x83Q\x81\x10\x15b\0\x05\xC9W`\0\x84\x82\x81Q\x81\x10b\0\x04\xB7Wb\0\x04\xB7b\0\r\xB2V[` \x90\x81\x02\x91\x90\x91\x01\x81\x01Q`\x01`\x01`\xE0\x1B\x03\x19\x81\x16`\0\x90\x81R\x91\x86\x90R`@\x90\x91 T\x90\x91P`\x01`\x01`\xA0\x1B\x03\x16\x80\x15b\0\x05\nW`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x11\x8FV[`\x01`\x01`\xE0\x1B\x03\x19\x82\x16`\0\x81\x81R` \x87\x81R`@\x80\x83 \x80T`\x01`\x01`\xA0\x1B\x03\x90\x81\x16`\x01`\xA0\x1B`\x01`\x01``\x1B\x03\x8C\x16\x02\x17\x82U\x8C\x16\x80\x85R`\x01\x80\x8C\x01\x85R\x92\x85 \x80T\x93\x84\x01\x81U\x85R\x83\x85 `\x08\x84\x04\x01\x80Tc\xFF\xFF\xFF\xFF`\x07\x90\x95\x16`\x04\x02a\x01\0\n\x94\x85\x02\x19\x16`\xE0\x8A\x90\x1C\x94\x90\x94\x02\x93\x90\x93\x17\x90\x92U\x93\x90\x92R\x87\x90R\x81T`\x01`\x01`\xA0\x1B\x03\x19\x16\x17\x90U\x83b\0\x05\xAE\x81b\0\x11\xA1V[\x94PPPP\x80\x80b\0\x05\xC0\x90b\0\x0EJV[\x91PPb\0\x04\x96V[PPPPPV[`\0\x81Q\x11b\0\x05\xF4W`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x10\xCAV[`\0\x80Q` b\0\x15K\x839\x81Q\x91R`\x01`\x01`\xA0\x1B\x03\x83\x16b\0\x06-W`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x11$V[`\x01`\x01`\xA0\x1B\x03\x83\x16`\0\x90\x81R`\x01\x82\x01` R`@\x81 T\x90`\x01`\x01``\x1B\x03\x82\x16\x90\x03b\0\x06fWb\0\x06f\x82\x85b\0\t_V[`\0[\x83Q\x81\x10\x15b\0\x05\xC9W`\0\x84\x82\x81Q\x81\x10b\0\x06\x8AWb\0\x06\x8Ab\0\r\xB2V[` \x90\x81\x02\x91\x90\x91\x01\x81\x01Q`\x01`\x01`\xE0\x1B\x03\x19\x81\x16`\0\x90\x81R\x91\x86\x90R`@\x90\x91 T\x90\x91P`\x01`\x01`\xA0\x1B\x03\x90\x81\x16\x90\x87\x16\x81\x03b\0\x06\xE2W`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x12\x1FV[b\0\x06\xEF\x85\x82\x84b\0\t\xCCV[`\x01`\x01`\xE0\x1B\x03\x19\x82\x16`\0\x81\x81R` \x87\x81R`@\x80\x83 \x80T`\x01`\x01`\xA0\x1B\x03\x90\x81\x16`\x01`\xA0\x1B`\x01`\x01``\x1B\x03\x8C\x16\x02\x17\x82U\x8C\x16\x80\x85R`\x01\x80\x8C\x01\x85R\x92\x85 \x80T\x93\x84\x01\x81U\x85R\x83\x85 `\x08\x84\x04\x01\x80Tc\xFF\xFF\xFF\xFF`\x07\x90\x95\x16`\x04\x02a\x01\0\n\x94\x85\x02\x19\x16`\xE0\x8A\x90\x1C\x94\x90\x94\x02\x93\x90\x93\x17\x90\x92U\x93\x90\x92R\x87\x90R\x81T`\x01`\x01`\xA0\x1B\x03\x19\x16\x17\x90U\x83b\0\x07\x93\x81b\0\x11\xA1V[\x94PPPP\x80\x80b\0\x07\xA5\x90b\0\x0EJV[\x91PPb\0\x06iV[`\0\x81Q\x11b\0\x07\xD2W`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x10\xCAV[`\0\x80Q` b\0\x15K\x839\x81Q\x91R`\x01`\x01`\xA0\x1B\x03\x83\x16\x15b\0\x08\x0CW`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x12\x8AV[`\0[\x82Q\x81\x10\x15b\0\x08\x87W`\0\x83\x82\x81Q\x81\x10b\0\x080Wb\0\x080b\0\r\xB2V[` \x90\x81\x02\x91\x90\x91\x01\x81\x01Q`\x01`\x01`\xE0\x1B\x03\x19\x81\x16`\0\x90\x81R\x91\x85\x90R`@\x90\x91 T\x90\x91P`\x01`\x01`\xA0\x1B\x03\x16b\0\x08o\x84\x82\x84b\0\t\xCCV[PP\x80\x80b\0\x08~\x90b\0\x0EJV[\x91PPb\0\x08\x0FV[PPPPV[`\x01`\x01`\xA0\x1B\x03\x82\x16b\0\x08\xA0WPPV[b\0\x08\xC5\x82`@Q\x80``\x01`@R\x80`(\x81R` \x01b\0\x15k`(\x919b\0\r\x11V[`\0\x80\x83`\x01`\x01`\xA0\x1B\x03\x16\x83`@Qb\0\x08\xE2\x91\x90b\0\x12\xC1V[`\0`@Q\x80\x83\x03\x81\x85Z\xF4\x91PP=\x80`\0\x81\x14b\0\t\x1FW`@Q\x91P`\x1F\x19`?=\x01\x16\x82\x01`@R=\x82R=`\0` \x84\x01>b\0\t$V[``\x91P[P\x91P\x91P\x81b\0\x08\x87W\x80Q\x15b\0\t@W\x80Q\x80\x82` \x01\xFD[\x83\x83`@Qc\x19!\x05\xD7`\xE0\x1B\x81R`\x04\x01b\0\x03\x8F\x92\x91\x90b\0\x12\xCDV[b\0\t\x84\x81`@Q\x80``\x01`@R\x80`$\x81R` \x01b\0\x15\x93`$\x919b\0\r\x11V[`\x02\x82\x01\x80T`\x01`\x01`\xA0\x1B\x03\x90\x92\x16`\0\x81\x81R`\x01\x94\x85\x01` \x90\x81R`@\x82 \x86\x01\x85\x90U\x94\x84\x01\x83U\x91\x82R\x92\x90 \x01\x80T`\x01`\x01`\xA0\x1B\x03\x19\x16\x90\x91\x17\x90UV[`\x01`\x01`\xA0\x1B\x03\x82\x16b\0\t\xF5W`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x13RV[0`\x01`\x01`\xA0\x1B\x03\x83\x16\x03b\0\n W`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x90b\0\x13\xAEV[`\x01`\x01`\xE0\x1B\x03\x19\x81\x16`\0\x90\x81R` \x84\x81R`@\x80\x83 T`\x01`\x01`\xA0\x1B\x03\x86\x16\x84R`\x01\x80\x88\x01\x90\x93R\x90\x83 T`\x01`\xA0\x1B\x90\x91\x04`\x01`\x01``\x1B\x03\x16\x92\x91b\0\nq\x91b\0\x13\xC0V[\x90P\x80\x82\x14b\0\x0BjW`\x01`\x01`\xA0\x1B\x03\x84\x16`\0\x90\x81R`\x01\x86\x01` R`@\x81 \x80T\x83\x90\x81\x10b\0\n\xAAWb\0\n\xAAb\0\r\xB2V[`\0\x91\x82R` \x80\x83 `\x08\x83\x04\x01T`\x01`\x01`\xA0\x1B\x03\x89\x16\x84R`\x01\x8A\x01\x90\x91R`@\x90\x92 \x80T`\x07\x90\x92\x16`\x04\x02a\x01\0\n\x90\x92\x04`\xE0\x1B\x92P\x82\x91\x90\x85\x90\x81\x10b\0\n\xFEWb\0\n\xFEb\0\r\xB2V[`\0\x91\x82R` \x80\x83 `\x08\x83\x04\x01\x80Tc\xFF\xFF\xFF\xFF`\x07\x90\x94\x16`\x04\x02a\x01\0\n\x93\x84\x02\x19\x16`\xE0\x95\x90\x95\x1C\x92\x90\x92\x02\x93\x90\x93\x17\x90U`\x01`\x01`\xE0\x1B\x03\x19\x92\x90\x92\x16\x82R\x86\x90R`@\x90 \x80T`\x01`\x01`\xA0\x1B\x03\x16`\x01`\xA0\x1B`\x01`\x01``\x1B\x03\x85\x16\x02\x17\x90U[`\x01`\x01`\xA0\x1B\x03\x84\x16`\0\x90\x81R`\x01\x86\x01` R`@\x90 \x80T\x80b\0\x0B\x96Wb\0\x0B\x96b\0\x13\xD6V[`\0\x82\x81R` \x80\x82 `\x08`\0\x19\x90\x94\x01\x93\x84\x04\x01\x80Tc\xFF\xFF\xFF\xFF`\x04`\x07\x87\x16\x02a\x01\0\n\x02\x19\x16\x90U\x91\x90\x92U`\x01`\x01`\xE0\x1B\x03\x19\x85\x16\x82R\x86\x90R`@\x81 \x81\x90U\x81\x90\x03b\0\x05\xC9W`\x02\x85\x01T`\0\x90b\0\x0B\xFC\x90`\x01\x90b\0\x13\xC0V[`\x01`\x01`\xA0\x1B\x03\x86\x16`\0\x90\x81R`\x01\x80\x89\x01` R`@\x90\x91 \x01T\x90\x91P\x80\x82\x14b\0\x0C\xB2W`\0\x87`\x02\x01\x83\x81T\x81\x10b\0\x0C?Wb\0\x0C?b\0\r\xB2V[`\0\x91\x82R` \x90\x91 \x01T`\x02\x89\x01\x80T`\x01`\x01`\xA0\x1B\x03\x90\x92\x16\x92P\x82\x91\x84\x90\x81\x10b\0\x0CsWb\0\x0Csb\0\r\xB2V[`\0\x91\x82R` \x80\x83 \x91\x90\x91\x01\x80T`\x01`\x01`\xA0\x1B\x03\x19\x16`\x01`\x01`\xA0\x1B\x03\x94\x85\x16\x17\x90U\x92\x90\x91\x16\x81R`\x01\x89\x81\x01\x90\x92R`@\x90 \x01\x81\x90U[\x86`\x02\x01\x80T\x80b\0\x0C\xC8Wb\0\x0C\xC8b\0\x13\xD6V[`\0\x82\x81R` \x80\x82 \x83\x01`\0\x19\x90\x81\x01\x80T`\x01`\x01`\xA0\x1B\x03\x19\x16\x90U\x90\x92\x01\x90\x92U`\x01`\x01`\xA0\x1B\x03\x88\x16\x82R`\x01\x89\x81\x01\x90\x91R`@\x82 \x01UPPPPPPPV[\x81;\x81\x81b\0\x08\x87W`@QbF\x1B\xCD`\xE5\x1B\x81R`\x04\x01b\0\x03\x8F\x91\x90b\0\x13\xECV[`\0`\x01`\x01`\xA0\x1B\x03\x82\x16[\x92\x91PPV[b\0\rS\x81b\0\r5V[\x81\x14b\0\r_W`\0\x80\xFD[PV[\x80Qb\0\rB\x81b\0\rHV[`\0\x80`@\x83\x85\x03\x12\x15b\0\r\x87Wb\0\r\x87`\0\x80\xFD[`\0b\0\r\x95\x85\x85b\0\rbV[\x92PP` b\0\r\xA8\x85\x82\x86\x01b\0\rbV[\x91PP\x92P\x92\x90PV[cNH{q`\xE0\x1B`\0R`2`\x04R`$`\0\xFD[cNH{q`\xE0\x1B`\0R`!`\x04R`$`\0\xFD[`'\x81R` \x81\x01\x7FLibDiamondCut: Incorrect FacetCu\x81Rf: \xB1\xBA4\xB7\xB7`\xC9\x1B` \x82\x01R\x90P[`@\x01\x90V[` \x80\x82R\x81\x01b\0\rB\x81b\0\r\xDEV[cNH{q`\xE0\x1B`\0R`\x11`\x04R`$`\0\xFD[`\0`\x01\x82\x01b\0\x0E_Wb\0\x0E_b\0\x0E4V[P`\x01\x01\x90V[b\0\x0Eq\x81b\0\r5V[\x82RPPV[`\x03\x81\x10b\0\r_Wb\0\r_b\0\r\xC8V[\x80b\0\x0E\x96\x81b\0\x0EwV[\x91\x90PV[`\0b\0\rB\x82b\0\x0E\x8AV[b\0\x0Eq\x81b\0\x0E\x9BV[`\x01`\x01`\xE0\x1B\x03\x19\x81\x16b\0\x0EqV[b\0\x0E\xD0\x82\x82b\0\x0E\xB3V[P` \x01\x90V[`\0b\0\x0E\xE2\x82Q\x90V[\x80\x84R` \x93\x84\x01\x93\x83\x01`\0[\x82\x81\x10\x15b\0\x0F\x19W\x81Qb\0\x0F\x07\x87\x82b\0\x0E\xC4V[\x96PP` \x82\x01\x91P`\x01\x01b\0\x0E\xF0V[P\x93\x94\x93PPPPV[\x80Q`\0\x90``\x84\x01\x90b\0\x0F9\x85\x82b\0\x0EfV[P` \x83\x01Qb\0\x0FN` \x86\x01\x82b\0\x0E\xA8V[P`@\x83\x01Q\x84\x82\x03`@\x86\x01Rb\0\x0Fh\x82\x82b\0\x0E\xD7V[\x95\x94PPPPPV[`\0b\0\x0F\x7F\x83\x83b\0\x0F#V[\x93\x92PPPV[`\0b\0\x0F\x91\x82Q\x90V[\x80\x84R` \x84\x01\x93P\x83` \x82\x02\x85\x01b\0\x0F\xAC\x85` \x01\x90V[`\0[\x84\x81\x10\x15b\0\x0F\xE4W\x83\x83\x03\x88R\x81Qb\0\x0F\xCB\x84\x82b\0\x0FqV[\x93PP` \x82\x01` \x98\x90\x98\x01\x97\x91P`\x01\x01b\0\x0F\xAFV[P\x90\x96\x95PPPPPPV[`\0[\x83\x81\x10\x15b\0\x10\rW\x81\x81\x01Q\x83\x82\x01R` \x01b\0\x0F\xF3V[PP`\0\x91\x01RV[`\0b\0\x10!\x82Q\x90V[\x80\x84R` \x84\x01\x93Pb\0\x10:\x81\x85` \x86\x01b\0\x0F\xF0V[`\x1F\x01`\x1F\x19\x16\x92\x90\x92\x01\x92\x91PPV[``\x80\x82R\x81\x01b\0\x10^\x81\x86b\0\x0F\x86V[\x90Pb\0\x10o` \x83\x01\x85b\0\x0EfV[\x81\x81\x03`@\x83\x01Rb\0\x0Fh\x81\x84b\0\x10\x16V[`+\x81R` \x81\x01\x7FLibDiamondCut: No selectors in f\x81Rj\x18X\xD9]\x08\x1D\x1B\xC8\x18\xDD]`\xAA\x1B` \x82\x01R\x90Pb\0\x0E\x1CV[` \x80\x82R\x81\x01b\0\rB\x81b\0\x10\x83V[`,\x81R` \x81\x01\x7FLibDiamondCut: Add facet can't b\x81Rke address(0)`\xA0\x1B` \x82\x01R\x90Pb\0\x0E\x1CV[` \x80\x82R\x81\x01b\0\rB\x81b\0\x10\xDCV[`5\x81R` \x81\x01\x7FLibDiamondCut: Can't add functio\x81R\x7Fn that already exists\0\0\0\0\0\0\0\0\0\0\0` \x82\x01R\x90Pb\0\x0E\x1CV[` \x80\x82R\x81\x01b\0\rB\x81b\0\x116V[`\x01`\x01``\x1B\x03\x16`\0`\x02`\x01``\x1B\x03\x19\x82\x01b\0\x0E_Wb\0\x0E_b\0\x0E4V[`8\x81R` \x81\x01\x7FLibDiamondCut: Can't replace fun\x81R\x7Fction with same function\0\0\0\0\0\0\0\0` \x82\x01R\x90Pb\0\x0E\x1CV[` \x80\x82R\x81\x01b\0\rB\x81b\0\x11\xC6V[`6\x81R` \x81\x01\x7FLibDiamondCut: Remove facet addr\x81R\x7Fess must be address(0)\0\0\0\0\0\0\0\0\0\0` \x82\x01R\x90Pb\0\x0E\x1CV[` \x80\x82R\x81\x01b\0\rB\x81b\0\x121V[`\0b\0\x12\xA7\x82Q\x90V[b\0\x12\xB7\x81\x85` \x86\x01b\0\x0F\xF0V[\x92\x90\x92\x01\x92\x91PPV[b\0\rB\x81\x83b\0\x12\x9CV[`@\x81\x01b\0\x12\xDD\x82\x85b\0\x0EfV[\x81\x81\x03` \x83\x01Rb\0\x12\xF1\x81\x84b\0\x10\x16V[\x94\x93PPPPV[`7\x81R` \x81\x01\x7FLibDiamondCut: Can't remove func\x81R\x7Ftion that doesn't exist\0\0\0\0\0\0\0\0\0` \x82\x01R\x90Pb\0\x0E\x1CV[` \x80\x82R\x81\x01b\0\rB\x81b\0\x12\xF9V[`.\x81R` \x81\x01\x7FLibDiamondCut: Can't remove immu\x81Rm:0\xB162\x903:\xB71\xBA4\xB7\xB7`\x91\x1B` \x82\x01R\x90Pb\0\x0E\x1CV[` \x80\x82R\x81\x01b\0\rB\x81b\0\x13dV[\x81\x81\x03\x81\x81\x11\x15b\0\rBWb\0\rBb\0\x0E4V[cNH{q`\xE0\x1B`\0R`1`\x04R`$`\0\xFD[` \x80\x82R\x81\x01b\0\x0F\x7F\x81\x84b\0\x10\x16V[a\x01<\x80b\0\x14\x0F`\09`\0\xF3\xFE`\x80`@R6a\0\x0BW\0[`\0\x805\x7F\xFF\xFF\xFF\xFF\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x16\x81R\x7F\xC8\xFC\xAD\x8D\xB8M<\xC1\x8BLA\xD5Q\xEA\x0E\xE6m\xD5\x99\xCD\xE0h\xD9\x98\xE5}^\t3,\x13\x1C` \x81\x90R`@\x90\x91 T\x81\x90s\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\x16\x80a\0\xE2W`@Q\x7F\x08\xC3y\xA0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x81R` `\x04\x82\x01\x81\x90R`$\x82\x01R\x7FDiamond: Function does not exist`D\x82\x01R`d\x01`@Q\x80\x91\x03\x90\xFD[6`\0\x807`\0\x806`\0\x84Z\xF4=`\0\x80>\x80\x80\x15a\x01\x01W=`\0\xF3[=`\0\xFD\xFE\xA2dipfsX\"\x12 ;\x16\x86\xECs\xA5a\xF8\xFE\x1F\xFC\x0C\xD1\x05\x01\x8C\xCD\x91\x15\x07\xCF\xF3\x8F\xA4\x11\x8DE\xF6\x7F\xBA\xA6\x91dsolcC\0\x08\x14\x003\xC8\xFC\xAD\x8D\xB8M<\xC1\x8BLA\xD5Q\xEA\x0E\xE6m\xD5\x99\xCD\xE0h\xD9\x98\xE5}^\t3,\x13\x1CLibDiamondCut: _init address has no codeLibDiamondCut: New facet has no code";
    /// The bytecode of the contract.
    pub static SWITCHBOARD_BYTECODE: ::ethers::core::types::Bytes = ::ethers::core::types::Bytes::from_static(
        __BYTECODE,
    );
    #[rustfmt::skip]
    const __DEPLOYED_BYTECODE: &[u8] = b"`\x80`@R6a\0\x0BW\0[`\0\x805\x7F\xFF\xFF\xFF\xFF\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x16\x81R\x7F\xC8\xFC\xAD\x8D\xB8M<\xC1\x8BLA\xD5Q\xEA\x0E\xE6m\xD5\x99\xCD\xE0h\xD9\x98\xE5}^\t3,\x13\x1C` \x81\x90R`@\x90\x91 T\x81\x90s\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\xFF\x16\x80a\0\xE2W`@Q\x7F\x08\xC3y\xA0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\x81R` `\x04\x82\x01\x81\x90R`$\x82\x01R\x7FDiamond: Function does not exist`D\x82\x01R`d\x01`@Q\x80\x91\x03\x90\xFD[6`\0\x807`\0\x806`\0\x84Z\xF4=`\0\x80>\x80\x80\x15a\x01\x01W=`\0\xF3[=`\0\xFD\xFE\xA2dipfsX\"\x12 ;\x16\x86\xECs\xA5a\xF8\xFE\x1F\xFC\x0C\xD1\x05\x01\x8C\xCD\x91\x15\x07\xCF\xF3\x8F\xA4\x11\x8DE\xF6\x7F\xBA\xA6\x91dsolcC\0\x08\x14\x003";
    /// The deployed bytecode of the contract.
    pub static SWITCHBOARD_DEPLOYED_BYTECODE: ::ethers::core::types::Bytes = ::ethers::core::types::Bytes::from_static(
        __DEPLOYED_BYTECODE,
    );
    pub struct Switchboard<M>(::ethers::contract::Contract<M>);
    impl<M> ::core::clone::Clone for Switchboard<M> {
        fn clone(&self) -> Self {
            Self(::core::clone::Clone::clone(&self.0))
        }
    }
    impl<M> ::core::ops::Deref for Switchboard<M> {
        type Target = ::ethers::contract::Contract<M>;
        fn deref(&self) -> &Self::Target {
            &self.0
        }
    }
    impl<M> ::core::ops::DerefMut for Switchboard<M> {
        fn deref_mut(&mut self) -> &mut Self::Target {
            &mut self.0
        }
    }
    impl<M> ::core::fmt::Debug for Switchboard<M> {
        fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
            f.debug_tuple(::core::stringify!(Switchboard))
                .field(&self.address())
                .finish()
        }
    }
    impl<M: ::ethers::providers::Middleware> Switchboard<M> {
        /// Creates a new contract instance with the specified `ethers` client at
        /// `address`. The contract derefs to a `ethers::Contract` object.
        pub fn new<T: Into<::ethers::core::types::Address>>(
            address: T,
            client: ::std::sync::Arc<M>,
        ) -> Self {
            Self(
                ::ethers::contract::Contract::new(
                    address.into(),
                    SWITCHBOARD_ABI.clone(),
                    client,
                ),
            )
        }
        /// Constructs the general purpose `Deployer` instance based on the provided constructor arguments and sends it.
        /// Returns a new instance of a deployer that returns an instance of this contract after sending the transaction
        ///
        /// Notes:
        /// - If there are no constructor arguments, you should pass `()` as the argument.
        /// - The default poll duration is 7 seconds.
        /// - The default number of confirmations is 1 block.
        ///
        ///
        /// # Example
        ///
        /// Generate contract bindings with `abigen!` and deploy a new contract instance.
        ///
        /// *Note*: this requires a `bytecode` and `abi` object in the `greeter.json` artifact.
        ///
        /// ```ignore
        /// # async fn deploy<M: ethers::providers::Middleware>(client: ::std::sync::Arc<M>) {
        ///     abigen!(Greeter, "../greeter.json");
        ///
        ///    let greeter_contract = Greeter::deploy(client, "Hello world!".to_string()).unwrap().send().await.unwrap();
        ///    let msg = greeter_contract.greet().call().await.unwrap();
        /// # }
        /// ```
        pub fn deploy<T: ::ethers::core::abi::Tokenize>(
            client: ::std::sync::Arc<M>,
            constructor_args: T,
        ) -> ::core::result::Result<
            ::ethers::contract::builders::ContractDeployer<M, Self>,
            ::ethers::contract::ContractError<M>,
        > {
            let factory = ::ethers::contract::ContractFactory::new(
                SWITCHBOARD_ABI.clone(),
                SWITCHBOARD_BYTECODE.clone().into(),
                client,
            );
            let deployer = factory.deploy(constructor_args)?;
            let deployer = ::ethers::contract::ContractDeployer::new(deployer);
            Ok(deployer)
        }
        ///Gets the contract's `DiamondCut` event
        pub fn diamond_cut_filter(
            &self,
        ) -> ::ethers::contract::builders::Event<
            ::std::sync::Arc<M>,
            M,
            DiamondCutFilter,
        > {
            self.0.event()
        }
        ///Gets the contract's `OwnershipTransferred` event
        pub fn ownership_transferred_filter(
            &self,
        ) -> ::ethers::contract::builders::Event<
            ::std::sync::Arc<M>,
            M,
            OwnershipTransferredFilter,
        > {
            self.0.event()
        }
        /// Returns an `Event` builder for all the events of this contract.
        pub fn events(
            &self,
        ) -> ::ethers::contract::builders::Event<
            ::std::sync::Arc<M>,
            M,
            SwitchboardEvents,
        > {
            self.0.event_with_filter(::core::default::Default::default())
        }
    }
    impl<M: ::ethers::providers::Middleware> From<::ethers::contract::Contract<M>>
    for Switchboard<M> {
        fn from(contract: ::ethers::contract::Contract<M>) -> Self {
            Self::new(contract.address(), contract.client())
        }
    }
    ///Custom Error type `InitializationFunctionReverted` with signature `InitializationFunctionReverted(address,bytes)` and selector `0x192105d7`
    #[derive(
        Clone,
        ::ethers::contract::EthError,
        ::ethers::contract::EthDisplay,
        Default,
        Debug,
        PartialEq,
        Eq,
        Hash
    )]
    #[etherror(
        name = "InitializationFunctionReverted",
        abi = "InitializationFunctionReverted(address,bytes)"
    )]
    pub struct InitializationFunctionReverted {
        pub initialization_contract_address: ::ethers::core::types::Address,
        pub calldata: ::ethers::core::types::Bytes,
    }
    #[derive(
        Clone,
        ::ethers::contract::EthEvent,
        ::ethers::contract::EthDisplay,
        Default,
        Debug,
        PartialEq,
        Eq,
        Hash
    )]
    #[ethevent(
        name = "DiamondCut",
        abi = "DiamondCut((address,uint8,bytes4[])[],address,bytes)"
    )]
    pub struct DiamondCutFilter {
        pub diamond_cut: ::std::vec::Vec<FacetCut>,
        pub init: ::ethers::core::types::Address,
        pub calldata: ::ethers::core::types::Bytes,
    }
    #[derive(
        Clone,
        ::ethers::contract::EthEvent,
        ::ethers::contract::EthDisplay,
        Default,
        Debug,
        PartialEq,
        Eq,
        Hash
    )]
    #[ethevent(
        name = "OwnershipTransferred",
        abi = "OwnershipTransferred(address,address)"
    )]
    pub struct OwnershipTransferredFilter {
        #[ethevent(indexed)]
        pub previous_owner: ::ethers::core::types::Address,
        #[ethevent(indexed)]
        pub new_owner: ::ethers::core::types::Address,
    }
    ///Container type for all of the contract's events
    #[derive(Clone, ::ethers::contract::EthAbiType, Debug, PartialEq, Eq, Hash)]
    pub enum SwitchboardEvents {
        DiamondCutFilter(DiamondCutFilter),
        OwnershipTransferredFilter(OwnershipTransferredFilter),
    }
    impl ::ethers::contract::EthLogDecode for SwitchboardEvents {
        fn decode_log(
            log: &::ethers::core::abi::RawLog,
        ) -> ::core::result::Result<Self, ::ethers::core::abi::Error> {
            if let Ok(decoded) = DiamondCutFilter::decode_log(log) {
                return Ok(SwitchboardEvents::DiamondCutFilter(decoded));
            }
            if let Ok(decoded) = OwnershipTransferredFilter::decode_log(log) {
                return Ok(SwitchboardEvents::OwnershipTransferredFilter(decoded));
            }
            Err(::ethers::core::abi::Error::InvalidData)
        }
    }
    impl ::core::fmt::Display for SwitchboardEvents {
        fn fmt(&self, f: &mut ::core::fmt::Formatter<'_>) -> ::core::fmt::Result {
            match self {
                Self::DiamondCutFilter(element) => ::core::fmt::Display::fmt(element, f),
                Self::OwnershipTransferredFilter(element) => {
                    ::core::fmt::Display::fmt(element, f)
                }
            }
        }
    }
    impl ::core::convert::From<DiamondCutFilter> for SwitchboardEvents {
        fn from(value: DiamondCutFilter) -> Self {
            Self::DiamondCutFilter(value)
        }
    }
    impl ::core::convert::From<OwnershipTransferredFilter> for SwitchboardEvents {
        fn from(value: OwnershipTransferredFilter) -> Self {
            Self::OwnershipTransferredFilter(value)
        }
    }
}
