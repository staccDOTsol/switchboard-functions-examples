sudo rm /data/protected_files/keypair.bin
sudo docker kill $(sudo docker ps -q)
sudo docker run --privileged -it --rm --device=/dev/sgx_enclave --device=/dev/sgx_provision --env-file env.list -v /home/credentials/:/home/credentials/ -v /var/run/aesmd:/var/run/aesmd -v /var/run/docker.sock:/var/run/docker.sock -v /run/containerd/containerd.sock:/run/containerd/containerd.sock --network=host dind
