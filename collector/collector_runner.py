"""
Runner direto do coletor ADLogs.

Usado pelo NSSM para iniciar o coletor como Windows Service.
Nao usar pywin32 service framework — o NSSM gerencia o processo.
"""
import logging
import logging.handlers
import os
import sys

# Garante diretorio correto e sys.path antes de qualquer import local
_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(_dir)
if _dir not in sys.path:
    sys.path.insert(0, _dir)

LOG_DIR = os.path.join(os.environ.get('PROGRAMDATA', 'C:\\ProgramData'), 'ADLogs')
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    handlers=[
        logging.handlers.RotatingFileHandler(
            os.path.join(LOG_DIR, 'collector.log'),
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
        ),
        logging.StreamHandler(sys.stdout),
    ],
)

from collector import Collector  # noqa: E402

if __name__ == '__main__':
    Collector().start()
