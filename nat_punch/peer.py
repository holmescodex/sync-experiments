#!/usr/bin/env python3
import socket
import sys
import time

PORT = 9999

def main():
    peer_id = sys.argv[1]
    server_ip = sys.argv[2]
    server_port = int(sys.argv[3]) if len(sys.argv) > 3 else PORT

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind(('', 0))
    local_port = sock.getsockname()[1]
    sock.sendto(peer_id.encode(), (server_ip, server_port))
    data, _ = sock.recvfrom(1024)
    other_id, other_ip, other_port = data.decode().split()
    other_port = int(other_port)
    print(f'{peer_id} learned {other_id} at {other_ip}:{other_port}', flush=True)

    # send a couple packets to open the mapping
    for _ in range(3):
        sock.sendto(f'ping from {peer_id}'.encode(), (other_ip, other_port))
        time.sleep(0.5)

    sock.settimeout(5)
    try:
        while True:
            msg, addr = sock.recvfrom(1024)
            msg = msg.decode()
            print(f'{peer_id} got "{msg}" from {addr}', flush=True)
            if msg.startswith('ping'):
                sock.sendto(f'ack from {peer_id}'.encode(), addr)
    except socket.timeout:
        pass
    sock.close()


if __name__ == '__main__':
    main()
