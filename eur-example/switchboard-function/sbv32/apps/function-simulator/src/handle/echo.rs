use crate::msg::echo::{MsgInEchoData, MsgOutEchoData};

pub fn handle_echo(msg: &MsgInEchoData) -> MsgOutEchoData {
    MsgOutEchoData {
        message: format!("-> {}", msg.message),
    }
}
