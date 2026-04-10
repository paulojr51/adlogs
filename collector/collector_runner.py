"""
Runner direto do coletor ADLogs.
Usado pelo NSSM para iniciar o coletor como Windows Service.
"""
import os
import sys

# Garante diretorio correto e sys.path antes de qualquer import local
_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(_dir)
if _dir not in sys.path:
    sys.path.insert(0, _dir)

# Carrega .env manualmente antes de importar config.py
# (garante funcionar mesmo que python-dotenv falhe ou CWD esteja errado)
_env_path = os.path.join(_dir, '.env')
if os.path.exists(_env_path):
    with open(_env_path, 'r', encoding='utf-8-sig') as _f:  # utf-8-sig strips BOM
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _key, _val = _line.split('=', 1)
                os.environ.setdefault(_key.strip(), _val.strip())

import logging
import logging.handlers

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
    logging.getLogger('adlogs').info('Iniciando via collector_runner (NSSM)')
    Collector().start()
