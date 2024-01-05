use proc_macro::Span;
use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, ItemEnum, ItemFn};

struct SBFunctionArgs {
    expiration_seconds: Option<syn::LitInt>,
    gas_limit: Option<syn::LitInt>,
}

fn parse_args(attrs: syn::AttributeArgs) -> SBFunctionArgs {
    let mut expiration_seconds = None;
    let mut gas_limit = None;

    for attr in attrs {
        if let syn::NestedMeta::Meta(syn::Meta::NameValue(nv)) = attr {
            if nv.path.is_ident("expiration_seconds") {
                if let syn::Lit::Int(lit) = nv.lit {
                    expiration_seconds = Some(lit);
                }
            } else if nv.path.is_ident("gas_limit") {
                if let syn::Lit::Int(lit) = nv.lit {
                    gas_limit = Some(lit);
                }
            }
        }
    }

    SBFunctionArgs {
        expiration_seconds,
        gas_limit,
    }
}

#[proc_macro_attribute]
pub fn sb_function(attr: TokenStream, item: TokenStream) -> TokenStream {
    let input = parse_macro_input!(item as ItemFn);
    let attrs = parse_macro_input!(attr as syn::AttributeArgs);
    // Extract function name and parameters
    let func_name = &input.sig.ident;
    let _func_params = &input.sig.inputs;

    // let _mattrs = attrs.clone();
    // let parser_type = match &mattrs[0] {
    // syn::NestedMeta::Meta(syn::Meta::Path(path)) => path,
    // _ => panic!("Expected a type for parser_type"),
    // };
    let parser_type = match input.sig.inputs.iter().nth(2) {
        Some(syn::FnArg::Typed(pat_type)) => &pat_type.ty,
        _ => panic!("Expected the function to have a third argument"),
    };

    let args = parse_args(attrs);

    // Extract values (and handle default values if needed)
    let expiration_seconds = args
        .expiration_seconds
        .unwrap_or_else(|| syn::LitInt::new(&120.to_string(), Span::call_site().into()));
    let gas_limit = args
        .gas_limit
        .unwrap_or_else(|| syn::LitInt::new(&5_500_000.to_string(), Span::call_site().into()));
    let expanded = quote! {
        use base64::Engine;
        use futures::future::join_all;
        use tokio::task::JoinHandle;
        use base64::engine::Engine as _;
        use base64::engine::general_purpose::STANDARD as BASE64;
        use ethers::prelude::*;
        use chrono::Utc;

        #input

        #[tokio::main(worker_threads = 12)]
        async fn main() -> Result<(), Box<dyn std::error::Error>> {
            // --- Initialize clients ---
            let mut function_runner = EvmFunctionRunner::new()?;
            let params: Vec<String> = serde_json::from_slice(
                &BASE64.decode(std::env::var("FUNCTION_PARAMS").unwrap()).unwrap()).unwrap();
            let provider = Provider::<Http>::try_from(CLIENT_URL)?;
            let signer = function_runner.enclave_wallet.clone();
            let client = SignerMiddleware::new_with_provider_chain(provider.clone(), signer).await?;
            let expiration = (Utc::now().timestamp() + #expiration_seconds).into();
            let gas_limit = #gas_limit.into();
            let mut futures: Vec<JoinHandle<Result<_, _>>> = vec![];

            // zip call_ids and params
            let call_ids = function_runner.call_ids.clone();
            let params = params.into_iter().zip(call_ids.into_iter()).collect::<Vec<_>>();

            // Call the user function
            let mut count = 0;
            for (param, call_id) in params {
                let parsed_params = #parser_type::decode(&BASE64.decode(&param).unwrap());
                let client = client.clone();
                futures.push(tokio::spawn(#func_name(client, call_id, parsed_params.unwrap_or_default())));
            }
            let results = join_all(futures).await;
            let mut i = 0;
            for res in results  {
                let call_id = function_runner.call_ids[i];
                let res = res.unwrap();
                i += 1;

                // set error if there is one
                if let Some(error) = res.as_ref().err() {
                    // get that call_id at this index
                    function_runner.set_error(call_id, (*error).into());
                    continue;
                }

                // set the function txs
                function_runner.set_txs(call_id, res.unwrap());
            }
            function_runner.emit(expiration, gas_limit, None)?;
            Ok(())
        }
    };
    TokenStream::from(expanded)
}

#[proc_macro_attribute]
pub fn sb_error(_attr: TokenStream, item: TokenStream) -> TokenStream {
    let mut input = parse_macro_input!(item as ItemEnum);
    let name = &input.ident;

    let reserved_variant: syn::Variant = syn::parse_quote! {
        RESERVED = 0
    };

    input.variants.insert(0, reserved_variant);

    let expanded = quote! {
        pub type SbResult = Result<Vec<FnCall>, #name>;

        use num_enum;
        #[derive(Clone, Copy, Debug, PartialEq, num_enum::IntoPrimitive, num_enum::TryFromPrimitive)]
        #[repr(u8)]
        #input

        impl std::fmt::Display for #name {
            fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                write!(f, "{:?}", self)
            }
        }

        impl std::error::Error for #name {}
    };

    TokenStream::from(expanded)
}
