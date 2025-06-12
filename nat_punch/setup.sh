#!/bin/bash
set -e
BASE=$(dirname "$0")

# create namespaces
for ns in server nat1 nat2 peer1 peer2; do
    ip netns add $ns || true
done

# create veth pairs
ip link add veth-srv type veth peer name veth-srv-br
ip link add veth-n1 type veth peer name veth-n1-br
ip link add veth-n2 type veth peer name veth-n2-br
ip link add veth-n1-p1 type veth peer name veth-p1
ip link add veth-n2-p2 type veth peer name veth-p2

# move interfaces
ip link set veth-srv netns server
ip link set veth-n1 netns nat1
ip link set veth-n2 netns nat2
ip link set veth-n1-p1 netns nat1
ip link set veth-n2-p2 netns nat2
ip link set veth-p1 netns peer1
ip link set veth-p2 netns peer2

# create bridge
ip link add br-ext type bridge || true
ip addr add 10.0.0.1/24 dev br-ext || true
ip link set br-ext up
ip link set veth-srv-br master br-ext
ip link set veth-srv-br up
ip link set veth-n1-br master br-ext
ip link set veth-n1-br up
ip link set veth-n2-br master br-ext
ip link set veth-n2-br up

# server
ip netns exec server ip addr add 10.0.0.2/24 dev veth-srv
ip netns exec server ip link set lo up
ip netns exec server ip link set veth-srv up

# NAT1
ip netns exec nat1 ip addr add 10.0.0.3/24 dev veth-n1
ip netns exec nat1 ip addr add 192.168.1.1/24 dev veth-n1-p1
ip netns exec nat1 ip link set lo up
ip netns exec nat1 ip link set veth-n1 up
ip netns exec nat1 ip link set veth-n1-p1 up
ip netns exec nat1 sysctl -w net.ipv4.ip_forward=1
ip netns exec nat1 iptables -t nat -A POSTROUTING -o veth-n1 -j MASQUERADE

# NAT2
ip netns exec nat2 ip addr add 10.0.0.4/24 dev veth-n2
ip netns exec nat2 ip addr add 192.168.2.1/24 dev veth-n2-p2
ip netns exec nat2 ip link set lo up
ip netns exec nat2 ip link set veth-n2 up
ip netns exec nat2 ip link set veth-n2-p2 up
ip netns exec nat2 sysctl -w net.ipv4.ip_forward=1
ip netns exec nat2 iptables -t nat -A POSTROUTING -o veth-n2 -j MASQUERADE

# peer1
ip netns exec peer1 ip addr add 192.168.1.2/24 dev veth-p1
ip netns exec peer1 ip link set lo up
ip netns exec peer1 ip link set veth-p1 up
ip netns exec peer1 ip route add default via 192.168.1.1

# peer2
ip netns exec peer2 ip addr add 192.168.2.2/24 dev veth-p2
ip netns exec peer2 ip link set lo up
ip netns exec peer2 ip link set veth-p2 up
ip netns exec peer2 ip route add default via 192.168.2.1

# run demo
ip netns exec server python3 "$BASE/server.py" &
ip netns exec peer1 python3 "$BASE/peer.py" peer1 10.0.0.2 &
ip netns exec peer2 python3 "$BASE/peer.py" peer2 10.0.0.2 &
wait
