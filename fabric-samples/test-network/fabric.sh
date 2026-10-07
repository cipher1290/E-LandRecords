#!/bin/bash
echo "========================================="
echo " Hyperledger Fabric Auto Network Startup "
echo "========================================="

cd $HOME/go/src/github.com/charitha/fabric-samples/test-network
export PATH=$HOME/go/src/github.com/charitha/fabric-samples/bin:$PATH
export FABRIC_CFG_PATH=$HOME/go/src/github.com/charitha/fabric-samples/config/
export DOCKER_SOCK=/var/run/docker.sock

echo "Stopping old network..."
./network.sh down || true

echo "Starting network and creating channel..."
./network.sh up createChannel -ca -s couchdb -c mychannel

echo "Adding Org3..."
cd addOrg3
./addOrg3.sh up -ca -c mychannel -s couchdb
cd ..

echo "Fixing certificate symlinks..."
for org in org1 org2 org3; do
  SIGNCERTS=$HOME/go/src/github.com/charitha/fabric-samples/test-network/organizations/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/signcerts
  KEYSTORE=$HOME/go/src/github.com/charitha/fabric-samples/test-network/organizations/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/keystore
  ln -sf cert.pem "$SIGNCERTS/Admin@${org}.example.com-cert.pem" 2>/dev/null
  cd $KEYSTORE && ln -sf $(ls | grep -v priv_sk | head -1) priv_sk 2>/dev/null
done
for org in org1 org2 org3; do
  SIGNCERTS=$HOME/elandrecords/fabric-samples/test-network/organizations/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/signcerts
  KEYSTORE=$HOME/elandrecords/fabric-samples/test-network/organizations/peerOrganizations/${org}.example.com/users/Admin@${org}.example.com/msp/keystore
  ln -sf cert.pem "$SIGNCERTS/Admin@${org}.example.com-cert.pem" 2>/dev/null
  cd $KEYSTORE && ln -sf $(ls | grep -v priv_sk | head -1) priv_sk 2>/dev/null
done

cd $HOME/go/src/github.com/charitha/fabric-samples/test-network

echo "Deploying chaincode on Org1 and Org2..."
./network.sh deployCC \
  -ccn land-registration \
  -ccp $HOME/elandrecords/chaincode/land-registration \
  -ccl javascript \
  -c mychannel \
  -ccv 1.0 \
  -ccs 1

echo "Installing and approving chaincode on Org3..."
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org3MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp
export CORE_PEER_ADDRESS=localhost:11051

peer lifecycle chaincode install land-registration.tar.gz

PKGID=$(peer lifecycle chaincode queryinstalled --output json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['installed_chaincodes'][0]['package_id'])")
echo "Org3 Package ID: $PKGID"

peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile ${PWD}/organizations/ordererOrganizations/example.com/tlsca/tlsca.example.com-cert.pem \
  --channelID mychannel \
  --name land-registration \
  --version 1.0 \
  --package-id $PKGID \
  --sequence 1

echo "Verifying all 3 orgs approved..."
peer lifecycle chaincode querycommitted --channelID mychannel --name land-registration

echo "Re-enrolling wallet identities..."
cd $HOME/elandrecords/fabric-api
rm -f src/wallets/org1/admin.id wallets/org2/admin.id src/wallets/org3/admin.id
node src/org1/enrollAdmin.js
node src/org1/registerUser.js
node src/org2/enrollAdmin.js
node src/org2/registerUser.js
node src/org3/enrollAdmin.js

echo "========================================="
echo " Fabric Network Running Successfully!    "
echo "========================================="
docker ps
