from django.shortcuts import render
from django.http import JsonResponse
from vagas.models import *
from datetime import timedelta
from django.utils import timezone
from vagas.sensores import listaSensores

def index(request):
    return render(request, 'index.html')

for sensor in listaSensores:
    exec(f"""def vaga{sensor}_json(request):
     # Lê o parâmetro "dias" da URL (ex: ?dias=7)
    dias_param = request.GET.get('dias', 7)

    try:
        # Converte para inteiro, caso o usuário envie algo válido
        dias = int(dias_param)
    except ValueError:
        # Caso o parâmetro não seja número, usa 7 por padrão
        dias = 7

    # Calcula a data limite
    data_limite = timezone.now() - timedelta(days=dias)

    # Filtra apenas os registros dentro do período
    dados = Vaga{sensor}.objects.filter(data_hora__gte=data_limite).order_by('data_hora')
    """ +

    """json_data = {
        'dados': [
            {
                'data_hora': d.data_hora.isoformat(),
                'ocupada': str(d.ocupada)
            }
            for d in dados
        ]
    }
    return JsonResponse(json_data)""")
