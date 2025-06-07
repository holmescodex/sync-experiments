#!/bin/bash
set -e
for ns in server nat1 nat2 peer1 peer2; do
    ip netns delete $ns 2>/dev/null || true
done
ip link set br-ext down 2>/dev/null || true
ip link delete br-ext type bridge 2>/dev/null || true
for intf in veth-srv-br veth-n1-br veth-n2-br; do
    ip link delete $intf 2>/dev/null || true
done
