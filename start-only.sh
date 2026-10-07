#!/bin/bash
echo "Starting existing network..."
cd $HOME/elandrecords/fabric-samples/test-network

# Just start existing containers without recreating
docker start peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com \
  orderer.example.com couchdb0 couchdb1 couchdb4 \
  ca_org1 ca_org2 ca_org3 ca_orderer 2>/dev/null

echo "Starting fabric-api..."
cd $HOME/elandrecords/fabric-api
export DOCKER_SOCK=/var/run/docker.sock
node index.js &
sleep 3

echo "Done! Check health:"
curl http://localhost:3001/health
