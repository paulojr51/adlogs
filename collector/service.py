"""
ADLogs Windows Service wrapper.

Instala e gerencia o coletor como um Windows Service usando pywin32.

Uso:
    # Instalar serviço (PowerShell como Admin):
    python service.py install

    # Iniciar:
    python service.py start

    # Parar:
    python service.py stop

    # Remover:
    python service.py remove

    # Depurar (roda em foreground):
    python service.py debug
"""
import logging
import logging.handlers
import os
import sys

# Garante que o diretório do serviço está no sys.path.
# Necessário porque o Windows inicia o serviço a partir de System32.
_svc_dir = os.path.dirname(os.path.abspath(__file__))
if _svc_dir not in sys.path:
    sys.path.insert(0, _svc_dir)

import servicemanager  # type: ignore[import]
import win32event  # type: ignore[import]
import win32service  # type: ignore[import]
import win32serviceutil  # type: ignore[import]

from config import SERVICE_DESCRIPTION, SERVICE_DISPLAY_NAME, SERVICE_NAME
from collector import Collector

# Configura logging para o Event Viewer do Windows + arquivo
LOG_DIR = os.path.join(os.environ.get('PROGRAMDATA', 'C:\\ProgramData'), 'ADLogs')
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(name)s] %(levelname)s: %(message)s',
    handlers=[
        logging.handlers.RotatingFileHandler(
            os.path.join(LOG_DIR, 'collector.log'),
            maxBytes=10 * 1024 * 1024,  # 10 MB
            backupCount=5,
        ),
        logging.StreamHandler(sys.stdout),
    ],
)

logger = logging.getLogger('adlogs.service')


class ADLogsService(win32serviceutil.ServiceFramework):
    _svc_name_ = SERVICE_NAME
    _svc_display_name_ = SERVICE_DISPLAY_NAME
    _svc_description_ = SERVICE_DESCRIPTION

    def __init__(self, args):
        try:
            win32serviceutil.ServiceFramework.__init__(self, args)
            self.stop_event = win32event.CreateEvent(None, 0, 0, None)
            self.collector = Collector()
        except Exception as exc:
            import traceback
            err_path = os.path.join(LOG_DIR, 'service_init_error.txt')
            with open(err_path, 'w', encoding='utf-8') as f:
                f.write(traceback.format_exc())
            raise

    def SvcStop(self):
        logger.info('Recebido sinal de parada')
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        self.collector.stop()
        win32event.SetEvent(self.stop_event)

    def SvcDoRun(self):
        self.ReportServiceStatus(win32service.SERVICE_RUNNING)
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ''),
        )
        logger.info('Serviço %s iniciando', SERVICE_DISPLAY_NAME)
        try:
            self.collector.start()
        except Exception as exc:
            logger.error('Erro fatal no serviço: %s', exc)
            servicemanager.LogErrorMsg(str(exc))


def debug_mode():
    """Roda o coletor em foreground para depuração."""
    logging.basicConfig(level=logging.DEBUG)
    logger.info('Rodando em modo de depuração...')
    c = Collector()
    c.start()


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'debug':
        debug_mode()
    else:
        if len(sys.argv) == 1:
            servicemanager.Initialize()
            servicemanager.PrepareToHostSingle(ADLogsService)
            servicemanager.StartServiceCtrlDispatcher()
        else:
            win32serviceutil.HandleCommandLine(ADLogsService)
