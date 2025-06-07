# NAT Hole Punching Experiment

This directory contains an experimental setup for testing UDP NAT hole
punching.  It uses Linux network namespaces to emulate two hosts behind
independent NAT routers which are introduced by a third server.

The network is created entirely with Linux network namespaces so it can
run on a single machine.

Files:

- `server.py` – simple UDP introducer that learns the public address of
  each peer and sends them to each other.
- `peer.py` – peer process that contacts the introducer and then attempts
  to communicate with the other peer.
- `setup.sh` – creates the network namespaces, configures NAT and runs
  the demo.
- `cleanup.sh` – removes namespaces and bridges created by `setup.sh`.

## Requirements

- Python 3
- `iptables` and `iproute2`

Run `sudo ./setup.sh` to start the test.  When finished use
`sudo ./cleanup.sh` to tear down the namespaces.  The peers should
exchange a few UDP messages after being introduced.

## How realistic are the NATs?

The NAT devices in this demo are implemented with simple `iptables`
`MASQUERADE` rules.  This models the most basic form of home router NAT
where outbound connections are translated to the router's public address
and port.  It does **not** attempt to emulate more advanced or quirky
behaviour such as port preservation, port prediction, or symmetric NAT
rules that you may encounter in commercial products or carrier grade
equipment.  For experiments that need highly realistic NAT behaviour you
would need to run full router software (for example OpenWrt) in virtual
machines or a dedicated network simulator.
