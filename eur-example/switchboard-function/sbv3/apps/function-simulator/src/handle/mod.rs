use crate::*;

pub mod container_verify;
pub mod echo;
pub mod measurement;
pub mod solana_simulate;

pub async fn handle_event(
    manager: Arc<dyn ContainerManager + Send + Sync>,
    args: Arc<Args>,
    stream: &mut WebsocketStream,
    event: MsgIn,
) -> Res<()> {
    match event {
        MsgIn::Echo(data) => stream
            .send(msg::MsgOut::Echo(echo::handle_echo(&data)).to_msg())
            .await
            .unwrap(),
        MsgIn::ContainerVerify(data) => {
            let result =
                container_verify::handle_container_verify(manager.clone(), stream, &data).await?;
            stream
                .send(MsgOut::ContainerVerify(result).to_msg())
                .await
                .unwrap()
        }
        MsgIn::Measurement(data) => {
            let result = measurement::handle_measurement(manager.clone(), stream, &data).await?;
            stream
                .send(MsgOut::Measurement(result).to_msg())
                .await
                .unwrap()
        }
        MsgIn::SolanaSimulate(data) => {
            match solana_simulate::handle_solana_simulate(
                manager.clone(),
                args.clone(),
                stream,
                &data,
            )
            .await
            {
                Ok(result) => stream
                    .send(MsgOut::SolanaSimulate(result).to_msg())
                    .await
                    .unwrap(),
                Err(error) => stream
                    .send(
                        MsgOut::SolanaSimulate(MsgOutSolanaSimulateData {
                            fn_key: data.fn_key,
                            image_name: "".to_string(),
                            result: None,
                            error: Some(error.to_string()),
                            logs: None,
                        })
                        .to_msg(),
                    )
                    .await
                    .unwrap(),
            }
        }
    }
    Ok(())
}
