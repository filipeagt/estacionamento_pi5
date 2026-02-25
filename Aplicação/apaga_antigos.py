import django
import os

# Configuração do Django para acessar os modelos de fora da aplicação
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "estacionamento.settings")
django.setup()

from django.utils import timezone
from datetime import timedelta
from vagas.models import *
from vagas.sensores import listaSensores

# Define o limite de um mês atrás (30 dias)
um_mes_atras = timezone.now() - timedelta(days=30)

# Deleta todos os registros com data_criacao mais antiga que um_mes_atras
for sensor in listaSensores:
    VagaX = eval(f"Vaga{sensor}")
    registros_antigos = VagaX.objects.filter(data_hora__lte=um_mes_atras)
    quantidade = registros_antigos.count()
    registros_antigos.delete()
    print(f"{quantidade} registros da vaga {sensor} foram apagados.")
