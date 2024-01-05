use crate::*;

use ipfs_api::TryFromUri;
use ipfs_api::{IpfsApi, IpfsClient};
use serde::{Deserialize, Serialize};
use serde_json;

use std::default::Default;
use std::io::Cursor;
use std::result::Result;

use futures::stream::TryStreamExt;
use tokio::runtime::Handle;
use tokio::sync::mpsc;

pub struct IPFSManager {
    client: IpfsClient,
}

impl IPFSManager {
    pub fn new() -> Self {
        Self {
            client: IpfsClient::from_str(&Env::get().IPFS_URL)
                .unwrap()
                .with_credentials(&Env::get().IPFS_KEY, &Env::get().IPFS_SECRET),
        }
    }

    pub async fn get_object<T>(&self, cid: String) -> Result<T, SbError>
    where
        T: for<'a> Deserialize<'a> + Default,
    {
        let handle = Handle::current();

        let client = self.client.clone();
        let res = handle
            .spawn_blocking(move || {
                let handle = Handle::current();
                handle.block_on(client.cat(&cid).map_ok(|chunk| chunk.to_vec()).try_concat())
            })
            .await
            .map_err(|_e| SbError::IpfsNetworkError)?
            .map_err(|_e| SbError::IpfsNetworkError)?;
        serde_json::from_slice(&res).map_err(|_| SbError::IpfsParseError)
    }

    pub async fn set_object<T>(&self, my_object: T) -> Result<String, SbError>
    where
        T: Serialize + Default,
    {
        let content = serde_json::to_string(&my_object).map_err(|_| SbError::IpfsParseError)?;
        let content = content.as_bytes().to_vec();
        let cursor = Cursor::new(content);

        let client = self.client.clone();
        let handle = Handle::current();
        let (tx, mut rx) = mpsc::channel(1);
        let _res = handle
            .spawn_blocking(move || {
                let handle = Handle::current();
                handle.block_on(async move {
                    let add_result = client.add(cursor).await.unwrap();
                    tx.send(add_result.hash).await.unwrap();
                });
            })
            .await
            .map_err(|_e| SbError::IpfsNetworkError)?;

        let cid = rx.recv().await.unwrap();
        Ok(cid)
    }
}
