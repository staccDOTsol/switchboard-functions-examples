use crate::*;
use clap::{Args, Parser, Subcommand};
use env_logger::Env;
use miette::Result;
use std::ffi::OsString;
use tokio_graceful_shutdown::SubsystemHandle;

/// Tools to help you interact and debug Switchboard Functions
#[derive(Debug, Parser)]
#[command(name = "sb-func-tools")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
    /// Increase verbosity, and can be used multiple times
    #[arg(short, long, action = clap::ArgAction::Count, required = false, global = true)]
    pub verbose: u8,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// Decodes the serialized FunctionRunner result.
    #[command(arg_required_else_help = false)]
    Decode {
        /// The encoded FunctionRunner result. Should start with FN_OUT: abc...
        #[arg(required = true)]
        fn_result: String,
        /// Optional, The location to write the decoded JSON result.
        #[arg(short, long)]
        filename: Option<String>,
    },

    Docker(DockerArgs),

    #[command(external_subcommand)]
    External(Vec<OsString>),
}

impl Commands {
    pub async fn handle(&self) -> Result<()> {
        match self {
            // decode
            Commands::Decode {
                fn_result,
                filename,
            } => {
                match switchboard_common::FunctionResult::decode(fn_result.as_str()) {
                    Err(e) => panic!("Failed to decode FunctionResult - {:?}", e),
                    Ok(decoded) => {
                        // TODO: handle deserializing individual chain transactions. we can lookup programID IDL for Solana.
                        let decoded_string = serde_json::to_string_pretty(&decoded).unwrap();
                        println!("{}", decoded_string);

                        if let Some(filepath) = filename {
                            let write_result = std::fs::write(filepath, decoded_string);
                            if write_result.is_err() {
                                warn!("Warning: Failed to write FunctionResult JSON to file");
                            }
                        }

                        Ok(())
                    }
                }
            }

            // docker
            Commands::Docker(sub_args) => {
                sub_args.command.handle().await?;

                Ok(())
            }

            // external
            Commands::External(sub_matches) => {
                info!("Calling out with {sub_matches:?}");

                Ok(())
            }
        }
    }
}

#[derive(Debug, Args)]
#[command(args_conflicts_with_subcommands = true)]
struct DockerArgs {
    #[command(subcommand)]
    command: DockerCommands,
}

#[derive(Debug, Subcommand)]
enum DockerCommands {
    Measurement {
        image: String,
    },
    #[command(args_conflicts_with_subcommands = false)]
    Simulate {
        image: String,
        /// Force pull an image if one doesnt exist locally.
        #[arg(short, long, required = false)]
        pull: Option<bool>,
    },
}

impl DockerCommands {
    pub async fn handle(&self) -> Result<()> {
        match self {
            // emit MrEnclave
            DockerCommands::Measurement { image } => {
                let measurement = docker::get_dockerhub_measurement(image.clone()).await?;
                println!("MrEnclave: {}", measurement);
                Ok(())
            }

            // simulate container
            DockerCommands::Simulate { image, pull } => {
                docker::simulate_container(image.clone(), *pull).await?;
                // let measurement = docker::get_dockerhub_measurement(image.clone()).await?;
                // println!("MrEnclave: {}", measurement);
                Ok(())
            }
        }
    }
}

pub async fn run(subsys: SubsystemHandle) -> Result<()> {
    let args = Cli::parse();

    let debug_level = match args.verbose {
        0 => "warn",
        1 => "info",
        2 => "debug",
        _ => "trace",
    };
    env_logger::Builder::from_env(Env::default().default_filter_or(debug_level)).init();

    args.command.handle().await?;

    subsys.request_shutdown();
    subsys.on_shutdown_requested().await;

    Ok(())
}
