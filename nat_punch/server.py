#!/usr/bin/env python3
import socket

PORT = 9999


def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(("0.0.0.0", PORT))
    peers = {}
    while len(peers) < 2:
        data, addr = sock.recvfrom(1024)
        peer_id = data.decode().strip()
        print(f"got {peer_id} from {addr}", flush=True)
        peers[peer_id] = addr
    ids = list(peers.keys())
    a_id, b_id = ids[0], ids[1]
    a_addr, b_addr = peers[a_id], peers[b_id]
    sock.sendto(f"{b_id} {b_addr[0]} {b_addr[1]}".encode(), a_addr)
    sock.sendto(f"{a_id} {a_addr[0]} {a_addr[1]}".encode(), b_addr)
    print("introduced", a_id, b_id, flush=True)
    sock.close()


if __name__ == "__main__":
    main()
