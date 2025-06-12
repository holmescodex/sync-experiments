import subprocess
import time


def test_peer_communication(tmp_path):
    server = subprocess.Popen(['python3', 'nat_punch/server.py'], stdout=subprocess.PIPE, text=True)
    time.sleep(0.5)
    p1 = subprocess.Popen(['python3', 'nat_punch/peer.py', 'peer1', '127.0.0.1'], stdout=subprocess.PIPE, text=True)
    p2 = subprocess.Popen(['python3', 'nat_punch/peer.py', 'peer2', '127.0.0.1'], stdout=subprocess.PIPE, text=True)

    out1, _ = p1.communicate(timeout=15)
    out2, _ = p2.communicate(timeout=15)
    server.wait(timeout=5)

    assert 'learned peer2' in out1
    assert 'learned peer1' in out2
    assert 'ack from peer2' in out1
    assert 'ack from peer1' in out2

