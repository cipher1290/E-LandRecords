#!/bin/bash
cd $HOME/go/src/github.com/charitha/fabric-samples/test-network
export DOCKER_SOCK=/var/run/docker.sock
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/

# Restart existing network (don't recreate - just start stopped containers)
docker start peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com
docker start orderer.example.com
docker start couchdb0 couchdb1 couchdb4
docker start ca_org1 ca_org2 ca_org3 ca_orderer

echo "Waiting for containers to be ready..."
sleep 10
docker ps
echo "Network is ready!"

# Fix certificate symlinks
for org in org1 org2 org3; do
  SIGNCERTS=$HOME/go/src/github.com/charitha/fabric-samples/test-network/organizations/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/signcerts
  KEYSTORE=$HOME/go/src/github.com/charitha/fabric-samples/test-network/organizations/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/keystore
  ln -sf cert.pem "$SIGNCERTS/Admin@${org}.example.com-cert.pem" 2>/dev/null
  cd $KEYSTORE && ln -sf $(ls | head -1) priv_sk 2>/dev/null
done
echo "Certificate symlinks fixed!"

# Fix cert symlinks for elandrecords fabric-api path
for org in org1 org2 org3; do
  SIGNCERTS=$HOME/elandrecords/fabric-samples/test-network/organizations/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/signcerts
  KEYSTORE=$HOME/elandrecords/fabric-samples/test-network/organizations/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/keystore
  ln -sf cert.pem "$SIGNCERTS/Admin@${org}.example.com-cert.pem" 2>/dev/null
  ln -sf $(ls $KEYSTORE | grep -v priv_sk | head -1) $KEYSTORE/priv_sk 2>/dev/null
done
