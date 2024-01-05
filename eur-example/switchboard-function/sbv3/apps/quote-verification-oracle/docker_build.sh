sudo DOCKER_BUILDKIT=1 docker build . --build-arg OPTIMISM=$OPTIMISM --tag qvn -m 10g && sudo docker save --output qvn.tar qvn && sudo chmod a+rw qvn.tar && cp qvn.tar ../function-manager/files/
